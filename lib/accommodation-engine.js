/**
 * accommodation-engine.js
 * Hotel selection display and surcharge calculations.
 */
import { escapeHtml } from './detail-engine.js';

/** Cities that may have surcharges displayed */
export const SURCHARGE_CITIES = new Set(['SP', 'DN', 'PQ', 'HL']);

/**
 * Count nights per city from brief rows.
 * A city gets 1 night per consecutive row in that city that isn't the last day.
 * Simple approach: count how many days have that templateCity, minus 1 for last.
 */
export function countNightsPerCity(briefRows) {
  const counts = {};
  for (const row of briefRows) {
    const city = row.templateCity || '';
    if (!city) continue;
    counts[city] = (counts[city] || 0) + 1;
  }
  // Subtract 1 from last city (departure day doesn't count as night)
  const cities = Object.keys(counts);
  if (cities.length > 0) {
    const lastCity = briefRows.filter(r => r.templateCity).slice(-1)[0]?.templateCity;
    if (lastCity && counts[lastCity] > 1) counts[lastCity]--;
    else if (lastCity) delete counts[lastCity];
  }
  return counts;
}

/**
 * Calculate early check-in surcharge.
 * = 50% of room rate (for 1 room, per pax in that room)
 * @param {string} rateStr - e.g. "850k" or "32 USD"
 * @param {number} paxPerRoom - adults + children sharing that room
 * @returns {string} formatted surcharge string
 */
export function calcEarlyCheckin(rateStr, paxPerRoom) {
  const rate = parseRate(rateStr);
  if (!rate) return '—';
  const surcharge = (rate * 0.5) / Math.max(paxPerRoom, 1);
  return formatRate(surcharge, isUSD(rateStr));
}

/**
 * Calculate room upgrade surcharge.
 * upgradeRateStr is the per-night surcharge (not the full room rate).
 * = upgradeRate * nights / paxPerRoom
 * @param {string} baseRateStr   (used only for currency detection)
 * @param {string} upgradeRateStr
 * @param {number} nights
 * @param {number} paxPerRoom
 */
export function calcUpgrade(baseRateStr, upgradeRateStr, nights, paxPerRoom) {
  const upgrade = parseRate(upgradeRateStr);
  if (!upgrade) return '—';
  const total = (upgrade * nights) / Math.max(paxPerRoom, 1);
  return formatRate(total, isUSD(upgradeRateStr) || isUSD(baseRateStr));
}

/** Parse a rate string like "850k" → 850000, "32 USD" → 32 */
function parseRate(str) {
  if (!str) return 0;
  const s = str.toLowerCase().trim();
  const m = s.match(/([\d,.]+)\s*k/);
  if (m) return parseFloat(m[1].replace(/,/g, '')) * 1000;
  const m2 = s.match(/([\d,.]+)\s*usd/);
  if (m2) return parseFloat(m2[1].replace(/,/g, ''));
  const m3 = s.match(/^([\d,.]+)$/);
  if (m3) return parseFloat(m3[1].replace(/,/g, ''));
  return 0;
}

function isUSD(str) {
  return str && str.toUpperCase().includes('USD');
}

function formatRate(num, inUSD) {
  if (inUSD) return `$${num.toFixed(2)} USD`;
  if (num >= 1000) return `${Math.round(num / 1000)}k VND`;
  return `${Math.round(num)} VND`;
}

/**
 * Generate the Accommodation Tables HTML (3* and 4* side by side).
 * @param {Array}  orderedCities - city codes in order
 * @param {Object} hotels3       - {city: {hotel, rate, earlyCheckin, upgrade, nights}}
 * @param {Object} hotels4       - same structure
 * @param {Object} nightsMap     - {city: nightCount}
 * @param {Object} state
 */
