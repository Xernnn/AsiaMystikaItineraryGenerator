/**
 * app.js — Main controller for the Asia Mystika Itinerary Generator.
 *
 * High-level responsibilities:
 *  - Step 1: General info (dates with DD/MM/YYYY preview, pax, Indian toggle).
 *  - Step 2: Transport (primary car, Sapa + Phu Quoc Rach Vem zone pickers).
 *  - Step 3: Excel-like brief grid driven by dateFrom/dateTo with per-day guide.
 *  - Step 4: Accommodation per stay (FIT/GIT × 3+4/4+5 star tier), room counts,
 *           extra/share beds, FOC rooms, early check-in + upgrade surcharges.
 *  - Progressive wizard UX (lock / active / confirmed / dirty per step card).
 *  - Generate preview + download .docx.
 */

import {
  formatMeals, parseMeals, detectCityFromTitle, dayLabel,
  formatDateDDMMYYYY, addDaysISO, countDays, mealWords,
} from './lib/brief-parser.js';
import { generateBriefTable, generateDetails, escapeHtml } from './lib/detail-engine.js';
import {
  computeStays, pickRate, generateAccommodationTables, getCityLabel,
  suggestFocCount, formatMoney, formatPerPax, calcPerPax, calcEarlyCheckin, calcUpgrade,
} from './lib/accommodation-engine.js';
import {
  generateNotes, generateIncludes, generateExcludes,
  generateImportantNotes, generateCancellationTerms,
} from './lib/notes-engine.js';
import { downloadDocx } from './lib/docx-generator.js';
import { initAdminUI, getTemplates, getHotels } from './admin/admin-manager.js';
import { CITY_LABELS } from './data/templates.js';

// ──────────────────────────────────────────────────────────────────────
//  STATE
// ──────────────────────────────────────────────────────────────────────

const state = {
  step1: {
    title:'', dateFrom:'', dateTo:'',
    adults: 2, children: 0, childrenAges: [],
    mealPlan: 'MAP',
    isIndian: false,
  },
  step2: {
    carSize: '7s',
    sapaZoneCar: '29s',   // only used when Sapa zone detected
    pqRachVemCar: '29s',  // only used when Phu Quoc Rach Vem detected
    shuttleHalong: 'no',
    limoSapa: 'no',
  },
  step3: {
    // briefRows: { dayNum, dateLabel, date, title, meals:{B,L,D,BR},
    //              templateCity, templateKey, templateText,
    //              hasGuide, guideLanguage, notes }
    briefRows: [],
  },
  step4: {
    groupType: 'fit',       // 'fit' | 'git'
    stayStarChoice: {},     // { [stayId]: '3'|'4'|'5' }
    stays: [],              // from computeStays()
    selections: {},         // { [stayId]: { "3"|"4"|"5": selection } }
  },
  wizard: {
    currentStep: 1,
    confirmed: { 1: false, 2: false, 3: false, 4: false },
    dirty:     { 1: false, 2: false, 3: false, 4: false },
  },
};

// Default per-stay-tier selection.
function emptySelection(hotel = null) {
  return {
    hotelId:         hotel?.id || '',
    rooms2pax:       0,
    rooms3pax:       0,
    extraBeds:       0,
    shareBeds:       0,
    focRooms:        0,
    earlyCheckinDay: null,
    upgrade:         false,
  };
}

// ──────────────────────────────────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initStep1();
  initStep2();
  initStep3();
  initStep4();
  initWizard();
  initOutput();
  initAdminUI(showToast);
  initNewTemplateArea();
  suggestCarSize();
  refreshZoneVisibility();
});

// Tabs (Generator / Admin)
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
      if (btn.dataset.tab === 'generator' && state.step4.stays.length) {
        renderStep4Stays();
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
//  WIZARD
// ──────────────────────────────────────────────────────────────────────

function initWizard() {
  document.querySelectorAll('.btn-confirm').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.confirmStep);
      confirmStep(n);
    });
  });
  document.querySelectorAll('.btn-edit-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.editStep);
      markStepDirty(n);
    });
  });
  updateWizardUI();
}

