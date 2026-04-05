/**
 * admin-manager.js
 * CRUD for templates and hotels, stored in localStorage with JSON export/import.
 */
import { templatesByCity, CITY_LABELS } from '../data/templates.js';
import { hotelsByStars } from '../data/hotels.js';

const LS_TEMPLATES = 'am_templates_v1';
const LS_HOTELS    = 'am_hotels_v1';

// ─── Data Access ─────────────────────────────────────────

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
    return saved ? JSON.parse(saved) : deepClone(hotelsByStars);
  } catch { return deepClone(hotelsByStars); }
}

export function saveHotels(data) {
  localStorage.setItem(LS_HOTELS, JSON.stringify(data));
}

// ─── Export / Import ─────────────────────────────────────

export function exportConfig() {
  const config = {
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: getTemplates(),
    hotels: getHotels(),
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `asia-mystika-config-${new Date().toISOString().slice(0,10)}.json`;
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

// ─── Template CRUD ────────────────────────────────────────

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

// ─── Hotel CRUD ───────────────────────────────────────────

export function addHotel(stars, hotelData) {
  const hotels = getHotels();
  if (!hotels[stars]) hotels[stars] = [];
  hotelData.id = generateId(hotelData.name);
  hotels[stars].push(hotelData);
  saveHotels(hotels);
}

export function updateHotel(stars, index, hotelData) {
  const hotels = getHotels();
  if (!hotels[stars] || !hotels[stars][index]) return;
  hotels[stars][index] = { ...hotels[stars][index], ...hotelData };
  saveHotels(hotels);
}

export function deleteHotel(stars, index) {
  const hotels = getHotels();
  if (!hotels[stars]) return;
  hotels[stars].splice(index, 1);
  saveHotels(hotels);
}

// ─── Admin UI ─────────────────────────────────────────────

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

  // Modal close buttons
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
    const idx   = document.getElementById('templateModal').dataset.editIndex;
    const eCity = document.getElementById('templateModal').dataset.editCity;

    if (!key || !text) { showToast('Please fill in name and text.', 'error'); return; }

    if (idx !== undefined && idx !== '') {
      if (city !== eCity) {
        // City changed — delete from old, add to new
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
    document.getElementById('templateModal').style.display = 'none';
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
    const stars = document.getElementById('hmStars').value;
    const name  = document.getElementById('hmName').value.trim();
    if (!name) { showToast('Hotel name required.', 'error'); return; }

    const flags = [];
    if (document.getElementById('hmFlagSkip').checked)    flags.push('skip');
    if (document.getElementById('hmFlagNoEB').checked)    flags.push('noExtraBed');
    if (document.getElementById('hmFlagDC').checked)      flags.push('dayCruiseOnly');
    if (document.getElementById('hmFlagGIT').checked)     flags.push('gitOnly');
    if (document.getElementById('hmFlagPartial').checked) flags.push('partialPrice');

    const hotelData = {
      name,
      city:        document.getElementById('hmCity').value,
      vatIncluded: document.getElementById('hmVat').value === 'true',
      roomType:    document.getElementById('hmRoomType').value.trim(),
      lowRate:     document.getElementById('hmLowRate').value.trim(),
      highRate:    document.getElementById('hmHighRate').value.trim(),
      childShare:  document.getElementById('hmChildShare').value.trim(),
      extraBed:    document.getElementById('hmExtraBed').value.trim(),
      upgradeRoom: document.getElementById('hmUpgrade').value.trim() || null,
      url:         document.getElementById('hmUrl').value.trim(),
      flags,
    };

    const modal = document.getElementById('hotelModal');
    const idx   = modal.dataset.editIndex;
    const eStars = modal.dataset.editStars;

    if (idx !== undefined && idx !== '') {
      if (stars !== eStars) {
        // Tier changed: remove from old tier, add to new tier
        const hotels = getHotels();
        if (hotels[eStars]?.[parseInt(idx)] !== undefined) {
          hotels[eStars].splice(parseInt(idx), 1);
        }
        if (!hotels[stars]) hotels[stars] = [];
        hotels[stars].push(hotelData);
        saveHotels(hotels);
        showToast(`Hotel moved to ${stars}★ and updated!`, 'success');
      } else {
        updateHotel(eStars, parseInt(idx), hotelData);
        showToast('Hotel updated!', 'success');
      }
    } else {
      addHotel(stars, hotelData);
      showToast('Hotel added!', 'success');
    }
    modal.style.display = 'none';
    const activeFilter = document.querySelector('.cft-btn.active[data-stars]')?.dataset.stars || 'all';
    renderHotelList(activeFilter);
  });
}

// ─── Template List ────────────────────────────────────────

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

// ─── Hotel List ───────────────────────────────────────────

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

  for (const [stars, items] of Object.entries(hotels)) {
    if (filterStars !== 'all' && stars !== filterStars) continue;
    items.forEach((hotel, idx) => {
      const flagsHtml = (hotel.flags || []).map(f =>
        `<span class="flag-badge">${f}</span>`
      ).join('');
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-body">
          <div class="item-card-title">
            <span class="stars-badge">${stars}★</span>
            <span class="city-badge">${hotel.city || '?'}</span>
            ${escHtml(hotel.name)}${flagsHtml}
          </div>
          <div class="item-card-meta" style="white-space:normal">
            ${escHtml(hotel.roomType || '')} &nbsp;|&nbsp;
            Low: <strong>${escHtml(hotel.lowRate || '—')}</strong> &nbsp;|&nbsp;
            High: <strong>${escHtml(hotel.highRate || '—')}</strong> &nbsp;|&nbsp;
            VAT: ${hotel.vatIncluded ? '✅ Incl.' : '❌ +VAT'}
            ${hotel.childShare ? ` | Child: ${escHtml(hotel.childShare)}` : ''}
            ${hotel.extraBed   ? ` | EB: ${escHtml(hotel.extraBed)}`     : ''}
          </div>
          ${hotel.upgradeRoom ? `<div class="item-card-preview" style="max-height:none">Upgrade: ${escHtml(hotel.upgradeRoom)}</div>` : ''}
        </div>
        <div class="item-card-actions">
          <button class="btn-edit" data-stars="${stars}" data-idx="${idx}">Edit</button>
          <button class="btn-delete" data-stars="${stars}" data-idx="${idx}">Delete</button>
        </div>`;
      list.appendChild(card);
    });
  }

  if (!list.children.length) {
    list.innerHTML = '<p style="color:#888;padding:12px">No hotels found.</p>';
  }

  list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const stars = btn.dataset.stars;
      const idx   = parseInt(btn.dataset.idx);
      const hotel = getHotels()[stars]?.[idx];
      if (hotel) openHotelModal({ stars, idx, ...hotel });
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
  document.getElementById('hmName').value      = data?.name      || '';
  document.getElementById('hmStars').value     = data?.stars     || '3';
  document.getElementById('hmCity').value      = data?.city      || 'HN';
  document.getElementById('hmVat').value       = data?.vatIncluded ? 'true' : 'false';
  document.getElementById('hmRoomType').value  = data?.roomType  || '';
  document.getElementById('hmLowRate').value   = data?.lowRate   || '';
  document.getElementById('hmHighRate').value  = data?.highRate  || '';
  document.getElementById('hmChildShare').value= data?.childShare|| '';
  document.getElementById('hmExtraBed').value  = data?.extraBed  || '';
  document.getElementById('hmUpgrade').value   = data?.upgradeRoom || '';
  document.getElementById('hmUrl').value       = data?.url       || '';
  document.getElementById('hmFlagSkip').checked    = (data?.flags || []).includes('skip');
  document.getElementById('hmFlagNoEB').checked    = (data?.flags || []).includes('noExtraBed');
  document.getElementById('hmFlagDC').checked      = (data?.flags || []).includes('dayCruiseOnly');
  document.getElementById('hmFlagGIT').checked     = (data?.flags || []).includes('gitOnly');
  document.getElementById('hmFlagPartial').checked = (data?.flags || []).includes('partialPrice');
  modal.dataset.editIndex = data?.idx ?? '';
  modal.dataset.editStars = data?.stars ?? '';
  modal.style.display = 'flex';
}

// ─── Helpers ──────────────────────────────────────────────

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function generateId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,40);
}
