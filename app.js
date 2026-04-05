/**
 * app.js — Main controller for Asia Mystika Itinerary Generator
 */
import { parsePastedBrief, formatMeals, parseMeals, detectCityFromTitle, dayLabel } from './lib/brief-parser.js';
import { parseRequest } from './lib/request-parser.js';
import { generateBriefTable, generateDetails, escapeHtml } from './lib/detail-engine.js';
import { countNightsPerCity, generateAccommodationTables, getCityLabel, SURCHARGE_CITIES } from './lib/accommodation-engine.js';
import { generateNotes, generateIncludes, generateExcludes, generateImportantNotes, generateCancellationTerms } from './lib/notes-engine.js';
import { downloadDocx } from './lib/docx-generator.js';
import { initAdminUI, getTemplates, getHotels } from './admin/admin-manager.js';
import { CITY_LABELS } from './data/templates.js';

// ─── State ────────────────────────────────────────────────
const state = {
  step1: { title:'', dateFrom:'', dateTo:'', adults:2, children:0, childrenAges:[], rooms:1, roomType:'double', mealPlan:'MAP' },
  step2: { carSize:'7s', shuttleHalong:'no', limoSapa:'no', guideLanguage:'english' },
  step3: { briefRows: [] },
  step4: { hotels3:{}, hotels4:{}, hotels5:{} },
};

// ─── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initStepCollapse();
  initQuickParse();
  initStep1();
  initStep2();
  initStep3();
  initOutput();
  initAdminUI(showToast);
  suggestCarSize(); // set initial suggestion based on defaults
});

// ─── Tab switching ────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
      // Refresh hotel blocks when returning to generator (admin may have changed hotel data)
      if (btn.dataset.tab === 'generator' && state.step3.briefRows.length) {
        updateStep4Hotels();
      }
    });
  });
}

// ─── Step collapse (disabled — steps always visible, panel scrolls) ───────────
function initStepCollapse() {
  // No-op: accordion removed in favour of scrollable panel
}

// ─── Quick Parse ───────────────────────────────────────────
function initQuickParse() {
  // Collapsible toggle for quick parse card
  const toggle = document.getElementById('quickParseToggle');
  const body   = document.getElementById('quickParseBody');
  const chev   = document.getElementById('quickParseChevron');
  if (toggle && body) {
    // Start collapsed
    body.style.display = 'none';
    if (chev) chev.textContent = '▶';
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      if (chev) chev.textContent = open ? '▶' : '▼';
    });
  }

  document.getElementById('parseRequestBtn')?.addEventListener('click', () => {
    const text = document.getElementById('requestPasteArea')?.value || '';
    if (!text.trim()) { showToast('Paste a request first.', 'error'); return; }

    const result = parseRequest(text);
    const { step1Fields, briefRows, hotelStars, warnings } = result;

    // ── Fill Step 1 fields ──────────────────────────────
    const s1 = step1Fields;
    state.step1.title       = s1.title       || state.step1.title;
    state.step1.dateFrom    = s1.dateFrom    || '';
    state.step1.dateTo      = s1.dateTo      || '';
    state.step1.adults      = s1.adults      ?? state.step1.adults;
    state.step1.children    = s1.children    ?? 0;
    state.step1.childrenAges = s1.childrenAges || [];
    state.step1.rooms       = s1.rooms       ?? state.step1.rooms;
    state.step1.roomType    = s1.roomType    || state.step1.roomType;
    state.step1.mealPlan    = s1.mealPlan    || state.step1.mealPlan;

    // Sync DOM
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== null && val !== undefined) el.value = val; };
    setVal('tourTitle', state.step1.title);
    setVal('dateFrom',  state.step1.dateFrom);
    setVal('dateTo',    state.step1.dateTo);
    setVal('adults',    state.step1.adults);
    setVal('children',  state.step1.children);
    setVal('rooms',     state.step1.rooms);
    setVal('roomType',  state.step1.roomType);
    setVal('mealPlan',  state.step1.mealPlan);

    const childAgesEl = document.getElementById('childAges');
    if (childAgesEl && s1.childrenAges.length) {
      childAgesEl.value = s1.childrenAges.join(', ');
    }
    const childAgesGroup = document.getElementById('childAgesGroup');
    if (childAgesGroup) childAgesGroup.style.display = state.step1.children > 0 ? 'block' : 'none';

    // Auto-suggest car size
    suggestCarSize();

    // ── Fill Brief rows ─────────────────────────────────
    state.step3.briefRows = briefRows;
    state.step4 = { hotels3:{}, hotels4:{}, hotels5:{} };
    renderBriefFormRows();
    updateBriefPreview();
    updateStep4Hotels();

    // Switch Step 3 to form mode so user sees the rows
    document.querySelectorAll('.brief-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.brief-mode').forEach(m => m.classList.remove('active'));
    document.querySelector('.brief-tab-btn[data-btab="form"]')?.classList.add('active');
    document.getElementById('brief-form-mode')?.classList.add('active');

    // ── Show warnings ───────────────────────────────────
    const warnBox = document.getElementById('parseWarnings');
    if (warnBox) {
      if (warnings.length) {
        warnBox.style.display = '';
        warnBox.textContent = '⚠️ ' + warnings.join('\n⚠️ ');
      } else {
        warnBox.style.display = 'none';
      }
    }

    const dayCount = briefRows.length;
    showToast(`Parsed! ${dayCount} days auto-filled ✓${warnings.length ? ' (see warnings)' : ''}`, 'success');
  });
}

