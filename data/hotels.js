/**
 * hotels.js — Asia Mystika Itinerary Generator
 *
 * SCHEMA (v3) — a hotel owns a list of room types, each with its own
 * rates, extra-bed policy, flexible-price flag, and flags.
 *
 *   {
 *     id, name, city, starRating, currency, vatIncluded, url,
 *     earlyCheckinRate: number | null,    // null → 50% of room rate
 *     focRule: { everyRooms, freeRooms } | null,
 *     highSeason: Array<{ from: "MM-DD", to: "MM-DD" }>,
 *     flags: Array<"skip"|"redFlag"|"dayCruiseOnly"|"gitOnly"|"partialPrice">,
 *     roomTypes: [
 *       {
 *         id, name,
 *         rates: { fit: { low, high }, git: { low, high } },
 *         extraBedAllowed, extraBedRate, shareBed,
 *         flexiblePrice, flags, notes,
 *       }
 *     ]
 *   }
 *
 * The seed data below is generated from a compact builder (`H` below) so
 * we can cheaply ship realistic hotels for every destination.
 */

export const HOTEL_CITY_CODES = ["HN", "NB", "SP", "HL", "DN", "HA", "HC", "PQ"];

const STANDARD_HIGH_SEASON = [
  { from: "01-01", to: "04-30" },
  { from: "10-01", to: "12-31" },
];
const BEACH_HIGH_SEASON = [{ from: "06-01", to: "08-31" }];
const SAPA_HIGH_SEASON  = [
  { from: "06-01", to: "08-31" },
  { from: "12-20", to: "01-05" },
];

/**
 * H — compact factory. Shorthand spec:
 *   H(id, name, city, star, currency, rooms, opts?)
 *   rooms  = [{ key, name, fit:[low,high], git:[low,high], eb?, sb?, flex?, flags? }]
 *   opts   = { vat=true, url='', eci=null, foc=[everyRooms,freeRooms]|null,
 *              season='std'|'beach'|'sapa', flags=[] }
 */
function H(id, name, city, star, currency, rooms, opts = {}) {
  const vatIncluded = opts.vat !== false;
  const highSeason =
    opts.season === 'beach' ? BEACH_HIGH_SEASON :
    opts.season === 'sapa'  ? SAPA_HIGH_SEASON  :
    STANDARD_HIGH_SEASON;
  const focRule = opts.foc
    ? { everyRooms: opts.foc[0], freeRooms: opts.foc[1] }
    : null;
  return {
    id,
    name,
    city,
    starRating: star,
    currency,
    vatIncluded,
    url: opts.url || '',
    earlyCheckinRate: opts.eci ?? null,
    focRule,
    highSeason,
    flags: opts.flags || [],
    roomTypes: rooms.map(r => ({
      id:   `${id}__${r.key}`,
      name: r.name,
      rates: {
        fit: { low: r.fit[0], high: r.fit[1] },
        git: { low: r.git[0], high: r.git[1] },
      },
      extraBedAllowed: r.eb != null,
      extraBedRate:    r.eb ?? null,
      shareBed:        r.sb ?? null,
      flexiblePrice:   !!r.flex,
      flags:           r.flags || [],
      notes:           r.notes || '',
    })),
  };
}

