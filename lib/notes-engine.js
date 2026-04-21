/**
 * notes-engine.js
 * Auto-generate NOTES, TOUR INCLUDES, TOUR EXCLUDES, IMPORTANT NOTES, CANCELLATION sections.
 *
 * Key behaviour changes (v2):
 *  - Tipping rule (GIT vs FIT) is based on total paying pax — independent from the
 *    manual FIT/GIT rate toggle in Step 4.
 *  - Indian group tag surfaces at the top of Notes when step1.isIndian.
 *  - Guide line is generated per-day from briefRows.guide / guideLanguage.
 *  - Sapa split-bus include line appears when Step 2 sapaZoneCar is "split".
 */

import { hasFansipanLunch } from './detail-engine.js';
import { getCityLabel } from './accommodation-engine.js';

/** NOTES list. */
export function generateNotes(state, briefRows) {
  const notes = [];
  const adults   = state.step1?.adults   || 0;
  const children = state.step1?.children || 0;
  const totalPax = adults + children;

  if (state.step1?.isIndian) {
    notes.push('INDIAN GROUP — dietary and cultural preferences will be honoured throughout the tour.');
  }

  if (totalPax < 10) {
    notes.push('Tipping fee for driver and guide: USD 5/pax/day (FIT rate).');
  } else {
    notes.push('Tipping fee for driver and guide: USD 3/pax/day (GIT rate).');
  }

  if (children > 0) {
    notes.push('Children from 11 years old are considered adults for pricing purposes.');
  }

  const hasTriple = (state.step4?.stays || []).some(stay =>
    Object.values(stay?.selections || {}).some(sel => (sel?.rooms3pax || 0) > 0)
  );
  if (hasTriple) {
    notes.push('Triple room = Double/Twin room + 1 Extra Bed. Maximum 1 Extra Bed per room.');
    notes.push('Extra bed arrangements are subject to hotel confirmation at the time of booking.');
  }

  const shuttleHalong = state.step2?.shuttleHalong === 'yes';
  const limoSapa      = state.step2?.limoSapa      === 'yes';
  const hasHalong     = briefRows.some(r => r.templateCity === 'HL');
  const hasSapa       = briefRows.some(r => r.templateCity === 'SP');

  if (hasHalong && shuttleHalong) {
    notes.push('Transfer to Halong Bay: Shared Shuttle Bus (fixed departure times). Private car upgrade available on request.');
  }
  if (hasSapa && limoSapa) {
    notes.push('Transfer to Sapa: Private Limousine (overnight sleeper bus / train optional upon request).');
  }

  // Per-day guide summary line
  const guideLine = buildGuideLine(briefRows);
  if (guideLine) notes.push(guideLine);

  // Early check-in / upgrade notes if any surcharges are in play
  if (anySurchargeSelected(state)) {
    notes.push('Early check-in surcharge = 50% of the room rate per day (or as contracted), divided by pax per room.');
    notes.push('Room upgrade surcharge = (upgrade rate per night × number of nights) ÷ pax per room.');
  }

  if ((state.step4?.stays || []).some(s => Object.values(s.selections || {}).some(sel => (sel?.focRooms || 0) > 0))) {
    notes.push('FOC (Free of Charge) rooms are provided per hotel contract; their cost is spread evenly across all paying pax plus the tour leader.');
  }

  return notes;
}

