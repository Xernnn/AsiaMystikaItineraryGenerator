/**
 * stay-modal.js — Controller for the Step-4 "Edit stay details" modal.
 *
 * This module is deliberately *decoupled* from app.js:
 * it receives a small context object (dependencies + getters/callbacks)
 * via createStayModalController(ctx), so the main module keeps ownership
 * of state, showToast, rendering orchestration, etc.
 *
 *   const sm = createStayModalController({ state, getHotels, ... });
 *   sm.init();                // wire DOM listeners once
 *   sm.open(stayId);          // open the modal for a given stay
 *
 * Everything below is plain DOM + math; no imports from ./app.js.
 */

import {
  findRoomType, buildStayBreakdown, suggestFocCount,
  formatMoney, formatPerPax, getCityLabel,
} from './accommodation-engine.js';
import { escapeHtml } from './detail-engine.js';

export function createStayModalController(ctx) {
  const {
    state,
    getHotels,
    emptySelection,
    seedDefaultRoomCounts,
    showToast,
    touchStep,
    renderStep4Stays,
  } = ctx;

  const stayEdit = {
    stayId: null,
    tier: null,
    draft: null, // working copy of the selection — committed on Save
  };

  const currentStay = () =>
    state.step4.stays.find(s => s.id === stayEdit.stayId) || null;

  const currentHotel = () => {
    const stay = currentStay();
    if (!stay) return null;
    const byStars = getHotels();
    const list = (byStars[stayEdit.tier] || []).filter(h =>
      h.city === stay.city && !(h.flags || []).includes('skip'));
    return list.find(h => h.id === stayEdit.draft.hotelId) || null;
  };

  function init() {
    const modal = document.getElementById('stayEditModal');
    if (!modal) return;

    modal.querySelectorAll('[data-close="stayEditModal"]').forEach(btn => {
      btn.addEventListener('click', close);
    });

    document.getElementById('smHotel')?.addEventListener('change', e => {
      stayEdit.draft.hotelId = e.target.value;
      stayEdit.draft.roomTypeId = '';
      stayEdit.draft.upgradeRoomTypeId = null;
      stayEdit.draft.priceOverride = null;
      refresh({ repopulateLists: true });
    });

    document.querySelectorAll('#smStarToggle .pill-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const tier = btn.dataset.star;
        if (!tier || tier === stayEdit.tier) return;
        document.querySelectorAll('#smStarToggle .pill-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Only mutate the DRAFT here. Nothing is written to state.step4 until Save.
        stayEdit.tier = tier;
        const existing = state.step4.selections[stayEdit.stayId]?.[tier];
        if (existing) {
          stayEdit.draft = { ...existing };
        } else {
          const byStars = getHotels();
          const hotels = (byStars[tier] || []).filter(h =>
            h.city === currentStay()?.city && !(h.flags || []).includes('skip'));
          stayEdit.draft = emptySelection(hotels[0] || null);
          seedDefaultRoomCounts(stayEdit.draft);
        }
        refresh({ repopulateLists: true });
      });
    });

    document.getElementById('smRoomType')?.addEventListener('change', e => {
      stayEdit.draft.roomTypeId = e.target.value;
      stayEdit.draft.upgradeRoomTypeId = null;
      stayEdit.draft.priceOverride = null;
      refresh({ repopulateLists: true });
    });

    document.getElementById('smUpgradeRt')?.addEventListener('change', e => {
      stayEdit.draft.upgradeRoomTypeId = e.target.value || null;
      refresh();
    });

    const numBind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', e => {
        stayEdit.draft[key] = Math.max(0, parseInt(e.target.value) || 0);
        refresh();
      });
    };
    numBind('smR2',  'rooms2pax');
    numBind('smR3',  'rooms3pax');
    numBind('smEb',  'extraBeds');
    numBind('smSb',  'shareBeds');
    numBind('smFoc', 'focRooms');

    document.getElementById('smEci')?.addEventListener('change', e => {
      stayEdit.draft.earlyCheckinDay = e.target.value ? Number(e.target.value) : null;
      refresh();
    });

    const blankOrIntBind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', e => {
        const v = e.target.value.trim();
        stayEdit.draft[key] = v === '' ? null : Math.max(0, parseInt(v) || 0);
        refresh();
      });
    };
    blankOrIntBind('smEciRooms',     'eciRooms');
    blankOrIntBind('smUpgradeRooms', 'upgradeRooms');

    document.getElementById('smPriceOverride')?.addEventListener('input', e => {
      const v = e.target.value.trim();
      stayEdit.draft.priceOverride = v === '' ? null : Number(v);
      refresh();
    });

    document.getElementById('smSuggestFocBtn')?.addEventListener('click', () => {
      const hotel = currentHotel();
      if (!hotel) return;
      const totalRooms = (Number(stayEdit.draft.rooms2pax) || 0) + (Number(stayEdit.draft.rooms3pax) || 0);
      const suggestion = suggestFocCount(hotel, totalRooms);
      stayEdit.draft.focRooms = suggestion;
      const focEl = document.getElementById('smFoc');
      if (focEl) focEl.value = String(suggestion);
      refresh();
      const rule = hotel.focRule;
      const helper = document.getElementById('smFocHelper');
      if (helper) {
        helper.textContent = rule?.everyRooms
          ? `Rule: every ${rule.everyRooms} rooms → ${rule.freeRooms} FOC. Booked ${totalRooms} rooms → ${suggestion} FOC.`
          : 'No FOC rule on this hotel.';
      }
    });

    document.getElementById('smSaveBtn')?.addEventListener('click', () => {
      // Commit BOTH the star-tier choice and the selection draft atomically.
      if (!state.step4.selections[stayEdit.stayId]) state.step4.selections[stayEdit.stayId] = {};
      state.step4.selections[stayEdit.stayId][stayEdit.tier] = { ...stayEdit.draft };
      state.step4.stayStarChoice[stayEdit.stayId] = stayEdit.tier;
      close();
      renderStep4Stays();
      touchStep(4);
      showToast('Stay updated.', 'success');
    });
  }

  function open(stayId) {
    const stay = state.step4.stays.find(s => s.id === stayId);
    if (!stay) return;
    const tier = state.step4.stayStarChoice[stayId] || '4';
    const saved = state.step4.selections[stayId]?.[tier];
    let draft;
    if (saved) {
      draft = { ...saved };
    } else {
      const byStars = getHotels();
      const hotels = (byStars[tier] || []).filter(h =>
        h.city === stay.city && !(h.flags || []).includes('skip'));
      draft = emptySelection(hotels[0] || null);
      seedDefaultRoomCounts(draft);
    }
    stayEdit.stayId = stayId;
    stayEdit.tier   = tier;
    stayEdit.draft  = draft;

    document.querySelectorAll('#smStarToggle .pill-opt').forEach(b => {
      b.classList.toggle('active', b.dataset.star === tier);
    });

    const titleEl = document.getElementById('stayModalTitle');
    if (titleEl) {
      titleEl.textContent = `${getCityLabel(stay.city)} — Day ${stay.startDay}` +
        `${stay.endDay !== stay.startDay ? '–' + stay.endDay : ''}` +
        ` (${stay.nights} night${stay.nights !== 1 ? 's' : ''})`;
    }

    refresh({ repopulateLists: true });

    const modal = document.getElementById('stayEditModal');
    if (modal) modal.style.display = 'flex';
  }

  function close() {
    const modal = document.getElementById('stayEditModal');
    if (modal) modal.style.display = 'none';
    stayEdit.stayId = null;
    stayEdit.tier = null;
    stayEdit.draft = null;
  }

  /**
   * Repaint the stay-edit modal from `stayEdit.draft`.
   * - repopulateLists: rebuild the hotel + room-type + upgrade + ECI lists.
   * - Otherwise only the price breakdown + helper-text zones update,
   *   which preserves focus in the text inputs while the user types.
   */
  function refresh({ repopulateLists = false } = {}) {
    if (!stayEdit.stayId || !stayEdit.draft) return;
    const stay = currentStay();
    if (!stay) return;

    const tier = stayEdit.tier;
    const byStars = getHotels();
    const hotels = (byStars[tier] || []).filter(h =>
      h.city === stay.city && !(h.flags || []).includes('skip'));

    if (!hotels.length) {
      const breakdown = document.getElementById('smBreakdown');
      if (breakdown) breakdown.innerHTML = `<div class="helper-text">No ${tier}★ hotels available for ${escapeHtml(getCityLabel(stay.city))}. Add via Admin → Hotels.</div>`;
      if (repopulateLists) {
        const hEl = document.getElementById('smHotel');      if (hEl) hEl.innerHTML = '<option value="">—</option>';
        const rEl = document.getElementById('smRoomType');   if (rEl) rEl.innerHTML = '';
        const uEl = document.getElementById('smUpgradeRt');  if (uEl) uEl.innerHTML = '';
      }
      return;
    }

    if (!stayEdit.draft.hotelId || !hotels.find(h => h.id === stayEdit.draft.hotelId)) {
      stayEdit.draft.hotelId = hotels[0].id;
      stayEdit.draft.roomTypeId = hotels[0].roomTypes?.[0]?.id || '';
    }
    const hotel = hotels.find(h => h.id === stayEdit.draft.hotelId);
    if (!(hotel.roomTypes || []).find(rt => rt.id === stayEdit.draft.roomTypeId)) {
      stayEdit.draft.roomTypeId = hotel.roomTypes?.[0]?.id || '';
    }
    const rt = findRoomType(hotel, stayEdit.draft.roomTypeId);

    if (repopulateLists) {
      const hEl = document.getElementById('smHotel');
      if (hEl) {
        hEl.innerHTML = hotels.map(h => {
          const red = (h.flags || []).includes('redFlag') ? ' 🚩' : '';
          return `<option value="${h.id}" ${h.id === stayEdit.draft.hotelId ? 'selected' : ''}>${escapeHtml(h.name)}${red}</option>`;
        }).join('');
      }
      const rEl = document.getElementById('smRoomType');
      if (rEl) {
        rEl.innerHTML = (hotel.roomTypes || []).map(rtOpt => {
          const red = (rtOpt.flags || []).includes('redFlag') ? ' 🚩' : '';
          const flex = rtOpt.flexiblePrice ? ' 💲' : '';
          return `<option value="${rtOpt.id}" ${rtOpt.id === stayEdit.draft.roomTypeId ? 'selected' : ''}>${escapeHtml(rtOpt.name)}${red}${flex}</option>`;
        }).join('');
      }
      const uEl = document.getElementById('smUpgradeRt');
      if (uEl) {
        uEl.innerHTML = [
          `<option value="">(no upgrade)</option>`,
          ...(hotel.roomTypes || [])
            .filter(rtOpt => rtOpt.id !== stayEdit.draft.roomTypeId)
            .map(rtOpt => `<option value="${rtOpt.id}" ${rtOpt.id === stayEdit.draft.upgradeRoomTypeId ? 'selected' : ''}>Upgrade → ${escapeHtml(rtOpt.name)}</option>`),
        ].join('');
      }
      const eciEl = document.getElementById('smEci');
      if (eciEl) {
        const curr = stayEdit.draft.earlyCheckinDay || '';
        const opts = [`<option value="">(no early check-in)</option>`];
        for (let d = stay.startDay; d <= stay.endDay; d++) {
          opts.push(`<option value="${d}" ${String(curr) === String(d) ? 'selected' : ''}>Day ${d}</option>`);
        }
        eciEl.innerHTML = opts.join('');
      }
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? 0; };
      setVal('smR2',  stayEdit.draft.rooms2pax ?? 0);
      setVal('smR3',  stayEdit.draft.rooms3pax ?? 0);
      setVal('smEb',  stayEdit.draft.extraBeds ?? 0);
      setVal('smSb',  stayEdit.draft.shareBeds ?? 0);
      setVal('smFoc', stayEdit.draft.focRooms  ?? 0);
      const eciRoomsEl = document.getElementById('smEciRooms');
      if (eciRoomsEl) eciRoomsEl.value = stayEdit.draft.eciRooms ?? '';
      const upRoomsEl = document.getElementById('smUpgradeRooms');
      if (upRoomsEl) upRoomsEl.value = stayEdit.draft.upgradeRooms ?? '';
      const poEl = document.getElementById('smPriceOverride');
      if (poEl) poEl.value = stayEdit.draft.priceOverride ?? '';
    }

    // Flags + warnings + visibility
    const hotelFlagsEl = document.getElementById('smHotelFlags');
    if (hotelFlagsEl) {
      const chips = [];
      if ((hotel.flags || []).includes('redFlag'))       chips.push(`<span class="flag-badge flag-redFlag">🚩 Red flag</span>`);
      if ((hotel.flags || []).includes('gitOnly'))       chips.push(`<span class="flag-badge">GIT only</span>`);
      if ((hotel.flags || []).includes('dayCruiseOnly')) chips.push(`<span class="flag-badge">Day cruise only</span>`);
      hotelFlagsEl.innerHTML = chips.join(' ');
    }
    const rtFlagsEl = document.getElementById('smRoomTypeFlags');
    if (rtFlagsEl) {
      const chips = [];
      if ((rt?.flags || []).includes('redFlag')) chips.push(`<span class="flag-badge flag-redFlag">🚩 Red flag</span>`);
      if (rt?.flexiblePrice)                     chips.push(`<span class="flag-badge flag-flex">Flexible price</span>`);
      if (rt?.extraBedAllowed === false)         chips.push(`<span class="flag-badge">No extra bed</span>`);
      rtFlagsEl.innerHTML = chips.join(' ');
    }
    const ebWarnEl = document.getElementById('smEbWarn');
    if (ebWarnEl) ebWarnEl.style.display = (rt?.extraBedAllowed === false) ? 'block' : 'none';
    const ebEl = document.getElementById('smEb');
    if (ebEl) {
      ebEl.disabled = (rt?.extraBedAllowed === false);
      if (rt?.extraBedAllowed === false) {
        ebEl.value = '0';
        stayEdit.draft.extraBeds = 0;
      }
    }
    const flexBlock = document.getElementById('smFlexBlock');
    if (flexBlock) flexBlock.style.display = rt?.flexiblePrice ? 'block' : 'none';

    const helper = document.getElementById('smFocHelper');
    if (helper) {
      const rule = hotel.focRule;
      helper.textContent = rule?.everyRooms
        ? `Rule: every ${rule.everyRooms} rooms → ${rule.freeRooms} FOC.`
        : 'No FOC rule configured on this hotel.';
    }

    const bd = buildStayBreakdown({
      stay,
      sel: stayEdit.draft,
      hotel,
      state,
      groupType: state.step4.groupType,
      dateFrom: state.step1.dateFrom,
    });
    const breakdownEl = document.getElementById('smBreakdown');
    if (breakdownEl) breakdownEl.innerHTML = renderBreakdownTable(bd);
  }

  return { init, open, close };
}

