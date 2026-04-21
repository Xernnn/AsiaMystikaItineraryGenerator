/**
 * app.js — Main controller for the Asia Mystika Itinerary Generator.
 *
 * High-level responsibilities:
 *  - Step 1: General info (DD/MM/YYYY text dates, pax, Indian toggle).
 *  - Step 2: Transport primary car + Sapa / Phu Quoc zone fleets (N×29 + M×16).
 *  - Step 3: Excel-like brief grid with template auto-match + closest suggestions.
 *  - Step 4: Accommodation per stay — room-type aware, flexible price override,
 *           FOC rooms, early check-in + upgrade (pick target room type).
 *  - Progressive wizard UX and document generation.
 */

import {
  formatMeals, parseMeals, detectCityFromTitle, dayLabel,
  formatDateDDMMYYYY, parseDDMMYYYY, addDaysISO, countDays,
} from './lib/brief-parser.js';
import { generateBriefTable, generateDetails, escapeHtml } from './lib/detail-engine.js';
import {
  computeStays, generateAccommodationTables, getCityLabel,
  formatMoney, formatPerPax, findRoomType, buildStayBreakdown,
} from './lib/accommodation-engine.js';
import {
  generateNotes, generateIncludes, generateExcludes,
  generateImportantNotes, generateCancellationTerms,
} from './lib/notes-engine.js';
import { downloadDocx } from './lib/docx-generator.js';
import { createStayModalController } from './lib/stay-modal.js';
import { initAdminUI, getTemplates, getHotels, addTemplate as adminAddTemplate } from './admin/admin-manager.js';
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
    sapaZone: { n29: 0, n16: 0 },
    pqZone:   { n29: 0, n16: 0 },
    shuttleHalong: 'no',
    limoSapa: 'no',
  },
  step3: {
    // briefRows: { dayNum, dateLabel, date, title, meals (string),
    //              templateCity, templateKey, templateText,
    //              hasGuide, guideLanguage, notes }
    briefRows: [],
  },
  step4: {
    groupType: 'fit',       // 'fit' | 'git'
    stayStarChoice: {},     // { [stayId]: '3'|'4'|'5' }
    stays: [],
    selections: {},         // { [stayId]: { [tier]: selection } }
  },
  wizard: {
    currentStep: 1,
    confirmed: { 1: false, 2: false, 3: false, 4: false },
    dirty:     { 1: false, 2: false, 3: false, 4: false },
  },
};

function seedDefaultRoomCounts(draft) {
  const adults   = Number(state.step1.adults   || 0);
  const children = Number(state.step1.children || 0);
  const totalPax = Math.max(1, adults + children);
  if (!(draft.rooms2pax > 0) && !(draft.rooms3pax > 0)) {
    draft.rooms2pax = Math.ceil(totalPax / 2);
  }
  return draft;
}

function emptySelection(hotel = null) {
  return {
    hotelId:         hotel?.id || '',
    roomTypeId:      hotel?.roomTypes?.[0]?.id || '',
    rooms2pax:       0,
    rooms3pax:       0,
    extraBeds:       0,
    shareBeds:       0,
    focRooms:        0,
    earlyCheckinDay: null,
    eciRooms:            null,
    upgradeRoomTypeId:   null,
    upgradeRooms:        null,
    priceOverride:       null,
    upgradePriceOverride: null,
  };
}

// ──────────────────────────────────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const restored = restoreWizardState();

  initTabs();
  initStep1();
  initStep2();
  initStep3();
  initStep4();
  initWizard();
  initOutput();
  initAdminUI(showToast);
  initNewTemplateArea();

  if (restored) {
    applyRestoredStateToDOM();
    rebuildBriefGridForDates();
    recomputeStaysPreserve();
    renderStep4Stays();
    renderDestinationBars();
    updateWizardUI();
  }

  suggestCarSize();
  refreshZoneVisibility();
  renderPersistedBanner();
});

