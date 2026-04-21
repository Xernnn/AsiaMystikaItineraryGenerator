/**
 * accommodation-engine.js
 *
 * Hotel-selection math and rendering for the v3 hotel schema (room types).
 * Schema reference lives in [data/hotels.js](../data/hotels.js).
 *
 * Key exports
 *  - computeStays(briefRows)
 *  - pickRate(hotel, roomType, groupType, date, priceOverride)
 *  - calcEarlyCheckin(hotel, ratePerRoom, paxInRoom)
 *  - calcUpgrade(defaultRoomType, upgradeRoomType, groupType, date, nights, paxInRoom)
 *  - calcPerPax({ratePerRoom, totalRooms, focRooms, totalPax, nights})
 *  - generateAccommodationTables(stays, selections, hotelsByStars, state)
 *  - getCityLabel(code)
 */

import { escapeHtml } from './detail-engine.js';
import { addDaysISO } from './brief-parser.js';

// ──────────────────────────────────────────────────────────────────────
//  STAYS
// ──────────────────────────────────────────────────────────────────────

export function computeStays(briefRows) {
  if (!Array.isArray(briefRows) || briefRows.length === 0) return [];

  const stays = [];
  let current = null;

  briefRows.forEach((row, idx) => {
    const city = row.templateCity || '';
    if (!city) {
      if (current) { stays.push(current); current = null; }
      return;
    }
    if (current && current.city === city) {
      current.endDay = row.dayNum ?? idx + 1;
      current.rows.push(row);
    } else {
      if (current) stays.push(current);
      current = {
        city,
        startDay: row.dayNum ?? idx + 1,
        endDay:   row.dayNum ?? idx + 1,
        rows: [row],
      };
    }
  });
  if (current) stays.push(current);

  const lastRowIdx = briefRows.length - 1;
  stays.forEach(s => {
    s.nights = s.rows.length;
    s.id = `${s.city}_${s.startDay}`;
  });
  if (stays.length) {
    const last = stays[stays.length - 1];
    if (last.rows[last.rows.length - 1] === briefRows[lastRowIdx]) {
      last.nights = Math.max(0, last.nights - 1);
    }
  }

  return stays;
}

// ──────────────────────────────────────────────────────────────────────
//  RATE SELECTION
// ──────────────────────────────────────────────────────────────────────

export function isHighSeason(hotel, isoDate) {
  if (!hotel?.highSeason?.length || !isoDate) return false;
  const [, mm, dd] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate) || [];
  if (!mm) return false;
  const key = `${mm}-${dd}`;
  for (const r of hotel.highSeason) {
    const from = r.from;
    const to   = r.to;
    if (from <= to) {
      if (key >= from && key <= to) return true;
    } else {
      if (key >= from || key <= to) return true;
    }
  }
  return false;
}

/**
 * Pick the rate for a given (hotel, roomType, groupType, date), honouring an
 * optional per-booking priceOverride (valid only if the room type has
 * flexiblePrice = true).
 *
 * Returns `{ ratePerRoom, season, groupType, overridden }`.
 */
export function pickRate(hotel, roomType, groupType, isoDate, priceOverride = null) {
  const gt = groupType === 'git' ? 'git' : 'fit';
  const season = isHighSeason(hotel, isoDate) ? 'high' : 'low';

  if (priceOverride != null && priceOverride !== '' && roomType?.flexiblePrice) {
    return {
      ratePerRoom: Number(priceOverride) || 0,
      season,
      groupType: gt,
      overridden: true,
    };
  }

  const ratePerRoom = Number(roomType?.rates?.[gt]?.[season] ?? 0);
  return { ratePerRoom, season, groupType: gt, overridden: false };
}

/** Look up a room type by id on a hotel; returns first room type if id missing. */
export function findRoomType(hotel, roomTypeId) {
  const list = hotel?.roomTypes || [];
  if (!list.length) return null;
  if (!roomTypeId) return list[0];
  return list.find(rt => rt.id === roomTypeId) || list[0];
}

