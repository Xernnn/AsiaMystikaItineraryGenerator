/**
 * docx-generator.js
 * Generate a .docx file from the output document data (v3 hotel schema).
 * Uses the docx.js library loaded via CDN.
 *
 * Sections:
 *   Title, Subtitle, [INDIAN GROUP], ITINERARY BRIEF, ITINERARY DETAILS,
 *   ACCOMMODATION (per-stay tables with room-type, FOC, EB, SB, ECI, upgrade),
 *   NOTES, TOUR INCLUDES, TOUR EXCLUDES, IMPORTANT NOTES, CANCELLATION POLICY.
 */

import {
  buildStayBreakdown,
  getCityLabel, formatMoney, formatPerPax,
} from './accommodation-engine.js';

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
      const mealStr = typeof row.meals === 'string'
        ? (row.meals || '—')
        : [
            row.meals?.B ? 'B' : (row.meals?.BR ? 'BR' : '-'),
            row.meals?.L ? 'L' : '-',
            row.meals?.D ? 'D' : '-',
          ].join('/');

      const dateDisplay = row.dateLabel
        ? `Day ${row.dayNum} (${row.dateLabel})`
        : `Day ${row.dayNum}`;

      tableRows.push(new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: dateDisplay, size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.title || '', size: 20 })] })] }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: mealStr, size: 20 })] })],
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
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

    const mealStr = typeof row.meals === 'string' ? (row.meals || 'None') : buildMealWords(row.meals);
    children.push(new Paragraph({
      children: [new TextRun({ text: `Meals: ${mealStr}`, italics: true, size: 20, color: '555555' })],
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
  const stays        = docData.stays         || [];
  const selections   = docData.selections    || {};
  const hotelsByStars = docData.hotelsByStars || {};
  const groupType    = docData.groupType     || 'fit';
  const stayStar     = docData.stayStarChoice || {};
  const dateFrom     = docData.dateFrom || '';

  children.push(new Paragraph({
    children: [new TextRun({ text: `Group type: ${groupType.toUpperCase()}`, size: 20, color: '444444' })],
    spacing: { after: 80 },
  }));

  // One-shot state wrapper so buildStayBreakdown can read adults/children/dateFrom.
  const bdState = {
    step1: { adults: docData.adults, children: docData.children, dateFrom },
    step4: { groupType },
  };

  let grandSum = 0;
  let grandCurrency = null;
  const currencies = new Set();

  for (const stay of stays) {
    const tier = stayStar[stay.id] || '4';
    const sel  = selections?.[stay.id]?.[tier];
    const hotel = sel?.hotelId ? findHotel(hotelsByStars, tier, sel.hotelId) : null;
    if (!hotel) continue;

    const bd = buildStayBreakdown({
      stay, sel, hotel, state: bdState, groupType, dateFrom,
    });
    const { currency, season, overridden, defaultRoomType, grandTotal, perPax, totalPax } = bd;
    grandSum += grandTotal;
    if (grandCurrency == null) grandCurrency = currency;
    currencies.add(currency);

    const dayLbl = stay.nights > 0
      ? `Day ${stay.startDay}${stay.endDay !== stay.startDay ? '–' + stay.endDay : ''} (${stay.nights} night${stay.nights !== 1 ? 's' : ''})`
      : `Day ${stay.startDay} (no overnight)`;

    children.push(new Paragraph({
      children: [new TextRun({ text: `${getCityLabel(stay.city)} — ${dayLbl}  [${tier}★]`, bold: true, size: 24, color: '202124' })],
      spacing: { before: 180, after: 60 },
    }));

    const subParts = [hotel.name, defaultRoomType?.name || ''].filter(Boolean).join(' · ');
    const tags = [
      season === 'high' ? 'High Season' : 'Low Season',
      hotel.vatIncluded ? 'VAT incl.' : '+VAT',
      overridden ? 'Custom rate' : '',
    ].filter(Boolean).join(' · ');
    children.push(new Paragraph({
      children: [new TextRun({ text: `${subParts}  [${tags}]`, size: 20, color: '444444' })],
      spacing: { after: 80 },
    }));

    const header = ['Line', 'Detail', 'Amount'].map(h =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
        shading: { fill: 'E8F0FE', type: ShadingType.CLEAR, color: 'auto' },
      }));
    const rows = [new TableRow({ children: header })];

    for (const r of bd.rows) {
      if (r.kind === 'total' || r.kind === 'perPax') continue;
      const isDiscount = r.amount < 0;
      const amtText = isDiscount
        ? `− ${formatMoney(Math.abs(r.amount), currency)}`
        : formatMoney(r.amount, currency);
      const shading = r.kind === 'subtotal' ? { fill: 'F5F9FF', type: ShadingType.CLEAR, color: 'auto' } : undefined;
      rows.push(new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: r.label, size: 20, bold: r.kind === 'subtotal' })] })],
            ...(shading ? { shading } : {}),
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: r.detail || '', size: 19, italics: true, color: '666666' })] })],
            ...(shading ? { shading } : {}),
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: amtText, size: 20, color: isDiscount ? 'C0392B' : undefined })] })],
            ...(shading ? { shading } : {}),
          }),
        ],
      }));
    }

    // Grand total + per-pax rows
    rows.push(new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: 'Grand total', bold: true, size: 21 })] })],
          columnSpan: 2,
          shading: { fill: 'E8F0FE', type: ShadingType.CLEAR, color: 'auto' },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: formatMoney(grandTotal, currency), bold: true, size: 21 })] })],
          shading: { fill: 'E8F0FE', type: ShadingType.CLEAR, color: 'auto' },
        }),
      ],
    }));
    rows.push(new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: `÷ ${totalPax} pax`, size: 20 })] })],
          columnSpan: 2,
          shading: { fill: 'E6F4EA', type: ShadingType.CLEAR, color: 'auto' },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: formatPerPax(perPax, currency), bold: true, size: 21, color: '0A7D2A' })] })],
          shading: { fill: 'E6F4EA', type: ShadingType.CLEAR, color: 'auto' },
        }),
      ],
    }));

    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  // Accommodation grand total across all stays
  if (grandSum > 0) {
    const totalPax = Math.max(1, (docData.adults || 0) + (docData.children || 0));
    const mixed = currencies.size > 1;
    const label = mixed
      ? 'Accommodation grand total: multiple currencies — see per-stay totals above.'
      : `Accommodation grand total: ${formatMoney(grandSum, grandCurrency)}  ·  ${formatPerPax(grandSum / totalPax, grandCurrency)}  ·  ${totalPax} pax`;
    children.push(new Paragraph({
      children: [new TextRun({ text: label, bold: true, size: 22, color: mixed ? '856404' : '0A7D2A' })],
      spacing: { before: 240, after: 120 },
    }));
  }

  // ── NOTES / INCLUDES / EXCLUDES / IMPORTANT / CANCELLATION ──
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
  if (typeof meals === 'string') return meals || 'None';
  const parts = [];
  if (meals?.B)  parts.push('Breakfast');
  if (meals?.BR) parts.push('Brunch');
  if (meals?.L)  parts.push('Lunch');
  if (meals?.D)  parts.push('Dinner');
  return parts.length ? parts.join(', ') : 'None';
}

function findHotel(hotelsByStars, tier, hotelId) {
  const list = hotelsByStars?.[tier] || [];
  return list.find(h => h.id === hotelId) || null;
}
