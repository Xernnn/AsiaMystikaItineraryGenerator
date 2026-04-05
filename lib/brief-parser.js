/**
 * brief-parser.js
 * Parse a pasted Markdown table into structured brief rows.
 */

const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Ordinal suffix for a day number */
function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Format a JS Date object → "Sun, 1st June 2026"
 */
export function formatDateLong(date) {
  const dow = WEEKDAYS[date.getUTCDay()].slice(0,3);
  const d   = ordinal(date.getUTCDate());
  const mon = MONTHS[date.getUTCMonth()];
  const yr  = date.getUTCFullYear();
  return `${dow}, ${d} ${mon} ${yr}`;
}

/**
 * Given a start date string (YYYY-MM-DD) and day index (0-based),
 * return the formatted date label.
 */
export function dayLabel(startDateStr, dayIndex) {
  if (!startDateStr) return '';
  const [y, m, day] = startDateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day + dayIndex));
  return formatDateLong(d);
}

/**
 * Parse pasted markdown/plain table into row objects.
 * Handles both:
 *   | Day 1 (Sun, 31st May 2026) | Hanoi Arrival … | -/-/D |
 *   Day 1 (Sun, 31st May 2026)   Hanoi Arrival …    -/-/D
 */
export function parsePastedBrief(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    // Skip separator lines like |---|---|---|
    if (/^\|[-\s|:]+\|$/.test(line)) continue;
    // Skip header lines
    if (/date.*itinerary.*meal/i.test(line)) continue;

    let cells;
    if (line.startsWith('|')) {
      cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    } else {
      // Tab or multi-space separated
      cells = line.split(/\t{2,}|\s{3,}/).map(c => c.trim()).filter(c => c.length > 0);
    }

    if (cells.length < 2) continue;

    const dateCell = cells[0];
    const titleCell = cells[1] || '';
    const mealCell  = cells[2] || '';

    // Parse day number and date from dateCell
    // e.g. "Day 1 (Sun, 31st May 2026)" or "Day 1"
    const dayMatch = dateCell.match(/Day\s*(\d+)/i);
    const dayNum   = dayMatch ? parseInt(dayMatch[1]) : rows.length + 1;

    // Try to parse the date in parentheses
    const dateInParen = dateCell.match(/\(([^)]+)\)/);
    let parsedDate = '';
    if (dateInParen) {
      parsedDate = parseDateFromLabel(dateInParen[1]);
    }

    // Parse meals B/L/D/BR
    const meals = parseMeals(mealCell);

    rows.push({
      dayNum,
      dateLabel: dateInParen ? dateInParen[1].trim() : '',
      parsedDate,
      title: titleCell.replace(/\\&amp;/g, '&').replace(/&amp;/g, '&'),
      meals,
      templateCity: '',
      templateKey: '',
    });
  }

  return rows;
}

/**
 * Try to parse a date like "Sun, 31st May 2026" → "2026-05-31"
 */
function parseDateFromLabel(label) {
  // Remove ordinal suffixes: 31st → 31
  const clean = label.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const m = clean.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return '';
  const day = parseInt(m[1]);
  const monStr = m[2];
  const yr = parseInt(m[3]);
  const monIdx = MONTHS.findIndex(mn => mn.toLowerCase().startsWith(monStr.toLowerCase().slice(0,3)));
  if (monIdx < 0) return '';
  return `${yr}-${String(monIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

/**
 * Parse meal string like "B/L/-" or "B/BR/-" → {B, L, D, BR}
 */
export function parseMeals(str) {
  const s = str.toUpperCase();
  return {
    B:  s.includes('B') && !s.includes('BR'),
    L:  s.includes('L'),
    D:  s.includes('D'),
    BR: s.includes('BR'),
  };
}

/**
 * Format meals object → "B/L/-" style string
 */
export function formatMeals(meals) {
  const b  = meals.B  ? 'B'  : (meals.BR ? 'BR' : '-');
  const l  = meals.L  ? 'L'  : '-';
  const d  = meals.D  ? 'D'  : '-';
  return `${b}/${l}/${d}`;
}

/**
 * Format meals for "Meals:" line in detail text
 */
export function mealWords(meals) {
  const parts = [];
  if (meals.B)  parts.push('Breakfast');
  if (meals.BR) parts.push('Brunch');
  if (meals.L)  parts.push('Lunch');
  if (meals.D)  parts.push('Dinner');
  return parts.length ? parts.join(', ') : 'None';
}

/**
 * Detect which cities appear in the brief rows
 * Returns array of city codes in order of first appearance.
 */
export function detectCities(briefRows) {
  const seen = new Set();
  const ordered = [];
  for (const row of briefRows) {
    if (row.templateCity && !seen.has(row.templateCity)) {
      seen.add(row.templateCity);
      ordered.push(row.templateCity);
    }
  }
  return ordered;
}

/**
 * Detect destinations from title text (fallback when templateCity not set)
 */
export function detectCityFromTitle(title) {
  const t = title.toLowerCase();
  if (/hanoi|hà nội|ha noi/.test(t)) return 'HN';
  if (/ninh binh|ninh bình|hoa lu|tam coc|trang an/.test(t)) return 'NB';
  if (/sapa|sa pa|fansipan|cat cat|moana|lao chai/.test(t)) return 'SP';
  if (/halong|hạ long|ha long|cruise|halongbay/.test(t)) return 'HL';
  if (/danang|đà nẵng|da nang|hoi an|hội an|bana|ba na|hoian/.test(t)) return 'DN';
  if (/ho chi minh|hcmc|saigon|cu chi|mekong/.test(t)) return 'HC';
  if (/phu quoc|phú quốc|phuquoc|vinpearl|grand world/.test(t)) return 'PQ';
  return '';
}