export const hotelsByStars = {
  "3": [
    // ── Hanoi (HN) ───────────────────────────────────────────────────
    H('hn-la-siesta-central', 'La Siesta Central Hotel', 'HN', 3, 'USD', [
      { key: 'superior',      name: 'Superior',      fit: [42, 48], git: [36, 42], eb: 15, sb: 3 },
      { key: 'deluxe',        name: 'Deluxe',        fit: [52, 58], git: [45, 50], eb: 15, sb: 3 },
    ], { foc: [15, 1] }),
    H('hn-moon-view', 'Moon View Hotel Old Quarter', 'HN', 3, 'USD', [
      { key: 'standard', name: 'Standard Double', fit: [35, 40], git: [30, 35], eb: 12, sb: 3 },
      { key: 'city',     name: 'City View',       fit: [42, 48], git: [36, 42], eb: 12, sb: 3 },
    ], { foc: [15, 1] }),
    H('hn-hanoi-emerald', 'Hanoi Emerald Waters Hotel', 'HN', 3, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [38, 44], git: [34, 40], eb: 12, sb: 3 },
    ], { foc: [15, 1] }),

    // ── Halong (HL) — day-cruise + overnight land options ───────────
    H('hl-muong-thanh-quang-ninh', 'Muong Thanh Quang Ninh', 'HL', 3, 'USD', [
      { key: 'superior', name: 'Superior Bay View', fit: [45, 55], git: [40, 48], eb: 15, sb: 3 },
    ], { foc: [15, 1] }),
    H('hl-bien-dong', 'Bien Dong Hotel Halong', 'HL', 3, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [40, 50], git: [35, 45], eb: 15, sb: 3 },
    ]),

    // ── Sapa (SP) ────────────────────────────────────────────────────
    H('sp-sapa-legend', 'Sapa Legend Hotel & Spa', 'SP', 3, 'VND', [
      { key: 'superior', name: 'Superior', fit: [720000, 850000], git: [640000, 760000], eb: 220000, sb: 180000 },
      { key: 'deluxe',   name: 'Deluxe Mountain View', fit: [880000, 1020000], git: [800000, 940000], eb: 220000, sb: 180000 },
    ], { season: 'sapa', foc: [15, 1] }),
    H('sp-amazing-hotel', 'Amazing Hotel Sapa', 'SP', 3, 'VND', [
      { key: 'deluxe', name: 'Deluxe City View', fit: [750000, 870000], git: [670000, 780000], eb: 220000, sb: 180000 },
    ], { season: 'sapa' }),

    // ── Da Nang (DN) ─────────────────────────────────────────────────
    H('dn-sala-danang', 'Sala Danang Beach Hotel', 'DN', 3, 'USD', [
      { key: 'superior', name: 'Superior',    fit: [48, 62], git: [42, 55], eb: 18, sb: 4 },
      { key: 'deluxe',   name: 'Deluxe Ocean', fit: [58, 75], git: [52, 68], eb: 18, sb: 4 },
    ], { season: 'beach', foc: [20, 1] }),
    H('dn-adina', 'Adina Hotel Da Nang', 'DN', 3, 'USD', [
      { key: 'standard', name: 'Standard', fit: [38, 48], git: [34, 42], eb: 15, sb: 4 },
    ], { season: 'beach' }),

    // ── Hoi An (HA) ──────────────────────────────────────────────────
    H('ha-hoi-an-central-boutique', 'Hoi An Central Boutique Hotel', 'HA', 3, 'USD', [
      { key: 'superior', name: 'Superior', fit: [42, 52], git: [38, 46], eb: 15, sb: 3 },
      { key: 'deluxe',   name: 'Deluxe',   fit: [50, 62], git: [45, 55], eb: 15, sb: 3 },
    ], { season: 'beach', foc: [15, 1] }),
    H('ha-lasenta-boutique', 'LaSenta Boutique Hoi An', 'HA', 3, 'USD', [
      { key: 'deluxe', name: 'Deluxe Garden', fit: [48, 58], git: [42, 50], eb: 15, sb: 3 },
    ], { season: 'beach' }),

    // ── HCMC (HC) ────────────────────────────────────────────────────
    H('hc-northern-saigon', 'Northern Saigon Hotel', 'HC', 3, 'USD', [
      { key: 'superior', name: 'Superior', fit: [40, 46], git: [35, 42], eb: 15, sb: 3 },
    ], { foc: [15, 1] }),
    H('hc-liberty-central-saigon-citypoint', 'Liberty Central Saigon Citypoint', 'HC', 3, 'USD', [
      { key: 'deluxe', name: 'Deluxe City', fit: [50, 60], git: [45, 54], eb: 15, sb: 3 },
    ]),
    H('hc-silverland-yen', 'Silverland Yen Hotel', 'HC', 3, 'USD', [
      { key: 'superior', name: 'Superior', fit: [45, 52], git: [40, 46], eb: 15, sb: 3 },
    ]),

    // ── Phu Quoc (PQ) ────────────────────────────────────────────────
    H('pq-sea-breeze', 'Sea Breeze Resort Phu Quoc', 'PQ', 3, 'USD', [
      { key: 'garden',  name: 'Garden View',   fit: [48, 62], git: [42, 55], eb: 20, sb: 5 },
      { key: 'sea',     name: 'Sea View',      fit: [62, 78], git: [55, 68], eb: 20, sb: 5 },
    ], { season: 'beach', foc: [20, 1] }),
    H('pq-lahana', 'Lahana Resort Phu Quoc', 'PQ', 3, 'USD', [
      { key: 'bungalow', name: 'Garden Bungalow', fit: [55, 70], git: [50, 62], eb: 20, sb: 5 },
    ], { season: 'beach' }),

    // ── Ninh Binh (NB) ───────────────────────────────────────────────
    H('nb-tam-coc-garden', 'Tam Coc Garden Resort', 'NB', 3, 'USD', [
      { key: 'garden', name: 'Garden Bungalow', fit: [55, 65], git: [48, 58], eb: 15, sb: 4 },
    ], { foc: [15, 1] }),
  ],

  "4": [
    // ── Hanoi ────────────────────────────────────────────────────────
    H('hn-first-eden', 'First Eden Hotel', 'HN', 4, 'USD', [
      { key: 'deluxe-city', name: 'Deluxe City View', fit: [55, 65], git: [48, 58], eb: 20, sb: 5 },
      { key: 'junior',      name: 'Junior Suite',     fit: [75, 88], git: [68, 78], eb: 20, sb: 5, flex: true },
    ], { url: 'http://firstedenhotel.com.vn/Default.aspx', foc: [15, 1] }),
    H('hn-la-siesta-premium', 'La Siesta Premium Hang Be', 'HN', 4, 'USD', [
      { key: 'premium',  name: 'Premium',        fit: [72, 85], git: [66, 78], eb: 20, sb: 5 },
      { key: 'suite',    name: 'Junior Suite',   fit: [95, 110], git: [88, 100], eb: 20, sb: 5 },
    ], { foc: [15, 1] }),
    H('hn-silk-path-boutique', 'Silk Path Boutique Hanoi', 'HN', 4, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [62, 75], git: [55, 68], eb: 20, sb: 5 },
    ], { foc: [15, 1] }),
    H('hn-hanoi-pearl', 'Hanoi Pearl Hotel', 'HN', 4, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [58, 70], git: [52, 64], eb: 20, sb: 5 },
    ]),

    // ── Halong (overnight cruises handled separately; land hotels) ──
    H('hl-wyndham-legend', 'Wyndham Legend Halong', 'HL', 4, 'USD', [
      { key: 'deluxe-bay', name: 'Deluxe Bay View', fit: [72, 90], git: [65, 82], eb: 22, sb: 5 },
    ], { foc: [15, 1] }),
    H('hl-novotel-halong', 'Novotel Halong Bay', 'HL', 4, 'USD', [
      { key: 'superior-bay', name: 'Superior Bay', fit: [80, 98], git: [72, 88], eb: 22, sb: 5 },
      { key: 'deluxe-bay',   name: 'Deluxe Bay',   fit: [95, 118], git: [88, 108], eb: 22, sb: 5 },
    ], { foc: [15, 1] }),

    // ── Sapa ─────────────────────────────────────────────────────────
    H('sp-the-view', 'The View Sapa Hotel', 'SP', 4, 'VND', [
      { key: 'superior-garden', name: 'Superior Garden View', fit: [864000, 1026000], git: [790000, 940000], eb: 250000, sb: 200000 },
      { key: 'deluxe-mountain', name: 'Deluxe Mountain View', fit: [1080000, 1242000], git: [1006000, 1156000], eb: 250000, sb: 200000 },
    ], { url: 'http://theviewsapahotel.com/en', season: 'sapa', foc: [20, 1] }),
    H('sp-bamboo-sapa', 'Bamboo Sapa Hotel', 'SP', 4, 'VND', [
      { key: 'deluxe', name: 'Deluxe Mountain View', fit: [950000, 1100000], git: [860000, 1000000], eb: 250000, sb: 200000 },
    ], { season: 'sapa', foc: [15, 1] }),
    H('sp-silk-path-sapa', 'Silk Path Grand Resort Sapa', 'SP', 4, 'USD', [
      { key: 'deluxe', name: 'Deluxe Mountain View', fit: [95, 120], git: [85, 108], eb: 22, sb: 5 },
    ], { season: 'sapa', foc: [20, 1] }),

    // ── Da Nang ──────────────────────────────────────────────────────
    H('dn-grandvrio-ocean', 'GrandVrio City Da Nang', 'DN', 4, 'USD', [
      { key: 'superior', name: 'Superior',    fit: [78, 98], git: [70, 88], eb: 22, sb: 5 },
      { key: 'deluxe',   name: 'Deluxe Ocean', fit: [95, 120], git: [85, 108], eb: 22, sb: 5 },
    ], { season: 'beach', foc: [20, 1] }),
    H('dn-royal-lotus', 'Royal Lotus Hotel Danang', 'DN', 4, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [65, 82], git: [58, 72], eb: 20, sb: 5 },
    ], { season: 'beach' }),
    H('dn-mercure-danang-french-village', 'Mercure Danang French Village Bana Hills', 'DN', 4, 'USD', [
      { key: 'superior', name: 'Superior French Village', fit: [105, 140], git: [95, 128], eb: 25, sb: 5 },
    ], { season: 'beach' }),

    // ── Hoi An ───────────────────────────────────────────────────────
    H('ha-hoi-an-silk-village', 'Hoi An Silk Village Resort', 'HA', 4, 'USD', [
      { key: 'superior', name: 'Superior',     fit: [72, 92], git: [65, 82], eb: 22, sb: 5 },
      { key: 'deluxe',   name: 'Deluxe Pool',  fit: [92, 115], git: [85, 105], eb: 22, sb: 5 },
    ], { season: 'beach', foc: [20, 1] }),
    H('ha-little-hoi-an', 'Little Hoi An Boutique Hotel', 'HA', 4, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [78, 98], git: [70, 88], eb: 22, sb: 5 },
    ], { season: 'beach' }),
    H('ha-allegro-hoi-an', 'Allegro Hoi An – Little Luxury Hotel', 'HA', 4, 'USD', [
      { key: 'premium',  name: 'Premium Deluxe', fit: [88, 112], git: [80, 102], eb: 22, sb: 5 },
      { key: 'family',   name: 'Family Suite',   fit: [130, 165], git: [120, 148], eb: 22, sb: 5, flex: true },
    ], { season: 'beach', foc: [15, 1] }),

    // ── HCMC ─────────────────────────────────────────────────────────
    H('hc-liberty-central-saigon-riverside', 'Liberty Central Saigon Riverside', 'HC', 4, 'USD', [
      { key: 'superior', name: 'Superior',     fit: [68, 82], git: [60, 72], eb: 20, sb: 5 },
      { key: 'deluxe',   name: 'Deluxe River', fit: [82, 98], git: [72, 88], eb: 20, sb: 5 },
    ], { foc: [15, 1] }),
    H('hc-silverland-jolie', 'Silverland Jolie Hotel', 'HC', 4, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [72, 88], git: [65, 80], eb: 20, sb: 5 },
    ], { foc: [15, 1] }),
    H('hc-au-lac-legend', 'Au Lac Legend Hotel', 'HC', 4, 'USD', [
      { key: 'deluxe', name: 'Deluxe', fit: [62, 78], git: [56, 70], eb: 20, sb: 5 },
    ]),

    // ── Phu Quoc ─────────────────────────────────────────────────────
    H('pq-sonata-resort', 'Sonata Resort & Spa Phu Quoc', 'PQ', 4, 'USD', [
      { key: 'garden', name: 'Garden Villa',  fit: [85, 110], git: [78, 100], eb: 25, sb: 6 },
      { key: 'ocean',  name: 'Ocean Villa',   fit: [110, 140], git: [100, 128], eb: 25, sb: 6 },
    ], { season: 'beach', foc: [20, 1] }),
    H('pq-sunset-sanato', 'Sunset Sanato Beach Resort', 'PQ', 4, 'USD', [
      { key: 'bungalow', name: 'Beach Bungalow', fit: [95, 125], git: [88, 115], eb: 25, sb: 6 },
    ], { season: 'beach' }),
    H('pq-novotel-phu-quoc', 'Novotel Phu Quoc Resort', 'PQ', 4, 'USD', [
      { key: 'superior', name: 'Superior',       fit: [98, 130], git: [88, 118], eb: 25, sb: 6 },
      { key: 'bungalow', name: 'Beach Bungalow', fit: [150, 195], git: [138, 180], eb: 25, sb: 6, flex: true },
    ], { season: 'beach', foc: [20, 1] }),
  ],

  "5": [
    // ── Hanoi ────────────────────────────────────────────────────────
    H('hn-sofitel-legend-metropole', 'Sofitel Legend Metropole Hanoi', 'HN', 5, 'USD', [
      { key: 'premium',  name: 'Premium Grand',     fit: [285, 360], git: [260, 325], eb: 55, sb: 10 },
      { key: 'junior',   name: 'Junior Suite',      fit: [385, 485], git: [350, 440], eb: 55, sb: 10, flex: true },
    ], { vat: false, foc: [20, 1] }),
    H('hn-intercontinental-westlake', 'InterContinental Hanoi Westlake', 'HN', 5, 'USD', [
      { key: 'club',     name: 'Club InterContinental',   fit: [225, 295], git: [205, 265], eb: 45, sb: 8 },
      { key: 'deluxe',   name: 'Deluxe Lake View',        fit: [175, 225], git: [160, 205], eb: 45, sb: 8 },
    ], { vat: false, foc: [20, 1] }),

    // ── Halong ───────────────────────────────────────────────────────
    H('hl-vinpearl-resort-spa-halong', 'Vinpearl Resort & Spa Halong', 'HL', 5, 'USD', [
      { key: 'deluxe', name: 'Deluxe Ocean',   fit: [165, 215], git: [150, 195], eb: 40, sb: 8 },
      { key: 'suite',  name: 'Ocean Suite',    fit: [245, 315], git: [225, 285], eb: 40, sb: 8 },
    ], { vat: false, foc: [20, 1] }),

    // ── Sapa ─────────────────────────────────────────────────────────
    H('sp-hotel-de-la-coupole-mgallery', 'Hotel de la Coupole - MGallery Sapa', 'SP', 5, 'USD', [
      { key: 'deluxe', name: 'Deluxe Mountain',  fit: [165, 215], git: [150, 195], eb: 40, sb: 8 },
      { key: 'suite',  name: 'Junior Suite',     fit: [235, 305], git: [215, 275], eb: 40, sb: 8, flex: true },
    ], { vat: false, season: 'sapa', foc: [20, 1] }),

    // ── Da Nang ──────────────────────────────────────────────────────
    H('dn-marriott', 'Da Nang Marriott Resort & Spa', 'DN', 5, 'USD', [
      { key: 'deluxe-ocean', name: 'Deluxe Ocean View',          fit: [185, 245], git: [165, 215], eb: 45, sb: 8 },
      { key: 'junior-suite', name: 'Junior Suite Ocean View',    fit: [245, 305], git: [225, 275], eb: 45, sb: 8, flex: true, notes: 'Flexible rate — sale managers may override for special promotions.' },
    ], { vat: false, season: 'beach', foc: [20, 1] }),
    H('dn-intercontinental-sun-peninsula', 'InterContinental Danang Sun Peninsula Resort', 'DN', 5, 'USD', [
      { key: 'classic-king', name: 'Classic King',     fit: [345, 480], git: [315, 440], eb: 60, sb: 10 },
      { key: 'penthouse',    name: 'Terrace Suite',    fit: [520, 720], git: [480, 665], eb: 60, sb: 10, flex: true },
    ], { vat: false, season: 'beach', foc: [20, 1] }),

    // ── Hoi An ───────────────────────────────────────────────────────
    H('ha-four-seasons-nam-hai', 'Four Seasons Resort The Nam Hai', 'HA', 5, 'USD', [
      { key: 'villa-1br',  name: 'One-Bedroom Villa',    fit: [780, 1080], git: [720, 985], eb: 90, sb: 15, flex: true },
    ], { vat: false, season: 'beach', foc: [20, 1] }),
    H('ha-anantara-hoi-an', 'Anantara Hoi An Resort', 'HA', 5, 'USD', [
      { key: 'deluxe-balcony', name: 'Deluxe Balcony',   fit: [185, 255], git: [170, 232], eb: 45, sb: 8 },
      { key: 'junior-suite',   name: 'Junior Suite',     fit: [265, 345], git: [242, 315], eb: 45, sb: 8 },
    ], { vat: false, season: 'beach', foc: [20, 1] }),

    // ── HCMC ─────────────────────────────────────────────────────────
    H('hc-park-hyatt-saigon', 'Park Hyatt Saigon', 'HC', 5, 'USD', [
      { key: 'park-king',  name: 'Park King',        fit: [265, 340], git: [242, 308], eb: 55, sb: 10 },
      { key: 'suite',      name: 'Park Suite King',  fit: [385, 485], git: [350, 445], eb: 55, sb: 10, flex: true },
    ], { vat: false, foc: [20, 1] }),
    H('hc-caravelle-saigon', 'Caravelle Saigon', 'HC', 5, 'USD', [
      { key: 'deluxe', name: 'Deluxe',          fit: [165, 215], git: [150, 198], eb: 45, sb: 8 },
      { key: 'suite',  name: 'Signature Suite', fit: [285, 365], git: [260, 332], eb: 45, sb: 8 },
    ], { vat: false, foc: [20, 1] }),

    // ── Phu Quoc ─────────────────────────────────────────────────────
    H('pq-jw-marriott-emerald-bay', 'JW Marriott Phu Quoc Emerald Bay', 'PQ', 5, 'USD', [
      { key: 'emerald-sea',  name: 'Emerald Sea View',  fit: [285, 395], git: [260, 362], eb: 60, sb: 10 },
      { key: 'pool-villa',   name: 'One-Bedroom Pool Villa', fit: [585, 785], git: [540, 720], eb: 60, sb: 10, flex: true },
    ], { vat: false, season: 'beach', foc: [20, 1] }),
    H('pq-intercontinental-phu-quoc-long-beach', 'InterContinental Phu Quoc Long Beach Resort', 'PQ', 5, 'USD', [
      { key: 'classic',     name: 'Classic',      fit: [215, 285], git: [195, 262], eb: 50, sb: 8 },
      { key: 'sky-king',    name: 'Sky King Sea View', fit: [285, 365], git: [260, 332], eb: 50, sb: 8 },
    ], { vat: false, season: 'beach', foc: [20, 1] }),
  ],
};