// ──────────────────────────────────────────────────────────────────────
//  SURCHARGE MATH
// ──────────────────────────────────────────────────────────────────────

/**
 * Early check-in surcharge per pax. Hotel-level `earlyCheckinRate` override
 * is ONLY honoured when > 0 (blank / null / 0 all mean "use the 50% default").
 */
export function calcEarlyCheckin(hotel, ratePerRoom, paxInRoom) {
  const pax = Math.max(1, Number(paxInRoom) || 1);
  const overrideRaw = hotel?.earlyCheckinRate;
  const overrideNum = (overrideRaw == null || overrideRaw === '')
    ? null
    : Number(overrideRaw);
  const totalRoomCharge = (overrideNum != null && overrideNum > 0)
    ? overrideNum
    : Number(ratePerRoom) * 0.5;
  if (!totalRoomCharge) return 0;
  return totalRoomCharge / pax;
}

/** Total early check-in charge per room (before pax split). */
export function calcEarlyCheckinPerRoom(hotel, ratePerRoom) {
  const overrideRaw = hotel?.earlyCheckinRate;
  const overrideNum = (overrideRaw == null || overrideRaw === '')
    ? null
    : Number(overrideRaw);
  return (overrideNum != null && overrideNum > 0)
    ? overrideNum
    : Number(ratePerRoom || 0) * 0.5;
}

/**
 * Room-upgrade surcharge per pax: diff(rate) × nights ÷ paxInRoom.
 * Takes full hotel + default room type + upgrade room type so it can apply
 * the same season / groupType / price override to both.
 */
export function calcUpgrade({ hotel, defaultRoomType, upgradeRoomType, groupType, isoDate, nights, paxInRoom, priceOverride = null, upgradePriceOverride = null }) {
  if (!defaultRoomType || !upgradeRoomType) return 0;
  const pax = Math.max(1, Number(paxInRoom) || 1);
  const n   = Math.max(0, Number(nights) || 0);
  const baseRate = pickRate(hotel, defaultRoomType, groupType, isoDate, priceOverride).ratePerRoom;
  const upRate   = pickRate(hotel, upgradeRoomType, groupType, isoDate, upgradePriceOverride).ratePerRoom;
  const diff = upRate - baseRate;
  if (diff <= 0) return 0;
  return (diff * n) / pax;
}

/**
 * Per-pax price for a stay. paidRooms = totalRooms − focRooms.
 * perPax = rate × paidRooms × nights ÷ totalPax.
 */
export function calcPerPax({ ratePerRoom, totalRooms, focRooms = 0, totalPax, nights = 1 }) {
  const paid = Math.max(0, Number(totalRooms || 0) - Number(focRooms || 0));
  const pax  = Math.max(1, Number(totalPax || 1));
  const n    = Math.max(0, Number(nights || 0));
  return (Number(ratePerRoom || 0) * paid * n) / pax;
}

/** Suggest a FOC room count based on hotel.focRule and rooms actually booked. */
export function suggestFocCount(hotel, totalRooms) {
  const rule = hotel?.focRule;
  if (!rule || !rule.everyRooms || !rule.freeRooms) return 0;
  return Math.floor(Number(totalRooms || 0) / Number(rule.everyRooms)) * Number(rule.freeRooms);
}

/**
 * Single source-of-truth price breakdown for one stay.
 *
 * Returns `{ rows, grandTotal, perPax, paidRooms, totalRooms, nights,
 *            ratePerRoom, paxInRoom, totalPax, currency, season, overridden,
 *            hotel, defaultRoomType, upgradeRoomType }`.
 *
 * Each `row` is `{ kind, label, detail, amount }` where `kind` is one of
 * 'room' | 'foc' | 'subtotal' | 'extraBed' | 'shareBed' | 'eci' | 'upgrade'
 * | 'total' | 'perPax'. Signed amounts (negative = discount).
 */
