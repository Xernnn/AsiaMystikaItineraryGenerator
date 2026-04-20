/**
 * admin-manager.js
 *
 * Admin tab: CRUD for templates and hotels.
 * Data is stored in localStorage and can be exported / imported as JSON.
 *
 * Hotel data now uses the V2 schema defined in [data/hotels.js](../data/hotels.js).
 * The localStorage key has been bumped to `am_hotels_v2` to avoid colliding with
 * the old V1 data.
 */

import { templatesByCity, CITY_LABELS } from '../data/templates.js';
import { hotelsByStars } from '../data/hotels.js';

const LS_TEMPLATES = 'am_templates_v1';
const LS_HOTELS    = 'am_hotels_v2';

// ──────────────────────────────────────────────────────────────────────
//  DATA ACCESS
// ──────────────────────────────────────────────────────────────────────

export function getTemplates() {
  try {
    const saved = localStorage.getItem(LS_TEMPLATES);
    return saved ? JSON.parse(saved) : deepClone(templatesByCity);
  } catch { return deepClone(templatesByCity); }
}

export function saveTemplates(data) {
  localStorage.setItem(LS_TEMPLATES, JSON.stringify(data));
}

export function getHotels() {
  try {
    const saved = localStorage.getItem(LS_HOTELS);
    if (saved) return JSON.parse(saved);
  } catch {}
  return deepClone(hotelsByStars);
}

export function saveHotels(data) {
  localStorage.setItem(LS_HOTELS, JSON.stringify(data));
}

/** Flat list: all hotels with their tier attached. */
export function getAllHotelsFlat() {
  const byStars = getHotels();
  const list = [];
  for (const [tier, arr] of Object.entries(byStars)) {
    for (const h of arr) list.push({ ...h, _tier: tier });
  }
  return list;
}

// ──────────────────────────────────────────────────────────────────────
//  EXPORT / IMPORT
// ──────────────────────────────────────────────────────────────────────