function renderPersistedBanner() {
  const host = document.getElementById('step1');
  if (!host) return;
  const raw = localStorage.getItem(LS_WIZARD);
  if (!raw) return;
  if (document.getElementById('persistedBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'persistedBanner';
  bar.className = 'restore-banner';
  bar.innerHTML = `
    <span>💾 Previous draft restored.</span>
    <button type="button" class="btn-ghost" id="persistedClearBtn">Start fresh</button>
  `;
  host.insertBefore(bar, host.firstChild);
  document.getElementById('persistedClearBtn')?.addEventListener('click', () => {
    clearPersistedWizardState();
    location.reload();
  });
}

function applyRestoredStateToDOM() {
  const v = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  v('tourTitle',     state.step1.title);
  v('dateFrom',      state.step1.dateFrom ? formatDateDDMMYYYY(state.step1.dateFrom) : '');
  v('dateTo',        state.step1.dateTo   ? formatDateDDMMYYYY(state.step1.dateTo)   : '');
  v('adults',        state.step1.adults);
  v('children',      state.step1.children);
  v('mealPlan',      state.step1.mealPlan);
  const ind = document.getElementById('isIndian');
  if (ind) ind.checked = !!state.step1.isIndian;
  v('carSize',       state.step2.carSize);
  v('shuttleHalong', state.step2.shuttleHalong);
  v('limoSapa',      state.step2.limoSapa);
  v('sapaN29', state.step2.sapaZone?.n29 ?? 0);
  v('sapaN16', state.step2.sapaZone?.n16 ?? 0);
  v('pqN29',   state.step2.pqZone?.n29   ?? 0);
  v('pqN16',   state.step2.pqZone?.n16   ?? 0);
  v('groupType', state.step4.groupType);
}

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
  persistWizardState();

  if (n === 1) {
    rebuildBriefGridForDates();
    recomputeStaysPreserve();
  } else if (n === 3) {
    recomputeStaysPreserve();
  }

  if (n < 4 && state.wizard.currentStep <= n) {
    state.wizard.currentStep = n + 1;
  }
  for (let i = n + 1; i <= 4; i++) {
    if (state.wizard.confirmed[i]) state.wizard.dirty[i] = true;
  }
  updateWizardUI();

  if (n < 4) {
    const next = document.getElementById(`step${n + 1}`);
    next?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  showToast(`Step ${n} confirmed.`, 'success');
}

function markStepDirty(n) {
  if (state.wizard.confirmed[n]) {
    state.wizard.dirty[n] = true;
    for (let i = n + 1; i <= 4; i++) {
      if (state.wizard.confirmed[i]) state.wizard.dirty[i] = true;
    }
    updateWizardUI();
  }
}

function validateStep(n) {
  if (n === 1) {
    if (!state.step1.title.trim())    { showToast('Enter a tour title first.', 'error'); return false; }
    if (!state.step1.dateFrom)        { showToast('Set the From date first (DD/MM/YYYY).', 'error'); return false; }
    if (!state.step1.dateTo)          { showToast('Set the To date first (DD/MM/YYYY).', 'error'); return false; }
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

    const confirmBtn = card.querySelector('.btn-confirm');
    const editBtn    = card.querySelector('.btn-edit-step');
    if (isConfirmed && !isDirty) {
      if (confirmBtn) confirmBtn.style.display = 'none';
      if (editBtn)    editBtn.style.display = '';
    } else {
      if (confirmBtn) confirmBtn.style.display = '';
      if (editBtn)    editBtn.style.display = 'none';
    }

    // "Upstream dirty" banner — if any earlier step is dirty while this step
    // is already confirmed, warn the user that totals may be stale.
    renderUpstreamStaleBanner(card, n);
  }
}

function renderUpstreamStaleBanner(card, n) {
  const existing = card.querySelector('.step-stale-banner');
  let staleSrc = 0;
  for (let i = 1; i < n; i++) {
    if (state.wizard.dirty[i]) { staleSrc = i; break; }
  }
  const shouldShow = state.wizard.confirmed[n] && staleSrc > 0;
  if (shouldShow) {
    const msg = `⚠ Step ${staleSrc} was edited. Re-confirm it so Step ${n} stays in sync.`;
    if (existing) {
      existing.textContent = msg;
    } else {
      const el = document.createElement('div');
      el.className = 'step-stale-banner';
      el.textContent = msg;
      const body = card.querySelector('.step-body');
      if (body) body.insertBefore(el, body.firstChild);
    }
  } else if (existing) {
    existing.remove();
  }
}

// ──────────────────────────────────────────────────────────────────────
//  STEP 1
// ──────────────────────────────────────────────────────────────────────

function initStep1() {
  const titleEl = document.getElementById('tourTitle');
  if (titleEl) titleEl.addEventListener('input', e => { state.step1.title = e.target.value; touchStep(1); });

  bindDateField('dateFrom');
  bindDateField('dateTo');

  ['adults','children','mealPlan'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => handleStep1Change(id, el));
    el.addEventListener('input',  () => handleStep1Change(id, el));
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
}

function bindDateField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input',  () => autoFormatDDMMYYYY(el));
  el.addEventListener('change', () => commitDateField(id, el));
  el.addEventListener('blur',   () => commitDateField(id, el));
}

/** Insert / keep slashes while typing (1102 → 11/02, 110226 → 11/02/26 etc.). */
function autoFormatDDMMYYYY(el) {
  const raw = el.value.replace(/[^0-9]/g, '').slice(0, 8);
  let out = raw;
  if (raw.length > 4) out = raw.slice(0, 2) + '/' + raw.slice(2, 4) + '/' + raw.slice(4);
  else if (raw.length > 2) out = raw.slice(0, 2) + '/' + raw.slice(2);
  el.value = out;
}

function commitDateField(id, el) {
  const iso = parseDDMMYYYY(el.value);
  if (!iso && el.value.trim() !== '') {
    showToast('Date must be DD/MM/YYYY.', 'error');
    el.value = state.step1[id] ? formatDateDDMMYYYY(state.step1[id]) : '';
    return;
  }
  state.step1[id] = iso;
  rebuildBriefGridForDates();
  touchStep(1);
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
  touchStep(1);
}

function touchStep(n) {
  markStepDirty(n);
  persistWizardState();
}

// ──────────────────────────────────────────────────────────────────────
//  WIZARD STATE PERSISTENCE
// ──────────────────────────────────────────────────────────────────────

const LS_WIZARD = 'am_wizard_state_v1';

function persistWizardState() {
  try {
    const snapshot = {
      step1: state.step1,
      step2: state.step2,
      step3: state.step3,
      step4: {
        groupType:      state.step4.groupType,
        stayStarChoice: state.step4.stayStarChoice,
        selections:     state.step4.selections,
        // stays is recomputed from step1/step3 on load, do not persist it.
      },
      wizard: state.wizard,
    };
    localStorage.setItem(LS_WIZARD, JSON.stringify(snapshot));
  } catch { /* quota or SSR — silent */ }
}

function restoreWizardState() {
  try {
    const raw = localStorage.getItem(LS_WIZARD);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return false;
    Object.assign(state.step1, saved.step1 || {});
    Object.assign(state.step2, saved.step2 || {});
    if (saved.step3?.briefRows) state.step3.briefRows = saved.step3.briefRows;
    if (saved.step4) {
      state.step4.groupType      = saved.step4.groupType      ?? state.step4.groupType;
      state.step4.stayStarChoice = saved.step4.stayStarChoice ?? {};
      state.step4.selections     = saved.step4.selections     ?? {};
    }
    if (saved.wizard) {
      Object.assign(state.wizard.confirmed, saved.wizard.confirmed || {});
      Object.assign(state.wizard.dirty,     saved.wizard.dirty     || {});
      state.wizard.currentStep = saved.wizard.currentStep || 1;
    }
    return true;
  } catch { return false; }
}

function clearPersistedWizardState() {
  try { localStorage.removeItem(LS_WIZARD); } catch {}
}

// ──────────────────────────────────────────────────────────────────────
//  STEP 2 — Transport & zone fleets
// ──────────────────────────────────────────────────────────────────────

function initStep2() {
  ['carSize','shuttleHalong','limoSapa'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state.step2[id] = el.value;
      touchStep(2);
    });
  });

  bindZoneFleet('sapa', 'sapaN29', 'sapaN16', 'sapaZoneCapacity', 'sapaZoneSuggestBtn');
  bindZoneFleet('pq',   'pqN29',   'pqN16',   'pqZoneCapacity',   'pqZoneSuggestBtn');
}