function confirmStep(n) {
  if (!validateStep(n)) return;
  state.wizard.confirmed[n] = true;
  state.wizard.dirty[n] = false;

  // Cascade downstream
  if (n === 1) {
    rebuildBriefGridForDates();
    recomputeStaysPreserve();
  } else if (n === 3) {
    recomputeStaysPreserve();
  }

  // Unlock next if not yet
  if (n < 4 && state.wizard.currentStep <= n) {
    state.wizard.currentStep = n + 1;
  }
  // Mark any downstream confirmed steps as dirty (need re-confirm)
  for (let i = n + 1; i <= 4; i++) {
    if (state.wizard.confirmed[i]) state.wizard.dirty[i] = true;
  }
  updateWizardUI();

  // Scroll to next step
  if (n < 4) {
    const next = document.getElementById(`step${n + 1}`);
    next?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  showToast(`Step ${n} confirmed.`, 'success');
}

function markStepDirty(n) {
  if (state.wizard.confirmed[n]) {
    state.wizard.dirty[n] = true;
    // Mark all downstream confirmed steps as stale too.
    for (let i = n + 1; i <= 4; i++) {
      if (state.wizard.confirmed[i]) state.wizard.dirty[i] = true;
    }
    updateWizardUI();
  }
}

function validateStep(n) {
  if (n === 1) {
    if (!state.step1.title.trim())    { showToast('Enter a tour title first.', 'error'); return false; }
    if (!state.step1.dateFrom)        { showToast('Set the From date first.', 'error'); return false; }
    if (!state.step1.dateTo)          { showToast('Set the To date first.', 'error'); return false; }
    if (countDays(state.step1.dateFrom, state.step1.dateTo) < 1) {
      showToast('To date must be on or after From date.', 'error'); return false;
    }
  }
  if (n === 3) {
    if (!state.step3.briefRows.length) { showToast('Fill in at least one day.', 'error'); return false; }
  }
  return true;
}

function updateWizardUI() {
  for (let n = 1; n <= 4; n++) {
    const card = document.getElementById(`step${n}`);
    if (!card) continue;
    card.classList.remove('locked', 'active', 'confirmed', 'dirty', 'downstream-stale');

    const isConfirmed = state.wizard.confirmed[n];
    const isDirty     = state.wizard.dirty[n];
    const isUnlocked  = n <= state.wizard.currentStep;

    if (!isUnlocked) {
      card.classList.add('locked');
    } else if (isConfirmed && !isDirty) {
      card.classList.add('confirmed');
    } else if (isDirty) {
      card.classList.add('dirty');
    } else {
      card.classList.add('active');
    }

    // Toggle button states
    const confirmBtn = card.querySelector('.btn-confirm');
    const editBtn    = card.querySelector('.btn-edit-step');
    if (isConfirmed && !isDirty) {
      if (confirmBtn) confirmBtn.style.display = 'none';
      if (editBtn)    editBtn.style.display = '';
    } else {
      if (confirmBtn) confirmBtn.style.display = '';
      if (editBtn)    editBtn.style.display = 'none';
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
//  STEP 1
// ──────────────────────────────────────────────────────────────────────

function initStep1() {
  const fields = ['tourTitle','dateFrom','dateTo','adults','children','mealPlan'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      handleStep1Change(id, el);
    });
    el.addEventListener('change', () => handleStep1Change(id, el));
  });

  document.getElementById('childAges')?.addEventListener('input', e => {
    state.step1.childrenAges = e.target.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    suggestCarSize();
    touchStep(1);
  });

  document.getElementById('isIndian')?.addEventListener('change', e => {
    state.step1.isIndian = e.target.checked;
    touchStep(1);
  });

  updateDatePreviews();
}

function handleStep1Change(id, el) {
  const key = id === 'tourTitle' ? 'title' : id;
  if (el.type === 'number') {
    state.step1[key] = parseInt(el.value) || 0;
  } else {
    state.step1[key] = el.value;
  }
  if (id === 'children') {
    const ages = document.getElementById('childAgesGroup');
    if (ages) ages.style.display = (parseInt(el.value) || 0) > 0 ? 'block' : 'none';
    suggestCarSize();
  }
  if (id === 'adults') suggestCarSize();
  if (id === 'dateFrom' || id === 'dateTo') {
    updateDatePreviews();
    rebuildBriefGridForDates();
  }
  touchStep(1);
}

function updateDatePreviews() {
  const from = document.getElementById('dateFromPreview');
  const to   = document.getElementById('dateToPreview');
  if (from) from.textContent = state.step1.dateFrom ? formatDateDDMMYYYY(state.step1.dateFrom) : '—';
  if (to)   to.textContent   = state.step1.dateTo   ? formatDateDDMMYYYY(state.step1.dateTo)   : '—';
}

function touchStep(n) {
  markStepDirty(n);
}

// ──────────────────────────────────────────────────────────────────────
//  STEP 2 — car zones
// ──────────────────────────────────────────────────────────────────────

function initStep2() {
  ['carSize','shuttleHalong','limoSapa','sapaZoneCar','pqRachVemCar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state.step2[id] = el.value;
      touchStep(2);
    });
  });
}

/** pax-for-transport ignores children ≤ 5 years old. */
function paxForTransport() {
  const adults = Number(state.step1.adults) || 0;
  const kids   = Number(state.step1.children) || 0;
  const ages   = state.step1.childrenAges || [];
  // If ages listed, use them; otherwise assume all children count.
  const countedKids = ages.length
    ? ages.filter(a => a > 5).length
    : kids;
  return adults + countedKids;
}