export function generateAccommodationTables(orderedCities, hotels3, hotels4, hotels5, nightsMap, state) {
  const cities = orderedCities.filter(c => nightsMap[c] > 0);
  if (!cities.length) return '<p><em>No accommodation data — complete Steps 3 and 4 first.</em></p>';

  const pax = (state.step1?.adults || 2) + (state.step1?.children || 0);
  const paxPerRoom = Math.max(1, Math.round(pax / Math.max(state.step1?.rooms || 1, 1)));

  const tiers = [
    { key: hotels3, label: '⭐⭐⭐ 3-STAR STANDARD' },
    { key: hotels4, label: '⭐⭐⭐⭐ 4-STAR STANDARD' },
    { key: hotels5, label: '⭐⭐⭐⭐⭐ 5-STAR / DELUXE' },
  ].filter(t => Object.values(t.key).some(h => h?.name));

  if (!tiers.length) {
    return '<p><em>No hotels selected — complete Step 4 first.</em></p>';
  }

  const cols = tiers.length === 1 ? '1fr' : tiers.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr';
  const cols_html = tiers.map(t => `
  <div>
    <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#1a73e8">${t.label}</div>
    ${buildAccomTable(cities, t.key, nightsMap, t.label, paxPerRoom)}
  </div>`).join('');

  return `
<div class="doc-section-title">ACCOMMODATION</div>
<div style="display:grid;grid-template-columns:${cols};gap:16px;margin-top:8px">${cols_html}
</div>`;
}

function buildAccomTable(cities, hotelsMap, nightsMap, label, paxPerRoom) {
  let rows = '';
  let hasSurcharge = false;
  const surchargeRows = [];

  for (const city of cities) {
    const h = hotelsMap[city];
    const nights = nightsMap[city] || 0;
    if (!h || !h.name) continue;
    const rate   = h.currentRate || (h.rateType === 'high' ? h.highRate : h.lowRate) || '—';
    const vatSuffix = h.vatIncluded ? ' <span style="color:#2e7d32;font-size:10px">(VAT✔)</span>' : ' <span style="color:#b45309;font-size:10px">(+VAT)</span>';
    const roomTypeLine = h.roomType ? `<div style="font-size:10px;color:#666;margin-top:2px">${escapeHtml(h.roomType)}</div>` : '';
    rows += `<tr>
  <td>${getCityLabel(city)}</td>
  <td>${escapeHtml(h.name)}${roomTypeLine}</td>
  <td>${escapeHtml(rate)}${vatSuffix}</td>
  <td style="text-align:center">${nights}n</td>
</tr>`;
    if (h.earlyCheckinSurcharge) {
      hasSurcharge = true;
      surchargeRows.push(`<tr><td colspan="2" style="padding-left:20px;color:#856404">↳ Early check-in (${getCityLabel(city)})</td><td colspan="2" style="text-align:right;color:#856404">${escapeHtml(h.earlyCheckinSurcharge)}</td></tr>`);
    }
    if (h.upgradeSurcharge) {
      hasSurcharge = true;
      surchargeRows.push(`<tr><td colspan="2" style="padding-left:20px;color:#856404">↳ Upgrade (${getCityLabel(city)})</td><td colspan="2" style="text-align:right;color:#856404">${escapeHtml(h.upgradeSurcharge)}</td></tr>`);
    }
  }

  return `<table class="doc-table">
<thead><tr><th>City</th><th>Hotel / Cruise</th><th>Rate/pax</th><th>Nts</th></tr></thead>
<tbody>
${rows}
${hasSurcharge ? '<tr><td colspan="4" style="font-weight:700;background:#fff8e1;padding:6px 10px">Surcharges</td></tr>' + surchargeRows.join('\n') : ''}
</tbody>
</table>`;
}

/** City code → display label */
export function getCityLabel(code) {
  const map = {
    HN: 'Hanoi', NB: 'Ninh Binh', SP: 'Sapa',
    HL: 'Halong Bay', DN: 'Da Nang / Hoi An',
    HC: 'Ho Chi Minh City', PQ: 'Phu Quoc',
  };
  return map[code] || code;
}