function bindZoneFleet(key, n29Id, n16Id, capId, suggestId) {
  const stateKey = key === 'sapa' ? 'sapaZone' : 'pqZone';
  const n29El = document.getElementById(n29Id);
  const n16El = document.getElementById(n16Id);
  const capEl = document.getElementById(capId);
  const sugBtn = document.getElementById(suggestId);

  const update = () => {
    const n29 = Math.max(0, parseInt(n29El?.value) || 0);
    const n16 = Math.max(0, parseInt(n16El?.value) || 0);
    state.step2[stateKey] = { n29, n16 };
    const cap = n29 * 29 + n16 * 16;
    const pax = paxForTransport();
    if (capEl) {
      const ok = cap >= pax;
      capEl.innerHTML = `Capacity: <strong>${cap}</strong> seats (pax: ${pax}) ${ok ? '<span style="color:#0a7d2a">✓</span>' : '<span style="color:#c0392b">⚠ insufficient</span>'}`;
    }
    touchStep(2);
  };
  n29El?.addEventListener('input', update);
  n16El?.addEventListener('input', update);

  sugBtn?.addEventListener('click', () => {
    const pax = paxForTransport();
    const combo = suggestZoneFleet(pax);
    if (n29El) n29El.value = combo.n29;
    if (n16El) n16El.value = combo.n16;
    update();
  });

  update();
}

/** Greedy: prefer 29-seaters; fill leftovers with 16-seater(s). */
function suggestZoneFleet(pax) {
  if (!pax || pax <= 0) return { n29: 0, n16: 0 };
  if (pax <= 16) return { n29: 0, n16: 1 };
  if (pax <= 29) return { n29: 1, n16: 0 };
  const n29 = Math.floor(pax / 29);
  const rem = pax - n29 * 29;
  if (rem === 0) return { n29, n16: 0 };
  if (rem <= 16) return { n29, n16: 1 };
  return { n29: n29 + 1, n16: 0 };
}

