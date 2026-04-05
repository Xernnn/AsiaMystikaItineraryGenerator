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
  const mealStr = mealWords(row.meals);

  let bodyText = '';
  if (row.templateText && row.templateText.trim()) {
    bodyText = escapeHtml(row.templateText.trim());
  } else {
    bodyText = `<em style="color:#888">[No template selected — please choose a template for this day in Step 3]</em>`;
  }

  return `
<div class="doc-day-title">Day ${row.dayNum}${row.dateLabel ? ' (' + escapeHtml(row.dateLabel) + ')' : ''}: ${escapeHtml(row.title)}</div>
<div class="doc-day-meta">Meals: ${mealStr}${accom ? ' | Accommodation: ' + escapeHtml(accom) : ''}</div>
<div class="doc-day-body">${bodyText}</div>
`.trim() + '\n';
}

/**
 * Determine accommodation note for a day based on city/hotels.
 */
function accommodationNote(row, state) {
  if (!row.templateCity) return '';
  const city = row.templateCity;
  // Use 3* hotel as reference (or 4* or 5* if no 3*)
  const h3 = state.step4?.hotels3?.[city];
  const h4 = state.step4?.hotels4?.[city];
  const h5 = state.step4?.hotels5?.[city];
  const hotel = h3 || h4 || h5;
  if (hotel?.name) return hotel.name;
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
    const mealStr = [
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
      return row.meals.L;
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
      return row.meals.L;
    }
  }
  return false;
}