export function exportConfig() {
  const config = {
    version: 2,
    exportedAt: new Date().toISOString(),
    templates: getTemplates(),
    hotels: getHotels(),
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `asia-mystika-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function importConfig(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        if (config.templates) saveTemplates(config.templates);
        if (config.hotels)    saveHotels(config.hotels);
        resolve(config);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function resetToDefaults() {
  localStorage.removeItem(LS_TEMPLATES);
  localStorage.removeItem(LS_HOTELS);
}

// ──────────────────────────────────────────────────────────────────────
//  TEMPLATE CRUD
// ──────────────────────────────────────────────────────────────────────

export function addTemplate(city, key, text) {
  const templates = getTemplates();
  if (!templates[city]) templates[city] = [];
  templates[city].push({ key: key.trim(), text: text.trim() });
  saveTemplates(templates);
}

export function updateTemplate(city, index, key, text) {
  const templates = getTemplates();
  if (!templates[city] || !templates[city][index]) return;
  templates[city][index] = { key: key.trim(), text: text.trim() };
  saveTemplates(templates);
}

export function deleteTemplate(city, index) {
  const templates = getTemplates();
  if (!templates[city]) return;
  templates[city].splice(index, 1);
  saveTemplates(templates);
}

// ──────────────────────────────────────────────────────────────────────
//  HOTEL CRUD
// ──────────────────────────────────────────────────────────────────────

export function addHotel(tier, hotelData) {
  const hotels = getHotels();
  if (!hotels[tier]) hotels[tier] = [];
  hotelData.id = hotelData.id || generateId(hotelData.name);
  hotels[tier].push(hotelData);
  saveHotels(hotels);
}

export function updateHotel(tier, index, hotelData) {
  const hotels = getHotels();
  if (!hotels[tier] || !hotels[tier][index]) return;
  hotels[tier][index] = { ...hotels[tier][index], ...hotelData };
  saveHotels(hotels);
}

export function deleteHotel(tier, index) {
  const hotels = getHotels();
  if (!hotels[tier]) return;
  hotels[tier].splice(index, 1);
  saveHotels(hotels);
}

// ──────────────────────────────────────────────────────────────────────
//  UI INIT
// ──────────────────────────────────────────────────────────────────────

export function initAdminUI(showToast) {
  const CITIES = Object.entries(CITY_LABELS);

  // Populate city selects
  ['tmCity', 'hmCity'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = CITIES.map(([code, label]) =>
      `<option value="${code}">${label} (${code})</option>`
    ).join('');
  });

  // Admin nav
  document.querySelectorAll('.admin-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`admin-${btn.dataset.asection}`)?.classList.add('active');
    });
  });

  // Export / Import / Reset
  document.getElementById('exportConfigBtn')?.addEventListener('click', () => {
    exportConfig();
    showToast('Config exported!', 'success');
  });

  document.getElementById('importConfigBtn')?.addEventListener('click', () => {
    document.getElementById('importFileInput')?.click();
  });

  document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importConfig(file);
      showToast('Config imported! Reloading...', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch {
      showToast('Import failed — invalid config file.', 'error');
    }
    e.target.value = '';
  });

  document.getElementById('resetConfigBtn')?.addEventListener('click', () => {
    if (!confirm('Reset all templates and hotels to defaults? This cannot be undone.')) return;
    resetToDefaults();
    showToast('Reset to defaults. Reloading...', 'success');
    setTimeout(() => location.reload(), 1200);
  });

  // Modal close
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close)?.style.setProperty('display', 'none');
    });
  });

  // ── Template UI ──
  buildCityFilterTabs();
  renderTemplateList('all');

  document.getElementById('addTemplateBtn')?.addEventListener('click', () => {
    openTemplateModal(null);
  });

  document.getElementById('saveTemplateBtn')?.addEventListener('click', () => {
    const city  = document.getElementById('tmCity').value;
    const key   = document.getElementById('tmKey').value.trim();
    const text  = document.getElementById('tmText').value.trim();
    const modal = document.getElementById('templateModal');
    const idx   = modal.dataset.editIndex;
    const eCity = modal.dataset.editCity;

    if (!key || !text) { showToast('Please fill in name and text.', 'error'); return; }

    if (idx !== undefined && idx !== '') {
      if (city !== eCity) {
        deleteTemplate(eCity, parseInt(idx));
        addTemplate(city, key, text);
      } else {
        updateTemplate(eCity, parseInt(idx), key, text);
      }
      showToast('Template updated!', 'success');
    } else {
      addTemplate(city, key, text);
      showToast('Template added!', 'success');
    }
    modal.style.display = 'none';
    const activeFilter = document.querySelector('.cft-btn.active[data-city]')?.dataset.city || 'all';
    renderTemplateList(activeFilter);
  });

  // ── Hotel UI ──
  buildStarFilterTabs();
  renderHotelList('all');

  document.getElementById('addHotelBtn')?.addEventListener('click', () => {
    openHotelModal(null);
  });

  document.getElementById('saveHotelBtn')?.addEventListener('click', () => {
    const tier = document.getElementById('hmStars').value;
    const name = document.getElementById('hmName').value.trim();
    if (!name) { showToast('Hotel name required.', 'error'); return; }

    const flags = [];
    if (document.getElementById('hmFlagSkip').checked)    flags.push('skip');
    if (document.getElementById('hmFlagNoEB').checked)    flags.push('noExtraBed');
    if (document.getElementById('hmFlagDC').checked)      flags.push('dayCruiseOnly');
    if (document.getElementById('hmFlagGIT').checked)     flags.push('gitOnly');
    if (document.getElementById('hmFlagPartial').checked) flags.push('partialPrice');

    const numOrNull = (id) => {
      const v = document.getElementById(id).value.trim();
      return v === '' ? null : Number(v);
    };
    const num = (id) => Number(document.getElementById(id).value || 0);

    const highSeason = parseSeasonRanges(document.getElementById('hmHighSeason').value);

    const upgradeRoom = document.getElementById('hmUpgradeRoom').value.trim();
    const upgradeRate = numOrNull('hmUpgradeRate');
    const upgrade = upgradeRoom && upgradeRate != null
      ? { roomType: upgradeRoom, ratePerNight: upgradeRate }
      : null;

    const focEvery = numOrNull('hmFocEvery');
    const focFree  = numOrNull('hmFocFree');
    const focRule  = (focEvery && focFree) ? { everyRooms: focEvery, freeRooms: focFree } : null;

    const hotelData = {
      name,
      city:        document.getElementById('hmCity').value,
      starRating:  Number(tier),
      roomType:    document.getElementById('hmRoomType').value.trim(),
      currency:    document.getElementById('hmCurrency').value,
      rates: {
        fit: { low: num('hmFitLow'), high: num('hmFitHigh') },
        git: { low: num('hmGitLow'), high: num('hmGitHigh') },
      },
      extraBed:         numOrNull('hmExtraBed'),
      shareBed:         numOrNull('hmShareBed'),
      earlyCheckinRate: numOrNull('hmEci'),
      upgrade,
      focRule,
      vatIncluded: document.getElementById('hmVat').value === 'true',
      highSeason,
      url:   document.getElementById('hmUrl').value.trim(),
      flags,
    };

    const modal = document.getElementById('hotelModal');
    const idx   = modal.dataset.editIndex;
    const eTier = modal.dataset.editStars;

    if (idx !== undefined && idx !== '') {
      if (tier !== eTier) {
        const hotels = getHotels();
        if (hotels[eTier]?.[parseInt(idx)] !== undefined) {
          hotels[eTier].splice(parseInt(idx), 1);
        }
        if (!hotels[tier]) hotels[tier] = [];
        hotelData.id = hotelData.id || generateId(name);
        hotels[tier].push(hotelData);
        saveHotels(hotels);
        showToast(`Hotel moved to ${tier}★ and updated!`, 'success');
      } else {
        updateHotel(eTier, parseInt(idx), hotelData);
        showToast('Hotel updated!', 'success');
      }
    } else {
      addHotel(tier, hotelData);
      showToast('Hotel added!', 'success');
    }
    modal.style.display = 'none';
    const activeFilter = document.querySelector('.cft-btn.active[data-stars]')?.dataset.stars || 'all';
    renderHotelList(activeFilter);
  });
}

// ──────────────────────────────────────────────────────────────────────
//  TEMPLATE LIST RENDERING
// ──────────────────────────────────────────────────────────────────────

function buildCityFilterTabs() {
  const container = document.getElementById('templateCityFilter');
  if (!container) return;
  const cities = Object.entries(CITY_LABELS);
  container.innerHTML =
    `<button class="cft-btn active" data-city="all">All</button>` +
    cities.map(([code, label]) =>
      `<button class="cft-btn" data-city="${code}">${label}</button>`
    ).join('');

  container.querySelectorAll('.cft-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cft-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTemplateList(btn.dataset.city);
    });
  });
}

function renderTemplateList(filterCity) {
  const list = document.getElementById('templateList');
  if (!list) return;
  const templates = getTemplates();
  list.innerHTML = '';

  for (const [city, items] of Object.entries(templates)) {
    if (filterCity !== 'all' && city !== filterCity) continue;
    items.forEach((tmpl, idx) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-body">
          <div class="item-card-title">
            <span class="city-badge">${city}</span>${escHtml(tmpl.key)}
          </div>
          <div class="item-card-preview">${escHtml(tmpl.text)}</div>
        </div>
        <div class="item-card-actions">
          <button class="btn-edit" data-city="${city}" data-idx="${idx}">Edit</button>
          <button class="btn-delete" data-city="${city}" data-idx="${idx}">Delete</button>
        </div>`;
      list.appendChild(card);
    });
  }

  if (!list.children.length) {
    list.innerHTML = '<p style="color:#888;padding:12px">No templates found.</p>';
  }

  list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const city = btn.dataset.city;
      const idx  = parseInt(btn.dataset.idx);
      const tmpl = getTemplates()[city]?.[idx];
      if (tmpl) openTemplateModal({ city, idx, ...tmpl });
    });
  });

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this template?')) return;
      deleteTemplate(btn.dataset.city, parseInt(btn.dataset.idx));
      renderTemplateList(filterCity);
    });
  });
}

