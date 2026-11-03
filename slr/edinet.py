"""金融庁 EDINET API（v2）から、有価証券報告書の「主要な経営指標等の推移」を取り出す。

- 利用条件：公共データ利用規約（PDL1.0）。出典（金融庁 EDINET）を明記し、必要な項目を抜き出して加工して利用する。
- APIキー（Subscription-Key）は環境変数 EDINET_API_KEY で渡す。キーはファイルにもログにも書かない。
- 仕様：EDINET API仕様書（Version 2, 2026-06-03更新）、書類閲覧操作ガイド
  - 書類一覧API  : GET /api/v2/documents.json?date=YYYY-MM-DD&type=2
  - 書類取得API  : GET /api/v2/documents/{docID}?type=5  （XBRLをCSVに変換したZIP）
  - CSV         : タブ区切り・UTF-16LE・CRLF・各値は " でくくる。
                  列は 要素ID / 項目名 / コンテキストID / 相対年度 / 連結・個別 / 期間・時点 / ユニットID / 単位 / 値
  - エラーは HTTP 200 のまま JSON {"StatusCode": 401, ...} で返ることがある

注意：APIキーがない状態で作ったため、実データでの動作は未確認。読み取れない項目は空欄のままにする（推測で埋めない）。
"""

from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from datetime import date, timedelta

API = "https://api.edinet-fsa.go.jp/api/v2"
VIEW = "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?"

DOC_ANNUAL = "120"       # 有価証券報告書
DOC_TYPES_SHOWN = {
    "120": "有価証券報告書", "130": "訂正有価証券報告書", "160": "半期報告書", "170": "訂正半期報告書",
    "180": "臨時報告書", "190": "訂正臨時報告書", "220": "自己株券買付状況報告書",
}


class EdinetError(RuntimeError):
    pass


