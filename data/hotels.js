/**
 * hotels.js — Asia Mystika Itinerary Generator
 *
 * NEW SCHEMA (v2) — redesigned per Hiếu's requirements:
 *
 *   {
 *     id:               string,                   // slug
 *     name:             string,
 *     city:             "HN" | "NB" | "SP" | "HL" | "DN" | "HA" | "HC" | "PQ",
 *     starRating:       3 | 4 | 5,
 *     roomType:         string,                   // "Deluxe City View"
 *     currency:         "USD" | "VND",
 *     rates: {
 *       fit: { low: number, high: number },       // per room per night, for groups booking few rooms
 *       git: { low: number, high: number },       // per room per night, for groups booking many rooms
 *     },
 *     extraBed:         number | null,            // per night
 *     shareBed:         number | null,            // per night (child share bed with parents)
 *     earlyCheckinRate: number | null,            // per room, per incident. If null, fallback = 50% × current room rate.
 *     upgrade:          { roomType: string, ratePerNight: number } | null,
 *     focRule:          { everyRooms: number, freeRooms: number } | null,
 *     vatIncluded:      boolean,
 *     highSeason:       Array<{ from: "MM-DD", to: "MM-DD" }>,   // inclusive ranges; may wrap year-end
 *     url:              string | "",
 *     flags:            Array<"skip"|"noExtraBed"|"dayCruiseOnly"|"gitOnly"|"partialPrice">,
 *   }
 *
 * Only 3 real seed hotels below — rest will be populated via the Admin tab.
 * The old V1 data has been moved to data/hotels.legacy.js for reference only.
 */

export const hotelsByStars = {
  "3": [],
  "4": [
    {
      id: "first-eden-hanoi",
      name: "First Eden Hotel",
      city: "HN",
      starRating: 4,
      roomType: "Deluxe City View",
      currency: "USD",
      rates: {
        fit: { low: 32, high: 35 },
        git: { low: 28, high: 31 },
      },
      extraBed: 15,
      shareBed: 3,
      earlyCheckinRate: null,
      upgrade: null,
      focRule: { everyRooms: 15, freeRooms: 1 },
      vatIncluded: true,
      highSeason: [
        { from: "01-01", to: "04-30" },
        { from: "10-01", to: "12-31" },
      ],
      url: "http://firstedenhotel.com.vn/Default.aspx",
      flags: [],
    },
    {
      id: "the-view-sapa",
      name: "The View Sapa Hotel",
      city: "SP",
      starRating: 4,
      roomType: "Superior Garden View",
      currency: "VND",
      rates: {
        fit: { low: 864000, high: 1026000 },
        git: { low: 790000, high: 940000 },
      },
      extraBed: 250000,
      shareBed: 200000,
      earlyCheckinRate: null,
      upgrade: { roomType: "Deluxe Mountain View", ratePerNight: 216000 },
      focRule: { everyRooms: 20, freeRooms: 1 },
      vatIncluded: true,
      highSeason: [
        { from: "06-01", to: "08-31" },
        { from: "12-20", to: "01-05" },
      ],
      url: "http://theviewsapahotel.com/en",
      flags: [],
    },
  ],
  "5": [
    {
      id: "danang-marriott-resort",
      name: "Da Nang Marriott Resort & Spa",
      city: "DN",
      starRating: 5,
      roomType: "Deluxe Ocean View",
      currency: "USD",
      rates: {
        fit: { low: 185, high: 245 },
        git: { low: 165, high: 215 },
      },
      extraBed: 45,
      shareBed: 0,
      earlyCheckinRate: null,
      upgrade: { roomType: "Junior Suite Ocean View", ratePerNight: 60 },
      focRule: { everyRooms: 20, freeRooms: 1 },
      vatIncluded: false,
      highSeason: [
        { from: "06-01", to: "08-31" },
      ],
      url: "",
      flags: [],
    },
  ],
};

/**
 * City codes used in the new schema.
 * Note: DN and HA are separate (previously merged as "DN").
 */
export const HOTEL_CITY_CODES = ["HN", "NB", "SP", "HL", "DN", "HA", "HC", "PQ"];
