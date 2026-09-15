import subprocess
import xml.etree.ElementTree as ET
import re
import json
import unicodedata

CONFIGS = {
    '2022': {
        'pdf': 'data/pdf/r04_04.pdf',
        'svg_prefix': 'r04',
        'cols': {
            'name': (225.2, 406.9),
            '57d': (406.9, 464.1),
            '7m': (464.1, 521.4),
            'age1': (521.4, 578.6),
            'age2': (578.6, 635.8),
            'age3': (635.8, 693.0),
            'age4': (693.0, 750.3),
            'age5': (750.3, 807.5),
        },
        'p1_min_y': 690
    },
    '2023': {
        'pdf': 'data/pdf/r05_04.pdf',
        'svg_prefix': 'r05',
        'cols': {
            'name': (242.7, 423.8),
            '57d': (423.8, 480.6),
            '7m': (480.6, 537.6),
            'age1': (537.6, 594.5),
            'age2': (594.5, 651.4),
            'age3': (651.4, 708.3),
            'age4': (708.3, 765.2),
            'age5': (765.2, 822.1),
        },
        'p1_min_y': 690
    },
    '2024': {
        'pdf': 'data/pdf/r06_04.pdf',
        'svg_prefix': 'r06',
        'cols': {
            'name': (156.1, 444.1),
            '57d': (444.1, 512.3),
            '7m': (512.3, 581.0),
            'age1': (581.0, 649.7),
            'age2': (649.7, 718.4),
            'age3': (718.4, 787.1),
            'age4': (787.1, 855.8),
            'age5': (855.8, 924.5),
        },
        'p1_min_y': 690
    },
    '2025': {
        'pdf': 'data/pdf/r07_04.pdf',
        'svg_prefix': 'r07',
        'cols': {
            'name': (156.1, 444.1),
            '57d': (444.1, 512.3),
            '7m': (512.3, 581.0),
            'age1': (581.0, 649.7),
            'age2': (649.7, 718.4),
            'age3': (718.4, 787.1),
            'age4': (787.1, 855.8),
            'age5': (855.8, 924.5),
        },
        'p1_min_y': 690
    }
}

AGE_COLS = ['57d', '7m', 'age1', 'age2', 'age3', 'age4', 'age5']

def normalize_name(name):
    if not name:
        return ""
    n = unicodedata.normalize('NFKC', name)
    n = re.sub(r'[\s　・\(\)（）\n]', '', n)
    return n