def _check_json_error(body: bytes) -> None:
    """HTTP 200 でも中身がエラーの JSON のことがある。"""
    head = body[:400].lstrip()
    if head.startswith(b"{"):
        try:
            j = json.loads(body.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            return
        code = j.get("StatusCode") or (j.get("metadata") or {}).get("status")
        if code and str(code) not in ("200",):
            raise EdinetError(f"EDINET API エラー {code}: {j.get('message') or (j.get('metadata') or {}).get('message')}")


# ---------------- CSV の読み取り ----------------

def read_csv_bytes(b: bytes) -> list[dict]:
    """EDINET の CSV（UTF-16LE、タブ区切り）を辞書のリストにする。"""
    text = b.decode("utf-16")  # BOM があれば自動で判定
    reader = csv.reader(io.StringIO(text), delimiter="\t", quotechar='"')
    rows = list(reader)
    if not rows:
        return []
    header = [h.strip() for h in rows[0]]
    return [dict(zip(header, r)) for r in rows[1:] if len(r) >= len(header) - 1]


def main_csv_from_zip(blob: bytes) -> list[dict]:
    """ZIPの中から、有価証券報告書の本文（jpcrp）のCSVを探して読む。"""
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        main = [n for n in names if "jpcrp" in n.lower() and "aud" not in n.lower()] or names
        if not main:
            raise EdinetError("ZIPにCSVがありません")
        return read_csv_bytes(z.read(sorted(main)[0]))


# 項目の候補（要素IDの「:」より後ろ）。上から順に優先。見つからなければ項目名のキーワードで探す。
FIELDS = {
    "sales": (["NetSalesSummaryOfBusinessResults", "RevenueIFRSSummaryOfBusinessResults", "RevenuesUSGAAPSummaryOfBusinessResults",
               "OperatingRevenue1SummaryOfBusinessResults", "OperatingRevenue2SummaryOfBusinessResults",
               "NetSalesOfCompletedConstructionContractsSummaryOfBusinessResults"],
              ["売上高", "売上収益", "営業収益", "完成工事高"]),
    "ordinary_income": (["OrdinaryIncomeLossSummaryOfBusinessResults", "ProfitLossBeforeTaxIFRSSummaryOfBusinessResults",
                         "ProfitLossBeforeTaxUSGAAPSummaryOfBusinessResults", "IncomeLossBeforeIncomeTaxesUSGAAPSummaryOfBusinessResults"],
                        ["経常利益", "税引前利益", "税引前当期利益"]),
    "net_income": (["ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",
                    "ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults",
                    "NetIncomeLossAttributableToOwnersOfParentUSGAAPSummaryOfBusinessResults",
                    "NetIncomeLossSummaryOfBusinessResults"],
                   ["親会社株主に帰属する当期純利益", "親会社の所有者に帰属する当期利益", "当期純利益"]),
    "eps": (["BasicEarningsLossPerShareSummaryOfBusinessResults", "BasicEarningsLossPerShareIFRSSummaryOfBusinessResults",
             "BasicEarningsLossPerShareUSGAAPSummaryOfBusinessResults"],
            ["1株当たり当期純利益", "基本的1株当たり当期利益", "１株当たり当期純利益"]),
    "bps": (["NetAssetsPerShareSummaryOfBusinessResults", "EquityAttributableToOwnersOfParentPerShareIFRSSummaryOfBusinessResults",
             "EquityAttributableToOwnersOfParentPerShareUSGAAPSummaryOfBusinessResults"],
            ["1株当たり純資産額", "1株当たり親会社所有者帰属持分", "１株当たり純資産額"]),
    "equity_ratio": (["EquityToAssetRatioSummaryOfBusinessResults", "RatioOfOwnersEquityToGrossAssetsIFRSSummaryOfBusinessResults",
                      "RatioOfOwnersEquityToGrossAssetsUSGAAPSummaryOfBusinessResults"],
                     ["自己資本比率", "親会社所有者帰属持分比率"]),
    "roe": (["RateOfReturnOnEquitySummaryOfBusinessResults", "RateOfReturnOnEquityIFRSSummaryOfBusinessResults",
             "RateOfReturnOnEquityUSGAAPSummaryOfBusinessResults"],
            ["自己資本利益率", "親会社所有者帰属持分当期利益率"]),
    "per": (["PriceEarningsRatioSummaryOfBusinessResults", "PriceEarningsRatioIFRSSummaryOfBusinessResults",
             "PriceEarningsRatioUSGAAPSummaryOfBusinessResults"],
            ["株価収益率"]),
    "dps": (["DividendPaidPerShareSummaryOfBusinessResults"], ["1株当たり配当額", "１株当たり配当額"]),
    "payout_ratio": (["PayoutRatioSummaryOfBusinessResults"], ["配当性向"]),
    "tsr": (["TotalShareholderReturn"], ["株主総利回り"]),
}
_WORDS = sorted(((w, k) for k, (_, ws) in FIELDS.items() for w in ws), key=lambda x: -len(x[0]))
# 割合（XBRLでは 0.378 のような小数で入っていることが多い）→ ％に直す項目
PERCENT_FIELDS = {"equity_ratio", "roe", "payout_ratio"}
# 単体（提出会社）の数字しかない項目
NONCONS_FIELDS = {"dps", "payout_ratio", "tsr", "tsr_index"}

_CTX = re.compile(r"^(CurrentYear|Prior(\d)Year)(Duration|Instant)(_NonConsolidatedMember)?$")


def _ctx(context_id: str):
    m = _CTX.match(context_id or "")
    if not m:
        return None
    offset = 0 if m.group(1) == "CurrentYear" else int(m.group(2))
    return offset, bool(m.group(4))


def _num(v: str):
    v = (v or "").strip().replace(",", "")
    if v in ("", "-", "－", "―", "—"):
        return None
    neg = v.startswith(("△", "▲"))
    v = v.lstrip("△▲")
    try:
        x = float(v)
    except ValueError:
        return None
    return -x if neg else x


def _fy_label(period_end: str, offset: int) -> str:
    d = date.fromisoformat(period_end[:10])
    return f"{d.year - offset:04d}/{d.month:02d}"


def extract_summary(rows: list[dict], period_end: str) -> dict:
    """主要な経営指標等の推移（最大5年分）を取り出す。

    戻り値: {"history": [{"fy": "2022/03", "sales": ..., ...}, ...（古い順）], "tsr_index_name": "..."}
    """
    vals: dict[tuple[str, int, bool], float] = {}
    index_name = None
    for r in rows:
        el = (r.get("要素ID") or "").split(":")[-1]
        label = r.get("項目名") or ""
        c = _ctx(r.get("コンテキストID") or "")
        if c is None:
            continue
        offset, noncons = c
        summary = el.endswith("SummaryOfBusinessResults") or "経営指標等" in label or "TotalShareholderReturn" in el
        if not summary:
            continue
        v = _num(r.get("値"))
        if v is None:
            continue
        field = None
        # 比較指標（株主総利回りの比べる相手）
        if "比較指標" in label or ("TotalShareholderReturn" in el and re.search(r"Index|Comparative|Benchmark|Indicator", el)):
            field = "tsr_index"
            m = re.search(r"比較指標[：:\s]*([^、,（(]+)", label)
            if m and m.group(1).strip():
                index_name = m.group(1).strip()
        else:
            for key, (elements, words) in FIELDS.items():
                if el in elements:
                    field = key
                    break
            if field is None:
                # 「1株当たり当期純利益」を「当期純利益」と取り違えないよう、長いキーワードから判定
                for word, key in _WORDS:
                    if word in label:
                        field = key
                        break
        if field is None:
            continue
        k = (field, offset, noncons)
        if k not in vals:
            vals[k] = v
    hist = []
    for offset in range(4, -1, -1):
        rec = {"fy": _fy_label(period_end, offset)}
        any_val = False
        for field in list(FIELDS) + ["tsr_index"]:
            if field in NONCONS_FIELDS:
                v = vals.get((field, offset, True), vals.get((field, offset, False)))
            else:
                v = vals.get((field, offset, False), vals.get((field, offset, True)))
            if v is not None:
                if field in PERCENT_FIELDS and abs(v) <= 1.5:
                    v = v * 100
                if field in ("tsr", "tsr_index") and abs(v) <= 20:
                    v = v * 100
                any_val = True
            rec[field] = v
        if any_val:
            hist.append(rec)
    return {"history": hist, "tsr_index_name": index_name}


# ---------------- 書類一覧の走査と取得 ----------------

def _get(client, path: str, key: str, ttl: float):
    url = f"{API}{path}"
    body = client.get(url, ttl=ttl, secret_params={"Subscription-Key": key})
    _check_json_error(body)
    return body


def scan_documents(client, key: str, codes: set[str], start: date, end: date, log=print) -> list[dict]:
    """start〜end の各日の提出書類一覧から、codes（EDINETコード）の会社の書類を集める。土日は飛ばす。"""
    found = []
    d = start
    today = date.today()
    while d <= end:
        if d.weekday() < 5:
            ttl = 6 * 3600 if (today - d).days < 3 else 60 * 86400
            body = _get(client, f"/documents.json?date={d.isoformat()}&type=2", key, ttl)
            j = json.loads(body.decode("utf-8"))
            for r in j.get("results") or []:
                if r.get("edinetCode") in codes and r.get("withdrawalStatus") in (None, "0") and r.get("docTypeCode") in DOC_TYPES_SHOWN:
                    found.append({k: r.get(k) for k in ("docID", "edinetCode", "docTypeCode", "docDescription", "submitDateTime", "periodEnd", "csvFlag")})
        d += timedelta(days=1)
    log(f"EDINET: {start}〜{end} の書類一覧から {len(found)} 件")
    return found


def update(client, key: str, companies: dict, data: dict, today: date, log=print, warn=print, max_days: int = 60) -> dict:
    """financials.json の中身（data）を更新して返す。"""
    data = dict(data or {})
    state = data.setdefault("state", {})
    docs = data.setdefault("docs", {})          # edinetCode -> [書類]
    out = data.setdefault("data", {})            # 証券コード -> {history, filings, source, docID}
    code_by_edinet = {v["edinet_code"]: c for c, v in companies.items() if v.get("edinet_code")}
    if not code_by_edinet:
        warn("EDINETコードが分からないため、決算データを取得できません")
        return data
    last = state.get("scanned_until")
    start = today - timedelta(days=max_days)
    if last:
        start = max(start, date.fromisoformat(last) + timedelta(days=1))
    if start <= today:
        new = scan_documents(client, key, set(code_by_edinet), start, today, log=log)
        for r in new:
            lst = docs.setdefault(r["edinetCode"], [])
            if all(x["docID"] != r["docID"] for x in lst):
                lst.append(r)
        state["scanned_until"] = today.isoformat()
        state.setdefault("scanned_from", start.isoformat())
        if start.isoformat() < state["scanned_from"]:
            state["scanned_from"] = start.isoformat()
    # 会社ごとに、最新の有価証券報告書を読む
    for ecode, sec in code_by_edinet.items():
        lst = sorted(docs.get(ecode, []), key=lambda x: x.get("submitDateTime") or "", reverse=True)
        filings = [{"date": (x.get("submitDateTime") or "")[:10], "title": x.get("docDescription") or DOC_TYPES_SHOWN.get(x.get("docTypeCode"), ""),
                    "url": VIEW + x["docID"]} for x in lst[:12]]
        rec = out.setdefault(sec, {})
        rec["filings"] = filings
        annual = next((x for x in lst if x.get("docTypeCode") == DOC_ANNUAL and x.get("csvFlag") == "1" and x.get("periodEnd")), None)
        if not annual or rec.get("docID") == annual["docID"]:
            continue
        try:
            blob = _get(client, f"/documents/{annual['docID']}?type=5", key, 365 * 86400)
            summary = extract_summary(main_csv_from_zip(blob), annual["periodEnd"])
        except Exception as e:  # noqa: BLE001
            warn(f"{sec}: 有価証券報告書（{annual['docID']}）を読み取れませんでした: {e}")
            continue
        if not summary["history"]:
            warn(f"{sec}: 有価証券報告書から主要な経営指標を見つけられませんでした（{annual['docID']}）")
            continue
        rec.update({"history": summary["history"], "tsr_index_name": summary["tsr_index_name"], "docID": annual["docID"],
                    "source": f"金融庁 EDINET（有価証券報告書 {annual.get('periodEnd', '')[:7]}期, {annual['docID']}）"})
        for h in rec["history"]:
            h["tsr_index_name"] = summary["tsr_index_name"]
    data["fetched_at"] = today.isoformat()
    data["source"] = "金融庁 EDINET API（公共データ利用規約 PDL1.0）"
    return data
