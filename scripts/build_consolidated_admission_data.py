import json
import re
import csv
import unicodedata

# 1. dist/data.js から施設マスターを取得
with open('dist/data.js', encoding='utf-8') as f:
    match = re.search(r'window\.NURSERY_DATA\s*=\s*(\[.*\]);?', f.read(), re.DOTALL)
    all_nurseries = json.loads(match.group(1))

licensed_master = [
    n for n in all_nurseries 
    if n.get('category') == '認可保育園・こども園' or '認可' in n.get('type', '') or 'こども園' in n.get('type', '')
]

def norm(n):
    if not n:
        return ""
    s = unicodedata.normalize('NFKC', n)
    s = re.sub(r'[\s　・\(\)（）\n\-\_]', '', s)
    return s

# 2. 抽出済みデータを読み込み
with open('/tmp/extracted_admission_index.json', encoding='utf-8') as f:
    extracted_by_year = json.load(f)

# 年度ごとの正規化名マップ
maps_by_year = {}
for yr in ['2022', '2023', '2024', '2025']:
    m = {}
    for item in extracted_by_year[yr]:
        m[norm(item['name'])] = item
    maps_by_year[yr] = m

# 旧園名・別名のマッピング辞書
ALIASES = {
    'アイグラン保育園新川': ['あい保育園新川'],
    'アイグラン保育園日本橋': ['あい保育園日本橋'],
    'アイグラン保育園水天宮': ['あい保育園水天宮'],
    'THREESTARNURSERY蛎殻町園': ['学栄ナーサリー日本橋蛎殻町保育園', 'THREESTARNURSERY蛎殻町園'],
    '小学館アカデミー勝どきこども園': ['勝どきこども園'],
    '渋谷教育学園晴海西こども園': ['晴海西こども園', '渋谷教育学園晴海西こども園'],
    'ポピンズナーサリースクールHARUMIFLAGPORTVILLAGE': ['ﾎﾟﾋﾟﾝｽﾞﾅｰｻﾘｰｽｸｰﾙHARUMIFLAGPORTVILLAGE', 'ﾎﾟﾋﾟﾝｽﾞﾅｰｻﾘｰｽｸｰﾙHARUMIFLAGPORTVILLAGE(本園)'],
    'ポピンズナーサリースクールららテラスHARUMIFLAG': ['ﾎﾟﾋﾟﾝｽﾞﾅｰｻﾘｰｽｸｰﾙららテラスHARUMIFLAG'],
    'インターナショナル保育所まぁむ月島駅前園': ['ｲﾝﾀｰﾅｼｮﾅﾙ保育所まぁむ月島駅前園', '保育所まぁむ月島駅前園'],
    'インターナショナル勝どきえほん保育園': ['ｲﾝﾀｰﾅｼｮﾅﾙ勝どきえほん保育園', '勝どきえほん保育園'],
    'キッズラボ水天宮前園': ['ｷｯｽﾞﾗﾎﾞ水天宮前園', 'キッズラボ水天宮前園'],
    '小学館アカデミー晴海保育園': ['小学館ｱｶﾃﾞﾐｰ晴海保育園'],
    'ニチイキッズさわやか勝どき6丁目保育園': ['ニチイキッズさわやか勝どき６丁目保育園'],
    'アスク晴海3丁目保育園': ['アスク晴海３丁目保育園'],
}

AGE_KEYS = [
    ('57d', '0歳児(57日)'),
    ('7m', '0歳児(7か月)'),
    ('age1', '1歳児'),
    ('age2', '2歳児'),
    ('age3', '3歳児'),
    ('age4', '4歳児'),
    ('age5', '5歳児')
]

YEARS = ['2022', '2023', '2024', '2025']
YEAR_LABELS = {
    '2022': '令和4年(2022)',
    '2023': '令和5年(2023)',
    '2024': '令和6年(2024)',
    '2025': '令和7年(2025)'
}

consolidated = []

for lic in licensed_master:
    lic_id = lic['id']
    lic_no = lic['number']
    lic_name = lic['name']
    lic_type = lic.get('type', '')
    lic_area = lic.get('area', '')
    opened_date = lic.get('opened', '')
    
    lic_norm = norm(lic_name)
    
    nursery_record = {
        'id': lic_id,
        'number': lic_no,
        'name': lic_name,
        'type': lic_type,
        'area': lic_area,
        'opened': opened_date,
        'ages': {}
    }
    
    for age_key, age_label in AGE_KEYS:
        nursery_record['ages'][age_key] = {
            'label': age_label,
            'years': {}
        }
        
        for yr in YEARS:
            # 開園日チェック
            is_opened = True
            if opened_date:
                # 4月入園なので、当該年の4月1日以前に開園しているか
                # 2022年4月入園 -> 2022-04-01 以前
                if opened_date > f"{yr}-04-01":
                    is_opened = False
                    
            if not is_opened:
                nursery_record['ages'][age_key]['years'][yr] = {
                    'status': 'unopened',
                    'status_label': '未開園',
                    'score': None,
                    'rank': None,
                    'display': '未開園'
                }
                continue
                
            # PDFデータから検索
            yr_map = maps_by_year[yr]
            cand = yr_map.get(lic_norm)
            if not cand and lic_norm in ALIASES:
                for alias in ALIASES[lic_norm]:
                    cand = yr_map.get(norm(alias))
                    if cand:
                        break
            if not cand:
                # 部分一致
                for k, v in yr_map.items():
                    if k in lic_norm or lic_norm in k:
                        cand = v
                        break
                        
            if not cand:
                nursery_record['ages'][age_key]['years'][yr] = {
                    'status': 'unknown',
                    'status_label': 'データなし',
                    'score': None,
                    'rank': None,
                    'display': '-'
                }
                continue
                
            age_data = cand['data'].get(age_key, {})
            status = age_data.get('status', 'empty')
            score = age_data.get('score')
            rank = age_data.get('rank')
            raw = age_data.get('raw', '-')
            is_merged = age_data.get('is_merged', False)
            
            if status == 'accepted':
                status_label = '内定あり'
                display = f"{rank} {score}".strip() if rank and score else (score or rank)
            elif status == 'vacant':
                status_label = '空きあり'
                display = '空'
            elif status == 'full':
                status_label = '定員達し(募集なし)'
                display = '-'
            elif status == 'none':
                status_label = '受入なし(対象外)'
                display = '／'
            else:
                status_label = '-'
                display = '-'
                
            nursery_record['ages'][age_key]['years'][yr] = {
                'status': status,
                'status_label': status_label,
                'score': score,
                'rank': rank,
                'display': display,
                'is_merged_0yo': is_merged
            }
            
    consolidated.append(nursery_record)

