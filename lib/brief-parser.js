/**
 * brief-parser.js
 *
 * Small helpers the itinerary brief grid uses:
 *  - Date formatting (long label + DD/MM/YYYY).
 *  - Meal string parse/format.
 *  - City detection from a title.
 *
 * The old Markdown-paste parser has been removed — Step 3 is now an
 * Excel-like editable grid driven directly by dateFrom/dateTo.
 */

const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Format a JS Date (UTC) → "Sun, 1st June 2026" */
export function formatDateLong(date) {
  const dow = WEEKDAYS[date.getUTCDay()].slice(0, 3);
  const d   = ordinal(date.getUTCDate());
  const mon = MONTHS[date.getUTCMonth()];
  const yr  = date.getUTCFullYear();
  return `${dow}, ${d} ${mon} ${yr}`;
}

/** Given ISO date "YYYY-MM-DD" + offset, return the long label. */
export function dayLabel(startDateStr, dayIndex) {
  if (!startDateStr) return '';
  const [y, m, d] = startDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dayIndex));
  return formatDateLong(dt);
}

/** ISO "YYYY-MM-DD" → "DD/MM/YYYY" (empty string on bad input). */
export function formatDateDDMMYYYY(isoDate) {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** "DD/MM/YYYY" → ISO "YYYY-MM-DD" (empty if invalid). */
export function parseDDMMYYYY(str) {
  if (!str) return '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str.trim());
  if (!m) return '';
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  return `${m[3]}-${mo}-${d}`;
}

/** Compute ISO date for dayIndex days past the start date. */
export function addDaysISO(startDateStr, dayIndex) {
  if (!startDateStr) return '';
  const [y, m, d] = startDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dayIndex));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Inclusive number-of-days between two ISO dates (1 if same day, 0 if invalid). */
export function countDays(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  const a = Date.parse(startISO + 'T00:00:00Z');
  const b = Date.parse(endISO + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Parse meal cell like "B/L/-" or "B/BR/-" → { B, L, D, BR } booleans. */
export function parseMeals(str) {
  const s = (str || '').toUpperCase();
  return {
    B:  s.includes('B') && !s.includes('BR'),
    L:  s.includes('L'),
    D:  s.includes('D'),
    BR: s.includes('BR'),
  };
}

/** Meals obj → "B/L/-" style compact string. */
export function formatMeals(meals) {
  const b = meals.B ? 'B' : (meals.BR ? 'BR' : '-');
  const l = meals.L ? 'L' : '-';
  const d = meals.D ? 'D' : '-';
  return `${b}/${l}/${d}`;
}

/** Meals obj → "Breakfast, Lunch" for the detail block. */
export function mealWords(meals) {
  const parts = [];
  if (meals.B)  parts.push('Breakfast');
  if (meals.BR) parts.push('Brunch');
  if (meals.L)  parts.push('Lunch');
  if (meals.D)  parts.push('Dinner');
  return parts.length ? parts.join(', ') : 'None';
}

/**
 * Guess a city code from a day's itinerary title.
 *
 * HA (Hội An) is separated from DN (Đà Nẵng):
 *  - If the title mentions Hội An AND does NOT mention Đà Nẵng as the overnight city,
 *    return HA. A simple heuristic: "hoi an" plus "overnight" / "drop off at hoi an".
 *  - Otherwise titles with "hoi an" that are day-trips from Đà Nẵng stay as DN.
 *  - Titles that only mention "da nang" / "bana" → DN.
 */
export function detectCityFromTitle(title) {
  const t = (title || '').toLowerCase();

  if (/hanoi|hà nội|ha noi/.test(t))                           return 'HN';
  if (/ninh binh|ninh bình|hoa lu|tam coc|trang an/.test(t))   return 'NB';
  if (/sapa|sa pa|fansipan|cat cat|moana|lao chai/.test(t))    return 'SP';
  if (/halong|hạ long|ha long|cruise|halongbay/.test(t))       return 'HL';

  const mentionsHoiAn = /hoi an|hội an|hoian/.test(t);
  const mentionsDaNang = /da nang|đà nẵng|danang|bana|ba na|bà nà/.test(t);

  if (mentionsHoiAn && (/overnight in hoi an|drop off.*hoi an|stay in hoi an|hoi an arrival/.test(t) || !mentionsDaNang)) {
    return 'HA';
  }
  if (mentionsDaNang || mentionsHoiAn) return 'DN';

  if (/ho chi minh|hcmc|saigon|sài gòn|cu chi|mekong/.test(t)) return 'HC';
  if (/phu quoc|phú quốc|phuquoc|vinpearl|grand world|rach vem|rạch vẹm/.test(t)) return 'PQ';
  return '';
}

/** Detect the unique city codes present in a list of brief rows (order-preserving). */
export function detectCities(briefRows) {
  const seen = new Set();
  const out  = [];
  for (const row of briefRows) {
    if (row.templateCity && !seen.has(row.templateCity)) {
      seen.add(row.templateCity);
      out.push(row.templateCity);
    }
  }
  return out;
}