export function buildStayBreakdown({ stay, sel, hotel, state, groupType, dateFrom }) {
  if (!stay || !sel || !hotel) {
    return { rows: [], grandTotal: 0, perPax: 0, paidRooms: 0, totalRooms: 0, nights: 0 };
  }

  const defaultRoomType = findRoomType(hotel, sel.roomTypeId);
  const upgradeRoomType = sel.upgradeRoomTypeId
    ? findRoomType(hotel, sel.upgradeRoomTypeId)
    : null;

  const firstNightISO = addDaysISO(dateFrom || '', (stay.startDay || 1) - 1);
  const gt = groupType === 'git' ? 'git' : 'fit';
  const { ratePerRoom, season, overridden } = pickRate(
    hotel, defaultRoomType, gt, firstNightISO, sel.priceOverride
  );

  const rooms2     = Math.max(0, Number(sel.rooms2pax || 0));
  const rooms3     = Math.max(0, Number(sel.rooms3pax || 0));
  const totalRooms = rooms2 + rooms3;
  const focRooms   = Math.min(totalRooms, Math.max(0, Number(sel.focRooms || 0)));
  const paidRooms  = Math.max(0, totalRooms - focRooms);
  const nights     = Math.max(0, Number(stay.nights || 0));

  const adults   = Number(state?.step1?.adults   || 0);
  const children = Number(state?.step1?.children || 0);
  const totalPax = Math.max(1, adults + children);

  // Weighted pax-in-room from actual rooms (not rounded from totalPax).
  const paxInRoom = totalRooms > 0
    ? (rooms2 * 2 + rooms3 * 3) / totalRooms
    : 2;

  const extraBeds    = Math.max(0, Number(sel.extraBeds || 0));
  const shareBeds    = Math.max(0, Number(sel.shareBeds || 0));
  const extraBedRate = Number(defaultRoomType?.extraBedRate || 0);
  const shareBedRate = Number(defaultRoomType?.shareBed || 0);

  const currency = hotel.currency || 'USD';
  const rows = [];

  // Rooms total (always shown, even when 0 so the user sees the matrix)
  const roomsLabel = formatRoomBreakdownLabel(rooms2, rooms3);
  const roomsGross = ratePerRoom * totalRooms * Math.max(1, nights);
  rows.push({
    kind: 'room',
    label: 'Rooms',
    detail: `${roomsLabel} × ${formatMoney(ratePerRoom, currency)} × ${nights || 0} night${nights === 1 ? '' : 's'}`,
    amount: roomsGross,
  });

  if (focRooms > 0) {
    const focDiscount = ratePerRoom * focRooms * Math.max(1, nights);
    rows.push({
      kind: 'foc',
      label: 'FOC discount',
      detail: `${focRooms} FOC room${focRooms === 1 ? '' : 's'} × ${formatMoney(ratePerRoom, currency)} × ${nights || 0} night${nights === 1 ? '' : 's'}`,
      amount: -focDiscount,
    });
  }

  const paidSubtotal = ratePerRoom * paidRooms * Math.max(1, nights);
  rows.push({
    kind: 'subtotal',
    label: 'Paid subtotal',
    detail: `${paidRooms} paid room${paidRooms === 1 ? '' : 's'} × ${nights || 0} night${nights === 1 ? '' : 's'}`,
    amount: paidSubtotal,
  });

  if (extraBeds > 0 && defaultRoomType?.extraBedAllowed !== false) {
    const amt = extraBeds * extraBedRate * Math.max(1, nights);
    rows.push({
      kind: 'extraBed',
      label: 'Extra bed',
      detail: `${extraBeds} × ${formatMoney(extraBedRate, currency)} × ${nights || 0} night${nights === 1 ? '' : 's'}`,
      amount: amt,
    });
  }
  if (shareBeds > 0) {
    const amt = shareBeds * shareBedRate * Math.max(1, nights);
    rows.push({
      kind: 'shareBed',
      label: 'Share bed',
      detail: `${shareBeds} × ${formatMoney(shareBedRate, currency)} × ${nights || 0} night${nights === 1 ? '' : 's'}`,
      amount: amt,
    });
  }

  if (sel.earlyCheckinDay) {
    const perRoom = calcEarlyCheckinPerRoom(hotel, ratePerRoom);
    // Number of rooms that need ECI — defaults to paid rooms but user can pick
    // any number between 0 and totalRooms.
    const eciRoomsRaw = sel.eciRooms;
    const eciRooms = eciRoomsRaw == null || eciRoomsRaw === ''
      ? paidRooms
      : Math.max(0, Math.min(totalRooms, Number(eciRoomsRaw) || 0));
    const amt = perRoom * eciRooms;
    if (amt > 0) {
      rows.push({
        kind: 'eci',
        label: 'Early check-in',
        detail: `Day ${sel.earlyCheckinDay}: ${formatMoney(perRoom, currency)} × ${eciRooms} room${eciRooms === 1 ? '' : 's'}`,
        amount: amt,
      });
    }
  }

  if (upgradeRoomType) {
    const upRate = pickRate(
      hotel, upgradeRoomType, gt, firstNightISO, sel.upgradePriceOverride
    ).ratePerRoom;
    const diff = upRate - ratePerRoom;
    // Number of rooms that are upgrading — defaults to all paid rooms but
    // user can pick any number between 0 and paidRooms.
    const upRoomsRaw = sel.upgradeRooms;
    const upgradeRooms = upRoomsRaw == null || upRoomsRaw === ''
      ? paidRooms
      : Math.max(0, Math.min(paidRooms, Number(upRoomsRaw) || 0));
    if (diff > 0 && upgradeRooms > 0) {
      const amt = diff * Math.max(1, nights) * upgradeRooms;
      rows.push({
        kind: 'upgrade',
        label: `Upgrade → ${upgradeRoomType.name}`,
        detail: `(${formatMoney(upRate, currency)} − ${formatMoney(ratePerRoom, currency)}) × ${nights || 0} night${nights === 1 ? '' : 's'} × ${upgradeRooms} room${upgradeRooms === 1 ? '' : 's'}`,
        amount: amt,
      });
    }
  }

  const grandTotal = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  rows.push({ kind: 'total', label: 'Grand total', detail: '', amount: grandTotal });

  const perPax = totalPax > 0 ? grandTotal / totalPax : 0;
  rows.push({
    kind: 'perPax',
    label: 'Per pax',
    detail: `÷ ${totalPax} pax`,
    amount: perPax,
  });

  return {
    rows,
    grandTotal,
    perPax,
    paidRooms,
    totalRooms,
    focRooms,
    nights,
    ratePerRoom,
    paxInRoom,
    totalPax,
    currency,
    season,
    overridden,
    hotel,
    defaultRoomType,
    upgradeRoomType,
  };
}

