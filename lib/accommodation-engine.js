/**
 * accommodation-engine.js
 *
 * Hotel-selection math and rendering for the new (v2) hotel schema.
 * Schema reference lives in [data/hotels.js](../data/hotels.js).
 *
 * Key exports
 *  - computeStays(briefRows)                         Contiguous-city runs → stays
 *  - pickRate(hotel, groupType, date)                FIT/GIT × low/high selection
 *  - calcEarlyCheckin(hotel, rate, paxInRoom)        50% fallback if hotel.earlyCheckinRate == null
 *  - calcUpgrade(upgrade, nights, paxInRoom)         (rate/night × nights) / paxInRoom
 *  - calcPerPax({rate, totalRooms, focRooms, totalPax, nights})
 *                                                   Full-stay per-pax price after FOC split
 *  - generateAccommodationTables(stays, selections, hotelsByStars, state)
 *                                                   HTML renderer for the document preview
 *  - getCityLabel(code)
 */

import { escapeHtml } from './detail-engine.js';
import { formatDateDDMMYYYY, addDaysISO } from './brief-parser.js';

// ──────────────────────────────────────────────────────────────────────
//  STAYS
// ──────────────────────────────────────────────────────────────────────

/**
 * A "stay" is a contiguous run of brief rows with the same templateCity.
 * If the same city reappears later in the trip it becomes a second stay.
 *
 * We include every row of the city in startDay..endDay. The number of nights
 * for that stay equals `length` of the run, EXCEPT that the very last row of
 * the whole itinerary is a departure day (no overnight), so the final stay
 * loses one night.
 *
 * @param {Array} briefRows
 * @returns {Array<{
 *    id: string,
 *    city: string,
 *    startDay: number,   // 1-based day number
 *    endDay: number,     // 1-based day number (inclusive)
 *    nights: number,
 *    rows: Array         // brief rows in this stay
 * }>}
 */
export function computeStays(briefRows) {
  if (!Array.isArray(briefRows) || briefRows.length === 0) return [];

  const stays = [];
  let current = null;

  briefRows.forEach((row, idx) => {
    const city = row.templateCity || '';
    if (!city) {
      // Row with no city breaks the current stay.
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

  // Compute night counts.
  const lastRowIdx = briefRows.length - 1;
  stays.forEach(s => {
    s.nights = s.rows.length;
    s.id = `${s.city}_${s.startDay}`;
  });
  // Last stay loses 1 night (departure day).
  if (stays.length) {
    const last = stays[stays.length - 1];
    // Only subtract if the very last brief row belongs to this stay
    if (last.rows[last.rows.length - 1] === briefRows[lastRowIdx]) {
      last.nights = Math.max(0, last.nights - 1);
    }
  }

  return stays;
}

// ──────────────────────────────────────────────────────────────────────
//  RATE SELECTION
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if an ISO date falls inside any of a hotel's high-season ranges.
 * Ranges are MM-DD strings and may wrap the year (e.g. 12-20 → 01-05).
 */
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
      // Wraps year end.
      if (key >= from || key <= to) return true;
    }
  }
  return false;
}

/**
 * Select FIT/GIT × low/high rate for a hotel on a given date.
 * Returns `{ ratePerRoom: number, season: 'low'|'high', groupType: 'fit'|'git' }`.
 * Returns ratePerRoom=0 if the hotel lacks that rate.
 */
export function pickRate(hotel, groupType, isoDate) {
  const gt = groupType === 'git' ? 'git' : 'fit';
  const season = isHighSeason(hotel, isoDate) ? 'high' : 'low';
  const ratePerRoom = Number(hotel?.rates?.[gt]?.[season] ?? 0);
  return { ratePerRoom, season, groupType: gt };
}

// ──────────────────────────────────────────────────────────────────────
//  SURCHARGE MATH
// ──────────────────────────────────────────────────────────────────────

/** Early check-in surcharge per pax. Fallback: 50% of the room rate if hotel.earlyCheckinRate is null. */
export function calcEarlyCheckin(hotel, ratePerRoom, paxInRoom) {
  const pax = Math.max(1, Number(paxInRoom) || 1);
  const override = hotel?.earlyCheckinRate;
  const totalRoomCharge = (override != null && override !== '') ? Number(override) : Number(ratePerRoom) * 0.5;
  if (!totalRoomCharge) return 0;
  return totalRoomCharge / pax;
}

/** Room-upgrade surcharge per pax over the whole stay. */
export function calcUpgrade(upgrade, nights, paxInRoom) {
  if (!upgrade || !upgrade.ratePerNight) return 0;
  const pax = Math.max(1, Number(paxInRoom) || 1);
  const n   = Math.max(0, Number(nights) || 0);
  return (Number(upgrade.ratePerNight) * n) / pax;
}

/**
 * Per-pax price for a stay with FOC rooms spread over total pax (including leader).
 *
 * Formula (selected in Q&A):
 *   perPax = ratePerRoom × paidRooms / totalPax
 *   paidRooms = max(0, totalRooms - focRooms)
 */