// ─── Step 1 ───────────────────────────────────────────────
function initStep1() {
  const fields = ['tourTitle','dateFrom','dateTo','adults','children','rooms','roomType','mealPlan'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      state.step1[id === 'tourTitle' ? 'title' : id] = el.type === 'number' ? parseInt(el.value)||0 : el.value;
      if (id === 'children') {
        document.getElementById('childAgesGroup').style.display = parseInt(el.value) > 0 ? 'block' : 'none';
        suggestCarSize();
      }
      if (id === 'adults' || id === 'children') suggestCarSize();
      if (id === 'dateFrom' && state.step3.briefRows.length) {
        state.step3.briefRows.forEach((row, i) => {
          row.dateLabel = dayLabel(el.value, i);
        });
        renderBriefFormRows();
        updateBriefPreview();
      }
    });
    el.addEventListener('change', () => el.dispatchEvent(new Event('input')));
  });

  document.getElementById('childAges')?.addEventListener('input', e => {
    state.step1.childrenAges = e.target.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  });
}

function suggestCarSize() {
  const total = state.step1.adults + state.step1.children;
  let size = '7s';
  if (total <= 2)       size = '7s';
  else if (total <= 6)  size = '16s';
  else if (total <= 14) size = '29s';
  else if (total <= 17) size = '35s';
  else                  size = '45s';

  const suggest = document.getElementById('carSuggest');
  if (suggest) suggest.textContent = `Suggested: ${size} (${total} pax)`;
  // Auto-set if user hasn't manually overridden
  const sel = document.getElementById('carSize');
  if (sel) { sel.value = size; state.step2.carSize = size; }
}

// ─── Step 2 ───────────────────────────────────────────────
function initStep2() {
  ['carSize','shuttleHalong','limoSapa','guideLanguage'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => { state.step2[id] = el.value; });
  });
}

