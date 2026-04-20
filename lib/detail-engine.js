/**
 * detail-engine.js
 * Maps brief rows + template selections → formatted ITINERARY DETAILS section
 */
import { mealWords } from './brief-parser.js';

/**
 * Generate the full ITINERARY DETAILS HTML for all brief rows.
 * @param {Array}  briefRows - array of {dayNum, dateLabel, title, meals, templateKey, templateCity, templateText}
 * @param {Object} state     - full app state for context
 * @returns {string} HTML string
 */
export function generateDetails(briefRows, state) {
  let html = '';
  for (const row of briefRows) {
    html += renderDay(row, state);
  }
  return html;
}

/**
 * Render a single day's detail block.
 */
function renderDay(row, state) {
  const accom = accommodationNote(row, state);
  // meals is now a free-text string; legacy object still supported
  const mealStr = typeof row.meals === 'string'
    ? (row.meals || 'None')
    : mealWords(row.meals);
  const guideBit = '';

  let bodyText = '';
  if (row.templateText && row.templateText.trim()) {
    bodyText = escapeHtml(row.templateText.trim());
  } else {
    bodyText = `<em style="color:#888">[No template selected — please choose a template for this day in Step 3]</em>`;
  }

  return `
<div class="doc-day-title">Day ${row.dayNum}${row.dateLabel ? ' (' + escapeHtml(row.dateLabel) + ')' : ''}: ${escapeHtml(row.title || '')}</div>
<div class="doc-day-meta">Meals: ${mealStr}${guideBit}${accom ? ' | Accommodation: ' + escapeHtml(accom) : ''}</div>
<div class="doc-day-body">${bodyText}</div>
`.trim() + '\n';
}

/**
 * Determine accommodation note for a day based on city/hotels.
 */
function accommodationNote(row, state) {
  if (!row.templateCity) return '';
  const stays = state?.step4?.stays || [];
  const selections = state?.step4?.selections || {};
  const stayStarChoice = state?.step4?.stayStarChoice || {};
  const hotelsByStars = state?._hotelsByStars || {};
  const stay = stays.find(s => s.city === row.templateCity &&
    row.dayNum >= s.startDay && row.dayNum <= s.endDay);
  if (!stay) return '';
  // Use the per-stay chosen star tier first, then fall through all tiers
  const preferred = stayStarChoice[stay.id] || '4';
  for (const tier of [preferred, '3', '4', '5']) {
    const sel = selections?.[stay.id]?.[tier];
    if (!sel?.hotelId) continue;
    const h = (hotelsByStars?.[tier] || []).find(x => x.id === sel.hotelId);
    if (h?.name) return h.name;
  }
  return '';
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate ITINERARY BRIEF table HTML.
 */
export function generateBriefTable(briefRows) {
  if (!briefRows.length) return '';

  let rows = '';
  for (const row of briefRows) {
    const mealStr = typeof row.meals === 'string'
      ? escapeHtml(row.meals || '—')
      : [
          row.meals.B ? 'B' : (row.meals.BR ? 'BR' : '-'),
          row.meals.L ? 'L' : '-',
          row.meals.D ? 'D' : '-',
        ].join('/');

    const dateDisplay = row.dateLabel
      ? `Day ${row.dayNum} (${escapeHtml(row.dateLabel)})`
      : `Day ${row.dayNum}`;

    rows += `<tr>
  <td>${dateDisplay}</td>
  <td>${escapeHtml(row.title)}</td>
  <td style="text-align:center;white-space:nowrap">${mealStr}</td>
</tr>\n`;
  }

  return `<table class="doc-table">
<thead><tr><th>Date</th><th>Itinerary</th><th>Meals</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

/**
 * Detect if a brief row involves Halong Bay overnight cruise (vs day cruise).
 */
export function isHalongOvernight(row) {
  const t = row.title.toLowerCase();
  return t.includes('hl') || t.includes('halong') || t.includes('hạ long') || t.includes('cruise');
}

/**
 * Detect if a meal code for a Bana Hills day includes Lunch.
 */
export function hasBanaLunch(briefRows) {
  for (const row of briefRows) {
    const t = row.title.toLowerCase();
    if (t.includes('bana') || t.includes('ba na') || t.includes('bà nà')) {
      return mealsHas(row.meals, 'L');
    }
  }
  return false;
}

/**
 * Detect if a meal code for Fansipan/Sapa includes Lunch.
 */
export function hasFansipanLunch(briefRows) {
  for (const row of briefRows) {
    const t = row.title.toLowerCase();
    if (t.includes('fansipan') || t.includes('sapa')) {
      return mealsHas(row.meals, 'L');
    }
  }
  return false;
}

/** Check if a meal entry (string or legacy object) includes a given code. */
function mealsHas(meals, code) {
  if (typeof meals === 'string') return new RegExp('\\b' + code + '\\b', 'i').test(meals);
  return !!(meals?.[code]);
}