// ──────────────────────────────────────────────────────────────────────
//  MIGRATION (v2 → v3) — kept for backward compatibility.
// ──────────────────────────────────────────────────────────────────────

export function migrateHotelsToV3(byStars) {
  const out = {};
  for (const [tier, arr] of Object.entries(byStars || {})) {
    out[tier] = (arr || []).map(h => migrateHotelV3(h));
  }
  return out;
}

function migrateHotelV3(h) {
  if (h && Array.isArray(h.roomTypes)) return h;

  const base = {
    id: h.id,
    name: h.name,
    city: h.city,
    starRating: h.starRating,
    currency: h.currency || 'USD',
    vatIncluded: !!h.vatIncluded,
    url: h.url || '',
    earlyCheckinRate: h.earlyCheckinRate ?? null,
    focRule: h.focRule || null,
    highSeason: h.highSeason || [],
    flags: (h.flags || []).filter(f => f !== 'noExtraBed'),
  };

  const noEB = (h.flags || []).includes('noExtraBed');
  const rt0 = {
    id: `${h.id}__${slugify(h.roomType || 'standard')}`,
    name: h.roomType || 'Standard',
    rates: {
      fit: { low: h.rates?.fit?.low ?? 0, high: h.rates?.fit?.high ?? 0 },
      git: { low: h.rates?.git?.low ?? 0, high: h.rates?.git?.high ?? 0 },
    },
    extraBedAllowed: !noEB && (h.extraBed != null),
    extraBedRate: h.extraBed ?? null,
    shareBed: h.shareBed ?? null,
    flexiblePrice: false,
    flags: [],
    notes: '',
  };

  const roomTypes = [rt0];

  if (h.upgrade && h.upgrade.roomType) {
    const up = h.upgrade;
    roomTypes.push({
      id: `${h.id}__${slugify(up.roomType)}`,
      name: up.roomType,
      rates: {
        fit: {
          low:  Number(h.rates?.fit?.low  || 0) + Number(up.ratePerNight || 0),
          high: Number(h.rates?.fit?.high || 0) + Number(up.ratePerNight || 0),
        },
        git: {
          low:  Number(h.rates?.git?.low  || 0) + Number(up.ratePerNight || 0),
          high: Number(h.rates?.git?.high || 0) + Number(up.ratePerNight || 0),
        },
      },
      extraBedAllowed: !noEB && (h.extraBed != null),
      extraBedRate: h.extraBed ?? null,
      shareBed: h.shareBed ?? null,
      flexiblePrice: false,
      flags: [],
      notes: '',
    });
  }

  return { ...base, roomTypes };
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'room';
}