// ─── Step 3 – Brief ───────────────────────────────────────
function initStep3() {
  // Brief sub-tabs
  document.querySelectorAll('.brief-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.brief-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.brief-mode').forEach(m => m.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`brief-${btn.dataset.btab}-mode`)?.classList.add('active');
    });
  });

  // Add row button
  document.getElementById('addBriefRow')?.addEventListener('click', () => {
    addBriefRow();
    // Scroll to newly added row
    const container = document.getElementById('briefRowsContainer');
    container?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Clear brief button
  document.getElementById('clearBriefBtn')?.addEventListener('click', () => {
    if (state.step3.briefRows.length && !confirm('Clear all itinerary days?')) return;
    state.step3.briefRows = [];
    state.step4 = { hotels3:{}, hotels4:{}, hotels5:{} };
    renderBriefFormRows();
    updateBriefPreview();
    updateStep4Hotels();
    showToast('Brief cleared.', '');
  });

  // Parse paste button
  document.getElementById('parseBriefBtn')?.addEventListener('click', () => {
    const text = document.getElementById('briefPasteArea')?.value || '';
    const rows = parsePastedBrief(text);
    if (!rows.length) { showToast('No rows detected. Check paste format.', 'error'); return; }
    // Auto-detect city from each row's title
    rows.forEach(row => {
      if (!row.templateCity) row.templateCity = detectCityFromTitle(row.title) || '';
    });
    state.step3.briefRows = rows;
    renderBriefFormRows();
    updateBriefPreview();
    updateStep4Hotels();
    // Switch to form tab so user sees the parsed rows
    document.querySelectorAll('.brief-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.brief-mode').forEach(m => m.classList.remove('active'));
    document.querySelector('.brief-tab-btn[data-btab="form"]')?.classList.add('active');
    document.getElementById('brief-form-mode')?.classList.add('active');
    showToast(`Parsed ${rows.length} day(s) ✓`, 'success');
  });
}

// ─── Brief row management ─────────────────────────────────
let rowCounter = 0;

function addBriefRow(rowData = null) {
  const idx = state.step3.briefRows.length;
  const dayNum = idx + 1;
  const dateStr = state.step1.dateFrom ? dayLabel(state.step1.dateFrom, idx) : '';

  const row = rowData || {
    dayNum,
    dateLabel: dateStr,
    parsedDate: '',
    title: '',
    meals: { B: false, L: false, D: false, BR: false },
    templateCity: '',
    templateKey: '',
    templateText: '',
  };
  state.step3.briefRows.push(row);
  renderBriefFormRows();
  updateBriefPreview();
  updateStep4Hotels();
}

function renderBriefFormRows() {
  const container = document.getElementById('briefRowsContainer');
  if (!container) return;
  container.innerHTML = '';

  state.step3.briefRows.forEach((row, idx) => {
    const div = document.createElement('div');
    div.className = 'brief-row-card';
    div.dataset.idx = idx;

    const templates = getTemplates();
    const templateOptions = buildTemplateOptions(templates, row.templateCity, row.templateKey);
    const cityOptions = buildCityOptions(row.templateCity);

    div.innerHTML = `
      <div class="brief-row-num">Day ${row.dayNum}</div>
      <button class="btn-remove-row" data-idx="${idx}" title="Remove day">✕</button>
      <div class="row-top">
        <div class="field-group" style="margin:0">
          <label>Date</label>
          <input type="text" class="row-date" value="${escapeHtml(row.dateLabel || '')}" placeholder="Mon, 1st June 2026" />
        </div>
        <div class="field-group" style="margin:0">
          <label>Meals</label>
          <div class="row-meals">
            <label><input type="checkbox" class="meal-b"  ${row.meals.B  ? 'checked' : ''} /> B</label>
            <label><input type="checkbox" class="meal-l"  ${row.meals.L  ? 'checked' : ''} /> L</label>
            <label><input type="checkbox" class="meal-d"  ${row.meals.D  ? 'checked' : ''} /> D</label>
            <label><input type="checkbox" class="meal-br" ${row.meals.BR ? 'checked' : ''} /> BR</label>
          </div>
        </div>
      </div>
      <div class="row-mid">
        <div class="field-group" style="margin:0">
          <label>Itinerary Title</label>
          <input type="text" class="row-title" value="${escapeHtml(row.title)}" placeholder="Hanoi – Hanoi Full-day City Tour" />
        </div>
      </div>
      <div class="field-row" style="margin-bottom:0">
        <div class="field-group" style="margin:0">
          <label>City</label>
          <select class="row-city">${cityOptions}</select>
        </div>
        <div class="field-group" style="margin:0">
          <label>Template</label>
          <select class="row-template">${templateOptions}</select>
        </div>
      </div>`;

    container.appendChild(div);

    // Events
    div.querySelector('.btn-remove-row').addEventListener('click', () => {
      state.step3.briefRows.splice(idx, 1);
      // Re-number days
      state.step3.briefRows.forEach((r, i) => { r.dayNum = i + 1; });
      renderBriefFormRows();
      updateBriefPreview();
      updateStep4Hotels();
    });

    div.querySelector('.row-date').addEventListener('input', e => {
      state.step3.briefRows[idx].dateLabel = e.target.value;
      updateBriefPreview();
    });

    div.querySelector('.row-title').addEventListener('input', e => {
      state.step3.briefRows[idx].title = e.target.value;
      // Auto-detect city from title
      const autoCity = detectCityFromTitle(e.target.value);
      if (autoCity && !state.step3.briefRows[idx].templateCity) {
        state.step3.briefRows[idx].templateCity = autoCity;
        div.querySelector('.row-city').value = autoCity;
        refreshTemplateDropdown(div, idx, autoCity);
      }
      updateBriefPreview();
      updateStep4Hotels();
    });

    ['meal-b','meal-l','meal-d','meal-br'].forEach(cls => {
      div.querySelector(`.${cls}`)?.addEventListener('change', e => {
        const key = cls.replace('meal-','').toUpperCase();
        if (key === 'BR') state.step3.briefRows[idx].meals.BR = e.target.checked;
        else state.step3.briefRows[idx].meals[key] = e.target.checked;
        updateBriefPreview();
      });
    });

    div.querySelector('.row-city').addEventListener('change', e => {
      state.step3.briefRows[idx].templateCity = e.target.value;
      state.step3.briefRows[idx].templateKey  = '';
      state.step3.briefRows[idx].templateText = '';
      refreshTemplateDropdown(div, idx, e.target.value);
      updateStep4Hotels();
    });

    div.querySelector('.row-template').addEventListener('change', e => {
      const [city, keyIdx] = e.target.value.split('::');
      const templates = getTemplates();
      const tmpl = templates[city]?.[parseInt(keyIdx)];
      state.step3.briefRows[idx].templateKey  = tmpl?.key  || '';
      state.step3.briefRows[idx].templateText = tmpl?.text || '';
    });
  });
}

function refreshTemplateDropdown(div, idx, city) {
  const sel = div.querySelector('.row-template');
  if (!sel) return;
  sel.innerHTML = buildTemplateOptions(getTemplates(), city, '');
}

function buildCityOptions(selectedCity) {
  const cities = Object.entries(CITY_LABELS);
  return `<option value="">— Select City —</option>` +
    cities.map(([code, label]) =>
      `<option value="${code}" ${code === selectedCity ? 'selected' : ''}>${label}</option>`
    ).join('');
}

function buildTemplateOptions(templates, city, selectedKey) {
  let opts = `<option value="">— Select Template —</option>`;
  const citiesToShow = city ? [city] : Object.keys(templates);
  for (const c of citiesToShow) {
    const items = templates[c] || [];
    if (items.length) {
      opts += `<optgroup label="${CITY_LABELS[c] || c}">`;
      items.forEach((t, i) => {
        const val = `${c}::${i}`;
        const sel = t.key === selectedKey ? 'selected' : '';
        opts += `<option value="${val}" ${sel}>${escapeHtml(t.key.slice(0, 60))}</option>`;
      });
      opts += `</optgroup>`;
    }
  }
  return opts;
}

// ─── Brief preview ────────────────────────────────────────
function updateBriefPreview() {
  const rows = state.step3.briefRows;
  const wrap = document.getElementById('briefPreviewWrap');
  const preview = document.getElementById('briefTablePreview');
  if (!wrap || !preview) return;

  if (!rows.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  preview.innerHTML = generateBriefTable(rows);
}

// ─── Step 4 – Hotels ──────────────────────────────────────
function updateStep4Hotels() {
  const briefRows = state.step3.briefRows;
  const nightsMap = countNightsPerCity(briefRows);
  const orderedCities = getOrderedCities(briefRows);
  const cities = orderedCities.filter(c => nightsMap[c] > 0);

  renderHotelTierCities('tier3Cities', cities, nightsMap, '3', state.step4.hotels3);
  renderHotelTierCities('tier4Cities', cities, nightsMap, '4', state.step4.hotels4);
  renderHotelTierCities('tier5Cities', cities, nightsMap, '5', state.step4.hotels5);
}

function getOrderedCities(briefRows) {
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

function renderHotelTierCities(containerId, cities, nightsMap, stars, hotelState) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!cities.length) {
    container.innerHTML = '<p class="no-dest-msg">Fill in the brief first to see available cities.</p>';
    return;
  }

  container.innerHTML = '';
  const allHotels = getHotels();
  const tierHotels = allHotels[stars] || [];
  let renderedCount = 0;

  for (const city of cities) {
    const nights = nightsMap[city] || 0;
    const cityHotels = tierHotels.filter(h => h.city === city && !(h.flags||[]).includes('skip'));
    if (!cityHotels.length) continue;
    renderedCount++;

    const block = document.createElement('div');
    block.className = 'hotel-city-block';

    // Auto-init state with first hotel so generation works without user touching it
    if (!hotelState[city]) {
      const h0 = cityHotels[0];
      hotelState[city] = { hotelIdx:0, name:h0?.name||'', roomType:h0?.roomType||'', vatIncluded:h0?.vatIncluded, rateType:'low', currentRate:h0?.lowRate||'' };
    }
    const currentSel = hotelState[city];
    const hotelOpts = cityHotels.map((h, i) => {
      const vatTag   = h.vatIncluded ? ' ✅VAT' : ' ❌+VAT';
      const flags    = h.flags || [];
      const flagTags = [
        flags.includes('dayCruiseOnly') ? ' [Day Cruise]' : '',
        flags.includes('gitOnly')       ? ' [GIT]'        : '',
        flags.includes('noExtraBed')    ? ' [No EB]'      : '',
        flags.includes('partialPrice')  ? ' [?Price]'     : '',
      ].join('');
      return `<option value="${i}" ${currentSel?.hotelIdx === i ? 'selected' : ''}>${escapeHtml(h.name)}${vatTag}${flagTags}</option>`;
    }).join('');

    const selectedHotelIdx = currentSel?.hotelIdx ?? 0;
    const selectedHotel    = cityHotels[selectedHotelIdx];
    const hasSurcharge     = SURCHARGE_CITIES.has(city);

    block.innerHTML = `
      <div class="hotel-city-name">
        ${escapeHtml(getCityLabel(city))}
        <span class="hotel-nights-badge">${nights} night${nights !== 1 ? 's' : ''}</span>
      </div>
      <div class="hotel-select-row">
        <select class="hotel-sel" data-city="${city}" data-stars="${stars}">
          <option value="">— Select Hotel —</option>
          ${hotelOpts}
        </select>
        <span class="vat-tag ${selectedHotel?.vatIncluded ? 'vat-included' : 'vat-excluded'}" id="vatTag-${stars}-${city}">
          ${selectedHotel?.vatIncluded ? 'VAT ✅' : 'VAT ❌'}
        </span>
      </div>
      ${renderRateSelection(selectedHotel, stars, city, currentSel)}
      ${hasSurcharge ? renderSurchargeBlock(selectedHotel, stars, city, nights, currentSel) : ''}
      ${(selectedHotel?.flags||[]).includes('noExtraBed') && state.step1.roomType === 'triple'
        ? '<div class="flag-warning">⚠️ This hotel cannot provide Extra Bed — not suitable for Triple Room</div>' : ''}`;

    container.appendChild(block);

    // Helper: re-render inner rate+surcharge section and rebind events
    const rerenderBlock = () => {
      const hotel = cityHotels[hotelState[city].hotelIdx || 0];
      const vatEl = block.querySelector(`#vatTag-${stars}-${city}`);
      if (vatEl) {
        vatEl.textContent = hotel?.vatIncluded ? 'VAT ✅' : 'VAT ❌';
        vatEl.className = `vat-tag ${hotel?.vatIncluded ? 'vat-included' : 'vat-excluded'}`;
      }
      // Remove dynamic sections (keep .hotel-city-name and .hotel-select-row)
      block.querySelector('.rate-select-row')?.remove();
      block.querySelector('.surcharge-block')?.remove();
      block.querySelector('.flag-warning')?.remove();
      block.insertAdjacentHTML('beforeend', renderRateSelection(hotel, stars, city, hotelState[city]));
      if (hasSurcharge) block.insertAdjacentHTML('beforeend', renderSurchargeBlock(hotel, stars, city, nights, hotelState[city]));
      if ((hotel?.flags||[]).includes('noExtraBed') && state.step1.roomType === 'triple') {
        block.insertAdjacentHTML('beforeend', '<div class="flag-warning">⚠️ This hotel cannot provide Extra Bed — not suitable for Triple Room</div>');
      }
      bindRateEvents(block, stars, city, cityHotels, hotelState, nights, hasSurcharge);
    };

    block.querySelector('.hotel-sel').addEventListener('change', e => {
      const idx = parseInt(e.target.value);
      const hotel = cityHotels[idx];
      hotelState[city] = { hotelIdx:idx, name:hotel?.name||'', roomType:hotel?.roomType||'', vatIncluded:hotel?.vatIncluded, rateType:'low', currentRate:hotel?.lowRate||'' };
      rerenderBlock();
    });

    bindRateEvents(block, stars, city, cityHotels, hotelState, nights, hasSurcharge);
  }

  if (renderedCount === 0) {
    container.innerHTML = '<p class="no-dest-msg">No hotels available for these destinations in this tier.</p>';
  }
}

function renderRateSelection(hotel, stars, city, currentSel) {
  if (!hotel) return '';
  const lowRate  = hotel.lowRate  || '—';
  const highRate = hotel.highRate || '—';
  const selRate  = currentSel?.rateType || 'low';
  return `<div class="rate-select-row">
    <label class="rate-item ${selRate === 'low' ? 'selected' : ''}" data-rate="low">
      <input type="radio" name="rate-${stars}-${city}" value="low" ${selRate === 'low' ? 'checked' : ''} />
      <div><div style="font-size:10px;color:#666">Low Season</div><div class="rate-display">${escapeHtml(lowRate)}</div></div>
    </label>
    <label class="rate-item ${selRate === 'high' ? 'selected' : ''}" data-rate="high">
      <input type="radio" name="rate-${stars}-${city}" value="high" ${selRate === 'high' ? 'checked' : ''} />
      <div><div style="font-size:10px;color:#666">High Season</div><div class="rate-display">${escapeHtml(highRate)}</div></div>
    </label>
  </div>`;
}

function renderSurchargeBlock(hotel, stars, city, nights, currentSel) {
  if (!hotel) return '';
  const hasUpgrade = hotel.upgradeRoom && hotel.upgradeRoom.trim();
  return `<div class="surcharge-block">
    <div class="surcharge-title">💰 Surcharges (${getCityLabel(city)})</div>
    <div class="surcharge-row">
      <div class="field-group" style="margin:0">
        <label>Early check-in</label>
        <input type="date" class="surcharge-earlycheckin" data-city="${city}" data-stars="${stars}"
          value="${currentSel?.earlyCheckinDate || ''}" />
      </div>
      <div class="field-group" style="margin:0">
        <label>Calculated</label>
        <div class="surcharge-calc" id="eciCalc-${stars}-${city}">${currentSel?.earlyCheckinSurcharge || '—'}</div>
      </div>
    </div>
    ${hasUpgrade ? `
    <div class="field-group" style="margin:0">
      <label>Room Upgrade</label>
      <select class="surcharge-upgrade" data-city="${city}" data-stars="${stars}">
        <option value="">No upgrade</option>
        ${parseUpgradeOptions(hotel.upgradeRoom).map(o =>
          `<option value="${o.rate}" ${currentSel?.upgradeRate === o.rate ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
        ).join('')}
      </select>
    </div>` : ''}
  </div>`;
}

function bindRateEvents(block, stars, city, cityHotels, hotelState, nights, hasSurcharge) {
  block.querySelectorAll(`input[name="rate-${stars}-${city}"]`).forEach(radio => {
    radio.addEventListener('change', e => {
      if (!hotelState[city]) hotelState[city] = {};
      hotelState[city].rateType = e.target.value;
      const hotel = cityHotels[hotelState[city].hotelIdx || 0];
      const newRate = e.target.value === 'low' ? hotel?.lowRate : hotel?.highRate;
      hotelState[city].currentRate = newRate;
      block.querySelectorAll('.rate-item').forEach(ri => ri.classList.remove('selected'));
      e.target.closest('.rate-item')?.classList.add('selected');
      // Re-calc early check-in surcharge with new rate if date already set
      if (hotelState[city].earlyCheckinDate) {
        const paxPerRoom = Math.max(1, Math.round((state.step1.adults + state.step1.children) / Math.max(state.step1.rooms, 1)));
        const calc = calcEarlyCheckinSimple(newRate, paxPerRoom);
        hotelState[city].earlyCheckinSurcharge = calc;
        const calcEl = document.getElementById(`eciCalc-${stars}-${city}`);
        if (calcEl) calcEl.textContent = calc;
      }
    });
  });

  block.querySelector('.surcharge-earlycheckin')?.addEventListener('change', e => {
    if (!hotelState[city]) hotelState[city] = {};
    hotelState[city].earlyCheckinDate = e.target.value;
    const hotel = cityHotels[hotelState[city].hotelIdx || 0];
    const rate  = hotelState[city].rateType === 'high' ? hotel?.highRate : hotel?.lowRate;
    const paxPerRoom = Math.max(1, Math.round((state.step1.adults + state.step1.children) / Math.max(state.step1.rooms, 1)));
    const calc  = e.target.value ? calcEarlyCheckinSimple(rate, paxPerRoom) : '—';
    const calcEl = document.getElementById(`eciCalc-${stars}-${city}`);
    if (calcEl) calcEl.textContent = calc;
    hotelState[city].earlyCheckinSurcharge = e.target.value ? calc : '';
  });

  block.querySelector('.surcharge-upgrade')?.addEventListener('change', e => {
    if (!hotelState[city]) hotelState[city] = {};
    const upgradeRate = e.target.value;
    hotelState[city].upgradeRate = upgradeRate;
    if (upgradeRate) {
      const hotel = cityHotels[hotelState[city].hotelIdx || 0];
      const baseRate = hotelState[city].rateType === 'high' ? hotel?.highRate : hotel?.lowRate;
      const paxPerRoom = Math.max(1, Math.round((state.step1.adults + state.step1.children) / Math.max(state.step1.rooms, 1)));
      hotelState[city].upgradeSurcharge = calcUpgradeSimple(baseRate, upgradeRate, nights, paxPerRoom);
    } else {
      hotelState[city].upgradeSurcharge = '';
    }
  });
}

function calcEarlyCheckinSimple(rateStr, paxPerRoom) {
  const rate = parseRateNum(rateStr);
  if (!rate) return '—';
  const val = (rate * 0.5) / paxPerRoom;
  return formatRateSimple(val, rateStr);
}

function calcUpgradeSimple(baseStr, upgradeStr, nights, paxPerRoom) {
  const upgrade = parseRateNum(upgradeStr);
  if (!upgrade) return '—';
  // upgradeStr is a per-night surcharge (not the full room rate)
  const val = (upgrade * nights) / paxPerRoom;
  return formatRateSimple(val, upgradeStr);
}

function parseRateNum(str) {
  if (!str) return 0;
  const s = String(str).toLowerCase();
  const mk = s.match(/([\d,.]+)\s*k/);
  if (mk) return parseFloat(mk[1].replace(/,/g,'')) * 1000;
  const mu = s.match(/([\d,.]+)\s*usd/);
  if (mu) return parseFloat(mu[1].replace(/,/g,''));
  const mn = s.match(/^([\d,.]+)$/);
  if (mn) return parseFloat(mn[1].replace(/,/g,''));
  return 0;
}

function formatRateSimple(num, refStr) {
  const isUsd = refStr && String(refStr).toUpperCase().includes('USD');
  if (isUsd) return `$${num.toFixed(0)} USD/pax`;
  if (num >= 1000) return `${Math.round(num/1000)}k VND/pax`;
  return `${Math.round(num)} VND/pax`;
}

function parseUpgradeOptions(upgradeText) {
  if (!upgradeText) return [];
  // Support both newlines and ' | ' separators (from Excel flatten)
  const lines = upgradeText.split(/\n|\s*\|\s*/).filter(l => l.trim());
  return lines.map(line => {
    const m = line.match(/([\d,]+k|[\d,.]+\s*USD)/i);
    return { label: line.trim(), rate: m ? m[0].trim() : line.trim() };
  }).filter(o => o.rate);
}

// ─── Generate output ──────────────────────────────────────
function initOutput() {
  document.getElementById('generateBtn')?.addEventListener('click', generateOutput);

  document.getElementById('copyBtn')?.addEventListener('click', () => {
    const content = document.getElementById('outputContent');
    const text = content?.innerText || '';
    navigator.clipboard.writeText(text)
      .then(() => showToast('Copied to clipboard!', 'success'))
      .catch(() => showToast('Copy failed. Select text manually.', 'error'));
  });

  document.getElementById('downloadDocxBtn')?.addEventListener('click', async () => {
    const briefRows = state.step3.briefRows;
    if (!briefRows.length) { showToast('Generate document first.', 'error'); return; }

    const nightsMap = countNightsPerCity(briefRows);
    const docData = buildDocData(briefRows, nightsMap);

    try {
      showToast('Building .docx file…');
      await downloadDocx(docData);
      showToast('.docx downloaded!', 'success');
    } catch (err) {
      console.error(err);
      showToast(`Error: ${err.message}`, 'error');
    }
  });
}

function generateOutput() {
  const briefRows = state.step3.briefRows;
  const hasBrief = briefRows.length > 0;

  const nightsMap = hasBrief ? countNightsPerCity(briefRows) : {};
  const orderedCities = hasBrief ? getOrderedCities(briefRows) : [];

  // Build notes/includes/excludes (safe even with empty briefRows)
  const notes        = hasBrief ? generateNotes(state, briefRows) : [];
  const includes     = hasBrief ? generateIncludes(state, briefRows) : [];
  const excludes     = hasBrief ? generateExcludes(state, briefRows) : [];
  const importantNotes      = generateImportantNotes();
  const cancellationTerms   = generateCancellationTerms(state);

  const s1 = state.step1;
  const placeholder = '<span style="color:#bbb">...</span>';

  const dateRange = s1.dateFrom && s1.dateTo
    ? `${formatDateDisplay(s1.dateFrom)} – ${formatDateDisplay(s1.dateTo)}`
    : (s1.dateFrom ? formatDateDisplay(s1.dateFrom) + ' – ...' : '');
  const paxLine = [
    s1.adults ? `${s1.adults} Adult${s1.adults !== 1 ? 's' : ''}` : '',
    s1.children ? `${s1.children} Child${s1.children !== 1 ? 'ren' : ''}` : '',
  ].filter(Boolean).join(', ');

  let html = `<div class="doc-paper">`;

  // Header
  html += `
    <div class="doc-title">${escapeHtml(s1.title) || placeholder}</div>
    <div class="doc-subtitle">📅 ${dateRange || placeholder}</div>
    <div class="doc-subtitle">👥 ${paxLine || placeholder} | 🚗 ${carSizeLabel(state.step2.carSize)}</div>
    <hr class="doc-divider" />`;

  // ITINERARY BRIEF
  html += `<div class="doc-section">
    <div class="doc-section-title">ITINERARY BRIEF</div>
    ${hasBrief ? generateBriefTable(briefRows) : `<p style="color:#bbb;font-style:italic">Add itinerary days in Step 3 to see brief table...</p>`}
  </div>`;

  // ITINERARY DETAILS
  html += `<div class="doc-section">
    <div class="doc-section-title">ITINERARY DETAILS</div>
    ${hasBrief ? generateDetails(briefRows, state) : `<p style="color:#bbb;font-style:italic">Add itinerary days in Step 3 to see details...</p>`}
  </div>`;

  // ACCOMMODATION
  if (hasBrief && orderedCities.length) {
    html += `<div class="doc-section">
      <div class="doc-section-title">ACCOMMODATION</div>
      ${generateAccommodationTables(orderedCities, state.step4.hotels3, state.step4.hotels4, state.step4.hotels5, nightsMap, state)}
    </div>`;
  } else {
    html += `<div class="doc-section">
      <div class="doc-section-title">ACCOMMODATION</div>
      <p style="color:#bbb;font-style:italic">Set cities in Step 3 and hotels in Step 4...</p>
    </div>`;
  }

  // NOTES
  if (notes.length) {
    html += `<div class="doc-section">
      <div class="doc-section-title">NOTES</div>
      <ul class="doc-list">${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    </div>`;
  }

  // TOUR INCLUDES
  html += `<div class="doc-section">
    <div class="doc-section-title">TOUR INCLUDES</div>
    ${includes.length ? `<ul class="doc-list">${includes.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : `<p style="color:#bbb;font-style:italic">...</p>`}
  </div>`;

  // TOUR EXCLUDES
  html += `<div class="doc-section">
    <div class="doc-section-title">TOUR EXCLUDES</div>
    ${excludes.length ? `<ul class="doc-list">${excludes.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : `<p style="color:#bbb;font-style:italic">...</p>`}
  </div>`;

  // IMPORTANT NOTES
  html += `<div class="doc-section">
    <div class="doc-section-title">IMPORTANT NOTES</div>
    <ul class="doc-list">${importantNotes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
  </div>`;

  // CANCELLATION
  html += `<div class="doc-section">
    <div class="doc-section-title">CANCELLATION POLICY</div>
    <ul class="doc-list">${cancellationTerms.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
  </div>`;

  html += `</div>`;

  const output = document.getElementById('outputContent');
  if (output) {
    output.innerHTML = html;
    output.scrollTop = 0;
  }

  showToast('Document generated! ✓', 'success');
}

function buildDocData(briefRows, nightsMap) {
  const s1 = state.step1;
  const dateRange = s1.dateFrom && s1.dateTo
    ? `${formatDateDisplay(s1.dateFrom)} – ${formatDateDisplay(s1.dateTo)}`
    : '';
  const paxLine = [
    s1.adults   ? `${s1.adults} Adult${s1.adults !== 1 ? 's' : ''}`       : '',
    s1.children ? `${s1.children} Child${s1.children !== 1 ? 'ren' : ''}` : '',
  ].filter(Boolean).join(', ');

  return {
    title: s1.title || 'Tour Itinerary',
    subtitle: [dateRange, paxLine].filter(Boolean).join(' | '),
    briefRows,
    nightsMap,
    hotels: { hotels3: state.step4.hotels3, hotels4: state.step4.hotels4, hotels5: state.step4.hotels5 },
    notes:             generateNotes(state, briefRows),
    includes:          generateIncludes(state, briefRows),
    excludes:          generateExcludes(state, briefRows),
    importantNotes:    generateImportantNotes(),
    cancellationTerms: generateCancellationTerms(state),
  };
}

// ─── Helpers ──────────────────────────────────────────────
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function carSizeLabel(size) {
  const map = { '7s':'7-Seater','16s':'16-Seater','29s':'29-Seater','35s':'35-Seater','45s':'45-Seater' };
  return `${map[size] || size} Private Car`;
}

// ─── Toast ────────────────────────────────────────────────
let toastTimer = null;
export function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast${type ? ' ' + type : ''} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
