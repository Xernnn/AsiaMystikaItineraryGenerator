/**
 * notes-engine.js
 * Auto-generate Notes, Tour Includes, Tour Excludes sections.
 */
import { hasBanaLunch, hasFansipanLunch } from './detail-engine.js';

/**
 * Generate NOTES section text.
 */
export function generateNotes(state, briefRows) {
  const notes = [];
  const adults   = state.step1?.adults   || 0;
  const children = state.step1?.children || 0;
  const roomType = state.step1?.roomType || 'double';
  const rooms    = state.step1?.rooms    || 1;

  // Tipping
  const totalPax = adults + children;
  if (totalPax < 10) {
    notes.push('Tipping fee for driver and guide: USD 5/pax/day (FIT rate).');
  } else {
    notes.push('Tipping fee for driver and guide: USD 3/pax/day (GIT rate).');
  }

  // Children note
  if (children > 0) {
    notes.push('Children from 11 years old are considered adults for pricing purposes.');
  }

  // Room type notes
  if (roomType === 'triple') {
    notes.push('Triple room = Double/Twin room + 1 Extra Bed. Maximum 1 Extra Bed per room.');
    notes.push('Please note that extra bed arrangements must be confirmed with the hotel at booking.');
  }
  if (roomType === 'family') {
    notes.push('Family rooms are subject to availability. Please confirm family room suitability at booking.');
  }

  // Halong transport
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

  // Guide language
  if (state.step2?.guideLanguage === 'other') {
    notes.push('Non-English speaking guide supplement applies. Please confirm language requirement.');
  }

  // Early check-in
  const hasSurcharge = checkAnySurcharges(state);
  if (hasSurcharge) {
    notes.push('Early check-in surcharge = 50% of room rate per person (subject to room availability).');
    notes.push('Room upgrade surcharge = upgrade rate per night × number of nights ÷ pax per room.');
  }

  return notes;
}

function checkAnySurcharges(state) {
  for (const tierKey of ['hotels3', 'hotels4', 'hotels5']) {
    const tier = state.step4?.[tierKey] || {};
    for (const city of Object.values(tier)) {
      if (city?.earlyCheckinSurcharge || city?.upgradeSurcharge) return true;
    }
  }
  return false;
}

/**
 * Generate TOUR INCLUDES list items based on detected cities & options.
 */
export function generateIncludes(state, briefRows) {
  const items = [];
  const cities = new Set(briefRows.map(r => r.templateCity).filter(Boolean));

  const adults   = state.step1?.adults   || 0;
  const children = state.step1?.children || 0;
  const roomType = state.step1?.roomType || 'double';
  const rooms    = state.step1?.rooms    || 1;
  const mealPlan = state.step1?.mealPlan || 'MAP';

  // Vehicle
  const carSize = state.step2?.carSize || '7s';
  items.push(`Private air-conditioned ${carSizeLabel(carSize)} for all transfers and tours`);

  // Guide
  const lang = state.step2?.guideLanguage === 'other' ? '' : 'English-speaking ';
  items.push(`Professional ${lang}local guide throughout the tour`);

  // Accommodation per city
  const nightsMap = buildNightsMap(briefRows);
  for (const city of orderedCities(briefRows)) {
    const nights = nightsMap[city] || 0;
    if (nights <= 0) continue;
    const roomLabel = roomTypeLabel(roomType, rooms, adults + children);
    items.push(`${nights} night${nights > 1 ? 's' : ''} accommodation in ${getCityFull(city)} (${roomLabel})`);
  }

  // Meals
  if (mealPlan === 'CP')  items.push('Daily breakfast at hotel');
  if (mealPlan === 'MAP') items.push('Daily breakfast and one main meal at hotel');
  if (mealPlan === 'FB')  items.push('Daily full board meals (breakfast, lunch, dinner)');

  // City-specific includes
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
    const hasOvernight = briefRows.some(r => r.templateCity === 'HL' && isHalongOvernight(r.title));
    const hasDay       = briefRows.some(r => r.templateCity === 'HL' && !isHalongOvernight(r.title));
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
  if (cities.has('DN')) {
    items.push('Da Nang city tour');
    const hasHoiAn = briefRows.some(r => /hoi an|hội an/i.test(r.title));
    if (hasHoiAn) {
      items.push('Hoi An Ancient Town visit (entrance tickets included)');
      items.push('Basket boat experience in Hoi An Coconut Forest');
    }
    const hasBana = briefRows.some(r => /bana|bà nà/i.test(r.title));
    if (hasBana) {
      const withBuffet = briefRows.some(r => /bana|bà nà/i.test(r.title) && r.meals.L);
      items.push(`Bana Hills Cable Car Ticket${withBuffet ? ' with Buffet Ticket' : ''}`);
    }
  }
  if (cities.has('HC')) {
    items.push('Ho Chi Minh City half-day city tour (Independence Palace, Notre Dame Cathedral, Ben Thanh Market)');
    const hasCuChi   = briefRows.some(r => /cu chi/i.test(r.title));
    const hasMekong  = briefRows.some(r => /mekong/i.test(r.title));
    if (hasCuChi)  items.push('Cu Chi Tunnels tour (entrance ticket included)');
    if (hasMekong) items.push('Mekong Delta day tour with lunch');
  }
  if (cities.has('PQ')) {
    items.push('Phu Quoc local guide & transfers');
    const hasVinpearl = briefRows.some(r => /vinpearl|vinwonder/i.test(r.title));
    const hasIslands  = briefRows.some(r => /island|4 island|3 island/i.test(r.title));
    if (hasVinpearl) items.push('Vinpearl Safari & VinWonders Phu Quoc entrance tickets');
    if (hasIslands)  items.push('4-Island Boat Tour (lunch included, snorkeling, cable car)');
  }

  // Tipping
  const totalPax = adults + children;
  if (totalPax < 10) {
    items.push('Tipping for guide and driver: USD 5/pax/day');
  } else {
    items.push('Tipping for guide and driver: USD 3/pax/day');
  }

  return items;
}