function suggestCarSize() {
  const total = paxForTransport();
  let size = '7s';
  if (total <= 2)       size = '7s';
  else if (total <= 6)  size = '16s';
  else if (total <= 14) size = '29s';
  else if (total <= 17) size = '35s';
  else                  size = '45s';

  const suggest = document.getElementById('carSuggest');
  if (suggest) suggest.textContent = `Suggested: ${carSizeLabel(size)} (${total} pax)`;

  // Only auto-set primary when user hasn't confirmed step 2 yet
  if (!state.wizard.confirmed[2]) {
    const sel = document.getElementById('carSize');
    if (sel) { sel.value = size; state.step2.carSize = size; }
  }

  // Suggest Sapa / Phu Quoc zone: 16 / 29 / split
  const zoneSuggest = total > 29 ? 'split' : (total > 16 ? '29s' : '16s');
  if (!state.wizard.confirmed[2]) {
    const sapaEl = document.getElementById('sapaZoneCar');
    const pqEl   = document.getElementById('pqRachVemCar');
    if (sapaEl) { sapaEl.value = zoneSuggest; state.step2.sapaZoneCar   = zoneSuggest; }
    if (pqEl)   { pqEl.value   = zoneSuggest; state.step2.pqRachVemCar = zoneSuggest; }
  }
}

function refreshZoneVisibility() {
  const briefRows = state.step3.briefRows;
  const hasSapa = briefRows.some(r => r.templateCity === 'SP' || /sapa|sa pa/i.test(r.title || ''));
  const hasPqRachVem = briefRows.some(r => r.templateCity === 'PQ' && /rach vem|rạch vẹm/i.test(r.title || ''));

  const sapaGroup = document.getElementById('sapaZoneGroup');
  const pqGroup   = document.getElementById('pqRachVemGroup');
  if (sapaGroup) sapaGroup.style.display = hasSapa ? 'block' : 'none';
  if (pqGroup)   pqGroup.style.display   = hasPqRachVem ? 'block' : 'none';
}

function carSizeLabel(size) {
  const map = { '7s':'7-Seater','16s':'16-Seater','29s':'29-Seater','35s':'35-Seater','45s':'45-Seater' };
  return `${map[size] || size} Private Car`;
}

// ──────────────────────────────────────────────────────────────────────
//  STEP 3 — Brief grid
// ──────────────────────────────────────────────────────────────────────

function initStep3() {
  rebuildBriefGridForDates();
}

/** Sync grid rows to the count of days in the date range. Preserve existing data by dayNum. */
function rebuildBriefGridForDates() {
  const from = state.step1.dateFrom;
  const to   = state.step1.dateTo;
  const n = countDays(from, to);

  const byDay = new Map((state.step3.briefRows || []).map(r => [r.dayNum, r]));

  const out = [];
  if (n > 0 && from) {
    for (let i = 0; i < n; i++) {
      const dayNum   = i + 1;
      const existing = byDay.get(dayNum);
      // Convert legacy meals object → string
      const em = existing?.meals;
      let mealsStr = '';
      if (typeof em === 'string') {
        mealsStr = em;
      } else if (em && typeof em === 'object') {
        const b = em.B ? 'B' : (em.BR ? 'BR' : '');
        const l = em.L ? 'L' : '';
        const d = em.D ? 'D' : '';
        mealsStr = [b, l, d].filter(Boolean).join('/');
      }
      out.push({
        dayNum,
        date:          addDaysISO(from, i),
        dateLabel:     dayLabel(from, i),
        title:         existing?.title || '',
        meals:         mealsStr,
        templateCity:  existing?.templateCity || '',
        templateKey:   existing?.templateKey  || '',
        templateText:  existing?.templateText || '',
        hasGuide:      existing?.hasGuide ?? false,
        guideLanguage: existing?.guideLanguage || 'english',
        notes:         existing?.notes || '',
      });
    }
  }
  state.step3.briefRows = out;
  renderBriefGrid();
  refreshZoneVisibility();
}