/** TOUR INCLUDES list. */
export function generateIncludes(state, briefRows) {
  const items = [];
  const cities = new Set(briefRows.map(r => r.templateCity).filter(Boolean));

  const adults   = state.step1?.adults   || 0;
  const children = state.step1?.children || 0;
  const mealPlan = state.step1?.mealPlan || 'MAP';

  const carSize = state.step2?.carSize || '7s';
  items.push(`Private air-conditioned ${carSizeLabel(carSize)} for all transfers and tours`);

  const sapaLine = describeZoneFleet(state.step2?.sapaZone);
  if (sapaLine) items.push(`Sapa transfer vehicle${state.step2?.sapaZone?.n29 + state.step2?.sapaZone?.n16 > 1 ? 's' : ''}: ${sapaLine}`);
  const pqLine = describeZoneFleet(state.step2?.pqZone);
  if (pqLine) items.push(`Phu Quoc (Rach Vem) transfer vehicle${state.step2?.pqZone?.n29 + state.step2?.pqZone?.n16 > 1 ? 's' : ''}: ${pqLine}`);

  const guidedDays = (briefRows || []).filter(r => r.hasGuide);
  if (guidedDays.length) {
    const langs = new Set(guidedDays.map(r => r.guideLanguage || 'english'));
    const langLabel = langs.has('english') && langs.size === 1 ? 'English-speaking' : [...langs].join(' / ');
    items.push(`Professional ${langLabel} local guide on ${guidedDays.length} day(s) of the tour`);
  }

  // Accommodation summary per stay
  for (const stay of (state.step4?.stays || [])) {
    if (!stay.nights || stay.nights <= 0) continue;
    items.push(`${stay.nights} night${stay.nights > 1 ? 's' : ''} accommodation in ${getCityLabel(stay.city)} (Day ${stay.startDay}${stay.endDay !== stay.startDay ? '–' + stay.endDay : ''})`);
  }

  if (mealPlan === 'CP')  items.push('Daily breakfast at hotel');
  if (mealPlan === 'MAP') items.push('Daily breakfast and one main meal at hotel');
  if (mealPlan === 'FB')  items.push('Daily full board meals (breakfast, lunch, dinner)');

  if (cities.has('HN')) {
    items.push('Hanoi city tour (Old Quarter, Hoan Kiem Lake, Temple of Literature, Tran Quoc Pagoda)');
  }
  if (cities.has('NB')) {
    items.push('Ninh Binh tour (entrance tickets included)');
  }
  if (cities.has('SP')) {
    items.push('Fansipan Cable Car ticket' + (hasFansipanLunch(briefRows) ? ' with Buffet Ticket' : ''));
    if (state.step2?.limoSapa === 'yes') {
      items.push('Private limousine transfer Hanoi ↔ Sapa (round-trip)');
    }
  }
  if (cities.has('HL')) {
    const hasOvernight = briefRows.some(r => r.templateCity === 'HL' && isHalongOvernightTitle(r.title));
    const hasDay       = briefRows.some(r => r.templateCity === 'HL' && !isHalongOvernightTitle(r.title));
    if (hasOvernight) {
      items.push('2D1N Halong Bay Overnight Cruise Package (all meals, kayaking, activities on board)');
      if (state.step2?.shuttleHalong === 'yes') {
        items.push('Shared shuttle bus transfer to Halong Bay (round-trip)');
      }
    }
    if (hasDay) {
      items.push('Halong Bay Day Cruise Package with Lunch');
    }
  }
  if (cities.has('DN') || cities.has('HA')) {
    items.push('Da Nang city tour');
    if (cities.has('HA') || briefRows.some(r => /hoi an|hội an/i.test(r.title))) {
      items.push('Hoi An Ancient Town visit (entrance tickets included)');
      items.push('Basket boat experience in Hoi An Coconut Forest');
    }
    const hasBana = briefRows.some(r => /bana|bà nà/i.test(r.title));
    if (hasBana) {
      const withBuffet = briefRows.some(r => /bana|bà nà/i.test(r.title) && mealsHas(r.meals, 'L'));
      items.push(`Bana Hills Cable Car Ticket${withBuffet ? ' with Buffet Ticket' : ''}`);
    }
  }
  if (cities.has('HC')) {
    items.push('Ho Chi Minh City half-day city tour (Independence Palace, Notre Dame Cathedral, Ben Thanh Market)');
    if (briefRows.some(r => /cu chi/i.test(r.title)))  items.push('Cu Chi Tunnels tour (entrance ticket included)');
    if (briefRows.some(r => /mekong/i.test(r.title))) items.push('Mekong Delta day tour with lunch');
  }
  if (cities.has('PQ')) {
    items.push('Phu Quoc local guide & transfers');
    if (briefRows.some(r => /vinpearl|vinwonder/i.test(r.title))) items.push('Vinpearl Safari & VinWonders Phu Quoc entrance tickets');
    if (briefRows.some(r => /island|4 island|3 island/i.test(r.title))) items.push('4-Island Boat Tour (lunch included, snorkeling, cable car)');
  }

  const totalPax = adults + children;
  if (totalPax < 10) {
    items.push('Tipping for guide and driver: USD 5/pax/day');
  } else {
    items.push('Tipping for guide and driver: USD 3/pax/day');
  }

  return items;
}

