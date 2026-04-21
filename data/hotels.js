/**
 * hotels.js — Asia Mystika Itinerary Generator
 *
 * SCHEMA (v3) — a hotel owns a list of room types, each with its own
 * rates, extra-bed policy, flexible-price flag, and flags.
 *
 *   {
 *     id:               string,
 *     name:             string,
 *     city:             "HN"|"NB"|"SP"|"HL"|"DN"|"HA"|"HC"|"PQ",
 *     starRating:       3 | 4 | 5,
 *     currency:         "USD" | "VND",
 *     vatIncluded:      boolean,
 *     url:              string,
 *
 *     earlyCheckinRate: number | null,   // override rate / room; null → 50% of room rate
 *     focRule:          { everyRooms, freeRooms } | null,
 *     highSeason:       Array<{ from: "MM-DD", to: "MM-DD" }>,
 *     flags:            Array<"skip"|"redFlag"|"dayCruiseOnly"|"gitOnly"|"partialPrice">,
 *
 *     roomTypes: [
 *       {
 *         id:             string,
 *         name:           string,             // "Deluxe City View"
 *         rates: {
 *           fit: { low, high },
 *           git: { low, high },
 *         },
 *         extraBedAllowed: boolean,           // false → room type cannot accept EB
 *         extraBedRate:    number | null,     // per night (ignored if extraBedAllowed = false)
 *         shareBed:        number | null,     // per night
 *         flexiblePrice:   boolean,           // allow per-booking price override in Step 4
 *         flags:           Array<"redFlag">,
 *         notes:           string,
 *       }
 *     ]
 *   }
 */

export const hotelsByStars = {
  "3": [],
  "4": [
    {
      id: "first-eden-hanoi",
      name: "First Eden Hotel",
      city: "HN",
      starRating: 4,
      currency: "USD",
      vatIncluded: true,
      url: "http://firstedenhotel.com.vn/Default.aspx",
      earlyCheckinRate: null,
      focRule: { everyRooms: 15, freeRooms: 1 },
      highSeason: [
        { from: "01-01", to: "04-30" },
        { from: "10-01", to: "12-31" },
      ],
      flags: [],
      roomTypes: [
        {
          id: "first-eden-hanoi__deluxe-city-view",
          name: "Deluxe City View",
          rates: {
            fit: { low: 32, high: 35 },
            git: { low: 28, high: 31 },
          },
          extraBedAllowed: true,
          extraBedRate: 15,
          shareBed: 3,
          flexiblePrice: false,
          flags: [],
          notes: "",
        },
      ],
    },
    {
      id: "the-view-sapa",
      name: "The View Sapa Hotel",
      city: "SP",
      starRating: 4,
      currency: "VND",
      vatIncluded: true,
      url: "http://theviewsapahotel.com/en",
      earlyCheckinRate: null,
      focRule: { everyRooms: 20, freeRooms: 1 },
      highSeason: [
        { from: "06-01", to: "08-31" },
        { from: "12-20", to: "01-05" },
      ],
      flags: [],
      roomTypes: [
        {
          id: "the-view-sapa__superior-garden",
          name: "Superior Garden View",
          rates: {
            fit: { low: 864000, high: 1026000 },
            git: { low: 790000, high: 940000 },
          },
          extraBedAllowed: true,
          extraBedRate: 250000,
          shareBed: 200000,
          flexiblePrice: false,
          flags: [],
          notes: "",
        },
        {
          id: "the-view-sapa__deluxe-mountain",
          name: "Deluxe Mountain View",
          rates: {
            fit: { low: 1080000, high: 1242000 },
            git: { low: 1006000, high: 1156000 },
          },
          extraBedAllowed: true,
          extraBedRate: 250000,
          shareBed: 200000,
          flexiblePrice: false,
          flags: [],
          notes: "",
        },
      ],
    },
  ],
  "5": [
    {
      id: "danang-marriott-resort",
      name: "Da Nang Marriott Resort & Spa",
      city: "DN",
      starRating: 5,
      currency: "USD",
      vatIncluded: false,
      url: "",
      earlyCheckinRate: null,
      focRule: { everyRooms: 20, freeRooms: 1 },
      highSeason: [
        { from: "06-01", to: "08-31" },
      ],
      flags: [],
      roomTypes: [
        {
          id: "danang-marriott__deluxe-ocean",
          name: "Deluxe Ocean View",
          rates: {
            fit: { low: 185, high: 245 },
            git: { low: 165, high: 215 },
          },
          extraBedAllowed: true,
          extraBedRate: 45,
          shareBed: 0,
          flexiblePrice: false,
          flags: [],
          notes: "",
        },
        {
          id: "danang-marriott__junior-suite",
          name: "Junior Suite Ocean View",
          rates: {
            fit: { low: 245, high: 305 },
            git: { low: 225, high: 275 },
          },
          extraBedAllowed: true,
          extraBedRate: 45,
          shareBed: 0,
          flexiblePrice: true,
          flags: [],
          notes: "Flexible rate — sale managers may override for special promotions.",
        },
      ],
    },
  ],
};