function renderBreakdownTable(bd) {
  if (!bd || !bd.rows?.length) return `<div class="helper-text">No data yet.</div>`;
  const currency = bd.currency;
  const lineRows = bd.rows
    .filter(r => r.kind !== 'total' && r.kind !== 'perPax')
    .map(r => {
      const signedAmt = r.amount < 0
        ? `<span style="color:#c0392b">− ${formatMoney(Math.abs(r.amount), currency)}</span>`
        : `${formatMoney(r.amount, currency)}`;
      const rowClass =
        r.kind === 'subtotal' ? 'breakdown-row subtotal' :
        (r.kind === 'foc' ? 'breakdown-row discount' : 'breakdown-row');
      return `<tr class="${rowClass}">
  <td>${escapeHtml(r.label)}</td>
  <td class="bd-detail">${escapeHtml(r.detail)}</td>
  <td class="bd-amt">${signedAmt}</td>
</tr>`;
    }).join('');

  return `<table class="breakdown-table">
    <tbody>
      ${lineRows}
      <tr class="breakdown-row total">
        <td colspan="2" style="text-align:right">Grand total</td>
        <td class="bd-amt">${formatMoney(bd.grandTotal, currency)}</td>
      </tr>
      <tr class="breakdown-row per-pax">
        <td colspan="2" style="text-align:right">÷ ${bd.totalPax} pax</td>
        <td class="bd-amt">${formatPerPax(bd.perPax, currency)}</td>
      </tr>
    </tbody>
  </table>`;
}