/** TOUR EXCLUDES list. */
export function generateExcludes(state, briefRows) {
  const cities = new Set(briefRows.map(r => r.templateCity).filter(Boolean));
  const items = [
    'International flights and domestic flights (unless otherwise stated)',
    'Vietnam visa fees',
    'Personal expenses (laundry, telephone, mini bar, etc.)',
    'Travel insurance',
    'Any meals not mentioned in Tour Includes',
    'Optional activities and entrance fees not listed',
  ];

  if (cities.has('HA') || briefRows.some(r => /hoi an|hội an/i.test(r.title))) {
    items.push('Hoi An Workshop ticket and Boat Ticket (at your own expense)');
  }

  if (cities.has('SP')) {
    items.push('Sapa trekking permit (if applicable)');
  }

  items.push('Any surcharges not mentioned in Rate & Conditions');
  return items;
}

/** IMPORTANT NOTES (fixed). */
export function generateImportantNotes() {
  return [
    'All prices are per person in USD based on double/twin room sharing unless stated otherwise.',
    'Prices are subject to change without prior notice due to peak seasons and public holidays.',
    'Hotel rooms are subject to availability at time of confirmation.',
    'Check-in time is generally 14:00; check-out is 12:00. Early check-in/late check-out is subject to availability and may incur additional charges.',
    'The itinerary is subject to change due to weather conditions, road conditions, or other circumstances beyond our control.',
    'Asia Mystika reserves the right to make necessary alterations to the itinerary without prior notice.',
    'Passengers are responsible for ensuring they have valid travel documents (passport, visa, etc.).',
  ];
}

/** CANCELLATION TERMS (FIT / group split by total pax). */
export function generateCancellationTerms(state) {
  const totalPax = (state.step1?.adults || 0) + (state.step1?.children || 0);
  const isGroup  = totalPax >= 10;

  if (isGroup) {
    return [
      'More than 30 days before departure: 10% of total tour cost',
      '15–30 days before departure: 30% of total tour cost',
      '7–14 days before departure: 50% of total tour cost',
      '3–6 days before departure: 75% of total tour cost',
      'Less than 3 days before departure or no-show: 100% of total tour cost',
    ];
  }
  return [
    'More than 15 days before departure: 10% of total tour cost',
    '8–14 days before departure: 50% of total tour cost',
    '4–7 days before departure: 75% of total tour cost',
    '0–3 days before departure or no-show: 100% of total tour cost',
  ];
}

// ──────────────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────────────

function buildGuideLine(briefRows) {
  const parts = [];
  for (const r of briefRows || []) {
    if (!r.hasGuide) continue;
    const lang = r.guideLanguage && r.guideLanguage !== 'english' ? ` (${r.guideLanguage})` : '';
    const city = r.templateCity ? ` in ${getCityLabel(r.templateCity)}` : '';
    parts.push(`Day ${r.dayNum}${city}${lang}`);
  }
  if (!parts.length) return '';
  return `English-speaking guide on: ${parts.join('; ')}.`;
}

function anySurchargeSelected(state) {
  for (const stay of (state.step4?.stays || [])) {
    for (const sel of Object.values(stay.selections || {})) {
      if (!sel) continue;
      if (sel.earlyCheckinDay) return true;
      if (sel.upgrade) return true;
    }
  }
  return false;
}

function mealsHas(meals, code) {
  if (typeof meals === 'string') return new RegExp('\\b' + code + '\\b', 'i').test(meals);
  return !!(meals?.[code]);
}

function carSizeLabel(size) {
  const map = { '7s':'7-seater', '16s':'16-seater', '29s':'29-seater', '35s':'35-seater', '45s':'45-seater' };
  return map[size] || size;
}

/** Describe a zone fleet like {n29: 2, n16: 1} → "2 × 29-seater + 1 × 16-seater". */
function describeZoneFleet(zone) {
  if (!zone) return '';
  const n29 = Number(zone.n29 || 0);
  const n16 = Number(zone.n16 || 0);
  if (n29 === 0 && n16 === 0) return '';
  const parts = [];
  if (n29 > 0) parts.push(`${n29} × 29-seater`);
  if (n16 > 0) parts.push(`${n16} × 16-seater`);
  return parts.join(' + ');
}

function isHalongOvernightTitle(title) {
  const t = (title || '').toLowerCase();
  return t.includes('overnight') || t.includes('night') ||
         (t.includes('cruise') && !t.includes('day cruise'));
}