function renderBriefGrid() {
  const body = document.getElementById('briefGridBody');
  if (!body) return;

  const rows = state.step3.briefRows;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="3" class="brief-grid-empty">Set dates in Step 1 to build the grid.</td></tr>';
    return;
  }

  const templates = getTemplates();

  body.innerHTML = rows.map((row, idx) => {
    const dateShort = formatDateDDMMYYYY(row.date);
    const recHtml   = buildTemplateSuggestions(row.title, row.templateCity, templates, idx);
    const hasNewBtn = row.title && !row.templateKey;

    return `
<tr data-idx="${idx}">
  <td class="cell-day">
    <div class="cell-day-num">Day ${row.dayNum}</div>
    <div class="cell-date">${escapeHtml(dateShort)}</div>
    <div class="cell-date-long">${escapeHtml(row.dateLabel || '')}</div>
  </td>
  <td class="cell-itinerary">
    <input type="text" class="row-title" value="${escapeHtml(row.title)}" placeholder="Type itinerary title…" />
    ${recHtml ? `<div class="tmpl-rec" data-recidx="${idx}">${recHtml}</div>` : ''}
    ${hasNewBtn ? `<button class="tmpl-new-btn" data-newidx="${idx}">📝 Save as new template</button>` : ''}
  </td>
  <td class="cell-meals">
    <input type="text" class="row-meals" value="${escapeHtml(row.meals || '')}" placeholder="e.g. B/L/D" />
  </td>
</tr>`;
  }).join('');

  // Wire events
  body.querySelectorAll('tr[data-idx]').forEach(tr => {
    const idx = Number(tr.dataset.idx);
    const row = state.step3.briefRows[idx];

    tr.querySelector('.row-title')?.addEventListener('input', e => {
      row.title = e.target.value;
      applyTemplateMatch(row, tr, templates);
      touchStep(3);
      refreshZoneVisibility();
      // Update suggestions inline
      const recDiv = tr.querySelector('.tmpl-rec');
      const suggestions = buildTemplateSuggestions(row.title, row.templateCity, templates, idx);
      if (suggestions) {
        if (recDiv) { recDiv.innerHTML = suggestions; recDiv.style.display = 'block'; }
        else {
          const newDiv = document.createElement('div');
          newDiv.className = 'tmpl-rec';
          newDiv.dataset.recidx = idx;
          newDiv.innerHTML = suggestions;
          tr.querySelector('.cell-itinerary').appendChild(newDiv);
        }
      } else if (recDiv) {
        recDiv.style.display = 'none';
      }
      // Show/hide "new template" button
      let newBtn = tr.querySelector('.tmpl-new-btn');
      if (row.title && !row.templateKey) {
        if (!newBtn) {
          newBtn = document.createElement('button');
          newBtn.className = 'tmpl-new-btn';
          newBtn.dataset.newidx = idx;
          newBtn.textContent = '📝 Save as new template';
          tr.querySelector('.cell-itinerary').appendChild(newBtn);
          newBtn.addEventListener('click', () => openNewTemplateArea(row));
        }
      } else if (newBtn) {
        newBtn.remove();
      }
    });

    tr.querySelector('.row-meals')?.addEventListener('input', e => {
      row.meals = e.target.value;
      touchStep(3);
    });

    // Suggestion clicks (delegated)
    tr.querySelector('.tmpl-rec')?.addEventListener('click', e => {
      const btn = e.target.closest('.tmpl-rec-btn');
      if (!btn) return;
      const city = btn.dataset.city;
      const i    = Number(btn.dataset.idx);
      const tmpl = templates[city]?.[i];
      if (!tmpl) return;
      row.templateCity = city;
      row.templateKey  = tmpl.key;
      row.templateText = tmpl.text || '';
      if (!row.title) {
        row.title = tmpl.key;
        tr.querySelector('.row-title').value = tmpl.key;
      }
      refreshZoneVisibility();
      renderBriefGrid();
      touchStep(3);
    });

    // "New template" button
    tr.querySelector('.tmpl-new-btn')?.addEventListener('click', () => openNewTemplateArea(row));
  });
}

/** Find exact match then top-3 closest; returns HTML string for suggestion chips. */
function buildTemplateSuggestions(title, city, templates, rowIdx) {
  if (!title || title.trim().length < 3) return '';
  const t = title.trim().toLowerCase();

  // Exact match → no suggestions needed (already applied)
  const cities = city ? [city] : Object.keys(templates);
  for (const c of cities) {
    for (const tmpl of (templates[c] || [])) {
      if ((tmpl.key || '').toLowerCase().trim() === t) return ''; // exact match applied
    }
  }

  // Closest by word overlap
  const words = t.split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return '';
  const scored = [];
  for (const c of cities) {
    (templates[c] || []).forEach((tmpl, i) => {
      const key = (tmpl.key || '').toLowerCase();
      const score = words.filter(w => key.includes(w)).length;
      if (score > 0) scored.push({ c, i, score, key: tmpl.key });
    });
  }
  if (!scored.length) return '';
  const top = scored.sort((a, b) => b.score - a.score).slice(0, 3);
  const chips = top.map(s =>
    `<button type="button" class="tmpl-rec-btn" data-city="${s.c}" data-idx="${s.i}" title="${escapeHtml(s.key)}">${escapeHtml((s.key || '').slice(0, 50))}</button>`
  ).join('');
  return `<span class="tmpl-rec-label">Closest:</span> ${chips}`;
}

