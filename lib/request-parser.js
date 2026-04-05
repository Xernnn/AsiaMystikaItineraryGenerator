/**
 * request-parser.js
 * Parse a free-text travel request (email/brief) into structured data
 * for auto-filling Steps 1–3.
 */

import { dayLabel } from './brief-parser.js';

// ── City name → code mapping ──────────────────────────────
const CITY_ALIASES = {
  'hanoi': 'HN', 'ha noi': 'HN', 'hà nội': 'HN',
  'halong': 'HL', 'ha long': 'HL', 'halong bay': 'HL', 'ha long bay': 'HL', 'hạ long': 'HL',
  'danang': 'DN', 'da nang': 'DN', 'đà nẵng': 'DN',
  'hoian': 'DN', 'hoi an': 'DN', 'hội an': 'DN',
  'hue': 'DN',  // Hue often grouped with DN in this app
  'ho chi minh': 'HC', 'hcm': 'HC', 'hcmc': 'HC', 'saigon': 'HC',
  'ho chi minh city': 'HC', 'hồ chí minh': 'HC',
  'sapa': 'SP', 'sa pa': 'SP',
  'phu quoc': 'PQ', 'phú quốc': 'PQ',
  'ninh binh': 'NB', 'ninh bình': 'NB',
};

function detectCityCode(raw) {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (CITY_ALIASES[lower]) return CITY_ALIASES[lower];
  // Partial match
  for (const [key, code] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(key)) return code;
  }
  return null;
}

// ── Date helpers ──────────────────────────────────────────
function toDateStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseOrdinalDate(str) {
  // "31st May 2026" or "31 May 2026"
  const clean = str.replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
  const m = clean.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,
                   jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const mo = months[m[2].toLowerCase().slice(0,3)];
  if (mo === undefined) return null;
  const d = new Date(Date.UTC(parseInt(m[3]), mo, parseInt(m[1])));
  if (isNaN(d)) return null;
  return toDateStr(d);
}

// ── Title generators per city / day position ──────────────
const CITY_ARRIVAL_TITLES = {
  HN:  'Hanoi – Arrival',
  HL:  'Ha Long Bay Cruise',
  DN:  'Da Nang – Arrival',
  HC:  'Ho Chi Minh City – Arrival',
  SP:  'Sapa – Arrival',
  PQ:  'Phu Quoc – Arrival',
  NB:  'Ninh Binh – Arrival',
};
const CITY_DAY_TITLES = {
  HN:  'Hanoi – City Tour',
  HL:  'Ha Long Bay – Return',
  DN:  'Da Nang – Day Tour',
  HC:  'Ho Chi Minh City – Tour',
  SP:  'Sapa – Trekking',
  PQ:  'Phu Quoc – Beach & Leisure',
  NB:  'Ninh Binh – Day Tour',
};

function mealPreset(mealPlan, isArrival, isDeparture) {
  if (isDeparture) return { B: true, L: false, D: false, BR: false };
  if (isArrival)   return { B: false, L: false, D: mealPlan !== 'CP', BR: false };
  if (mealPlan === 'CP') return { B: true, L: false, D: false, BR: false };
  if (mealPlan === 'FB') return { B: true, L: true,  D: true,  BR: false };
  // MAP default
  return { B: true, L: false, D: true, BR: false };
}

// ── Main export ───────────────────────────────────────────
/**
 * Parse a free-text travel request.
 * Returns { step1Fields, step2Fields, briefRows, warnings[] }
 */