function formatRoomBreakdownLabel(rooms2, rooms3) {
  const parts = [];
  if (rooms2 > 0) parts.push(`${rooms2} × 2-pax`);
  if (rooms3 > 0) parts.push(`${rooms3} × 3-pax`);
  return parts.length ? `${parts.join(' + ')} = ${rooms2 + rooms3} room${(rooms2 + rooms3) === 1 ? '' : 's'}` : '0 rooms';
}

// ──────────────────────────────────────────────────────────────────────
//  FORMATTING / LABELS
// ──────────────────────────────────────────────────────────────────────

export function formatMoney(amount, currency = 'USD') {
  const n = Number(amount || 0);
  if (currency === 'VND') {
    if (n >= 1000) return `${Math.round(n / 1000).toLocaleString('en-US')}k VND`;
    return `${Math.round(n).toLocaleString('en-US')} VND`;
  }
  return `$${n.toFixed(n < 10 ? 2 : 0)} USD`;
}

export function formatPerPax(amount, currency = 'USD') {
  return `${formatMoney(amount, currency)}/pax`;
}

const CITY_LABEL_MAP = {
  HN: 'Hanoi',
  NB: 'Ninh Binh',
  SP: 'Sapa',
  HL: 'Halong Bay',
  DN: 'Da Nang',
  HA: 'Hoi An',
  HC: 'Ho Chi Minh City',
  PQ: 'Phu Quoc',
};