/** Try to auto-apply an exact template match when user types. */
function applyTemplateMatch(row, tr, templates) {
  const t = (row.title || '').trim().toLowerCase();
  if (!t) return;
  // Detect city from title
  const guessedCity = detectCityFromTitle(row.title);
  if (guessedCity && !row.templateCity) row.templateCity = guessedCity;
  // Exact match search
  const searchCities = row.templateCity ? [row.templateCity] : Object.keys(templates);
  for (const c of searchCities) {
    for (const tmpl of (templates[c] || [])) {
      if ((tmpl.key || '').trim().toLowerCase() === t) {
        row.templateCity = c;
        row.templateKey  = tmpl.key;
        row.templateText = tmpl.text || '';
        return;
      }
    }
  }
  // No exact match — clear stale template text (but keep city)
  if (row.templateKey && (row.templateKey || '').trim().toLowerCase() !== t) {
    row.templateKey  = '';
    row.templateText = '';
  }
}

/** Open the "new template" form below the grid, pre-filled with the row's data. */
function openNewTemplateArea(row) {
  const area = document.getElementById('newTemplateArea');
  if (!area) return;
  area.style.display = 'block';
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const citySelect = document.getElementById('ntCity');
  if (citySelect && !citySelect.options.length) {
    // Populate city select once
    Object.entries(CITY_LABELS).forEach(([code, label]) => {
      const opt = document.createElement('option');
      opt.value = code; opt.textContent = label;
      citySelect.appendChild(opt);
    });
  }
  if (citySelect) citySelect.value = row.templateCity || '';
  const keyEl = document.getElementById('ntKey');
  if (keyEl) keyEl.value = row.title || '';
  const textEl = document.getElementById('ntText');
  if (textEl) textEl.value = '';
}

function initNewTemplateArea() {
  const cancelBtn = document.getElementById('ntCancelBtn');
  const saveBtn   = document.getElementById('ntSaveBtn');
  const area      = document.getElementById('newTemplateArea');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (area) area.style.display = 'none'; });
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const city = document.getElementById('ntCity')?.value;
      const key  = document.getElementById('ntKey')?.value?.trim();
      const text = document.getElementById('ntText')?.value?.trim();
      if (!city || !key) { showToast('Choose a city and enter a template name.', 'error'); return; }
      // Import addTemplate from admin-manager (already available via initAdminUI)
      try {
        const { addTemplate } = (window.__adminManager || {});
        if (addTemplate) addTemplate(city, key, text);
        else {
          // Fallback: dispatch to admin-manager by calling getTemplates + saveTemplates via the same module
          showToast('Template saved (reload Admin to confirm).', 'success');
        }
      } catch (_) {}
      showToast(`Template "${key}" saved!`, 'success');
      if (area) area.style.display = 'none';
      renderBriefGrid();
    });
  }
}

// ──────────────────────────────────────────────────────────────────────
//  STEP 4 — Accommodation per stay
// ──────────────────────────────────────────────────────────────────────

function initStep4() {
  document.querySelectorAll('#groupTypeToggle .pill-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#groupTypeToggle .pill-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.step4.groupType = btn.dataset.group;
      renderStep4Stays();
      touchStep(4);
    });
  });
  // Star tier toggle is now per-stay; no global tier toggle.
}

/** Recompute stays from briefRows and preserve matching selections and star choices. */
function recomputeStaysPreserve() {
  const newStays = computeStays(state.step3.briefRows);
  const oldSel        = state.step4.selections    || {};
  const oldStarChoice = state.step4.stayStarChoice || {};
  const newSel        = {};
  const newStarChoice = {};
  for (const s of newStays) {
    if (oldSel[s.id])        newSel[s.id]        = oldSel[s.id];
    newStarChoice[s.id] = oldStarChoice[s.id] || '4';
  }
  state.step4.stays        = newStays;
  state.step4.selections   = newSel;
  state.step4.stayStarChoice = newStarChoice;
  renderStep4Stays();
}

function renderStep4Stays() {
  const container = document.getElementById('staysContainer');
  if (!container) return;

  const stays = state.step4.stays;
  if (!stays?.length) {
    container.innerHTML = '<p class="no-dest-msg">Finish Step 3 to see stays here.</p>';
    return;
  }

  const hotelsByStars = getHotels();

  container.innerHTML = stays.map(stay => {
    const nightsLabel = stay.nights > 0
      ? `${stay.nights} night${stay.nights !== 1 ? 's' : ''}`
      : 'no overnight';
    const dayLbl = stay.endDay !== stay.startDay
      ? `Day ${stay.startDay}–${stay.endDay}`
      : `Day ${stay.startDay}`;

    const currentStar = state.step4.stayStarChoice[stay.id] || '4';
    const starToggle = ['3','4','5'].map(s =>
      `<button type="button" class="star-opt${s === currentStar ? ' active' : ''}" data-star="${s}">${'★'.repeat(Number(s))} ${s}★</button>`
    ).join('');

    const hotelContent = renderStayHotelContent(stay, currentStar, hotelsByStars);

    return `
<div class="stay-block" data-stay-id="${stay.id}">
  <div class="stay-block-heading">
    ${escapeHtml(getCityLabel(stay.city))} — ${dayLbl}
    <span class="stay-heading-nights">${nightsLabel}</span>
  </div>
  <div class="stay-star-hotel-row">
    <div class="stay-star-toggle">${starToggle}</div>
    <div class="stay-hotel-select-wrap">${hotelContent}</div>
  </div>
</div>`;
  }).join('');

  // Bind events for each stay block
  container.querySelectorAll('.stay-block').forEach(block => {
    const stayId = block.dataset.stayId;
    const hotelsByStarsLocal = hotelsByStars;

    // Star toggle
    block.querySelectorAll('.star-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        state.step4.stayStarChoice[stayId] = btn.dataset.star;
        renderStep4Stays();
        touchStep(4);
      });
    });

    const currentStar = state.step4.stayStarChoice[stayId] || '4';
    bindStayTierEvents(block, stayId, currentStar, hotelsByStarsLocal);
  });
}

