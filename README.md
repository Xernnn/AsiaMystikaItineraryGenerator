# Asia Mystika – Itinerary Generator

A browser-based tool for generating tour itineraries for Asia Mystika OTA. No build step — pure vanilla JS ES modules.

## Quick Start

```bash
npm run serve
# then open http://localhost:8000
```

Or directly: `python -m http.server 8000`

## How to Use

### Option A — Quick Parse (Paste Request)

Click the **⚡ Quick Parse – Paste Request** card at the top of the steps panel, paste the client's email/brief, then click **⚡ Parse & Auto-fill All Steps**.

The parser extracts:

| Field | Detected from |
|---|---|
| Adults / Children / Ages | `No. of Pax: 13 Adults & 6 Children (9, 8, …)` |
| Rooms | `No. of Room: 6 Rooms` |
| Room type | `Double/Triple Sharing` → triple |
| Date From | `Travel Date: 31st May 2026` |
| Date To | Date From + nights |
| Meal plan | `Meal Plan: MAP` |
| Brief rows + cities | `2N Hanoi + 1N Ha Long + 3N Da Nang + 3N Ho Chi Minh` |
| Tour title | Auto-generated from cities + duration |
| Car size | Auto-suggested from total pax |

After parsing, Step 3 shows the generated brief rows. You only need to pick templates and hotels.

#### Example request to paste:

```
Dear Hiếu,
Please send the best itinerary & quotation for the following request.
Markup 6%
Travel Date: 31st May 2026
No. of Pax: 13 Adults & 6 Children (9, 8, 4, 4, 3, 1.5 years)
No. of Room: 6 Rooms on Double/Triple Sharing
Trip Duration: 9N/10D
Destination To Cover: 2N Hanoi + 1N Ha Long (Flight to Danang after Halong tour) + 3N Da Nang + 3N Ho Chi Minh
Resort/Hotel Category: 3* and 4* Hotel
Meal Plan: MAP
Airport Transfer: PVT. Basis
Best regards,
Ms. Huyen (Helen)
```

#### Resulting itinerary brief (copy into Step 3 → Paste Table to verify):

```
| Day 1 (Sun, 31st May 2026)   | Hanoi – Arrival                        | -/-/D |
| Day 2 (Mon, 1st June 2026)   | Hanoi – City Tour                      | B/-/D |
| Day 3 (Tue, 2nd June 2026)   | Ha Long Bay Cruise                     | -/-/D |
| Day 4 (Wed, 3rd June 2026)   | Da Nang – Arrival                      | -/-/D |
| Day 5 (Thu, 4th June 2026)   | Da Nang – Day Tour                     | B/-/D |
| Day 6 (Fri, 5th June 2026)   | Da Nang – Day Tour                     | B/-/D |
| Day 7 (Sat, 6th June 2026)   | Ho Chi Minh City – Arrival             | -/-/D |
| Day 8 (Sun, 7th June 2026)   | Ho Chi Minh City – Tour                | B/-/D |
| Day 9 (Mon, 8th June 2026)   | Ho Chi Minh City – Tour                | B/-/D |
| Day 10 (Tue, 9th June 2026)  | Departure – Airport Transfer           | B/-/- |
```

---

### Option B — Manual Form

### Generator Tab

1. **Step 1 – General Info**: Tour title, dates, pax count, room type, meal plan  
   — Changing **Date From** auto-recalculates date labels for all brief rows

2. **Step 2 – Transport**: Car size (auto-suggested based on pax), shuttle/limo options, guide language

3. **Step 3 – Itinerary Brief**:
   - **Paste mode**: paste a Markdown table → click **Parse Table** → cities are auto-detected from row titles → switch to form view
   - **Form mode**: manually add rows with **+ Thêm ngày** (or **🗑 Xóa tất cả** to clear)
   - For each day: date label, title, meals (B/L/D/BR), city, template

4. **Step 4 – Accommodation**: Cities auto-populate from brief. Three hotel tiers (3★ / 4★ / 5★):
   - Select hotel per city, choose Low/High season rate (auto-calculates per-pax)
   - Optional surcharges: early check-in (50% of rate), room upgrade (rate difference × nights)
   - Only tiers with at least one selected hotel appear in the output

5. Click **⚡ Generate Document** — full preview on the right panel

6. **📋 Copy All** to paste into email / Word, or **⬇️ Download .docx** for a formatted Word file  
   — The `.docx` accommodation table includes Rate/pax, VAT status, and surcharge rows

### Admin Tab
- **Templates**: Filter by city, Add / Edit / Delete. Editing with a different city moves the template.
- **Hotels**: Filter by stars, Add / Edit / Delete. Fields: name, city, VAT, room type, rates, child share, extra bed, upgrade options, URL, flags (skip / noExtraBed / dayCruiseOnly / gitOnly / partialPrice)
- **💾 Export Config**: Downloads `asia-mystika-config-YYYY-MM-DD.json`
- **📂 Import Config**: Upload a previously exported JSON
- **🔄 Reset to Defaults**: Restore Excel-parsed data

## Re-parsing the Excel

If `Bảng Của Hiếu.xlsx` is updated:

```bash
npm run parse-data
# regenerates data/templates.js and data/hotels.js
```

## File Structure

```
index.html              Main app (2 tabs: Generator + Admin)
styles.css              All styles
app.js                  Main controller & state
lib/
  brief-parser.js       Parse pasted Markdown table, date labels, city detection
  detail-engine.js      Map templates → detail HTML, accommodation note per day
  accommodation-engine.js  Hotel selection UI, surcharge calc, output tables
  notes-engine.js       Auto-generate Notes / Includes / Excludes / Cancellation
  docx-generator.js     Build & download .docx (docx.js v8.5.0 CDN)
admin/
  admin-manager.js      Template & hotel CRUD, localStorage, export/import
data/
  templates.js          37 itinerary templates across 7 cities
  hotels.js             33 hotels across 3 tiers (3★ / 4★ / 5★)
scripts/
  parse-excel.py        Bảng Của Hiếu.xlsx → data/templates.js + data/hotels.js
favicon.svg             App icon
```

## Key Behaviours

| Feature | Detail |
|---|---|
| State defaults | mealPlan=MAP, carSize auto-suggested (7s for ≤2 pax) |
| City auto-detect | After paste, titles matched to city codes (HN/NB/SP/HL/DN/HC/PQ) |
| Hotel auto-init | First available hotel selected per city/tier on load |
| Surcharge recalc | ECI surcharge updates immediately when rate type (low↔high) changes |
| Empty tier hiding | Tiers with no selected hotels omitted from both HTML preview and .docx |
| VAT display | Per-hotel VAT flag shown inline in accommodation tables |
| Tab switch | Returning to Generator refreshes hotel blocks with latest Admin data |

## Deployment

Static HTML — no build step needed:
- **Netlify / Vercel**: drag-and-drop the folder
- **GitHub Pages**: push to repo, enable Pages
- **Local network**: `python -m http.server 8000` on local IP for office use