/** Pax-for-transport ignores children ≤ 5 years old. */
function paxForTransport() {
  const adults = Number(state.step1.adults) || 0;
  const kids   = Number(state.step1.children) || 0;
  const ages   = state.step1.childrenAges || [];
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

  if (!state.wizard.confirmed[2]) {
    const sel = document.getElementById('carSize');
    if (sel) { sel.value = size; state.step2.carSize = size; }
  }

  // Pre-fill zone fleets with a suggestion if they're all zero.
  const pref = suggestZoneFleet(total);
  for (const [stateKey, n29Id, n16Id] of [['sapaZone', 'sapaN29', 'sapaN16'], ['pqZone', 'pqN29', 'pqN16']]) {
    const cur = state.step2[stateKey];
    if (cur.n29 === 0 && cur.n16 === 0 && !state.wizard.confirmed[2]) {
      state.step2[stateKey] = pref;
      const n29 = document.getElementById(n29Id); if (n29) n29.value = pref.n29;
      const n16 = document.getElementById(n16Id); if (n16) n16.value = pref.n16;
    }
  }
  // Refresh capacity displays
  refreshZoneCapacities();
}

function refreshZoneCapacities() {
  for (const [stateKey, capId] of [['sapaZone', 'sapaZoneCapacity'], ['pqZone', 'pqZoneCapacity']]) {
    const z = state.step2[stateKey];
    const cap = (z.n29 || 0) * 29 + (z.n16 || 0) * 16;
    const pax = paxForTransport();
    const el = document.getElementById(capId);
    if (el) {
      const ok = pax > 0 ? cap >= pax : cap > 0;
      el.classList.toggle('ok', ok && (cap > 0));
      el.classList.toggle('short', pax > 0 && cap < pax);
      el.innerHTML = `Capacity: <strong>${cap}</strong> seats (pax: ${pax}) ${ok ? '✓' : '⚠ insufficient'}`;
    }
  }
}

/**
 * Compute the set of destinations the tour actually visits, based on every
 * row's template city (fallback: regex-detected city from the typed title).
 * Returns an ordered array of unique city codes in the order they appear.
 */
