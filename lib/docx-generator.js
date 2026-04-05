/**
 * docx-generator.js
 * Generate a .docx file from the output document data.
 * Uses the docx.js library loaded via CDN.
 */

/**
 * Generate and trigger download of a .docx file.
 * @param {Object} docData - structured document data from buildDocData()
 */
export async function downloadDocx(docData) {
  // docx.js must be loaded globally via CDN script tag in index.html
  if (typeof window.docx === 'undefined') {
    throw new Error('docx.js library not loaded. Please check your internet connection.');
  }

  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, Packer, ShadingType,
  } = window.docx;

  // 1 inch = 1440 twips
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
      spacing: { after: 300 },
    }));
  }

  // ── Section helper ──
  const sectionHeading = (text) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: '1a73e8', allCaps: true })],
    spacing: { before: 300, after: 120 },
    border: { bottom: { color: '1a73e8', size: 6, style: BorderStyle.SINGLE } },
  });

  const para = (text, opts = {}) => new Paragraph({
    children: [new TextRun({ text, size: 22, ...opts })],
    spacing: { after: 80 },
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
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.title, size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: mealStr, size: 20 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        ],
      }));
    }

    children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  // ── ITINERARY DETAILS ──
  children.push(sectionHeading('ITINERARY DETAILS'));

  for (const row of (docData.briefRows || [])) {
    const dayTitle = `Day ${row.dayNum}${row.dateLabel ? ' (' + row.dateLabel + ')' : ''}: ${row.title}`;
    children.push(new Paragraph({
      children: [new TextRun({ text: dayTitle, bold: true, size: 24 })],
      spacing: { before: 240, after: 80 },
    }));

    const mealWords = buildMealWords(row.meals);
    children.push(new Paragraph({
      children: [new TextRun({ text: `Meals: ${mealWords}`, italics: true, size: 20, color: '555555' })],
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

  const accomHeader = (label) => new Paragraph({
    children: [new TextRun({ text: label, bold: true, size: 21, color: '1a73e8' })],
    spacing: { before: 160, after: 80 },
  });

  for (const [tierLabel, tierKey] of [['3-Star Standard','hotels3'],['4-Star Standard','hotels4'],['5-Star / Deluxe','hotels5']]) {
    const tierData = docData.hotels?.[tierKey] || {};
    // Skip tiers with no hotels
    if (!Object.values(tierData).some(h => h?.name)) continue;
    children.push(accomHeader(`⭐ ${tierLabel}`));

    const headerCells = ['City', 'Hotel / Cruise', 'Room Type', 'Nts', 'Rate/pax', 'VAT'].map(h =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
        shading: { fill: 'E8F0FE', type: ShadingType.CLEAR, color: 'auto' },
      })
    );
    const tableRows = [new TableRow({ children: headerCells })];

    for (const [city, h] of Object.entries(tierData)) {
      if (!h?.name) continue;
      const nights = docData.nightsMap?.[city] || 0;
      const rate   = h.currentRate || (h.rateType === 'high' ? h.highRate : h.lowRate) || '—';
      const vat    = h.vatIncluded ? 'Incl.' : '+VAT';
      tableRows.push(new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getCityFull(city), size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h.name, size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h.roomType || '', size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${nights}`, size: 20 })] })], width: { size: 6, type: WidthType.PERCENTAGE } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: rate, size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: vat, size: 20, color: h.vatIncluded ? '2e7d32' : 'b45309' })] })], width: { size: 8, type: WidthType.PERCENTAGE } }),
        ],
      }));
      if (h.earlyCheckinSurcharge) {
        tableRows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '', size: 20 })] })], columnSpan: 3 }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Surcharge: Early check-in`, size: 19, italics: true })] })], columnSpan: 2 }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h.earlyCheckinSurcharge, size: 20 })] })] }),
          ],
        }));
      }
      if (h.upgradeSurcharge) {
        tableRows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '', size: 20 })] })], columnSpan: 3 }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Surcharge: Room upgrade`, size: 19, italics: true })] })], columnSpan: 2 }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h.upgradeSurcharge, size: 20 })] })] }),
          ],
        }));
      }
    }

    if (tableRows.length > 1) {
      children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    }
  }

  // ── NOTES ──
  if (docData.notes?.length) {
    children.push(sectionHeading('NOTES'));
    for (const note of docData.notes) {
      children.push(bullet(note));
    }
  }

  // ── TOUR INCLUDES ──
  if (docData.includes?.length) {
    children.push(sectionHeading('TOUR INCLUDES'));
    for (const item of docData.includes) {
      children.push(bullet(item));
    }
  }

  // ── TOUR EXCLUDES ──
  if (docData.excludes?.length) {
    children.push(sectionHeading('TOUR EXCLUDES'));
    for (const item of docData.excludes) {
      children.push(bullet(item));
    }
  }

  // ── IMPORTANT NOTES ──
  if (docData.importantNotes?.length) {
    children.push(sectionHeading('IMPORTANT NOTES'));
    for (const note of docData.importantNotes) {
      children.push(bullet(note));
    }
  }

  // ── CANCELLATION TERMS ──
  if (docData.cancellationTerms?.length) {
    children.push(sectionHeading('CANCELLATION POLICY'));
    for (const term of docData.cancellationTerms) {
      children.push(bullet(term));
    }
  }

  // ── Build document ──
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: inch(1), bottom: inch(1), left: inch(1.2), right: inch(1.2) },
        },
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

function getCityFull(code) {
  const map = {
    HN:'Hanoi', NB:'Ninh Binh', SP:'Sapa',
    HL:'Halong Bay', DN:'Da Nang / Hoi An',
    HC:'Ho Chi Minh City', PQ:'Phu Quoc',
  };
  return map[code] || code;
}
