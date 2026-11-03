"""ネットに出ずに、データ作成の全体（会社情報・決算の要約・テーマの集計）を通しで確かめる。"""

import json
from argparse import Namespace

import pytest

from slr import build


@pytest.fixture
def tmp_data(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setattr(build, "DOCS_DATA", data)
    return data


def args(**kw):
    base = dict(offline=True, skip_financials=False, skip_jpx=True, delay=0.0, max_requests=0, edinet_max_days=0)
    base.update(kw)
    return Namespace(**base)


def test_offline_build(tmp_data):
    (tmp_data / "companies.json").write_text(json.dumps({"fetched_at": "2026-11-03", "data": {
        "7203": {"edinet_code": "E02144", "listed": True, "name": "トヨタ自動車株式会社", "industry": "輸送用機器", "fiscal_year_end": "3月31日"},
    }}), encoding="utf-8")
    (tmp_data / "financials.json").write_text(json.dumps({"fetched_at": "2026-11-01", "data": {"7203": {
        "source": "EDINET",
        "history": [
            {"fy": "2023/03", "sales": 100.0, "operating_income": 10.0, "net_income": 5.0, "tsr": 110.0, "tsr_index": 105.0},
            {"fy": "2024/03", "sales": 110.0, "operating_income": 11.0, "net_income": 6.0, "tsr": 150.0, "tsr_index": 140.0},
            {"fy": "2025/03", "sales": 121.0, "operating_income": 12.0, "net_income": 7.0, "tsr": 140.0, "tsr_index": 150.0},
            {"fy": "2026/03", "sales": 133.1, "operating_income": 13.0, "net_income": -1.0, "tsr": 168.0, "tsr_index": 180.0},
        ],
        "filings": [{"date": "2026-06-20", "title": "有価証券報告書－第122期", "url": "https://example.org/doc"}],
    }}}), encoding="utf-8")

    build.Builder(args()).run()

    stocks = {s["code"]: s for s in json.loads((tmp_data / "stocks.json").read_text(encoding="utf-8"))}
    t = stocks["7203"]
    assert t["industry"] == "輸送用機器" and t["edinet_code"] == "E02144"
    assert t["fin"]["sales_cagr_3y"] == pytest.approx(0.10)
    assert t["fin"]["profit_years_negative"] == 1
    assert t["fin"]["tsr_1y"] == pytest.approx(168 / 140 - 1)
    assert t["fin"]["tsr_1y_index"] == pytest.approx(180 / 150 - 1)
    assert t["fin"]["tsr_3y"] == pytest.approx(168 / 110 - 1)
    assert len(t["fin_history"]) == 4 and t["filings"][0]["title"].startswith("有価証券報告書")
    # データがない銘柄は空欄（推測で埋めない）
    assert stocks["1605"]["fin_history"] == [] and stocks["1605"]["industry"] is None
    # 株価などの市場データは出さない
    assert "price" not in t and "market_cap" not in t

    themes = {x["id"]: x for x in json.loads((tmp_data / "themes.json").read_text(encoding="utf-8"))}
    assert themes["decarbon"]["with_fin"] == 1 and themes["decarbon"]["loss_making"] == 1
    meta = json.loads((tmp_data / "meta.json").read_text(encoding="utf-8"))
    assert meta["counts"]["with_fin"] == 1 and meta["fin_latest_fy"] == "2026/03"
