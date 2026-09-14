import json
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

import openpyxl


SOURCE = Path(sys.argv[1])
OUTPUT = Path(sys.argv[2])


def clean(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        value = unicodedata.normalize("NFC", value).replace("\t", " ").strip()
        value = re.sub(r"[ \u3000]+", " ", value)
        return value or None
    return value


def number(value):
    value = clean(value)
    return value if isinstance(value, (int, float)) else None


def load_rows(workbook, sheet_name):
    sheet = workbook[sheet_name]
    headers = [clean(cell.value) for cell in sheet[1]]
    rows = []
    for values in sheet.iter_rows(min_row=2, values_only=True):
        record = {headers[i]: clean(value) for i, value in enumerate(values) if i < len(headers) and headers[i]}
        if record.get("名称"):
            rows.append(record)
    return rows


def as_boolish(value):
    value = clean(value)
    if value is None:
        return None
    return str(value)


def map_licensed(row):
    return {
        "id": f"licensed-{row.get('No.')}",
        "number": number(row.get("No.")),
        "name": row.get("名称"),
        "category": "認可保育園・こども園",
        "type": row.get("種別"),
        "area": row.get("エリア"),
        "operator": row.get("運営者"),
        "address": row.get("住所"),
        "postalCode": row.get("郵便番号"),
        "lat": number(row.get("緯度")),
        "lng": number(row.get("経度")),
        "opened": row.get("開設年月日"),
        "floorArea": number(row.get("延床面積")),
        "areaPerChild": number(row.get("延床面積/園児")),
        "areaPerChildLabel": row.get("延床面積/園児(表示)"),
        "areaRank": row.get("延床面積/園児\nランク") or row.get("1人あたりの面積ランキング"),
        "gardenArea": number(row.get("園庭面積")),
        "gardenPerChild": number(row.get("園庭面積/園児")),
        "gardenLabel": row.get("園庭有無"),
        "gardenRank": row.get("園庭面積/園児\nランク") or row.get("1人あたりの園庭面積ランキング"),
        "capacity": {
            "57d": number(row.get("0歳児(産明け)\n定員")),
            "7m": number(row.get("0歳児(7ヶ月)\n定員")),
            "age0": number(row.get("0歳児定員")),
            "age1": number(row.get("1歳児定員")),
            "age2": number(row.get("2歳児定員")),
            "age3": number(row.get("3歳児定員")),
            "age4": number(row.get("4歳児定員")),
            "age5": number(row.get("5歳児定員")),
            "total": number(row.get("(定員全体)")),
        },
        "admissionIndex": {
            "57d": row.get("0歳児(産明け)\n入園指数"),
            "7m": row.get("0歳児(7ヶ月)\n入園指数"),
            "age1": row.get("1歳児入園指数"),
            "age2": row.get("2歳児入園指数"),
            "age3": row.get("3歳児入園指数"),
            "age4": row.get("4歳児入園指数"),
            "age5": row.get("5歳児入園指数"),
        },
        "elevator": as_boolish(row.get("エレベーター")),
        "bicycle": as_boolish(row.get("駐輪スペース")),
        "stroller": as_boolish(row.get("日中のベビーカー置場")),
        "diaperPrep": as_boolish(row.get("おむつ-準備")),
        "diaperDispose": as_boolish(row.get("おむつ-処分")),
        "beddingPrep": as_boolish(row.get("布団カバー-準備")),
        "beddingAttach": as_boolish(row.get("布団カバー-付け外し")),
        "beddingWash": as_boolish(row.get("布団カバー-洗濯")),
        "beddingNote": row.get("布団カバー-備考"),
        "contactApp": as_boolish(row.get("連絡アプリ")),
        "contactAppNote": row.get("連絡アプリ-備考"),
        "uniform": as_boolish(row.get("制服")),
        "uniformNote": row.get("制服-備考"),
        "medicalCare": as_boolish(row.get("医ケア児受入")),
        "nurseryTeachers": number(row.get("保育士数")),
        "totalStaff": number(row.get("(職員数全体)")),
        "teacherPerChild": number(row.get("保育士/園児")),
        "teacherPerChildLabel": row.get("保育士/園児(表示)"),
        "teacherRank": row.get("保育士/園児\nランク") or row.get("1人あたりの保育士数ランキング"),
        "staffPerChild": number(row.get("職員/園児")),
        "staffPerChildLabel": row.get("職員/園児(表示)"),
        "staffRank": row.get("職員/園児\nランク") or row.get("1人あたりの職員数ランキング"),
        "inspection": as_boolish(row.get("指導検査結果有無")),
        "inspectionDetail": row.get("指導検査結果"),
        "website": row.get("詳細"),
        "evaluation": row.get("評価"),
        "note": row.get("備考"),
    }


def map_other(row, category):
    no = row.get("No.") if row.get("No.") is not None else row.get("N")
    return {
        "id": f"other-{category}-{no}",
        "number": number(no),
        "name": row.get("名称"),
        "category": category,
        "type": row.get("種別"),
        "area": row.get("エリア"),
        "operator": row.get("設置者") or row.get("運営者"),
        "address": row.get("住所"),
        "postalCode": row.get("郵便番号"),
        "lat": number(row.get("緯度")),
        "lng": number(row.get("経度")),
        "opened": row.get("設立年度"),
        "floorArea": number(row.get("延床面積")),
        "areaPerChild": number(row.get("延床面積/園児")),
        "areaRank": row.get("延床面積/園児\nランク"),
        "capacity": {
            "57d": number(row.get("0歳児(産明け)\n定員")),
            "7m": number(row.get("0歳児(7ヶ月)\n定員")),
            "age0": number(row.get("0歳児定員")),
            "age1": number(row.get("1歳児定員")),
            "age2": number(row.get("2歳児定員")),
            "age3": number(row.get("3歳児定員")),
            "age4": number(row.get("4歳児定員")),
            "age5": number(row.get("5歳児定員")),
            "total": number(row.get("(定員全体)")),
        },
        "nurseryTeachers": number(row.get("保育士数")),
        "totalStaff": number(row.get("(職員数全体)")),
        "teacherPerChild": number(row.get("保育士/園児")),
        "staffPerChild": number(row.get("職員/園児")),
        "website": row.get("URL") or row.get("区URL"),
        "wardWebsite": row.get("区URL"),
        "phone": row.get("電話番号"),
    }


workbook = openpyxl.load_workbook(SOURCE, data_only=True, read_only=False)
records = [map_licensed(row) for row in load_rows(workbook, "認可")]
records += [map_other(row, "地域型保育") for row in load_rows(workbook, "地域型保育")]
records += [map_other(row, "認証保育所") for row in load_rows(workbook, "認証")]
records += [map_other(row, "認可外・企業主導型") for row in load_rows(workbook, "認可外・企業主導型")]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
payload = json.dumps(records, ensure_ascii=False, separators=(",", ":"), default=str)
OUTPUT.write_text(f"window.NURSERY_DATA={payload};\n", encoding="utf-8")
print(json.dumps({"records": len(records), "licensed": sum(r["category"] == "認可保育園・こども園" for r in records)}, ensure_ascii=False))