def parse_page(yr, page):
    cfg = CONFIGS[yr]
    pdf_path = cfg['pdf']
    svg_path = f'/tmp/svg/{cfg["svg_prefix"]}_p{page}.svg'
    cols = cfg['cols']
    
    # 1. pdftotext -bbox
    out = subprocess.check_output(['pdftotext', '-bbox', '-f', str(page), '-l', str(page), pdf_path, '-'])
    root = ET.fromstring(out)
    words = []
    for word in root.findall('.//{http://www.w3.org/1999/xhtml}word'):
        if word.text:
            words.append({
                'text': word.text,
                'xMin': float(word.attrib['xMin']),
                'yMin': float(word.attrib['yMin']),
                'xMax': float(word.attrib['xMax']),
                'yMax': float(word.attrib['yMax'])
            })
            
    # 2. SVG lines, diags, grays, v_mid
    tree = ET.parse(svg_path)
    svg_root = tree.getroot()
    defs = svg_root.find('{http://www.w3.org/2000/svg}defs')
    body = [c for c in svg_root if c != defs]
    
    name_l, name_r = cols['name']
    h_lines = []
    diagonals = []
    gray_rects = []
    v_lines_57d_7m = []
    mid_57_7m = cols['57d'][1]
    
    for parent in body:
        for el in parent.iter('{http://www.w3.org/2000/svg}path'):
            tr = el.attrib.get('transform', '')
            d = el.attrib.get('d', '')
            fill = el.attrib.get('fill', '')
            pts = re.findall(r'([-\d\.]+)\s+([-\d\.]+)', d)
            if len(pts) >= 4:
                xs = [float(p[0]) for p in pts]
                ys = [float(p[1]) for p in pts]
                
                # 行列変換適用
                if tr and 'matrix' in tr:
                    m = re.findall(r'[-\d\.]+', tr)
                    if len(m) == 6:
                        a, b, c, d_val, e, f = map(float, m)
                        t_pts = [(a*x + c*y + e, b*x + d_val*y + f) for x, y in zip(xs, ys)]
                        xs = [p[0] for p in t_pts]
                        ys = [p[1] for p in t_pts]
                        
                dx = max(xs) - min(xs)
                dy = max(ys) - min(ys)
                
                # 水平線: 施設名列にまたがっている境界線
                if dy < 2.0:
                    if min(xs) <= name_l + 50 and max(xs) >= name_r - 50:
                        mid_y = (min(ys) + max(ys)) / 2
                        if page == 1 and mid_y < cfg['p1_min_y']:
                            continue
                        h_lines.append(mid_y)
                # 垂直線 (57d と 7m の境界)
                if dx < 1.5 and dy > 10 and abs(min(xs) - mid_57_7m) < 2.0:
                    v_lines_57d_7m.append((min(ys), max(ys)))
                # 斜線 vs 矩形
                if 30 < dx < 95 and 15 < dy < 55:
                    ux = {round(x, 1) for x in xs}
                    uy = {round(y, 1) for y in ys}
                    if len(ux) == 2 and len(uy) == 2:
                        # 軸平行矩形 (グレー網掛け)
                        if 'rgb(74' in fill or 'rgb(75' in fill:
                            gray_rects.append(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2))
                    else:
                        # 斜線
                        diagonals.append(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2))
                        
    # 重複h_linesの統合
    h_lines = sorted(list(set(round(y, 1) for y in h_lines)))
    merged_h = []
    for y in h_lines:
        if not merged_h or abs(merged_h[-1] - y) > 2.0:
            merged_h.append(y)
            
    nurseries = []
    for r in range(len(merged_h) - 1):
        y_top = merged_h[r]
        y_bot = merged_h[r+1]
        if y_bot - y_top < 25:
            continue
            
        # 施設名セル
        name_words = [w for w in words if name_l <= (w['xMin']+w['xMax'])/2 <= name_r and y_top - 1 <= (w['yMin']+w['yMax'])/2 <= y_bot + 1]
        name_words.sort(key=lambda w: (w['yMin'], w['xMin']))
        raw_name = ''.join(w['text'] for w in name_words).strip()
        
        if not raw_name or raw_name in ['保育施設', '区分', '施設名']:
            continue
        if any(keyword in raw_name for keyword in ['クラスと', '一緒になります', '最終順位区分表', '利用調整結果', '申込児童の歳児']):
            continue
            
        # 0歳児結合判定
        has_split_0yo = any(v_top <= (y_top + y_bot)/2 <= v_bot or (abs(v_top - y_top) < 5 and abs(v_bot - y_bot) < 5) for v_top, v_bot in v_lines_57d_7m)
        
        row_res = {
            'name': raw_name,
            'norm_name': normalize_name(raw_name),
            'page': page,
            'y_top': y_top,
            'y_bot': y_bot,
            'merged_0yo': not has_split_0yo,
            'data': {}
        }
        
        # 0歳児が結合されている場合
        if not has_split_0yo:
            x_0_l = cols['57d'][0]
            x_0_r = cols['7m'][1]
            words_0yo = [w for w in words if x_0_l + 2 <= (w['xMin']+w['xMax'])/2 <= x_0_r - 2 and y_top - 1 <= (w['yMin']+w['yMax'])/2 <= y_bot + 1]
            words_0yo.sort(key=lambda w: (w['yMin'], w['xMin']))
            txt_0yo = ' '.join(w['text'] for w in words_0yo).strip()
            for h_txt in ['0歳児', '０歳児', '57日', '7か月', '7ヶ月']:
                txt_0yo = txt_0yo.replace(h_txt, '').strip()
            diag_0yo = any(x_0_l <= dx <= x_0_r and y_top <= dy <= y_bot for dx, dy in diagonals)
            gray_0yo = any(x_0_l <= gx <= x_0_r and y_top <= gy <= y_bot for gx, gy in gray_rects)
            
            val_0yo = parse_cell_content(txt_0yo, diag_0yo, gray_0yo)
            val_0yo['is_merged'] = True
            row_res['data']['57d'] = val_0yo
            row_res['data']['7m'] = val_0yo
            
        for col_id in AGE_COLS:
            if not has_split_0yo and col_id in ['57d', '7m']:
                continue
                
            x_l, x_r = cols[col_id]
            cell_words = [w for w in words if x_l + 2 <= (w['xMin']+w['xMax'])/2 <= x_r - 2 and y_top - 1 <= (w['yMin']+w['yMax'])/2 <= y_bot + 1]
            cell_words.sort(key=lambda w: (w['yMin'], w['xMin']))
            txt = ' '.join(w['text'] for w in cell_words).strip()
            for h_txt in ['0歳児', '０歳児', '57日', '7か月', '7ヶ月', '1歳児', '１歳児', '2歳児', '２歳児', '3歳児', '３歳児', '4歳児', '４歳児', '5歳児', '５歳児']:
                txt = txt.replace(h_txt, '').strip()
                
            diag = any(x_l <= dx <= x_r and y_top <= dy <= y_bot for dx, dy in diagonals)
            gray = any(x_l <= gx <= x_r and y_top <= gy <= y_bot for gx, gy in gray_rects)
            
            row_res['data'][col_id] = parse_cell_content(txt, diag, gray)
            
        nurseries.append(row_res)
    return nurseries

def parse_cell_content(txt, has_diag, has_gray):
    if has_diag:
        return {'raw': '／', 'status': 'none', 'score': None, 'rank': None}
    if txt == '空' or (has_gray and not txt):
        return {'raw': '空', 'status': 'vacant', 'score': None, 'rank': None}
    if txt in ['-', '- -', '―', 'ー']:
        return {'raw': '-', 'status': 'full', 'score': None, 'rank': None}
    if txt:
        rank = None
        score = None
        for p in txt.split():
            if re.match(r'^[A-P]$', p):
                rank = p
            elif '点' in p:
                score = p
            elif p in ['空', '-']:
                return {'raw': p, 'status': 'vacant' if p == '空' else 'full', 'score': None, 'rank': None}
        if score or rank:
            raw_val = f"{rank} {score}".strip() if rank and score else (score or rank)
            return {'raw': raw_val, 'status': 'accepted', 'score': score, 'rank': rank}
        return {'raw': txt, 'status': 'accepted', 'score': txt, 'rank': None}
    return {'raw': '-', 'status': 'full', 'score': None, 'rank': None}

def main():
    results = {}
    for yr in ['2022', '2023', '2024', '2025']:
        yr_rows = []
        for p in [1, 2, 3, 4]:
            yr_rows.extend(parse_page(yr, p))
        results[yr] = yr_rows
        print(f"{yr}: successfully parsed {len(yr_rows)} nurseries")
        
    with open('/tmp/extracted_admission_index.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("Saved to /tmp/extracted_admission_index.json")

if __name__ == '__main__':
    main()