/**
 * Generate TOUR EXCLUDES list.
 */
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

  const hasHoiAn = briefRows.some(r => /hoi an|hội an/i.test(r.title));
  if (hasHoiAn) {
    items.push('Hoi An Workshop ticket and Boat Ticket (at your own expense)');
  }

  if (cities.has('SP')) {
    items.push('Sapa trekking permit (if applicable)');
  }

  items.push('Any surcharges not mentioned in Rate & Conditions');

  return items;
}

/**
 * Generate IMPORTANT NOTES (fixed).
 */
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

/**
 * Generate CANCELLATION TERMS (fixed, FIT vs Group).
 */
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

// ─── Helpers ───────────────────────────────────────

function carSizeLabel(size) {
  const map = { '7s':'7-seater', '16s':'16-seater', '29s':'29-seater', '35s':'35-seater', '45s':'45-seater' };
  return map[size] || size;
}

function roomTypeLabel(type, rooms, totalPax) {
  const paxPerRoom = Math.round(totalPax / Math.max(rooms, 1));
  if (type === 'double') return `${rooms} Double/Twin Room${rooms > 1 ? 's' : ''}`;
  if (type === 'triple') return `${rooms} Triple Room${rooms > 1 ? 's' : ''} (Double + Extra Bed)`;
  if (type === 'family') return `${rooms} Family Room${rooms > 1 ? 's' : ''}`;
  return `${rooms} room${rooms > 1 ? 's' : ''}`;
}

function getCityFull(code) {
  const map = {
    HN:'Hanoi', NB:'Ninh Binh', SP:'Sapa',
    HL:'Halong Bay', DN:'Da Nang / Hoi An',
    HC:'Ho Chi Minh City', PQ:'Phu Quoc',
  };
  return map[code] || code;
}

function isHalongOvernight(title) {
  const t = title.toLowerCase();
  return t.includes('overnight') || t.includes('night') || t.includes('d1') || t.includes('d2') ||
         (t.includes('cruise') && !t.includes('day cruise'));
}

function buildNightsMap(briefRows) {
  const counts = {};
  for (const row of briefRows) {
    const c = row.templateCity;
    if (c) counts[c] = (counts[c] || 0) + 1;
  }
  const last = briefRows.filter(r => r.templateCity).slice(-1)[0]?.templateCity;
  if (last && counts[last] > 0) counts[last]--;
  return counts;
}

function orderedCities(briefRows) {
  const seen = new Set();
  const result = [];
  for (const row of briefRows) {
    if (row.templateCity && !seen.has(row.templateCity)) {
      seen.add(row.templateCity);
      result.push(row.templateCity);
    }
  }
  return result;
}