export function parseRequest(text) {
  const warnings = [];

  // ── Adults & children ─────────────────────────────────
  let adults = 2, children = 0, childrenAges = [];
  const paxMatch = text.match(/(\d+)\s*Adults?\s*(?:[&and,\s]+(\d+)\s*Children?)?/i);
  if (paxMatch) {
    adults = parseInt(paxMatch[1]);
    children = paxMatch[2] ? parseInt(paxMatch[2]) : 0;
  }
  const agesMatch = text.match(/Children?\s*\(([^)]+)\)/i);
  if (agesMatch) {
    childrenAges = agesMatch[1].split(/[,\s]+/)
      .map(s => parseFloat(s))
      .filter(n => !isNaN(n));
  }

  // ── Rooms ─────────────────────────────────────────────
  let rooms = 1;
  const roomMatch = text.match(/(\d+)\s*Rooms?/i);
  if (roomMatch) rooms = parseInt(roomMatch[1]);

  // ── Room type ─────────────────────────────────────────
  let roomType = 'double';
  if (/triple/i.test(text))       roomType = 'triple';
  else if (/twin/i.test(text))    roomType = 'twin';
  else if (/single/i.test(text))  roomType = 'single';

  // ── Travel date ───────────────────────────────────────
  let dateFrom = null;
  const datePatterns = [
    /Travel\s*Date\s*:\s*(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i,
    /Departure\s*Date\s*:\s*(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i,
    /Start\s*Date\s*:\s*(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i,
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) { dateFrom = parseOrdinalDate(m[1]); break; }
  }
  if (!dateFrom) warnings.push('Could not detect Travel Date — please set it manually.');

  // ── Trip duration ─────────────────────────────────────
  let nights = 0;
  const durMatch = text.match(/(\d+)\s*N\s*[\/\\]\s*(\d+)\s*D/i);
  if (durMatch) nights = parseInt(durMatch[1]);

  let dateTo = null;
  if (dateFrom && nights) {
    const [y, mo, da] = dateFrom.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1, da + nights));
    dateTo = toDateStr(d);
  }

  // ── Meal plan ─────────────────────────────────────────
  let mealPlan = 'MAP';
  const mealMatch = text.match(/Meal\s*Plan\s*:\s*(MAP|CP|FB|BB)/i);
  if (mealMatch) mealPlan = mealMatch[1].toUpperCase();
  else if (/\bCP\b/.test(text)) mealPlan = 'CP';
  else if (/full\s*board/i.test(text)) mealPlan = 'FB';

  // ── Hotel stars ───────────────────────────────────────
  const hotelStars = new Set();
  const starMatches = [...text.matchAll(/(\d)\s*[\*★]\s*(?:and|&|\+)?\s*(\d)?\s*[\*★]?\s*(?:Hotel|Star|Resort)?/gi)];
  for (const m of starMatches) {
    const n = parseInt(m[1]);
    if (n >= 3 && n <= 5) hotelStars.add(n);
    if (m[2]) { const n2 = parseInt(m[2]); if (n2 >= 3 && n2 <= 5) hotelStars.add(n2); }
  }
  // Simpler fallback: any "3*" or "4*" or "5*" in text
  for (const m of text.matchAll(/(\d)[\*★]/g)) {
    const n = parseInt(m[1]);
    if (n >= 3 && n <= 5) hotelStars.add(n);
  }

  // ── Destinations ──────────────────────────────────────
  // Find the destination line (may span until next label)
  const destLineMatch = text.match(
    /Destination[^:]*:\s*([\s\S]*?)(?=\n\s*\n|\n[A-Za-z][^:]+:|\n\s*Best|$)/i
  );
  const destinations = []; // [{code, nights, label}]
  if (destLineMatch) {
    const raw = destLineMatch[1];
    // Match "2N Hanoi", "1N Ha Long Bay", etc.
    const segs = [...raw.matchAll(/(\d+)\s*N\s+([A-Za-z][A-Za-z\s]+?)(?:\s*\(.*?\))?\s*(?:\+|$)/gi)];
    for (const seg of segs) {
      const n = parseInt(seg[1]);
      const cityRaw = seg[2].replace(/\s+/g, ' ').trim();
      const code = detectCityCode(cityRaw);
      if (code) {
        destinations.push({ code, nights: n, label: cityRaw });
      } else {
        warnings.push(`Could not detect city for "${cityRaw}" — please set manually.`);
        destinations.push({ code: null, nights: n, label: cityRaw });
      }
    }
  }

  const totalDestNights = destinations.reduce((s, d) => s + d.nights, 0);
  if (destinations.length && nights && totalDestNights !== nights) {
    warnings.push(`Destination nights (${totalDestNights}) ≠ trip duration (${nights}N) — please verify.`);
  }

  // ── Auto-generate tour title ───────────────────────────
  const cityLabels = destinations.filter(d => d.code).map(d => d.label);
  const totalDays = nights + 1 || (totalDestNights + 1);
  const title = cityLabels.length
    ? `Best of Vietnam – ${totalDays}D${nights || totalDestNights}N (${cityLabels.join(', ')})`
    : '';

  // ── Generate brief rows ────────────────────────────────
  const briefRows = [];
  let globalDayIdx = 0;  // 0-based offset from dateFrom

  destinations.forEach((dest, destIdx) => {
    const isFirstDest = destIdx === 0;
    const isLastDest  = destIdx === destinations.length - 1;

    for (let n = 0; n < dest.nights; n++) {
      const isFirstDayOfDest = n === 0;
      const isLastDay = isLastDest && n === dest.nights - 1;
      const isArrival = isFirstDayOfDest;

      const dayNum = globalDayIdx + 1;
      const dateLabel = dateFrom ? dayLabel(dateFrom, globalDayIdx) : '';
      const parsedDate = dateFrom
        ? (() => {
            const [y, mo, da] = dateFrom.split('-').map(Number);
            return toDateStr(new Date(Date.UTC(y, mo - 1, da + globalDayIdx)));
          })()
        : '';

      // Title: arrival name for first day of city, day tour for rest
      let rowTitle = '';
      if (isFirstDayOfDest) {
        rowTitle = (dest.code ? CITY_ARRIVAL_TITLES[dest.code] : null) || `${dest.label} – Arrival`;
      } else {
        rowTitle = (dest.code ? CITY_DAY_TITLES[dest.code] : null) || `${dest.label} – Day Tour`;
      }

      briefRows.push({
        dayNum,
        dateLabel,
        parsedDate,
        title: rowTitle,
        meals: mealPreset(mealPlan, isArrival, false),
        templateCity: dest.code || '',
        templateKey: '',
        templateText: '',
      });
      globalDayIdx++;
    }
  });

  // Departure day (last day, no overnight)
  if (destinations.length) {
    const lastDest = destinations[destinations.length - 1];
    briefRows.push({
      dayNum: globalDayIdx + 1,
      dateLabel: dateFrom ? dayLabel(dateFrom, globalDayIdx) : '',
      parsedDate: dateFrom
        ? (() => {
            const [y, mo, da] = dateFrom.split('-').map(Number);
            return toDateStr(new Date(Date.UTC(y, mo - 1, da + globalDayIdx)));
          })()
        : '',
      title: 'Departure – Airport Transfer',
      meals: mealPreset(mealPlan, false, true),
      templateCity: lastDest.code || '',
      templateKey: '',
      templateText: '',
    });
  }

  return {
    step1Fields: { title, dateFrom, dateTo, adults, children, childrenAges, rooms, roomType, mealPlan },
    step2Fields: {},  // carSize auto-suggested from pax; shuttle/limo left as default
    hotelStars: [...hotelStars].sort(),
    briefRows,
    warnings,
    nights,
  };
}