function detectTourDestinations() {
  const seen = new Set();
  const out = [];
  for (const r of (state.step3.briefRows || [])) {
    let c = r.templateCity;
    if (!c && r.title) c = detectCityFromTitle(r.title) || '';
    if (c && !seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}

/** Does any Phu Quoc row go to Rach Vem? Drives the PQ zone-fleet UI. */
function tourHitsPqRachVem() {
  return (state.step3.briefRows || []).some(r =>
    r.templateCity === 'PQ' && /rach vem|rạch vẹm/i.test(r.title || '')
  );
}

function refreshZoneVisibility() {
  const dest = detectTourDestinations();
  const hasSapa     = dest.includes('SP');
  const hasPq       = dest.includes('PQ');
  const hasHalong   = dest.includes('HL');

  const sapaGroup = document.getElementById('sapaZoneGroup');
  const pqGroup   = document.getElementById('pqRachVemGroup');
  if (sapaGroup) sapaGroup.style.display = hasSapa ? 'block' : 'none';
  if (pqGroup)   pqGroup.style.display   = (hasPq && tourHitsPqRachVem()) ? 'block' : 'none';

  // Destination-specific transport options
  const optShuttle = document.getElementById('optShuttleHalong');
  const optLimo    = document.getElementById('optLimoSapa');
  const optEmpty   = document.getElementById('optEmptyHint');
  if (optShuttle) optShuttle.style.display = hasHalong ? '' : 'none';
  if (optLimo)    optLimo.style.display    = hasSapa   ? '' : 'none';

  // Auto-reset a toggle that is no longer relevant to avoid surprise values.
  if (!hasHalong && state.step2.shuttleHalong !== 'no') {
    state.step2.shuttleHalong = 'no';
    const el = document.getElementById('shuttleHalong');
    if (el) el.value = 'no';
  }
  if (!hasSapa && state.step2.limoSapa !== 'no') {
    state.step2.limoSapa = 'no';
    const el = document.getElementById('limoSapa');
    if (el) el.value = 'no';
  }

  const anyOption = hasHalong || hasSapa;
  if (optEmpty) optEmpty.style.display = anyOption ? 'none' : '';

  renderDestinationBars(dest);
}

/**
 * Render the "Destinations (auto-detected)" chip bar wherever a
 * [data-destination-bar] exists in the DOM (Step 1 + Step 2 currently).
 */
function renderDestinationBars(dest) {
  const list = Array.isArray(dest) ? dest : detectTourDestinations();
  document.querySelectorAll('[data-destination-chips]').forEach(container => {
    if (!list.length) {
      container.innerHTML = `<span class="destination-empty">Set the itinerary in Step 3 to see the detected cities here.</span>`;
      return;
    }
    container.innerHTML = list.map(code => {
      const label = getCityLabel(code) || code;
      const kind = destinationFlavourClass(code);
      return `<span class="destination-chip ${kind}" title="${escapeHtml(label)} (${code})">${escapeHtml(label)}</span>`;
    }).join('');
  });
}

/** Map city codes to a CSS flavour class for chip tinting. */
function destinationFlavourClass(code) {
  if (code === 'HL') return 'dest-halong';
  if (code === 'SP') return 'dest-sapa';
  if (code === 'PQ') return 'dest-pq';
  if (code === 'HA') return 'dest-hoian';
  if (code === 'DN') return 'dest-danang';
  if (code === 'HN') return 'dest-hanoi';
  if (code === 'HC') return 'dest-hcm';
  return 'dest-generic';
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
  bindBriefGridDelegation();
}

/**
 * Single, persistent click delegate on the brief grid <tbody>. Survives
 * every renderBriefGrid() / refreshRowSuggestions() call so clicks on
 * dynamically-created .tmpl-rec-btn and .tmpl-new-btn always fire.
 */
function bindBriefGridDelegation() {
  const body = document.getElementById('briefGridBody');
  if (!body || body.dataset.delegated === '1') return;
  body.dataset.delegated = '1';

  body.addEventListener('click', (e) => {
    const recBtn = e.target.closest('.tmpl-rec-btn');
    const newBtn = e.target.closest('.tmpl-new-btn');
    if (!recBtn && !newBtn) return;

    const tr = e.target.closest('tr[data-idx]');
    if (!tr) return;
    const idx = Number(tr.dataset.idx);
    const row = state.step3.briefRows[idx];
    if (!row) return;
    const templates = getTemplates();

    if (recBtn) {
      const city = recBtn.dataset.city;
      const i    = Number(recBtn.dataset.idx);
      const tmpl = templates[city]?.[i];
      if (!tmpl) return;
      row.templateCity = city;
      row.templateKey  = tmpl.key;
      row.templateText = tmpl.text || '';
      row.title        = tmpl.key;
      const titleEl = tr.querySelector('.row-title');
      if (titleEl) titleEl.value = tmpl.key;
      refreshZoneVisibility();
      refreshRowSuggestions(tr, row, templates);
      touchStep(3);
      return;
    }

    if (newBtn) {
      openNewTemplateArea(row);
    }
  });
}

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
    const recHtml   = buildTemplateSuggestions(row.title, row.templateCity, row.templateKey, templates);
    const hasNewBtn = row.title && !row.templateKey;

    return `
<tr data-idx="${idx}">
  <td class="cell-day">
    <div class="cell-day-num">Day ${row.dayNum}</div>
    <div class="cell-date">${escapeHtml(dateShort)}</div>
    <div class="cell-date-long">${escapeHtml(row.dateLabel || '')}</div>
  </td>
  <td class="cell-itinerary">
    <input type="text" class="row-title" value="${escapeHtml(row.title)}" />
    ${recHtml ? `<div class="tmpl-rec" data-recidx="${idx}">${recHtml}</div>` : ''}
    ${hasNewBtn ? `<button class="tmpl-new-btn" data-newidx="${idx}">📝 Save as new template</button>` : ''}
  </td>
  <td class="cell-meals">
    <input type="text" class="row-meals" value="${escapeHtml(row.meals || '')}" />
  </td>
</tr>`;
  }).join('');

  body.querySelectorAll('tr[data-idx]').forEach(tr => {
    const idx = Number(tr.dataset.idx);
    const row = state.step3.briefRows[idx];

    tr.querySelector('.row-title')?.addEventListener('input', e => {
      row.title = e.target.value;
      applyTemplateMatch(row, tr, templates);
      touchStep(3);
      refreshZoneVisibility();
      refreshRowSuggestions(tr, row, templates);
    });

    tr.querySelector('.row-meals')?.addEventListener('input', e => {
      row.meals = e.target.value;
      touchStep(3);
    });
  });
}