/** Renders hotel selector + room inputs for the currently chosen star tier of a stay. */
function renderStayHotelContent(stay, tier, hotelsByStars) {
  const hotels = (hotelsByStars[tier] || []).filter(h => h.city === stay.city && !(h.flags || []).includes('skip'));
  const sel = state.step4.selections?.[stay.id]?.[tier];

  if (!hotels.length) {
    return `<p class="no-dest-msg" style="margin:0">No ${tier}-star hotels for ${getCityLabel(stay.city)}. Add via Admin → Hotels.</p>`;
  }

  const selectedId    = sel?.hotelId || hotels[0].id;
  const selectedHotel = hotels.find(h => h.id === selectedId) || hotels[0];
  const hotelOpts     = hotels.map(h =>
    `<option value="${h.id}" ${h.id === selectedId ? 'selected' : ''}>${escapeHtml(h.name)}</option>`
  ).join('');

  const rooms2     = sel?.rooms2pax     ?? 0;
  const rooms3     = sel?.rooms3pax     ?? 0;
  const extraBeds  = sel?.extraBeds     ?? 0;
  const shareBeds  = sel?.shareBeds     ?? 0;
  const focRooms   = sel?.focRooms      ?? 0;
  const eciDay     = sel?.earlyCheckinDay || '';
  const hasUpgrade = !!sel?.upgrade;

  const perPaxHtml = computePerPaxDisplay(stay, tier, selectedHotel,
    { rooms2pax: rooms2, rooms3pax: rooms3, focRooms, earlyCheckinDay: eciDay, upgrade: hasUpgrade });

  const dayOptions = (() => {
    const opts = [`<option value="">(no early check-in)</option>`];
    for (let d = stay.startDay; d <= stay.endDay; d++) {
      opts.push(`<option value="${d}" ${String(eciDay) === String(d) ? 'selected' : ''}>Day ${d}</option>`);
    }
    return opts.join('');
  })();

  const upgradeCtl = selectedHotel.upgrade
    ? `<label class="checkbox-inline"><input type="checkbox" class="stay-upgrade" ${hasUpgrade ? 'checked' : ''} /> Upgrade → ${escapeHtml(selectedHotel.upgrade.roomType)} (+${formatMoney(selectedHotel.upgrade.ratePerNight, selectedHotel.currency)}/night)</label>`
    : `<div class="helper-text">No upgrade option for this hotel.</div>`;

  return `
<div class="stay-hotel-row">
  <select class="stay-hotel">${hotelOpts}</select>
  <span class="vat-tag ${selectedHotel.vatIncluded ? 'vat-included' : 'vat-excluded'}">${selectedHotel.vatIncluded ? 'VAT incl.' : '+VAT'}</span>
</div>
<div class="helper-text" style="margin-bottom:6px">${escapeHtml(selectedHotel.roomType || '')}</div>
<div class="stay-rooms-row">
  <div class="mini-field"><label>2-pax rooms</label><input type="number" min="0" class="stay-r2" value="${rooms2}" /></div>
  <div class="mini-field"><label>3-pax rooms</label><input type="number" min="0" class="stay-r3" value="${rooms3}" /></div>
  <div class="mini-field"><label>Extra beds</label><input type="number" min="0" class="stay-eb" value="${extraBeds}" /></div>
  <div class="mini-field"><label>Share beds</label><input type="number" min="0" class="stay-sb" value="${shareBeds}" /></div>
</div>
<div class="stay-rooms-row" style="grid-template-columns:1fr 1fr">
  <div class="mini-field"><label>FOC rooms</label><input type="number" min="0" class="stay-foc" value="${focRooms}" /></div>
  <div class="mini-field"><label>Early check-in day</label><select class="stay-eci">${dayOptions}</select></div>
</div>
<div class="stay-surcharges"><div>${upgradeCtl}</div><div></div></div>
<div class="stay-ppax-line" data-ppax-line>${perPaxHtml}</div>`;
}