export function calcPerPax({ ratePerRoom, totalRooms, focRooms = 0, totalPax, nights = 1 }) {
  const paid = Math.max(0, Number(totalRooms || 0) - Number(focRooms || 0));
  const pax  = Math.max(1, Number(totalPax || 1));
  const n    = Math.max(0, Number(nights || 0));
  return (Number(ratePerRoom || 0) * paid * n) / pax;
}

/**
 * Suggest a FOC room count based on the hotel's focRule and rooms actually booked.
 * Example: rule "every 20 rooms → 1 free", booking 20 → 1, booking 40 → 2, booking 19 → 0.
 */
export function suggestFocCount(hotel, totalRooms) {
  const rule = hotel?.focRule;
  if (!rule || !rule.everyRooms || !rule.freeRooms) return 0;
  return Math.floor(Number(totalRooms || 0) / Number(rule.everyRooms)) * Number(rule.freeRooms);
}

// ──────────────────────────────────────────────────────────────────────
//  FORMATTING
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

// ──────────────────────────────────────────────────────────────────────
//  LABELS
// ──────────────────────────────────────────────────────────────────────

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

// Backwards-compat stub — no longer used by the new UI. Every city can have
// surcharges now (per Hiếu's feedback). Left in for any external references.
export const SURCHARGE_CITIES = new Set(['HN','NB','SP','HL','DN','HA','HC','PQ']);

// ──────────────────────────────────────────────────────────────────────
//  PREVIEW TABLE RENDERING
// ──────────────────────────────────────────────────────────────────────

/**
 * Render ACCOMMODATION section HTML for the document preview.
 *
 * @param {Array}  stays       result of computeStays()
 * @param {Object} selections  { [stayId]: { [starTier]: selection } }
 *                             where selection = {
 *                               hotelId, rooms2pax, rooms3pax, extraBeds,
 *                               shareBeds, focRooms, earlyCheckinDay, upgrade
 *                             }
 * @param {Object} hotelsByStars { "3":[...], "4":[...], "5":[...] }
 * @param {Object} state        full app state (for dateFrom, step1, step4)
 */
export function generateAccommodationTables(stays, selections, hotelsByStars, state) {
  if (!stays?.length) {
    return '<p><em>Add itinerary days in Step 3 to see accommodation.</em></p>';
  }

  const tierChoice = state?.step4?.tierChoice || '3+4';
  const tierKeys   = tierChoice === '4+5' ? ['4', '5'] : ['3', '4'];
  const groupType  = state?.step4?.groupType === 'git' ? 'git' : 'fit';
  const dateFrom   = state?.step1?.dateFrom || '';

  // Any tier with at least one real selection?
  const tiersWithHotels = tierKeys.filter(tier => {
    for (const stay of stays) {
      const sel = selections?.[stay.id]?.[tier];
      if (sel?.hotelId) return true;
    }
    return false;
  });
  if (!tiersWithHotels.length) {
    return '<p><em>Select hotels in Step 4 to see accommodation.</em></p>';
  }

  const tierHtml = tiersWithHotels.map(tier => {
    const starsLabel = '★'.repeat(Number(tier));
    const blocks = stays.map(stay => renderStayBlock(stay, tier, selections, hotelsByStars, state, groupType, dateFrom)).join('');
    return `
<div class="accom-tier">
  <div class="accom-tier-title">${starsLabel} ${tier}-STAR ${tier === '5' ? 'DELUXE' : 'STANDARD'} (${groupType.toUpperCase()})</div>
  ${blocks}
</div>`;
  }).join('');

  return `<div class="accom-wrap">${tierHtml}</div>`;
}