# さらに、地域型保育事業（キャリー保育園八丁堀、KuuKids）も追加
for extra_name in ['キャリー保育園八丁堀', 'KuuKids']:
    extra_record = {
        'id': f"community-{norm(extra_name)}",
        'number': None,
        'name': extra_name,
        'type': '地域型保育事業(小規模)',
        'area': '京橋' if '八丁堀' in extra_name else '勝どき',
        'opened': None,
        'ages': {}
    }
    for age_key, age_label in AGE_KEYS:
        extra_record['ages'][age_key] = {
            'label': age_label,
            'years': {}
        }
        for yr in YEARS:
            cand = maps_by_year[yr].get(norm(extra_name))
            if not cand:
                extra_record['ages'][age_key]['years'][yr] = {
                    'status': 'unopened',
                    'status_label': '未開園/対象外',
                    'score': None,
                    'rank': None,
                    'display': '／'
                }
                continue
            age_data = cand['data'].get(age_key, {})
            status = age_data.get('status', 'empty')
            score = age_data.get('score')
            rank = age_data.get('rank')
            is_merged = age_data.get('is_merged', False)
            
            if status == 'accepted':
                status_label = '内定あり'
                display = f"{rank} {score}".strip() if rank and score else (score or rank)
            elif status == 'vacant':
                status_label = '空きあり'
                display = '空'
            elif status == 'full':
                status_label = '定員達し(募集なし)'
                display = '-'
            elif status == 'none':
                status_label = '受入なし(対象外)'
                display = '／'
            else:
                status_label = '-'
                display = '-'
                
            extra_record['ages'][age_key]['years'][yr] = {
                'status': status,
                'status_label': status_label,
                'score': score,
                'rank': rank,
                'display': display,
                'is_merged_0yo': is_merged
            }
    consolidated.append(extra_record)

# JSON保存
with open('data/admission_index_consolidated.json', 'w', encoding='utf-8') as f:
    json.dump(consolidated, f, ensure_ascii=False, indent=2)

# CSV保存（行: 園 × 歳児、列: 基本情報 + 各年度）
csv_file = 'data/admission_index_by_nursery_age.csv'
with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f)
    writer.writerow([
        '施設番号', '施設ID', '施設名', '種別', '地域', '歳児クラス',
        '令和4年(2022)実績', '令和4年_順位', '令和4年_最低指数', '令和4年_状況',
        '令和5年(2023)実績', '令和5年_順位', '令和5年_最低指数', '令和5年_状況',
        '令和6年(2024)実績', '令和6年_順位', '令和6年_最低指数', '令和6年_状況',
        '令和7年(2025)実績', '令和7年_順位', '令和7年_最低指数', '令和7年_状況',
        '0歳児合同募集備考'
    ])
    
    for n in consolidated:
        no_str = str(n['number']) if n['number'] else '-'
        for age_key, age_label in AGE_KEYS:
            age_info = n['ages'][age_key]
            y22 = age_info['years'].get('2022', {})
            y23 = age_info['years'].get('2023', {})
            y24 = age_info['years'].get('2024', {})
            y25 = age_info['years'].get('2025', {})
            
            merged_note = ''
            if age_key in ['57d', '7m']:
                merged_years = [yr for yr in YEARS if age_info['years'].get(yr, {}).get('is_merged_0yo')]
                if merged_years:
                    merged_note = f"{','.join(merged_years)}年は57日・7か月合同募集枠"
                    
            writer.writerow([
                no_str, n['id'], n['name'], n['type'], n['area'], age_label,
                y22.get('display', '-'), y22.get('rank') or '', y22.get('score') or '', y22.get('status_label', ''),
                y23.get('display', '-'), y23.get('rank') or '', y23.get('score') or '', y23.get('status_label', ''),
                y24.get('display', '-'), y24.get('rank') or '', y24.get('score') or '', y24.get('status_label', ''),
                y25.get('display', '-'), y25.get('rank') or '', y25.get('score') or '', y25.get('status_label', ''),
                merged_note
            ])

print(f"Successfully consolidated {len(consolidated)} nurseries into:")
print("  - data/admission_index_consolidated.json")
print("  - data/admission_index_by_nursery_age.csv")