function openTemplateModal(data) {
  const modal = document.getElementById('templateModal');
  document.getElementById('templateModalTitle').textContent = data ? 'Edit Template' : 'Add Template';
  document.getElementById('tmCity').value = data?.city || 'HN';
  document.getElementById('tmKey').value  = data?.key  || '';
  document.getElementById('tmText').value = data?.text || '';
  modal.dataset.editIndex = data?.idx ?? '';
  modal.dataset.editCity  = data?.city ?? '';
  modal.style.display = 'flex';
}

// ──────────────────────────────────────────────────────────────────────
//  HOTEL LIST RENDERING
// ──────────────────────────────────────────────────────────────────────

function buildStarFilterTabs() {
  const container = document.getElementById('hotelStarFilter');
  if (!container) return;
  container.querySelectorAll('.cft-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cft-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderHotelList(btn.dataset.stars);
    });
  });
}

function renderHotelList(filterStars) {
  const list = document.getElementById('hotelList');
  if (!list) return;
  const hotels = getHotels();
  list.innerHTML = '';

  for (const [tier, items] of Object.entries(hotels)) {
    if (filterStars !== 'all' && tier !== filterStars) continue;
    items.forEach((hotel, idx) => {
      const flagsHtml = (hotel.flags || []).map(f =>
        `<span class="flag-badge">${f}</span>`
      ).join('');
      const cur = hotel.currency || 'USD';
      const fitLo = formatAmount(hotel.rates?.fit?.low, cur);
      const fitHi = formatAmount(hotel.rates?.fit?.high, cur);
      const gitLo = formatAmount(hotel.rates?.git?.low, cur);
      const gitHi = formatAmount(hotel.rates?.git?.high, cur);

      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-body">
          <div class="item-card-title">
            <span class="stars-badge">${tier}★</span>
            <span class="city-badge">${hotel.city || '?'}</span>
            ${escHtml(hotel.name)}${flagsHtml}
          </div>
          <div class="item-card-meta" style="white-space:normal">
            ${escHtml(hotel.roomType || '')}
            &nbsp;|&nbsp; <strong>FIT</strong> low ${fitLo} / high ${fitHi}
            &nbsp;|&nbsp; <strong>GIT</strong> low ${gitLo} / high ${gitHi}
            &nbsp;|&nbsp; VAT: ${hotel.vatIncluded ? '✅' : '❌'}
            ${hotel.extraBed != null ? ` | EB: ${formatAmount(hotel.extraBed, cur)}` : ''}
            ${hotel.shareBed != null ? ` | SB: ${formatAmount(hotel.shareBed, cur)}` : ''}
            ${hotel.focRule ? ` | FOC: ${hotel.focRule.everyRooms}→${hotel.focRule.freeRooms}` : ''}
          </div>
          ${hotel.upgrade ? `<div class="item-card-preview" style="max-height:none">Upgrade: ${escHtml(hotel.upgrade.roomType)} +${formatAmount(hotel.upgrade.ratePerNight, cur)}/night</div>` : ''}
          ${hotel.highSeason?.length ? `<div class="item-card-preview" style="max-height:none;color:#856404">High season: ${hotel.highSeason.map(s => `${s.from}→${s.to}`).join(', ')}</div>` : ''}
        </div>
        <div class="item-card-actions">
          <button class="btn-edit" data-stars="${tier}" data-idx="${idx}">Edit</button>
          <button class="btn-delete" data-stars="${tier}" data-idx="${idx}">Delete</button>
        </div>`;
      list.appendChild(card);
    });
  }

  if (!list.children.length) {
    list.innerHTML = '<p style="color:#888;padding:12px">No hotels yet. Click + Add Hotel to create the first one.</p>';
  }

  list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.stars;
      const idx  = parseInt(btn.dataset.idx);
      const hotel = getHotels()[tier]?.[idx];
      if (hotel) openHotelModal({ tier, idx, ...hotel });
    });
  });

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this hotel?')) return;
      deleteHotel(btn.dataset.stars, parseInt(btn.dataset.idx));
      renderHotelList(filterStars);
    });
  });
}

function openHotelModal(data) {
  const modal = document.getElementById('hotelModal');
  document.getElementById('hotelModalTitle').textContent = data ? 'Edit Hotel' : 'Add Hotel';
  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

  v('hmName',      data?.name      || '');
  v('hmStars',     data?.tier      || data?.starRating || '4');
  v('hmCity',      data?.city      || 'HN');
  v('hmVat',       data?.vatIncluded ? 'true' : 'false');
  v('hmRoomType',  data?.roomType  || '');
  v('hmCurrency',  data?.currency  || 'USD');
  v('hmFitLow',    data?.rates?.fit?.low  ?? '');
  v('hmFitHigh',   data?.rates?.fit?.high ?? '');
  v('hmGitLow',    data?.rates?.git?.low  ?? '');
  v('hmGitHigh',   data?.rates?.git?.high ?? '');
  v('hmExtraBed',  data?.extraBed ?? '');
  v('hmShareBed',  data?.shareBed ?? '');
  v('hmEci',       data?.earlyCheckinRate ?? '');
  v('hmUpgradeRoom', data?.upgrade?.roomType || '');
  v('hmUpgradeRate', data?.upgrade?.ratePerNight ?? '');
  v('hmFocEvery',  data?.focRule?.everyRooms ?? '');
  v('hmFocFree',   data?.focRule?.freeRooms ?? '');
  v('hmHighSeason', formatSeasonRanges(data?.highSeason || []));
  v('hmUrl',       data?.url || '');

  document.getElementById('hmFlagSkip').checked    = (data?.flags || []).includes('skip');
  document.getElementById('hmFlagNoEB').checked    = (data?.flags || []).includes('noExtraBed');
  document.getElementById('hmFlagDC').checked      = (data?.flags || []).includes('dayCruiseOnly');
  document.getElementById('hmFlagGIT').checked     = (data?.flags || []).includes('gitOnly');
  document.getElementById('hmFlagPartial').checked = (data?.flags || []).includes('partialPrice');

  modal.dataset.editIndex = data?.idx ?? '';
  modal.dataset.editStars = data?.tier ?? '';
  modal.style.display = 'flex';
}

// ──────────────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────────────

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

function formatAmount(n, currency) {
  if (n == null || n === '') return '—';
  const val = Number(n);
  if (!val) return '0';
  if (currency === 'VND') {
    if (val >= 1000) return `${Math.round(val / 1000).toLocaleString('en-US')}k`;
    return val.toLocaleString('en-US');
  }
  return `$${val}`;
}

/**
 * "06-01..08-31, 12-20..01-05" → [{from:"06-01",to:"08-31"}, {from:"12-20",to:"01-05"}]
 */
function parseSeasonRanges(str) {
  if (!str || !str.trim()) return [];
  return str.split(',').map(s => {
    const m = /^(\d{2}-\d{2})\s*(?:\.\.|→|-|to)\s*(\d{2}-\d{2})$/i.exec(s.trim());
    if (!m) return null;
    return { from: m[1], to: m[2] };
  }).filter(Boolean);
}

function formatSeasonRanges(ranges) {
  if (!ranges?.length) return '';
  return ranges.map(r => `${r.from}..${r.to}`).join(', ');
}