function refreshRowSuggestions(tr, row, templates) {
  const cell = tr.querySelector('.cell-itinerary');
  if (!cell) return;
  let rec = tr.querySelector('.tmpl-rec');
  const suggestions = buildTemplateSuggestions(row.title, row.templateCity, row.templateKey, templates);
  if (suggestions) {
    if (!rec) {
      rec = document.createElement('div');
      rec.className = 'tmpl-rec';
      const newBtn = cell.querySelector('.tmpl-new-btn');
      if (newBtn) cell.insertBefore(rec, newBtn);
      else cell.appendChild(rec);
    }
    rec.innerHTML = suggestions;
    // Clear any inline display set by earlier versions so CSS's `flex` applies.
    rec.style.display = '';
  } else if (rec) {
    // No suggestions → hide without nuking the element so flex isn't broken later.
    rec.innerHTML = '';
    rec.style.display = 'none';
  }

  let newBtn = tr.querySelector('.tmpl-new-btn');
  const show = row.title && !row.templateKey;
  if (show) {
    if (!newBtn) {
      newBtn = document.createElement('button');
      newBtn.className = 'tmpl-new-btn';
      newBtn.type = 'button';
      newBtn.textContent = '📝 Save as new template';
      cell.appendChild(newBtn);
    }
  } else if (newBtn) {
    newBtn.remove();
  }
}

/**
 * Build the suggestion chips block.
 *
 *   - Any typed title → list every scored template (not hidden even when the
 *     title is an exact match, so the user can switch between near-misses).
 *   - The currently-applied template (by templateKey) gets an `active` chip so
 *     users can see what's selected without losing visibility of alternatives.
 *   - When nothing is typed yet, returns a short "browse templates by city"
 *     placeholder with up to 8 chips from the most-likely city, so a fresh
 *     grid doesn't look empty.
 */
function buildTemplateSuggestions(title, city, activeKey, templates) {
  const label = `<span class="tmpl-rec-label">Suggestions:</span>`;
  const t = (title || '').trim().toLowerCase();

  // Quiet by default — only surface chips once the user has typed ≥3 chars
  // OR already picked a template for this row. An empty row with a city set
  // used to spam ~8 chips per day; that was too noisy.
  if (t.length < 3 && !activeKey) return '';

  const allCities = Object.keys(templates);
  const searchCities = city ? [city, ...allCities.filter(c => c !== city)] : allCities;

  // If we have an active template but no typed text, just pin that chip.
  if (t.length < 3 && activeKey) {
    for (const c of searchCities) {
      const arr = templates[c] || [];
      const i = arr.findIndex(tmpl => tmpl.key === activeKey);
      if (i >= 0) return `${label}${chipFor(c, i, activeKey, activeKey)}`;
    }
    return '';
  }

  // Score templates by shared keywords + exact match (exact match pins first).
  const words = t.split(/\s+/).filter(w => w.length > 2);
  const scored = [];
  for (const c of searchCities) {
    (templates[c] || []).forEach((tmpl, i) => {
      const key = (tmpl.key || '').toLowerCase();
      let score = words.filter(w => key.includes(w)).length;
      if (key === t) score += 100;
      if (score > 0) scored.push({ c, i, score, key: tmpl.key });
    });
  }

  if (!scored.length) return '';

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 8);
  const chips = top.map(s => chipFor(s.c, s.i, s.key, activeKey)).join('');
  return `${label}${chips}`;
}

function chipFor(city, idx, key, activeKey) {
  const isActive = activeKey && activeKey === key;
  return `<button type="button"
    class="tmpl-rec-btn${isActive ? ' active' : ''}"
    data-city="${city}" data-idx="${idx}"
    title="[${city}] ${escapeHtml(key || '')}">[${city}] ${escapeHtml(key || '')}</button>`;
}

function applyTemplateMatch(row, tr, templates) {
  const t = (row.title || '').trim().toLowerCase();
  if (!t) { row.templateKey = ''; row.templateText = ''; return; }
  const guessedCity = detectCityFromTitle(row.title);
  if (guessedCity && !row.templateCity) row.templateCity = guessedCity;
  const searchCities = row.templateCity ? [row.templateCity, ...Object.keys(templates).filter(c => c !== row.templateCity)] : Object.keys(templates);
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
  if (row.templateKey && (row.templateKey || '').trim().toLowerCase() !== t) {
    row.templateKey  = '';
    row.templateText = '';
  }
}

function openNewTemplateArea(row) {
  const area = document.getElementById('newTemplateArea');
  if (!area) return;
  area.style.display = 'block';
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const citySelect = document.getElementById('ntCity');
  if (citySelect) citySelect.value = row.templateCity || '';
  const keyEl = document.getElementById('ntKey');
  if (keyEl) keyEl.value = row.title || '';
  const textEl = document.getElementById('ntText');
  if (textEl) textEl.value = '';
  area.dataset.srcDay = String(row.dayNum || '');
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
      const text = document.getElementById('ntText')?.value || '';
      if (!city || !key) { showToast('Choose a city and enter a template name.', 'error'); return; }
      try { adminAddTemplate(city, key, text); } catch (_) {}
      showToast(`Template "${key}" saved!`, 'success');
      // If we remember which row triggered the save, auto-apply
      const day = Number(area?.dataset?.srcDay);
      if (day) {
        const row = state.step3.briefRows.find(r => r.dayNum === day);
        if (row) {
          row.templateCity = city;
          row.templateKey  = key;
          row.templateText = text;
        }
      }
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
  initStayEditModal();
}