export function getCityLabel(code) {
  return CITY_LABEL_MAP[code] || code || '';
}

export const SURCHARGE_CITIES = new Set(['HN','NB','SP','HL','DN','HA','HC','PQ']);

// ──────────────────────────────────────────────────────────────────────
//  PREVIEW TABLE RENDERING
// ──────────────────────────────────────────────────────────────────────

/**
 * Render ACCOMMODATION section HTML for the document preview.
 * One tier block per stay — the star tier is chosen per stay (state.step4.stayStarChoice).
 */
export function generateAccommodationTables(stays, selections, hotelsByStars, state) {
  if (!stays?.length) {
    return '<p><em>Add itinerary days in Step 3 to see accommodation.</em></p>';
  }

  const groupType     = state?.step4?.groupType === 'git' ? 'git' : 'fit';
  const dateFrom      = state?.step1?.dateFrom || '';
  const stayStar      = state?.step4?.stayStarChoice || {};

  const anyHotel = stays.some(s => {
    const tier = stayStar[s.id] || '4';
    return selections?.[s.id]?.[tier]?.hotelId;
  });
  if (!anyHotel) {
    return '<p><em>Select hotels in Step 4 to see accommodation.</em></p>';
  }

  let grandSum = 0;
  let grandCurrency = null;
  const mixedCurrency = new Set();

  const blocks = stays.map(stay => {
    const tier = stayStar[stay.id] || '4';
    const sel = selections?.[stay.id]?.[tier];
    const hotel = sel?.hotelId ? findHotel(hotelsByStars, tier, sel.hotelId) : null;
    if (hotel) {
      const bd = buildStayBreakdown({ stay, sel, hotel, state, groupType, dateFrom });
      if (grandCurrency == null) grandCurrency = bd.currency;
      mixedCurrency.add(bd.currency);
      grandSum += bd.grandTotal;
    }
    return renderStayBlock(stay, tier, selections, hotelsByStars, state, groupType, dateFrom);
  }).join('');

  const adults   = Number(state?.step1?.adults   || 0);
  const children = Number(state?.step1?.children || 0);
  const totalPax = Math.max(1, adults + children);

  let grandBlock = '';
  if (grandSum > 0) {
    if (mixedCurrency.size > 1) {
      grandBlock = `<div class="accom-grand-total mixed">Multiple currencies across stays — see per-stay totals above.</div>`;
    } else {
      const perPax = grandSum / totalPax;
      grandBlock = `<div class="accom-grand-total">
        <div class="accom-grand-total-label">Accommodation grand total (all stays)</div>
        <div class="accom-grand-total-value">${formatMoney(grandSum, grandCurrency)} &nbsp;·&nbsp; ${formatPerPax(perPax, grandCurrency)} &nbsp;·&nbsp; ${totalPax} pax</div>
      </div>`;
    }
  }

  return `<div class="accom-wrap">
    <div class="accom-header">Group type: <strong>${groupType.toUpperCase()}</strong></div>
    ${blocks}
    ${grandBlock}
  </div>`;
}

