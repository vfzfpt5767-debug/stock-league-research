"""EDINET の読み取りのテスト。実データの代わりに、仕様書どおりの形式（UTF-16LE・タブ区切り）で作った見本を使う。"""

import io
import json
import zipfile
from datetime import date

import pytest

from slr import edinet

HEADER = ["要素ID", "項目名", "コンテキストID", "相対年度", "連結・個別", "期間・時点", "ユニットID", "単位", "値"]


def make_csv(rows):
    lines = ["\t".join(f'"{h}"' for h in HEADER)]
    for r in rows:
        lines.append("\t".join(f'"{x}"' for x in r))
    return ("﻿" + "\r\n".join(lines) + "\r\n").encode("utf-16-le")


def row(el, label, ctx, val, unit="JPY"):
    return [el, label, ctx, "", "", "", unit, "円", val]


JGAAP_ROWS = [
    # 連結（5年分）
    *[row("jpcrp_cor:NetSalesSummaryOfBusinessResults", "売上高、経営指標等", c, v) for c, v in
      [("Prior4YearDuration", "1000"), ("Prior3YearDuration", "1100"), ("Prior2YearDuration", "1210"), ("Prior1YearDuration", "1300"), ("CurrentYearDuration", "1331")]],
    row("jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults", "経常利益又は経常損失（△）、経営指標等", "CurrentYearDuration", "150"),
    row("jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults", "親会社株主に帰属する当期純利益又は親会社株主に帰属する当期純損失（△）、経営指標等", "CurrentYearDuration", "△20"),
    row("jpcrp_cor:BasicEarningsLossPerShareSummaryOfBusinessResults", "１株当たり当期純利益又は当期純損失（△）、経営指標等", "CurrentYearDuration", "-12.5", "JPYPerShares"),
    row("jpcrp_cor:EquityToAssetRatioSummaryOfBusinessResults", "自己資本比率、経営指標等", "CurrentYearInstant", "0.378", "pure"),
    row("jpcrp_cor:RateOfReturnOnEquitySummaryOfBusinessResults", "自己資本利益率、経営指標等", "CurrentYearDuration", "-0.021", "pure"),
    row("jpcrp_cor:PriceEarningsRatioSummaryOfBusinessResults", "株価収益率、経営指標等", "CurrentYearDuration", "-", "pure"),
    # 提出会社（単体）
    row("jpcrp_cor:NetSalesSummaryOfBusinessResults", "売上高、経営指標等", "CurrentYearDuration_NonConsolidatedMember", "999"),
    row("jpcrp_cor:DividendPaidPerShareSummaryOfBusinessResults", "１株当たり配当額、経営指標等", "CurrentYearDuration_NonConsolidatedMember", "95", "JPYPerShares"),
    row("jpcrp_cor:PayoutRatioSummaryOfBusinessResults", "配当性向、経営指標等", "CurrentYearDuration_NonConsolidatedMember", "0.331", "pure"),
    row("jpcrp_cor:TotalShareholderReturn", "株主総利回り", "Prior1YearDuration_NonConsolidatedMember", "1.40", "pure"),
    row("jpcrp_cor:TotalShareholderReturn", "株主総利回り", "CurrentYearDuration_NonConsolidatedMember", "1.68", "pure"),
    row("jpcrp030000-asr_E00000-000:ComparativeIndexTotalShareholderReturn", "比較指標：配当込みTOPIX", "Prior1YearDuration_NonConsolidatedMember", "1.50", "pure"),
    row("jpcrp030000-asr_E00000-000:ComparativeIndexTotalShareholderReturn", "比較指標：配当込みTOPIX", "CurrentYearDuration_NonConsolidatedMember", "1.80", "pure"),
    # 経営指標ではない行は無視する
    row("jppfs_cor:NetSales", "売上高", "CurrentYearDuration", "123456"),
]


def test_read_csv_and_extract_summary():
    rows = edinet.read_csv_bytes(make_csv(JGAAP_ROWS))
    assert rows[0]["要素ID"].endswith("NetSalesSummaryOfBusinessResults")
    s = edinet.extract_summary(rows, "2026-03-31")
    h = {x["fy"]: x for x in s["history"]}
    assert list(h) == ["2022/03", "2023/03", "2024/03", "2025/03", "2026/03"]
    cur = h["2026/03"]
    assert cur["sales"] == 1331  # 連結を優先（単体の999ではない）
    assert cur["net_income"] == -20  # △ はマイナス
    assert cur["eps"] == -12.5  # 「当期純利益」と取り違えない
    assert cur["equity_ratio"] == pytest.approx(37.8)  # 小数→％
    assert cur["roe"] == pytest.approx(-2.1)
    assert cur["per"] is None  # 「-」は空欄
    assert cur["dps"] == 95 and cur["payout_ratio"] == pytest.approx(33.1)
    assert cur["tsr"] == pytest.approx(168) and cur["tsr_index"] == pytest.approx(180)
    assert h["2025/03"]["tsr"] == pytest.approx(140)
    assert s["tsr_index_name"] == "配当込みTOPIX"