function renderStayBlock(stay, tier, selections, hotelsByStars, state, groupType, dateFrom) {
  const sel = selections?.[stay.id]?.[tier];
  const hotel = sel?.hotelId ? findHotel(hotelsByStars, tier, sel.hotelId) : null;
  const cityLabel = getCityLabel(stay.city);

  const dayLabel = stay.nights > 0
    ? `Day ${stay.startDay}${stay.endDay !== stay.startDay ? '–' + stay.endDay : ''} (${stay.nights} night${stay.nights !== 1 ? 's' : ''})`
    : `Day ${stay.startDay} (no overnight)`;

  if (!hotel) {
    return `
<div class="accom-stay accom-stay-empty">
  <div class="accom-stay-heading">${escapeHtml(cityLabel)} — ${dayLabel}</div>
  <div class="accom-stay-empty-msg">No hotel selected for this stay.</div>
</div>`;
  }

  // Resolve rate on the first night of the stay
  const firstNightISO = addDaysISO(dateFrom, (stay.startDay || 1) - 1);
  const { ratePerRoom, season } = pickRate(hotel, groupType, firstNightISO);

  const rooms2 = Number(sel.rooms2pax || 0);
  const rooms3 = Number(sel.rooms3pax || 0);
  const totalRooms = rooms2 + rooms3;
  const focRooms = Number(sel.focRooms || 0);
  const paidRooms = Math.max(0, totalRooms - focRooms);

  const adults   = Number(state?.step1?.adults   || 0);
  const children = Number(state?.step1?.children || 0);
  const totalPax = Math.max(1, adults + children);

  const paxPerRoom = totalRooms > 0 ? Math.max(1, Math.round(totalPax / totalRooms)) : 2;

  const perPax = calcPerPax({
    ratePerRoom,
    totalRooms,
    focRooms,
    totalPax,
    nights: stay.nights,
  });

  const extraBeds = Number(sel.extraBeds || 0);
  const shareBeds = Number(sel.shareBeds || 0);
  const extraBedTotal = extraBeds * Number(hotel.extraBed || 0) * Math.max(1, stay.nights);
  const shareBedTotal = shareBeds * Number(hotel.shareBed || 0) * Math.max(1, stay.nights);

  let earlyCheckin = 0;
  if (sel.earlyCheckinDay) {
    earlyCheckin = calcEarlyCheckin(hotel, ratePerRoom, paxPerRoom);
  }
  let upgradeSurcharge = 0;
  if (sel.upgrade && hotel.upgrade) {
    upgradeSurcharge = calcUpgrade(hotel.upgrade, stay.nights, paxPerRoom);
  }

  const currency = hotel.currency || 'USD';
  const seasonBadge = season === 'high'
    ? `<span class="accom-season high">High Season</span>`
    : `<span class="accom-season low">Low Season</span>`;
  const vatTag = hotel.vatIncluded
    ? `<span class="accom-vat incl">VAT incl.</span>`
    : `<span class="accom-vat excl">+ VAT</span>`;

  const surchargeRows = [];
  if (earlyCheckin > 0) {
    const dateLabel = sel.earlyCheckinDay ? ` on Day ${sel.earlyCheckinDay}` : '';
    surchargeRows.push(`<tr class="surcharge-row">
  <td colspan="3" style="padding-left:20px">↳ Early check-in${dateLabel}</td>
  <td style="text-align:right">${formatPerPax(earlyCheckin, currency)}</td>
</tr>`);
  }
  if (upgradeSurcharge > 0) {
    surchargeRows.push(`<tr class="surcharge-row">
  <td colspan="3" style="padding-left:20px">↳ Upgrade to ${escapeHtml(hotel.upgrade.roomType)}</td>
  <td style="text-align:right">${formatPerPax(upgradeSurcharge, currency)}</td>
</tr>`);
  }

  const extraBedRow = extraBeds > 0
    ? `<tr><td colspan="3" style="padding-left:20px">↳ Extra bed × ${extraBeds}</td><td style="text-align:right">${formatMoney(extraBedTotal, currency)} total</td></tr>`
    : '';
  const shareBedRow = shareBeds > 0
    ? `<tr><td colspan="3" style="padding-left:20px">↳ Share bed × ${shareBeds}</td><td style="text-align:right">${formatMoney(shareBedTotal, currency)} total</td></tr>`
    : '';
  const focRow = focRooms > 0
    ? `<tr><td colspan="3" style="padding-left:20px">↳ FOC rooms × ${focRooms} (cost split across ${totalPax} pax)</td><td></td></tr>`
    : '';

  return `
<div class="accom-stay">
  <div class="accom-stay-heading">${escapeHtml(cityLabel)} — ${dayLabel}</div>
  <div class="accom-stay-subheading">${escapeHtml(hotel.name)} · ${escapeHtml(hotel.roomType || '')} ${seasonBadge} ${vatTag}</div>
  <table class="doc-table accom-table">
    <thead>
      <tr><th>Rooms</th><th>Rate / room / night</th><th>Nights</th><th>Per pax</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${formatRoomBreakdown(rooms2, rooms3)}</td>
        <td>${formatMoney(ratePerRoom, currency)}</td>
        <td style="text-align:center">${stay.nights}</td>
        <td style="text-align:right;font-weight:700">${formatPerPax(perPax, currency)}</td>
      </tr>
      ${focRow}
      ${extraBedRow}
      ${shareBedRow}
      ${surchargeRows.join('\n')}
    </tbody>
  </table>
</div>`;
}

function formatRoomBreakdown(rooms2, rooms3) {
  const parts = [];
  if (rooms2 > 0) parts.push(`${rooms2} × Double/Twin`);
  if (rooms3 > 0) parts.push(`${rooms3} × Triple`);
  return parts.length ? parts.join(' + ') : '—';
}

function findHotel(hotelsByStars, tier, hotelId) {
  const list = hotelsByStars?.[tier] || [];
  return list.find(h => h.id === hotelId) || null;
}

// ──────────────────────────────────────────────────────────────────────
//  Back-compat exports — used by old callers; safe no-ops now.
// ──────────────────────────────────────────────────────────────────────

/** Count nights per city (legacy helper). */
export function countNightsPerCity(briefRows) {
  const stays = computeStays(briefRows);
  const out = {};
  for (const s of stays) out[s.city] = (out[s.city] || 0) + s.nights;
  return out;
}