function renderStayBlock(stay, tier, selections, hotelsByStars, state, groupType, dateFrom) {
  const sel   = selections?.[stay.id]?.[tier];
  const hotel = sel?.hotelId ? findHotel(hotelsByStars, tier, sel.hotelId) : null;
  const cityLabel = getCityLabel(stay.city);

  const dayLabel = stay.nights > 0
    ? `Day ${stay.startDay}${stay.endDay !== stay.startDay ? '–' + stay.endDay : ''} (${stay.nights} night${stay.nights !== 1 ? 's' : ''})`
    : `Day ${stay.startDay} (no overnight)`;

  if (!hotel) {
    return `
<div class="accom-stay accom-stay-empty">
  <div class="accom-stay-heading">${escapeHtml(cityLabel)} — ${dayLabel} <span class="accom-stay-tier">${tier}★</span></div>
  <div class="accom-stay-empty-msg">No hotel selected for this stay.</div>
</div>`;
  }

  const bd = buildStayBreakdown({ stay, sel, hotel, state, groupType, dateFrom });
  const { defaultRoomType, currency, season, overridden, perPax, grandTotal } = bd;

  const seasonBadge = season === 'high'
    ? `<span class="accom-season high">High Season</span>`
    : `<span class="accom-season low">Low Season</span>`;
  const vatTag = hotel.vatIncluded
    ? `<span class="accom-vat incl">VAT incl.</span>`
    : `<span class="accom-vat excl">+ VAT</span>`;
  const overrideTag = overridden
    ? `<span class="accom-override">Custom rate</span>` : '';
  const redFlag = (hotel.flags || []).includes('redFlag') || (defaultRoomType?.flags || []).includes('redFlag')
    ? `<span class="accom-redflag" title="Red-flagged">🚩</span>` : '';

  // Line-item table rows (skip internal 'total'/'perPax' rows — we render them as the footer).
  const bodyRows = bd.rows
    .filter(r => r.kind !== 'total' && r.kind !== 'perPax')
    .map(r => {
      const signedAmt = r.amount < 0
        ? `<span style="color:#c0392b">− ${formatMoney(Math.abs(r.amount), currency)}</span>`
        : `${formatMoney(r.amount, currency)}`;
      const rowClass = (r.kind === 'subtotal') ? ' subtotal-row'
                     : (r.kind === 'foc' || r.kind === 'eci' || r.kind === 'upgrade' || r.kind === 'extraBed' || r.kind === 'shareBed') ? ' surcharge-row'
                     : '';
      return `<tr class="${rowClass.trim()}">
  <td>${escapeHtml(r.label)}</td>
  <td>${escapeHtml(r.detail)}</td>
  <td style="text-align:right">${signedAmt}</td>
</tr>`;
    }).join('');

  return `
<div class="accom-stay">
  <div class="accom-stay-heading">${escapeHtml(cityLabel)} — ${dayLabel} <span class="accom-stay-tier">${tier}★</span></div>
  <div class="accom-stay-subheading">${redFlag}${escapeHtml(hotel.name)} · ${escapeHtml(defaultRoomType?.name || '')} ${seasonBadge} ${vatTag} ${overrideTag}</div>
  <table class="doc-table accom-table">
    <thead>
      <tr><th>Line</th><th>Detail</th><th style="width:140px;text-align:right">Amount</th></tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="grand-total-row">
        <td colspan="2" style="text-align:right;font-weight:800">Grand total</td>
        <td style="text-align:right;font-weight:800">${formatMoney(grandTotal, currency)}</td>
      </tr>
      <tr class="per-pax-row">
        <td colspan="2" style="text-align:right">÷ ${bd.totalPax} pax</td>
        <td style="text-align:right;font-weight:700;color:#0a7d2a">${formatPerPax(perPax, currency)}</td>
      </tr>
    </tbody>
  </table>
</div>`;
}

function findHotel(hotelsByStars, tier, hotelId) {
  const list = hotelsByStars?.[tier] || [];
  return list.find(h => h.id === hotelId) || null;
}

// ──────────────────────────────────────────────────────────────────────
//  Back-compat
// ──────────────────────────────────────────────────────────────────────

export function countNightsPerCity(briefRows) {
  const stays = computeStays(briefRows);
  const out = {};
  for (const s of stays) out[s.city] = (out[s.city] || 0) + s.nights;
  return out;
}
