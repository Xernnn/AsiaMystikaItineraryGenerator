"""
Parse Bảng Của Hiếu.xlsx → data/templates.js + data/hotels.js
Run: python scripts/parse-excel.py
"""
import zipfile, xml.etree.ElementTree as ET, os, json, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, 'Bảng Của Hiếu.xlsx')
DATA_DIR = os.path.join(ROOT, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

z = zipfile.ZipFile(XLSX)

# --- shared strings ---
ss_tree = ET.parse(z.open('xl/sharedStrings.xml'))
ss_ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings = []
for si in ss_tree.findall('.//m:si', ss_ns):
    strings.append(''.join(t.text or '' for t in si.findall('.//m:t', ss_ns)))

def read_sheet(n):
    tree = ET.parse(z.open(f'xl/worksheets/sheet{n}.xml'))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = []
    for row in tree.findall('.//m:row', ns):
        cells = {}
        for cell in row.findall('m:c', ns):
            ref = cell.get('r', '')
            col = ''.join(c for c in ref if c.isalpha())
            t = cell.get('t', '')
            v = cell.find('m:v', ns)
            if t == 's' and v is not None:
                cells[col] = strings[int(v.text)]
            elif v is not None:
                cells[col] = v.text
            else:
                cells[col] = ''
        rows.append(cells)
    return rows

# ============================================================
# TEMPLATES — Sheets 1-7
# ============================================================
CITY_MAP = {
    1: ('HN', 'A', 'B'),   # Hanoi        — key=A, text=B
    2: ('NB', 'A', 'B'),   # Ninh Binh    — key=A, text=B
    3: ('SP', 'A', 'B'),   # Sapa         — key=A, text=B
    4: ('HL', 'A', 'B'),   # Halong Bay   — key=A, text=B
    5: ('DN', 'A', 'B'),   # Da Nang      — key=A, text=B
    6: ('HC', 'B', 'D'),   # HCM          — key=B, text=D (different layout)
    7: ('PQ', 'A', 'B'),   # Phu Quoc     — key=A, text=B
}

CITY_LABELS = {
    'HN': 'Hà Nội',
    'NB': 'Ninh Bình',
    'SP': 'Sapa',
    'HL': 'Hạ Long',
    'DN': 'Đà Nẵng / Hội An',
    'HC': 'Hồ Chí Minh',
    'PQ': 'Phú Quốc',
}

templates_by_city = {}

SKIP_KEY_PATTERNS = ['giá', 'xe', 'vé', 'sic tour ninh binh cozy', 'cpai', 'apai', 'map',
                     'amazing', 'vcar', 'hoàng anh', 'lưu đêm', 'chưa vat', 'git:']

def is_skip_key(key):
    k = key.strip().lower()
    if not k:
        return True
    for pat in SKIP_KEY_PATTERNS:
        if pat in k:
            return True
    return False

for sheet_num, (city_code, key_col, text_col) in CITY_MAP.items():
    rows = read_sheet(sheet_num)
    templates = []
    for row in rows:
        key = row.get(key_col, '').strip()
        text = row.get(text_col, '').strip()
        if key and len(text) > 40 and not is_skip_key(key):
            templates.append({'key': key, 'text': text})
    templates_by_city[city_code] = templates
    print(f'Sheet {sheet_num} ({city_code}): {len(templates)} templates')

# ============================================================
# HOTELS — Sheet 9 (KS Real)
# ============================================================
# Columns: A=notes/tier, B=name, C=roomType, D=lowRate, E=highRate,
#          F=url, G=surcharge, H=upgradeRoom

hotels_by_stars = {'3': [], '4': [], '5': []}
current_tier = '3'

# City inference from known hotel names/URLs
CITY_HINTS = {
    'hanoi': 'HN', 'hà nội': 'HN', 'hanoila': 'HN', 'firsteden': 'HN',
    'lasante': 'HN', 'flowergar': 'HN', 'lacasa': 'HN', 'chalcedony': 'HN',
    'harmonia': 'HN', 'dolceh': 'HN', 'goldenlake': 'HN',
    'sapa': 'SP', 'sapacharm': 'SP', 'viewsapa': 'SP',
    'halong': 'HL', 'hera': 'HL', 'milacruise': 'HL', 'laregina': 'HL',
    'milalux': 'HL', 'vdream': 'HL', 'ambassador': 'HL',
    'danang': 'DN', 'anfada': 'DN', 'yarra': 'DN', 'codeh': 'DN',
    'canvas': 'DN', 'bluesun': 'DN', 'mandila': 'DN', 'dlg': 'DN',
    'nhatminh': 'DN', 'radisson-da-nang': 'DN',
    'hoian': 'DN', 'goldenholiday': 'DN',
    'phuquoc': 'PQ', 'gaia': 'PQ', 'sunsetbeach': 'PQ',
    'tahiti': 'PQ', 'palmy': 'PQ', 'radisson-blu-res': 'PQ',
    'saigon': 'HC', 'cicilia': 'HC', 'happylife': 'HC', 'avanti': 'HC',
}

def infer_city(name, url):
    combined = (name + url).lower().replace(' ', '').replace('-', '').replace('.', '')
    for hint, city in CITY_HINTS.items():
        if hint in combined:
            return city
    return 'HN'  # default fallback

def parse_surcharge(text):
    """Parse 'Ngủ chung = X\nThêm Bed = Y' → {childShare, extraBed}"""
    child = ''
    extra = ''
    if not text:
        return child, extra
    lines = text.replace('\\n', '\n').split('\n')
    for line in lines:
        l = line.strip()
        if l.lower().startswith('ngủ chung') or l.lower().startswith('ngu chung'):
            child = l.split('=', 1)[-1].strip() if '=' in l else ''
        elif l.lower().startswith('thêm bed') or l.lower().startswith('them bed'):
            extra = l.split('=', 1)[-1].strip() if '=' in l else ''
    return child, extra

def flatten(s):
    """Replace newlines with ' | ' for single-line display."""
    return ' | '.join(p.strip() for p in s.split('\n') if p.strip())

ks_rows = read_sheet(9)
for row in ks_rows:
    col_a = row.get('A', '').strip()
    col_b = row.get('B', '').strip()
    col_c = flatten(row.get('C', ''))
    col_d = flatten(row.get('D', ''))
    col_e = flatten(row.get('E', ''))
    col_f = row.get('F', '').strip()
    col_g = row.get('G', '').strip()
    col_h = flatten(row.get('H', ''))

    # Detect tier change
    if col_a in ('3 Sao', '4 Sao', '5 Sao'):
        current_tier = col_a[0]
        continue

    # Skip rows without hotel name
    if not col_b:
        continue

    # Parse VAT flag from name
    vat_included = 'ĐÃ VAT' in col_b
    hotel_name = col_b.replace('\nĐÃ VAT', '').replace('\nCHƯA VAT', '').strip()

    # Parse flags from col A
    flags = []
    if col_a:
        col_a_lower = col_a.lower()
        if 'không lấy' in col_a_lower or 'khong lay' in col_a_lower:
            flags.append('skip')
        if 'không kê được' in col_a_lower or 'extra bed' in col_a_lower.replace(' ', ''):
            if 'không kê được' in col_a_lower:
                flags.append('noExtraBed')
        if 'day cruise' in col_a_lower:
            flags.append('dayCruiseOnly')
        if 'git' in col_a_lower:
            flags.append('gitOnly')
        if 'chưa có giá' in col_a_lower:
            flags.append('partialPrice')

    # Parse surcharge
    child_share, extra_bed = parse_surcharge(col_g)

    # Infer city
    city = infer_city(hotel_name, col_f)

    hotel = {
        'id': re.sub(r'[^a-z0-9]', '-', hotel_name.lower())[:40].strip('-'),
        'name': hotel_name,
        'city': city,
        'vatIncluded': vat_included,
        'roomType': col_c,
        'lowRate': col_d,
        'highRate': col_e,
        'url': col_f,
        'childShare': child_share,
        'extraBed': extra_bed,
        'upgradeRoom': col_h if col_h else None,
        'flags': flags,
    }
    hotels_by_stars[current_tier].append(hotel)
    print(f'  [{current_tier}*] {hotel_name} → city={city}, flags={flags}')

# ============================================================
# Write data/templates.js
# ============================================================
templates_json = json.dumps(templates_by_city, ensure_ascii=False, indent=2)
templates_js = f'''// AUTO-GENERATED from Bảng Của Hiếu.xlsx — do not edit manually
// Edit via Admin tab or modify this file carefully.
// City codes: HN=Hà Nội, NB=Ninh Bình, SP=Sapa, HL=Hạ Long, DN=Đà Nẵng/Hội An, HC=Hồ Chí Minh, PQ=Phú Quốc

export const CITY_LABELS = {json.dumps(CITY_LABELS, ensure_ascii=False)};

export const templatesByCity = {templates_json};
'''
with open(os.path.join(DATA_DIR, 'templates.js'), 'w', encoding='utf-8') as f:
    f.write(templates_js)
print(f'\n✅ data/templates.js written')

# ============================================================
# Write data/hotels.js
# ============================================================
hotels_json = json.dumps(hotels_by_stars, ensure_ascii=False, indent=2)
hotels_js = f'''// AUTO-GENERATED from Bảng Của Hiếu.xlsx — do not edit manually
// Edit via Admin tab. City codes: HN, NB, SP, HL, DN, HC, PQ
// flags: "skip"=don't use, "noExtraBed"=can't add extra bed,
//        "dayCruiseOnly"=day cruise only, "gitOnly"=GIT groups only, "partialPrice"=incomplete pricing

export const hotelsByStars = {hotels_json};
'''
with open(os.path.join(DATA_DIR, 'hotels.js'), 'w', encoding='utf-8') as f:
    f.write(hotels_js)
print(f'✅ data/hotels.js written')
print(f'\nDone! Templates: {sum(len(v) for v in templates_by_city.values())} | Hotels: {sum(len(v) for v in hotels_by_stars.values())}')
