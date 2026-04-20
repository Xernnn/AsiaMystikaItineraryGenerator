/**
 * docx-generator.js
 * Generate a .docx file from the output document data.
 * Uses the docx.js library loaded via CDN.
 *
 * Sections (v2):
 *   Title, Subtitle, [INDIAN GROUP badge], ITINERARY BRIEF, ITINERARY DETAILS,
 *   ACCOMMODATION (per-stay tables, FIT/GIT + season tag), NOTES, TOUR INCLUDES,
 *   TOUR EXCLUDES, IMPORTANT NOTES, CANCELLATION POLICY.
 */

import {
  computeStays, pickRate, calcEarlyCheckin, calcUpgrade, calcPerPax,
  getCityLabel, formatMoney, formatPerPax,
} from './accommodation-engine.js';
import { addDaysISO } from './brief-parser.js';

export async function downloadDocx(docData) {
  if (typeof window.docx === 'undefined') {
    throw new Error('docx.js library not loaded. Please check your internet connection.');
  }

  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, Packer, ShadingType,
  } = window.docx;

  const inch = (n) => Math.round(n * 1440);
  const children = [];

  // ── Title block ──
  children.push(new Paragraph({
    children: [new TextRun({ text: docData.title || 'Tour Itinerary', bold: true, size: 32 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  if (docData.subtitle) {
    children.push(new Paragraph({
      children: [new TextRun({ text: docData.subtitle, size: 22, color: '444444' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }));
  }

  if (docData.isIndian) {
    children.push(new Paragraph({
      children: [new TextRun({ text: '🇮🇳 INDIAN GROUP', bold: true, size: 22, color: 'B45309' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }));
  }

  const sectionHeading = (text) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: '1A73E8', allCaps: true })],
    spacing: { before: 300, after: 120 },
    border: { bottom: { color: '1A73E8', size: 6, style: BorderStyle.SINGLE } },
  });

  const bullet = (text) => new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    bullet: { level: 0 },
    spacing: { after: 60 },
  });

  // ── ITINERARY BRIEF ──
  children.push(sectionHeading('ITINERARY BRIEF'));
  if (docData.briefRows?.length) {
    const headerCells = ['Date', 'Itinerary', 'Meals'].map(h =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
        shading: { fill: 'E8F0FE', type: ShadingType.CLEAR, color: 'auto' },
      })
    );
    const tableRows = [new TableRow({ children: headerCells })];

    for (const row of docData.briefRows) {
      const mealStr = [
        row.meals.B ? 'B' : (row.meals.BR ? 'BR' : '-'),
        row.meals.L ? 'L' : '-',
        row.meals.D ? 'D' : '-',
      ].join('/');
      const dateDisplay = row.dateLabel
        ? `Day ${row.dayNum} (${row.dateLabel})`
        : `Day ${row.dayNum}`;

      tableRows.push(new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: dateDisplay, size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.title || '', size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: mealStr, size: 20 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        ],
      }));
    }

    children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  // ── ITINERARY DETAILS ──
  children.push(sectionHeading('ITINERARY DETAILS'));
  for (const row of (docData.briefRows || [])) {
    const dayTitle = `Day ${row.dayNum}${row.dateLabel ? ' (' + row.dateLabel + ')' : ''}: ${row.title || ''}`;
    children.push(new Paragraph({
      children: [new TextRun({ text: dayTitle, bold: true, size: 24 })],
      spacing: { before: 240, after: 80 },
    }));

    const mealStr = buildMealWords(row.meals);
    const guideBit = row.hasGuide ? ` | Guide: ${row.guideLanguage || 'English'}` : '';
    children.push(new Paragraph({
      children: [new TextRun({ text: `Meals: ${mealStr}${guideBit}`, italics: true, size: 20, color: '555555' })],
      spacing: { after: 80 },
    }));

    if (row.templateText) {
      const lines = row.templateText.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line.trim(), size: 21 })],
            spacing: { after: 60 },
          }));
        }
      }
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: '[No template selected for this day]', italics: true, size: 20, color: '888888' })],
        spacing: { after: 100 },
      }));
    }
  }

  // ── ACCOMMODATION ──
  children.push(sectionHeading('ACCOMMODATION'));
  const stays       = docData.stays       || [];
  const selections  = docData.selections  || {};
  const hotelsByStars = docData.hotelsByStars || {};
  const groupType   = docData.groupType   || 'fit';
  const tierChoice  = docData.tierChoice  || '3+4';
  const tierKeys    = tierChoice === '4+5' ? ['4', '5'] : ['3', '4'];

  for (const tier of tierKeys) {
    const anyForTier = stays.some(s => selections?.[s.id]?.[tier]?.hotelId);
    if (!anyForTier) continue;

    children.push(new Paragraph({
      children: [new TextRun({ text: `${'★'.repeat(Number(tier))} ${tier}-STAR (${groupType.toUpperCase()})`, bold: true, size: 22, color: '1A73E8' })],
      spacing: { before: 240, after: 80 },
    }));

    for (const stay of stays) {
      const sel = selections?.[stay.id]?.[tier];
      const hotel = sel?.hotelId ? findHotel(hotelsByStars, tier, sel.hotelId) : null;
      if (!hotel) continue;

      const dayLbl = stay.nights > 0
        ? `Day ${stay.startDay}${stay.endDay !== stay.startDay ? '–' + stay.endDay : ''} (${stay.nights} night${stay.nights !== 1 ? 's' : ''})`
        : `Day ${stay.startDay} (no overnight)`;

      children.push(new Paragraph({
        children: [new TextRun({ text: `${getCityLabel(stay.city)} — ${dayLbl}`, bold: true, size: 24, color: '202124' })],
        spacing: { before: 180, after: 60 },
      }));

      const dateFrom = docData.dateFrom || '';
      const firstNight = addDaysISO(dateFrom, (stay.startDay || 1) - 1);
      const { ratePerRoom, season } = pickRate(hotel, groupType, firstNight);
      const rooms2 = Number(sel.rooms2pax || 0);
      const rooms3 = Number(sel.rooms3pax || 0);
      const totalRooms = rooms2 + rooms3;
      const focRooms = Number(sel.focRooms || 0);
      const totalPax = Math.max(1, (docData.adults || 0) + (docData.children || 0));
      const paxPerRoom = totalRooms > 0 ? Math.max(1, Math.round(totalPax / totalRooms)) : 2;
      const perPax = calcPerPax({ ratePerRoom, totalRooms, focRooms, totalPax, nights: stay.nights });
      const currency = hotel.currency || 'USD';

      children.push(new Paragraph({
        children: [new TextRun({ text: `${hotel.name} · ${hotel.roomType || ''}  [${season === 'high' ? 'High' : 'Low'} Season · ${hotel.vatIncluded ? 'VAT incl.' : '+VAT'}]`, size: 20, color: '444444' })],
        spacing: { after: 80 },
      }));

      const header = ['Rooms', 'Rate / night', 'Nights', 'Per pax'].map(h =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
          shading: { fill: 'E8F0FE', type: ShadingType.CLEAR, color: 'auto' },
        }));
      const rows = [new TableRow({ children: header })];

      rows.push(new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatRoomBreakdown(rooms2, rooms3), size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatMoney(ratePerRoom, currency), size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${stay.nights}`, size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatPerPax(perPax, currency), size: 20, bold: true })] })] }),
        ],
      }));

      if (focRooms > 0) {
        rows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `↳ FOC rooms × ${focRooms} (cost split over ${totalPax} pax)`, italics: true, size: 19 })] })], columnSpan: 4 }),
          ],
        }));
      }
      if ((sel.extraBeds || 0) > 0) {
        const total = Number(sel.extraBeds) * Number(hotel.extraBed || 0) * Math.max(1, stay.nights);
        rows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `↳ Extra bed × ${sel.extraBeds} → ${formatMoney(total, currency)} total`, italics: true, size: 19 })] })], columnSpan: 4 }),
          ],
        }));
      }
      if ((sel.shareBeds || 0) > 0) {
        const total = Number(sel.shareBeds) * Number(hotel.shareBed || 0) * Math.max(1, stay.nights);
        rows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `↳ Share bed × ${sel.shareBeds} → ${formatMoney(total, currency)} total`, italics: true, size: 19 })] })], columnSpan: 4 }),
          ],
        }));
      }
      if (sel.earlyCheckinDay) {
        const eci = calcEarlyCheckin(hotel, ratePerRoom, paxPerRoom);
        rows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `↳ Early check-in on Day ${sel.earlyCheckinDay}`, italics: true, size: 19 })] })], columnSpan: 3 }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatPerPax(eci, currency), size: 20 })] })] }),
          ],
        }));
      }
      if (sel.upgrade && hotel.upgrade) {
        const up = calcUpgrade(hotel.upgrade, stay.nights, paxPerRoom);
        rows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `↳ Upgrade to ${hotel.upgrade.roomType}`, italics: true, size: 19 })] })], columnSpan: 3 }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatPerPax(up, currency), size: 20 })] })] }),
          ],
        }));
      }

      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    }
  }

  // ── NOTES ──
  if (docData.notes?.length) {
    children.push(sectionHeading('NOTES'));
    for (const n of docData.notes) children.push(bullet(n));
  }
  if (docData.includes?.length) {
    children.push(sectionHeading('TOUR INCLUDES'));
    for (const i of docData.includes) children.push(bullet(i));
  }
  if (docData.excludes?.length) {
    children.push(sectionHeading('TOUR EXCLUDES'));
    for (const e of docData.excludes) children.push(bullet(e));
  }
  if (docData.importantNotes?.length) {
    children.push(sectionHeading('IMPORTANT NOTES'));
    for (const n of docData.importantNotes) children.push(bullet(n));
  }
  if (docData.cancellationTerms?.length) {
    children.push(sectionHeading('CANCELLATION POLICY'));
    for (const t of docData.cancellationTerms) children.push(bullet(t));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: inch(1), bottom: inch(1), left: inch(1.2), right: inch(1.2) } },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${(docData.title || 'itinerary').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function buildMealWords(meals) {
  const parts = [];
  if (meals.B)  parts.push('Breakfast');
  if (meals.BR) parts.push('Brunch');
  if (meals.L)  parts.push('Lunch');
  if (meals.D)  parts.push('Dinner');
  return parts.length ? parts.join(', ') : 'None';
}

function formatRoomBreakdown(rooms2, rooms3) {
  const parts = [];
  if (rooms2 > 0) parts.push(`${rooms2} × Double/Twin`);
  if (rooms3 > 0) parts.push(`${rooms3} × Triple`);
  return parts.length ? parts.join(' + ') : '—';
}

function findHotel(hotelsByStars, tier, hotelId) {
  const list = hotelsByStars?.[tier] || [];
  return list.find(h => h.id === hotelId) || null;
}