function recomputeStaysPreserve() {
  const newStays = computeStays(state.step3.briefRows);
  const oldSel        = state.step4.selections    || {};
  const oldStarChoice = state.step4.stayStarChoice || {};
  const newSel        = {};
  const newStarChoice = {};
  // Keep ONLY entries whose stay ID survives. Anything else is dropped so
  // state.step4 never accumulates orphan keys from deleted days.
  for (const s of newStays) {
    if (oldSel[s.id])       newSel[s.id]       = oldSel[s.id];
    newStarChoice[s.id] = oldStarChoice[s.id] || '4';
  }
  state.step4.stays          = newStays;
  state.step4.selections     = newSel;
  state.step4.stayStarChoice = newStarChoice;
  renderStep4Stays();
}

/**
 * Step 4 now renders one compact *summary card* per stay. All config happens
 * in the dedicated Edit-stay modal (see initStayEditModal / openStayEditModal).
 */
function renderStep4Stays() {
  const container = document.getElementById('staysContainer');
  if (!container) return;

  const stays = state.step4.stays;
  if (!stays?.length) {
    container.innerHTML = '<p class="no-dest-msg">Finish Step 3 to see stays here.</p>';
    return;
  }

  const hotelsByStars = getHotels();

  container.innerHTML = stays.map(stay =>
    renderStaySummaryCard(stay, hotelsByStars)
  ).join('') + renderGrandTotal(stays, hotelsByStars);

  // Bind per-card controls once. The cards themselves never re-render on
  // number input (that happens inside the modal only).
  container.querySelectorAll('.stay-summary-card').forEach(card => {
    const stayId = card.dataset.stayId;

    card.querySelectorAll('.star-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        state.step4.stayStarChoice[stayId] = btn.dataset.star;
        renderStep4Stays();
        touchStep(4);
      });
    });

    card.querySelector('.stay-edit-btn')?.addEventListener('click', () => {
      openStayEditModal(stayId);
    });
  });
}

function renderStaySummaryCard(stay, hotelsByStars) {
  const tier         = state.step4.stayStarChoice[stay.id] || '4';
  const nightsLabel  = stay.nights > 0 ? `${stay.nights} night${stay.nights !== 1 ? 's' : ''}` : 'no overnight';
  const dayLbl       = stay.endDay !== stay.startDay ? `Day ${stay.startDay}–${stay.endDay}` : `Day ${stay.startDay}`;
  const starToggle   = ['3','4','5'].map(s =>
    `<button type="button" class="star-opt${s === tier ? ' active' : ''}" data-star="${s}">${s}★</button>`
  ).join('');

  // RESOLVE selection for DISPLAY only — never mutate state during render.
  const hotels = (hotelsByStars[tier] || []).filter(h => h.city === stay.city && !(h.flags || []).includes('skip'));
  const savedSel = state.step4.selections[stay.id]?.[tier] || null;
  const sel = savedSel && hotels.find(h => h.id === savedSel.hotelId) ? savedSel : null;

  let body = '';
  if (!hotels.length) {
    body = `<div class="stay-summary-empty">⚠ No ${tier}★ hotels for ${escapeHtml(getCityLabel(stay.city))}. Add via Admin → Hotels.</div>`;
  } else if (!sel || !sel.hotelId) {
    body = `<div class="stay-summary-empty">No hotel selected yet — click <strong>Edit</strong> to pick one.</div>`;
  } else {
    const hotel = hotels.find(h => h.id === sel.hotelId) || hotels[0];
    const rt = findRoomType(hotel, sel.roomTypeId);
    const bd = buildStayBreakdown({
      stay, sel, hotel, state,
      groupType: state.step4.groupType,
      dateFrom: state.step1.dateFrom,
    });

    const redDots = [];
    if ((hotel.flags || []).includes('redFlag'))     redDots.push('Hotel');
    if ((rt?.flags   || []).includes('redFlag'))     redDots.push('Room');
    const redLine = redDots.length
      ? `<div class="stay-summary-warn">🚩 Red flag: ${redDots.join(' & ')}</div>`
      : '';
    const ebWarn = rt?.extraBedAllowed === false
      ? `<div class="stay-summary-warn">🚫 No extra bed on this room type.</div>`
      : '';
    const flexBadge = rt?.flexiblePrice ? `<span class="flag-badge flag-flex">Flexible</span>` : '';
    const overrideBadge = bd.overridden ? `<span class="accom-override">Custom rate</span>` : '';
    const seasonBadge = bd.season === 'high'
      ? `<span class="accom-season high">High Season</span>`
      : `<span class="accom-season low">Low Season</span>`;
    const vatTag = hotel.vatIncluded
      ? `<span class="accom-vat incl">VAT incl.</span>`
      : `<span class="accom-vat excl">+ VAT</span>`;

    const roomsLine = bd.totalRooms > 0
      ? `${bd.totalRooms} room${bd.totalRooms !== 1 ? 's' : ''}${bd.focRooms ? ` (${bd.focRooms} FOC)` : ''}`
      : `<span style="color:#c0392b">0 rooms — open Edit</span>`;

    const extras = [];
    if (sel.earlyCheckinDay) extras.push(`ECI day ${sel.earlyCheckinDay}`);
    if (sel.upgradeRoomTypeId) {
      const u = findRoomType(hotel, sel.upgradeRoomTypeId);
      if (u) extras.push(`→ ${u.name}`);
    }
    const extrasLine = extras.length ? `<div class="stay-summary-extras">+ ${extras.join(' · ')}</div>` : '';

    body = `
<div class="stay-summary-hotel">
  <div class="stay-summary-hotel-name">${escapeHtml(hotel.name)} ${flexBadge}</div>
  <div class="stay-summary-meta">${escapeHtml(rt?.name || '—')} · ${seasonBadge} ${vatTag} ${overrideBadge}</div>
  ${redLine}${ebWarn}
</div>
<div class="stay-summary-quote">
  <div class="stay-summary-rooms">${roomsLine}</div>
  ${extrasLine}
  <div class="stay-summary-perpax">
    <span class="stay-summary-perpax-label">Per pax</span>
    <span class="stay-summary-perpax-value">${formatPerPax(bd.perPax, bd.currency)}</span>
  </div>
  <div class="stay-summary-grand">Total ${formatMoney(bd.grandTotal, bd.currency)} · ${bd.totalPax} pax · ${bd.nights} night${bd.nights !== 1 ? 's' : ''}</div>
</div>`;
  }

  return `
<div class="stay-summary-card stay-block" data-stay-id="${stay.id}">
  <div class="stay-summary-heading">
    <div class="stay-summary-heading-text">
      ${escapeHtml(getCityLabel(stay.city))} — ${dayLbl}
      <span class="stay-heading-nights">${nightsLabel}</span>
    </div>
    <div class="stay-star-toggle stay-star-toggle-inline">${starToggle}</div>
    <button type="button" class="btn-primary-sm stay-edit-btn">✏️ Edit</button>
  </div>
  <div class="stay-summary-body">${body}</div>
</div>`;
}