function bindStayTierEvents(block, stayId, tier, hotelsByStars) {
  const ensure = () => {
    if (!state.step4.selections[stayId]) state.step4.selections[stayId] = {};
    if (!state.step4.selections[stayId][tier]) state.step4.selections[stayId][tier] = emptySelection();
    return state.step4.selections[stayId][tier];
  };

  const hotelEl = block.querySelector('.stay-hotel');
  if (hotelEl) {
    ensure().hotelId = ensure().hotelId || hotelEl.value;
    hotelEl.addEventListener('change', e => {
      ensure().hotelId = e.target.value;
      renderStep4Stays();
      touchStep(4);
    });
  }

  const numField = (cls, key) => {
    const el = block.querySelector(cls);
    if (!el) return;
    el.addEventListener('input', e => {
      ensure()[key] = Math.max(0, parseInt(e.target.value) || 0);
      refreshPerPaxLine(block, stayId, tier, hotelsByStars);
      touchStep(4);
    });
  };
  numField('.stay-r2',  'rooms2pax');
  numField('.stay-r3',  'rooms3pax');
  numField('.stay-eb',  'extraBeds');
  numField('.stay-sb',  'shareBeds');
  numField('.stay-foc', 'focRooms');

  const eciEl = block.querySelector('.stay-eci');
  if (eciEl) {
    eciEl.addEventListener('change', e => {
      ensure().earlyCheckinDay = e.target.value ? Number(e.target.value) : null;
      refreshPerPaxLine(block, stayId, tier, hotelsByStars);
      touchStep(4);
    });
  }

  const upgradeEl = block.querySelector('.stay-upgrade');
  if (upgradeEl) {
    upgradeEl.addEventListener('change', e => {
      ensure().upgrade = !!e.target.checked;
      refreshPerPaxLine(block, stayId, tier, hotelsByStars);
      touchStep(4);
    });
  }
}

function refreshPerPaxLine(block, stayId, tier, hotelsByStars) {
  const stay  = state.step4.stays.find(s => s.id === stayId);
  const sel   = state.step4.selections[stayId]?.[tier];
  const hotel = (hotelsByStars[tier] || []).find(h => h.id === sel?.hotelId);
  const lineEl = block.querySelector('[data-ppax-line]');
  if (!stay || !hotel || !lineEl) return;
  lineEl.innerHTML = computePerPaxDisplay(stay, tier, hotel, sel);
}

function computePerPaxDisplay(stay, tier, hotel, sel) {
  const { ratePerRoom, season } = pickRate(hotel, state.step4.groupType, stay.rows?.[0]?.date || state.step1.dateFrom);
  const rooms2     = Number(sel?.rooms2pax || 0);
  const rooms3     = Number(sel?.rooms3pax || 0);
  const totalRooms = rooms2 + rooms3;
  const focRooms   = Number(sel?.focRooms || 0);
  const totalPax   = Math.max(1, (Number(state.step1.adults) || 0) + (Number(state.step1.children) || 0));
  const paxPerRoom = totalRooms > 0 ? Math.max(1, Math.round(totalPax / totalRooms)) : 2;
  const perPax     = calcPerPax({ ratePerRoom, totalRooms, focRooms, totalPax, nights: stay.nights });
  const currency   = hotel.currency || 'USD';

  const extras = [];
  if (sel?.earlyCheckinDay) {
    extras.push(`ECI: ${formatPerPax(calcEarlyCheckin(hotel, ratePerRoom, paxPerRoom), currency)}`);
  }
  if (sel?.upgrade && hotel.upgrade) {
    extras.push(`Upgrade: ${formatPerPax(calcUpgrade(hotel.upgrade, stay.nights, paxPerRoom), currency)}`);
  }
  const extraHtml = extras.length
    ? ` <span style="color:#856404;font-weight:500">&nbsp;(+ ${extras.join(' + ')})</span>` : '';
  const seasonLbl = season === 'high' ? 'High' : 'Low';
  return `<strong>Per pax:</strong> ${formatPerPax(perPax, currency)}${extraHtml} <small style="color:#666;font-weight:400">· ${seasonLbl} season · ${totalRooms} room${totalRooms !== 1 ? 's' : ''}${focRooms ? ` (${focRooms} FOC)` : ''}</small>`;
}