def test_ifrs_labels_fallback():
    rows = edinet.read_csv_bytes(make_csv([
        row("jpcrp_cor:RevenueIFRSSummaryOfBusinessResults", "売上収益（IFRS）、経営指標等", "CurrentYearDuration", "5000"),
        row("jpcrp_cor:SomethingNewSummaryOfBusinessResults", "親会社の所有者に帰属する当期利益（IFRS）、経営指標等", "CurrentYearDuration", "300"),
        row("jpcrp_cor:AnotherSummaryOfBusinessResults", "基本的1株当たり当期利益（IFRS）、経営指標等", "CurrentYearDuration", "45.6"),
    ]))
    cur = edinet.extract_summary(rows, "2025-12-31")["history"][-1]
    assert cur["fy"] == "2025/12"
    assert cur["sales"] == 5000 and cur["net_income"] == 300 and cur["eps"] == 45.6


def test_json_error_is_detected():
    with pytest.raises(edinet.EdinetError):
        edinet._check_json_error(b'{"StatusCode": 401,"message": "Access denied due to invalid subscription key."}')
    edinet._check_json_error(b'{"metadata": {"status": "200"}, "results": []}')
    edinet._check_json_error(b"PK\x03\x04binary")


class FakeClient:
    """EDINET API の代わり。日付ごとの書類一覧と、書類のZIPを返す。"""

    def __init__(self, lists, zips):
        self.lists, self.zips, self.calls = lists, zips, []

    def get(self, url, ttl=None, secret_params=None):
        assert secret_params == {"Subscription-Key": "KEY"}
        assert "KEY" not in url
        self.calls.append(url)
        if "documents.json" in url:
            d = url.split("date=")[1][:10]
            return json.dumps({"metadata": {"status": "200"}, "results": self.lists.get(d, [])}).encode()
        doc = url.split("/documents/")[1].split("?")[0]
        return self.zips[doc]


def make_zip(csv_bytes):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("XBRL_TO_CSV/jpcrp030000-asr-001_E02144-000_2026-03-31_01_2026-06-20.csv", csv_bytes)
        z.writestr("XBRL_TO_CSV/jpaud-aar-cn-001_E02144-000_2026-03-31_01_2026-06-20.csv", make_csv([]))
    return buf.getvalue()


def test_update_flow():
    lists = {
        "2026-06-19": [  # 金曜
            {"docID": "S100AAAA", "edinetCode": "E02144", "docTypeCode": "120", "docDescription": "有価証券報告書－第122期", "submitDateTime": "2026-06-19 15:00", "periodEnd": "2026-03-31", "csvFlag": "1", "withdrawalStatus": "0"},
            {"docID": "S100ZZZZ", "edinetCode": "E99999", "docTypeCode": "120", "submitDateTime": "2026-06-19 15:00", "periodEnd": "2026-03-31", "csvFlag": "1"},
        ],
        "2026-06-22": [
            {"docID": "S100BBBB", "edinetCode": "E02144", "docTypeCode": "180", "docDescription": "臨時報告書", "submitDateTime": "2026-06-22 10:00", "csvFlag": "0", "withdrawalStatus": "0"},
        ],
    }
    client = FakeClient(lists, {"S100AAAA": make_zip(make_csv(JGAAP_ROWS))})
    companies = {"7203": {"edinet_code": "E02144"}}
    data = edinet.update(client, "KEY", companies, {}, date(2026, 6, 23), max_days=10)
    # 土日（6/20, 6/21）は問い合わせない
    days = [u.split("date=")[1][:10] for u in client.calls if "documents.json" in u]
    assert "2026-06-20" not in days and "2026-06-21" not in days and "2026-06-19" in days
    rec = data["data"]["7203"]
    assert rec["docID"] == "S100AAAA" and rec["history"][-1]["sales"] == 1331
    assert [f["title"] for f in rec["filings"]] == ["臨時報告書", "有価証券報告書－第122期"]
    assert rec["filings"][0]["url"].endswith("S100BBBB")
    assert data["state"]["scanned_until"] == "2026-06-23"
    # 2回目：新しい日だけ調べ、読んだ書類は読み直さない
    client.calls.clear()
    data = edinet.update(client, "KEY", companies, data, date(2026, 6, 24), max_days=10)
    assert all("S100AAAA" not in u for u in client.calls)
    assert [u.split("date=")[1][:10] for u in client.calls] == ["2026-06-24"]
