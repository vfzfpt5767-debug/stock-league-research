"""IR BANK（https://irbank.net/）のページ・CSV を読み取る。

利用条件（2026-11-03 確認）:
- robots.txt は全体を許可（Allow: /）。
- ダウンロードページに「Web公開で利用の際はリンク必須」「過剰アクセス禁止」と明記。
  → サイトの各ページに IR BANK へのリンクを付け、アクセスは3秒以上あける。
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date

from bs4 import BeautifulSoup

from .numbers import jp_amount, to_float

BASE = "https://irbank.net"
FILES = "https://f.irbank.net/files"


def chart_url(code: str, mw: int | None = None, y: str | None = None) -> str:
    """株価ページの URL。mw=1 で週足、mw=2 で月足。y=YYYY-MM-DD でその日までの表。"""
    params = []
    if y:
        params.append(f"y={y}")
    if mw:
        params.append(f"mw={mw}")
    q = ("?" + "&".join(params)) if params else ""
    return f"{BASE}/{code}/chart{q}"


def ir_url(code: str) -> str:
    return f"{BASE}/{code}/ir"


def company_url(code: str) -> str:
    return f"{BASE}/{code}"


_HEADER_KEYS = {
    "時価": "market_cap",
    "PER": "per",
    "PBR": "pbr",
    "配当": "dividend_yield",
    "ROE": "roe",
    "ROA": "roa",
}


def parse_header(soup: BeautifulSoup) -> dict:
    """ページ上部の指標（時価総額・PER・PBR・配当利回りなど）を読む。"""
    out: dict = {}
    dl = soup.select_one("#chb dl")
    if dl is None:
        return out
    dts = dl.find_all("dt")
    for i, dt in enumerate(dts):
        label_full = dt.get_text("", strip=True)
        forecast = "予" in label_full
        label = label_full.replace("予", "").replace(" ", "").strip()
        dd = dt.find_next_sibling("dd")
        if dd is None:
            continue
        value = dd.get_text("", strip=True)
        if i == 0:
            # 最初の dt は証券コード、dd はデータの日付
            m = re.search(r"(\d{4})/(\d{2})/(\d{2})", value)
            if m:
                out["date"] = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
            continue
        key = _HEADER_KEYS.get(label)
        if not key or key in out:
            continue
        if key == "market_cap":
            out[key] = jp_amount(value)
        else:
            out[key] = to_float(value)
            out[key + "_forecast"] = forecast
    return out


def parse_price_rows(soup: BeautifulSoup) -> list[dict]:
    """株価の表（#tbc）を読む。日付はリンク先の ?y=YYYY-MM-DD から取る。"""
    rows: list[dict] = []
    table = soup.select_one("#tbc")
    if table is None:
        return rows
    for tr in table.select("tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        a = tds[0].find("a")
        href = a.get("href", "") if a else ""
        m = re.search(r"y=(\d{4}-\d{2}-\d{2})", href)
        if not m:
            continue
        close = to_float(tds[4].get_text("", strip=True))
        if close is None:
            continue
        rows.append(
            {
                "date": m.group(1),
                "open": to_float(tds[1].get_text("", strip=True)),
                "high": to_float(tds[2].get_text("", strip=True)),
                "low": to_float(tds[3].get_text("", strip=True)),
                "close": close,
                "volume": to_float(tds[6].get_text("", strip=True)),
            }
        )
    rows.sort(key=lambda r: r["date"])
    return rows


def parse_chart_page(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else ""
    m = re.match(r"(.+?)（", title)
    return {
        "name": m.group(1).strip() if m else None,
        "header": parse_header(soup),
        "rows": parse_price_rows(soup),
    }


def parse_ir_page(html: str, limit: int = 15) -> list[dict]:
    """適時開示などの一覧（dl.sdl）を新しい順に読む。"""
    soup = BeautifulSoup(html, "lxml")
    out: list[dict] = []
    for dl in soup.select("dl.sdl"):
        current = None
        for el in dl.children:
            name = getattr(el, "name", None)
            if name == "dt":
                m = re.search(r"(\d{4})/(\d{2})/(\d{2})", el.get_text())
                current = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None
            elif name == "dd" and current:
                a = el.find("a")
                if not a:
                    continue
                title = a.get_text(" ", strip=True)
                title = re.sub(r"（\d{1,2}:\d{2}）$", "", title).strip()
                href = a.get("href", "")
                url = href if href.startswith("http") else BASE + href
                out.append({"date": current, "title": title, "url": url})
                if len(out) >= limit:
                    return out
        if out:
            break
    return out


# ---- 決算データ（全銘柄一括 CSV） -------------------------------------------------

FIN_FILES = {
    "pl": "fy-profit-and-loss.csv",
    "bs": "fy-balance-sheet.csv",
    "div": "fy-stock-dividend.csv",
}
FIN_FOLDERS = ["0000", "0025", "0024", "0023"]
# 取得するファイル（種類, 年度フォルダ）。0000=最新、0025=2025年度…。相手の負荷を考えて最小限にする
FIN_PLAN = [
    ("pl", "0000"), ("pl", "0025"), ("pl", "0024"), ("pl", "0023"),
    ("bs", "0000"), ("bs", "0025"),
    ("div", "0000"), ("div", "0025"),
]


def fin_url(folder: str, kind: str) -> str:
    return f"{FILES}/{folder}/{FIN_FILES[kind]}"


_FIN_COLUMNS = {
    "pl": {"売上高": "sales", "営業利益": "operating_income", "経常利益": "ordinary_income",
           "純利益": "net_income", "EPS": "eps", "ROE": "roe", "ROA": "roa"},
    "bs": {"総資産": "total_assets", "純資産": "net_assets", "BPS": "bps", "自己資本比率": "equity_ratio"},
    "div": {"一株配当": "dps", "配当性向": "payout_ratio"},
}


def parse_fin_csv(text: str, kind: str, codes: set[str] | None = None) -> dict[str, dict[str, dict]]:
    """IR BANK の決算 CSV を {code: {年度: {項目: 値}}} にする。

    ファイルの1行目はタイトル（例: 業績）、2行目は空行、3行目が見出し。
    """
    text = text.lstrip("﻿")
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines) if ln.startswith("コード,")), None)
    if start is None:
        return {}
    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])))
    cols = _FIN_COLUMNS[kind]
    out: dict[str, dict[str, dict]] = {}
    for row in reader:
        code = (row.get("コード") or "").strip()
        fy = (row.get("年度") or "").strip()
        if not code or not fy or (codes is not None and code not in codes):
            continue
        rec = {}
        for jp, key in cols.items():
            rec[key] = to_float(row.get(jp))
        out.setdefault(code, {})[fy] = rec
    return out


def merge_fin(target: dict, part: dict, kind: str) -> None:
    """複数年度のファイルをまとめる。同じ年度は先に入れたもの（新しいファイル）を優先。"""
    for code, years in part.items():
        for fy, rec in years.items():
            slot = target.setdefault(code, {}).setdefault(fy, {})
            for k, v in rec.items():
                if slot.get(k) is None and v is not None:
                    slot[k] = v


def today_iso() -> str:
    return date.today().isoformat()