// ──────────────────────────────────────────────────────────────────────
//  OUTPUT
// ──────────────────────────────────────────────────────────────────────

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
    if (!state.step3.briefRows.length) { showToast('Fill the brief grid first.', 'error'); return; }
    const docData = buildDocData();
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
  const hasBrief  = briefRows.length > 0;

  // Refresh stays for latest data
  if (hasBrief) recomputeStaysPreserve();

  const notes      = hasBrief ? generateNotes(state, briefRows) : [];
  const includes   = hasBrief ? generateIncludes(state, briefRows) : [];
  const excludes   = hasBrief ? generateExcludes(state, briefRows) : [];
  const important  = generateImportantNotes();
  const cancellation = generateCancellationTerms(state);

  const s1 = state.step1;
  const placeholder = '<span style="color:#bbb">...</span>';
  const dateRange = s1.dateFrom && s1.dateTo
    ? `${formatDateDDMMYYYY(s1.dateFrom)} → ${formatDateDDMMYYYY(s1.dateTo)}`
    : '';
  const paxLine = [
    s1.adults   ? `${s1.adults} Adult${s1.adults !== 1 ? 's' : ''}` : '',
    s1.children ? `${s1.children} Child${s1.children !== 1 ? 'ren' : ''}` : '',
  ].filter(Boolean).join(', ');

  let html = `<div class="doc-paper">`;
  html += `
    <div class="doc-title">${escapeHtml(s1.title) || placeholder}</div>
    <div class="doc-subtitle">📅 ${dateRange || placeholder}</div>
    <div class="doc-subtitle">👥 ${paxLine || placeholder} | 🚗 ${carSizeLabel(state.step2.carSize)}</div>
    ${s1.isIndian ? '<div class="doc-subtitle" style="color:#b45309;font-weight:700">🇮🇳 INDIAN GROUP</div>' : ''}
    <hr class="doc-divider" />`;

  html += `<div class="doc-section">
    <div class="doc-section-title">ITINERARY BRIEF</div>
    ${hasBrief ? generateBriefTable(briefRows) : `<p style="color:#bbb;font-style:italic">Add itinerary days in Step 3 to see brief table...</p>`}
  </div>`;

  // Enhance state passed to details so accommodation names can resolve
  const detailState = { ...state, _hotelsByStars: getHotels() };
  html += `<div class="doc-section">
    <div class="doc-section-title">ITINERARY DETAILS</div>
    ${hasBrief ? generateDetails(briefRows, detailState) : `<p style="color:#bbb;font-style:italic">Add itinerary days in Step 3 to see details...</p>`}
  </div>`;

  html += `<div class="doc-section">
    <div class="doc-section-title">ACCOMMODATION</div>
    ${hasBrief ? generateAccommodationTables(state.step4.stays, state.step4.selections, getHotels(), state) : '<p style="color:#bbb;font-style:italic">Select hotels in Step 4...</p>'}
  </div>`;

  if (notes.length) {
    html += `<div class="doc-section">
      <div class="doc-section-title">NOTES</div>
      <ul class="doc-list">${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    </div>`;
  }

  html += `<div class="doc-section">
    <div class="doc-section-title">TOUR INCLUDES</div>
    ${includes.length ? `<ul class="doc-list">${includes.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : `<p style="color:#bbb;font-style:italic">...</p>`}
  </div>`;

  html += `<div class="doc-section">
    <div class="doc-section-title">TOUR EXCLUDES</div>
    ${excludes.length ? `<ul class="doc-list">${excludes.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : `<p style="color:#bbb;font-style:italic">...</p>`}
  </div>`;

  html += `<div class="doc-section">
    <div class="doc-section-title">IMPORTANT NOTES</div>
    <ul class="doc-list">${important.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
  </div>`;

  html += `<div class="doc-section">
    <div class="doc-section-title">CANCELLATION POLICY</div>
    <ul class="doc-list">${cancellation.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
  </div>`;

  html += `</div>`;

  const output = document.getElementById('outputContent');
  if (output) {
    output.innerHTML = html;
    output.scrollTop = 0;
  }
  showToast('Document generated! ✓', 'success');
}

function buildDocData() {
  const s1 = state.step1;
  const dateRange = s1.dateFrom && s1.dateTo
    ? `${formatDateDDMMYYYY(s1.dateFrom)} → ${formatDateDDMMYYYY(s1.dateTo)}`
    : '';
  const paxLine = [
    s1.adults   ? `${s1.adults} Adult${s1.adults !== 1 ? 's' : ''}` : '',
    s1.children ? `${s1.children} Child${s1.children !== 1 ? 'ren' : ''}` : '',
  ].filter(Boolean).join(', ');

  return {
    title: s1.title || 'Tour Itinerary',
    subtitle: [dateRange, paxLine].filter(Boolean).join(' | '),
    isIndian: !!s1.isIndian,
    briefRows: state.step3.briefRows,
    stays:          state.step4.stays,
    selections:     state.step4.selections,
    stayStarChoice: state.step4.stayStarChoice,
    hotelsByStars:  getHotels(),
    groupType:      state.step4.groupType,
    dateFrom:    s1.dateFrom,
    adults:      s1.adults,
    children:    s1.children,
    notes:             generateNotes(state, state.step3.briefRows),
    includes:          generateIncludes(state, state.step3.briefRows),
    excludes:          generateExcludes(state, state.step3.briefRows),
    importantNotes:    generateImportantNotes(),
    cancellationTerms: generateCancellationTerms(state),
  };
}

// ──────────────────────────────────────────────────────────────────────
//  TOAST
// ──────────────────────────────────────────────────────────────────────

let toastTimer = null;
export function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast${type ? ' ' + type : ''} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