function renderGrandTotal(stays, hotelsByStars) {
  let sum = 0;
  let currency = null;
  const currencies = new Set();
  let anyConfigured = false;
  for (const stay of stays) {
    const tier  = state.step4.stayStarChoice[stay.id] || '4';
    const sel   = state.step4.selections?.[stay.id]?.[tier];
    const hotel = sel?.hotelId ? (hotelsByStars[tier] || []).find(h => h.id === sel.hotelId) : null;
    if (!hotel) continue;
    const bd = buildStayBreakdown({
      stay, sel, hotel, state,
      groupType: state.step4.groupType,
      dateFrom: state.step1.dateFrom,
    });
    if (bd.grandTotal > 0) anyConfigured = true;
    if (currency == null) currency = bd.currency;
    currencies.add(bd.currency);
    sum += bd.grandTotal;
  }
  if (!anyConfigured) return '';

  if (currencies.size > 1) {
    return `<div class="accom-grand-total mixed">
      <div class="accom-grand-total-label">Accommodation total</div>
      <div class="accom-grand-total-value">Multiple currencies — see per-stay totals above.</div>
    </div>`;
  }

  const adults   = Number(state.step1.adults   || 0);
  const children = Number(state.step1.children || 0);
  const totalPax = Math.max(1, adults + children);
  const perPax   = sum / totalPax;

  return `<div class="accom-grand-total">
    <div class="accom-grand-total-label">Accommodation grand total (all stays)</div>
    <div class="accom-grand-total-value">${formatMoney(sum, currency)} &nbsp;·&nbsp; ${formatPerPax(perPax, currency)} &nbsp;·&nbsp; ${totalPax} pax</div>
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────
//  STEP 4 — Stay edit modal (delegated to lib/stay-modal.js)
// ──────────────────────────────────────────────────────────────────────

const stayModal = createStayModalController({
  state,
  getHotels,
  emptySelection,
  seedDefaultRoomCounts,
  showToast,
  touchStep,
  renderStep4Stays: () => renderStep4Stays(),
});
function initStayEditModal()  { stayModal.init(); }
function openStayEditModal(id){ stayModal.open(id); }
function closeStayEditModal() { stayModal.close(); }

// The legacy inline implementations that previously lived here have moved
// to lib/stay-modal.js (see createStayModalController). Removed for clarity.

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