export const HOTEL_CITY_CODES = ["HN", "NB", "SP", "HL", "DN", "HA", "HC", "PQ"];

/**
 * Migrate a v2 hotels-by-stars object to v3 (roomTypes array). Safe to call
 * on already-v3 data.
 */
export function migrateHotelsToV3(byStars) {
  const out = {};
  for (const [tier, arr] of Object.entries(byStars || {})) {
    out[tier] = (arr || []).map(h => migrateHotelV3(h));
  }
  return out;
}

function migrateHotelV3(h) {
  if (h && Array.isArray(h.roomTypes)) return h; // already v3

  const base = {
    id: h.id,
    name: h.name,
    city: h.city,
    starRating: h.starRating,
    currency: h.currency || "USD",
    vatIncluded: !!h.vatIncluded,
    url: h.url || "",
    earlyCheckinRate: h.earlyCheckinRate ?? null,
    focRule: h.focRule || null,
    highSeason: h.highSeason || [],
    flags: (h.flags || []).filter(f => f !== "noExtraBed"),
  };

  const noEB = (h.flags || []).includes("noExtraBed");
  const rt0 = {
    id: `${h.id}__${slugify(h.roomType || "standard")}`,
    name: h.roomType || "Standard",
    rates: {
      fit: {
        low: h.rates?.fit?.low ?? 0,
        high: h.rates?.fit?.high ?? 0,
      },
      git: {
        low: h.rates?.git?.low ?? 0,
        high: h.rates?.git?.high ?? 0,
      },
    },
    extraBedAllowed: !noEB && (h.extraBed != null),
    extraBedRate: h.extraBed ?? null,
    shareBed: h.shareBed ?? null,
    flexiblePrice: false,
    flags: [],
    notes: "",
  };

  const roomTypes = [rt0];

  if (h.upgrade && h.upgrade.roomType) {
    const up = h.upgrade;
    const upRateFit = (Number(h.rates?.fit?.low || 0)) + Number(up.ratePerNight || 0);
    const upRateFitH = (Number(h.rates?.fit?.high || 0)) + Number(up.ratePerNight || 0);
    const upRateGit = (Number(h.rates?.git?.low || 0)) + Number(up.ratePerNight || 0);
    const upRateGitH = (Number(h.rates?.git?.high || 0)) + Number(up.ratePerNight || 0);
    roomTypes.push({
      id: `${h.id}__${slugify(up.roomType)}`,
      name: up.roomType,
      rates: {
        fit: { low: upRateFit,  high: upRateFitH },
        git: { low: upRateGit,  high: upRateGitH },
      },
      extraBedAllowed: !noEB && (h.extraBed != null),
      extraBedRate: h.extraBed ?? null,
      shareBed: h.shareBed ?? null,
      flexiblePrice: false,
      flags: [],
      notes: "",
    });
  }

  return { ...base, roomTypes };
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "room";
}
