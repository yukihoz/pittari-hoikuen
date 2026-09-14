#!/usr/bin/env python3
"""Build a compact, factual index of Chuo nursery evaluations from Fukunavi.

The generated browser data intentionally contains survey facts and derived topic
labels, not the report prose. Readers are sent to the official report for detail.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup


BASE = "https://www.fukunavi.or.jp/fukunavi/controller"
DETAIL_DEFAULTS = {
    "actionID": "hyk", "cmd": "hyklstdtldigest", "BEF_PRC": "hyk",
    "HYK_ID1": "", "HYK_ID2": "", "HYK_ID3": "", "HYK_ID4": "", "HYK_ID5": "",
    "JGY_CD1": "", "JGY_CD2": "", "JGY_CD3": "", "JGY_CD4": "", "JGY_CD5": "",
    "SCHSVCSBRCD": "", "SVCDBRCD": "", "PTN_CD": "", "SVCSBRCDALL": "",
    "SVCSBRCD": "031", "AREA1": "", "AREA2": "", "AREA3": "", "HYK_YR": "",
    "SCHHYK_YR": "", "NAME": "", "MODE": "multi", "DVS_CD": "", "SVCDBR_CD": "22",
    "SVCSBR_CD": "", "ROW": "0", "FROMDT": "", "SCH_ACTION": "hyklst", "KOHYO": "",
    "GEN": "", "HYKNEN": "", "LISTSVC": "", "ORDER": "", "HYK_DTL_CHK": "",
    "PRMCMT_CHK": "", "HYK_CHK": "", "JGY_CHK": "", "SVC_CHK": "", "DIG_MOVE_FLG": "",
    "MLT_SVCSBR_CD1": "", "MLT_SVCSBR_CD2": "", "MLT_SVCSBR_CD3": "",
    "MLT_SVCSBR_CD4": "", "MLT_SVCSBR_CD5": "", "MLT_SVCSBR_CD6": "",
    "MLT_SVCSBR_CD7": "", "MLT_SVCSBR_CD8": "", "COLOR_FLG": "", "COLOR_HYK_ID": "",
    "BEFORE_FLG": "", "MLT_DTL_SVCSBR_CD1": "", "MLT_DTL_SVCSBR_CD2": "",
    "MLT_DTL_SVCSBR_CD3": "", "MLT_DTL_SVCSBR_CD4": "", "MLT_DTL_SVCSBR_CD5": "",
    "MLT_DTL_SVCSBR_CD6": "", "MLT_DTL_SVCSBR_CD7": "", "MLT_DTL_SVCSBR_CD8": "",
    "HIKAKU_SVCSBRCD": "", "TELOPN001_NO1": "", "TELOPN001_NO2": "",
    "TELOPN001_NO3": "", "TELOPN002_NO1": "", "TELOPN002_NO2": "",
    "TELOPN002_NO3": "", "TELOPN003_NO1": "", "TELOPN003_NO2": "",
    "TELOPN003_NO3": "", "S_MODE": "area", "MLT_AREA": "13102", "H_NAME": "",
    "J_NAME": "", "STEP_SVCSBRCD": "031",
}

THEMES = (
    ("保護者との連携", ("保護者", "家庭", "相談", "報告", "信頼", "情報提供", "対話")),
    ("安全・健康管理", ("安全", "事故", "健康", "衛生", "医療", "けが", "感染")),
    ("食事・食育", ("食事", "食育", "給食", "調理")),
    ("地域連携・情報発信", ("地域", "社会", "交流", "発信", "sns", "web")),
    ("職員体制・チーム連携", ("職員", "チーム", "人材", "働き", "専門性", "連携")),
    ("環境整備", ("清掃", "整理", "整頓", "環境美化", "設備")),
    ("運営・業務改善", ("業務", "ルール", "マニュアル", "運営", "効率", "組織")),
    ("保育内容・子どもの育ち", ("子ども", "遊び", "体験", "感性", "好奇心", "成長", "発達", "主体")),
)

SITE_NAME_ALIASES = {
    "インターナショナルアンジェリカ月島保育園": "アンジェリカ月島保育園",
    "中央区立堀留町保育園": "堀留町保育園",
}


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text or "")).strip()


def normalize_name(text: str) -> str:
    return re.sub(r"[^0-9a-zぁ-んァ-ヶ一-龠]", "", clean(text).lower())


def detail_url(evaluation_id: str, facility_id: str) -> str:
    params = dict(DETAIL_DEFAULTS)
    params["HYK_ID"] = evaluation_id
    params["JGY_CD"] = facility_id
    return f"{BASE}?{urlencode(params)}"


def parse_list(path: Path) -> list[dict]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    facilities = []
    for row in soup.find_all("tr"):
        link = row.find("a", href=lambda value: value and "showDetail('031'" in value)
        if not link:
            continue
        match = re.search(r"showDetail\('031','([^']+)','([^']+)'", link["href"])
        if not match:
            continue
        evaluation_id, facility_id = match.groups()
        cells = row.find_all("td")
        years = []
        if cells:
            for image in cells[-1].find_all("img", alt=True):
                year_match = re.search(r"令和(\d+)年度", clean(image["alt"]))
                if year_match:
                    years.append(2018 + int(year_match.group(1)))
        facilities.append({
            "name": clean(link.get_text(" ", strip=True)),
            "key": normalize_name(link.get_text(" ", strip=True)),
            "evaluationId": evaluation_id,
            "facilityId": facility_id,
            "years": years,
            "url": detail_url(evaluation_id, facility_id),
        })
    return facilities


def topic_labels(titles: list[str]) -> list[str]:
    labels = []
    for title in titles:
        lower = clean(title).lower()
        label = next((name for name, words in THEMES if any(word in lower for word in words)), "保育・運営の質")
        if label not in labels:
            labels.append(label)
    return labels[:3]


def satisfaction_percent(text: str, response_count: Optional[int]) -> Optional[float]:
    counts = re.search(r"(?:「|<)大変満足(?:」|>)[^名]{0,12}?(\d+)名.*?(?:「|<)満足(?:」|>)[^名]{0,12}?(\d+)名", text)
    if counts and response_count:
        return round((int(counts.group(1)) + int(counts.group(2))) / response_count * 100, 1)
    patterns = (
        r"総合満足度\([^)]*合計した割合\)は、?\(?([\d.]+)%",
        r"総合的な満足度に関する調査の結果は.{0,20}?対象者の\s*([\d.]+)%が「大変満足」または「満足」",
        r"(?:合計|計|合わせて|合わせると).{0,12}?([\d.]+)%",
        r"満足以上の回答.{0,20}?([\d.]+)%",
        r"肯定的回答割合は\s*([\d.]+)%",
        r"([\d.]+)%と満足度が高い",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return float(match.group(1))
    pair = re.search(r"「大変満足」[^%]{0,50}?([\d.]+)%.*?「満足」[^%]{0,50}?([\d.]+)%", text)
    if pair:
        return round(float(pair.group(1)) + float(pair.group(2)), 1)
    percent_pair = re.search(r"「大変満足」:([\d.]+)パーセント.*?「満足」:([\d.]+)パーセント", text)
    if percent_pair:
        return round(float(percent_pair.group(1)) + float(percent_pair.group(2)), 1)
    if "対象者全員が「大変満足」または「満足」" in text or "回答者全員が満足以上" in text:
        return 100.0
    return None


def parse_detail(item: dict, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    plain = clean(soup.get_text(" ", strip=True))
    title = clean(soup.title.get_text(" ", strip=True) if soup.title else "")
    year_match = re.search(r"(20\d{2})年度", title)
    response_match = re.search(r"有効回答者数/利用者家族総数:\s*(\d+)\s*/\s*(\d+)\s*\(回答率\s*([\d.]+)%", plain)
    survey_comment_node = soup.select_one("#survey-comment-content p")
    survey_comment = clean(survey_comment_node.get_text(" ", strip=True) if survey_comment_node else "")
    good_titles = [clean(x.get_text(" ", strip=True)) for x in soup.select("#summary .type-good .summary-item-title")]
    improve_titles = [clean(x.get_text(" ", strip=True)) for x in soup.select("#summary .type-improvement .summary-item-title")]
    agency = ""
    evaluator = soup.select_one("#evaluator-info .info-card .data")
    if evaluator:
        agency = clean(evaluator.get_text(" ", strip=True))
    result = {
        "name": item["name"], "key": item["key"],
        "siteKey": normalize_name(SITE_NAME_ALIASES.get(item["name"], item["name"])),
        "year": int(year_match.group(1)) if year_match else (item["years"][0] if item["years"] else None),
        "years": item["years"], "agency": agency, "url": item["url"],
        "goodThemes": topic_labels(good_titles), "improveThemes": topic_labels(improve_titles),
    }
    if response_match:
        result.update({"responses": int(response_match.group(1)), "households": int(response_match.group(2)), "responseRate": float(response_match.group(3))})
    satisfaction = satisfaction_percent(survey_comment, result.get("responses"))
    if satisfaction is not None and 0 <= satisfaction <= 100:
        result["satisfaction"] = satisfaction
    return result


def load_detail(item: dict, cache: Path) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / f"{item['evaluationId']}.html"
    if target.exists():
        html = target.read_text(encoding="utf-8")
    else:
        response = requests.get(item["url"], timeout=35, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        html = response.text
        target.write_text(html, encoding="utf-8")
    return parse_detail(item, html)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("lists", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, default=Path("dist/evaluations.js"))
    parser.add_argument("--cache", type=Path, default=Path("/tmp/fukunavi-details"))
    args = parser.parse_args()
    items = []
    seen = set()
    for path in args.lists:
        for item in parse_list(path):
            if item["facilityId"] not in seen:
                items.append(item)
                seen.add(item["facilityId"])
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(load_detail, item, args.cache): item for item in items}
        for future in as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda x: x["name"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("window.FUKUNAVI_DATA=" + json.dumps(results, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"wrote {len(results)} evaluations to {args.output}")


if __name__ == "__main__":
    main()
