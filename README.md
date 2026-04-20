# Asia Mystika – Itinerary Generator

Browser-based tool for creating Vietnam tour itineraries and quotations.  
**No build step. No dependencies to install.** Pure vanilla JS ES modules.

---

## Running the app

```bash
npm run serve
# opens at http://localhost:8000
```

Or directly:

```bash
python -m http.server 8000
```

Then open **http://localhost:8000** in any modern browser.

---

## How it works — Wizard flow

The app uses a 4-step wizard. Each step unlocks the next after you click **Confirm & Continue**. You can always scroll up to edit a previous step — changes cascade forward automatically.

### Step 1 — General Info

| Field | Notes |
|---|---|
| Tour title | Full name of the tour package |
| From / To dates | Shown in DD/MM/YYYY next to the input |
| Adults / Children | Child ages entry appears when children > 0 |
| Meal plan | MAP / CP / Full Board |
| Indian group | Adds an INDIAN GROUP tag to the document |

### Step 2 — Transport & Guide

- **Car size** is auto-suggested based on pax count. Children aged **5 and under are excluded** from the pax count for vehicle sizing.
- **Sapa zone picker** appears automatically when any brief row involves Sapa. Options: 16-seater, 29-seater, or Split (1×29 + 1×16 when pax > 29).
- **Phu Quoc – Rach Vem zone picker** appears the same way when a Rach Vem day is detected.
- Shuttle to Halong and Limousine to Sapa toggles are independent.

### Step 3 — Itinerary Brief

The grid auto-generates one row per day between the From/To dates.

| Column | Behaviour |
|---|---|
| **Day** | Day number + DD/MM/YYYY + long date (e.g. Thu, 22nd May 2026) |
| **Itinerary** | Free-text title. **Exact match** against any saved template applies it automatically. If no exact match, the top-3 closest templates appear as clickable suggestion chips. If the title is truly new, a **📝 Save as new template** button appears below the table. |
| **Meals** | Free text — type whatever format you prefer (e.g. `B/L/D`, `B+D`, `Brunch only`). |

### Step 4 — Accommodation

One block per city stay (non-consecutive stays in the same city get separate blocks).

- **FIT / GIT toggle** at the top applies to all stays.
- Each stay has a **3★ / 4★ / 5★ star toggle** on the left to switch hotel tiers independently.
- Hotel dropdown on the right updates to show only hotels matching that city and star rating.
- Inputs per stay:
  - 2-pax rooms, 3-pax rooms, Extra beds, Share beds
  - FOC rooms (manually entered — cost is spread across all pax + 1 tour leader)
  - Early check-in day (surcharge = 50% of room rate ÷ pax per room)
  - Room upgrade (if hotel has an upgrade option configured)
- **Per-pax** line updates live showing base cost + ECI + upgrade surcharges.
- Season (low / high) is determined automatically from the stay dates against each hotel's `highSeason` ranges.

### Generate

Click **⚡ Generate Document** to render the full preview on the right panel:

- Itinerary Brief table
- Day-by-day Details (from matched templates)
- Accommodation tables (per stay, per tier, with surcharge rows)
- Notes, Tour Includes, Tour Excludes, Important Notes, Cancellation Policy

Use **📋 Copy All** to copy plain text, or **⬇️ Download .docx** for a formatted Word file.

---

## Admin tab

### Templates

Manage the template library used for auto-matching in Step 3.

- Filter by city
- Add / Edit / Delete templates
- Each template: **City**, **Key** (name shown in suggestions), **Detail text** (full activity schedule)

### Hotels

Manage the hotel database used in Step 4.

- Filter by star rating
- Each hotel stores:

| Field | Description |
|---|---|
| Name, City, Star rating | Basic info |
| Room type | e.g. Deluxe City View |
| Currency | USD or VND |
| VAT | Included or excluded |
| Rates | 2×2 matrix: FIT / GIT × Low season / High season |
| Extra bed / Share bed | Per-night rate |
| Early check-in override | Leave blank to use the default 50%-of-rate formula |
| Upgrade | Room type name + rate per night |
| FOC rule | Every N rooms → M free rooms |
| High-season ranges | Format `MM-DD..MM-DD`, comma-separated (e.g. `06-01..08-31, 12-20..01-05`) |
| Flags | Skip / No Extra Bed / Day Cruise Only / GIT Only / Partial Price |

### Import / Export

- **💾 Export Config** — saves all templates + hotels as a JSON backup file
- **📂 Import Config** — restores from a previously exported JSON
- **🔄 Reset to Defaults** — reloads the 3 seed reference hotels and default templates

---

## City codes

| Code | City |
|---|---|
| HN | Hà Nội |
| NB | Ninh Bình |
| SP | Sapa |
| HL | Hạ Long |
| DN | Đà Nẵng |
| HA | Hội An |
| HC | Hồ Chí Minh |
| PQ | Phú Quốc |

---

## File structure

```
index.html              Main app (Generator + Admin tabs)
styles.css              All styles
app.js                  State management, wizard logic, all step controllers
favicon.svg             App icon
package.json            npm scripts (serve only)
README.md

admin/
  admin-manager.js      Template & hotel CRUD, localStorage persistence, export/import

data/
  hotels.js             Seed hotel data (new FIT/GIT/FOC/season schema)
  templates.js          Itinerary templates grouped by city + CITY_LABELS

lib/
  brief-parser.js       Date helpers, city detection from title, meal utilities
  detail-engine.js      Render day-by-day details HTML from templates
  accommodation-engine.js  computeStays, pickRate (FIT/GIT + season), ECI/upgrade/FOC calculators
  notes-engine.js       Auto-generate Notes / Includes / Excludes / Cancellation
  docx-generator.js     Build and download .docx (docx.js v8.5.0 via CDN)
```

---

## Deployment

Static files — no server-side code needed:

- **Local network (office)**: `python -m http.server 8000` on local IP
- **Netlify / Vercel**: drag-and-drop the project folder
- **GitHub Pages**: push to repo, enable Pages on the `main` branch
