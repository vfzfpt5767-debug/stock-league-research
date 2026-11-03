"""config/ の CSV のチェック。グループのメンバーが CSV を編集したときに、
書き間違いがあれば GitHub Actions のテストで気づけるようにする。"""

from collections import Counter

import pytest

from slr.config import ConfigError, group_by_code, load_rules, load_stocks, load_themes


def test_themes_load():
    themes = load_themes()
    ids = [t["id"] for t in themes]
    assert len(ids) == len(set(ids))
    assert {"resources", "decarbon", "raremetal", "semicon", "energy"} <= set(ids)


def test_stocks_load_and_counts():
    themes = load_themes()
    rows = load_stocks(themes)
    counts = Counter(r["theme_id"] for r in rows)
    for t in themes:
        if t["enabled"]:
            # 依頼: 各テーマ15〜30社程度
            assert 15 <= counts[t["id"]] <= 30, (t["id"], counts[t["id"]])
    for r in rows:
        assert r["reason"], r
        assert r["source_url"].startswith("https://"), r


def test_group_by_code_merges_multi_theme():
    themes = load_themes()
    grouped = group_by_code(load_stocks(themes))
    # 富士電機は複数テーマに入っている
    assert len(grouped["6504"]["themes"]) >= 2
    assert set(grouped["6504"]["reasons"]) == set(grouped["6504"]["themes"])


def test_rules():
    rules = load_rules()
    p = rules["portfolio"]
    assert p["budget_yen"] == 5_000_000
    assert (p["min_stocks"], p["max_stocks"]) == (10, 20)
    assert p["fee_rate"] == 0.01 and p["fee_tax_rate"] == 0.10
    for item in rules["items"]:
        assert item["status"] in ("確認済み", "未確認")
        if item["status"] == "確認済み":
            assert item["source"].startswith("https://")


def test_bad_csv_is_reported(tmp_path):
    themes = load_themes()
    bad = tmp_path / "stocks.csv"
    bad.write_text("theme_id,code,name,reason,business,source_title,source_url,note\n"
                   "resources,72O3,トヨタ,理由,,,https://example.com,\n", encoding="utf-8")
    with pytest.raises(ConfigError) as e:
        load_stocks(themes, bad)
    assert "証券コード" in str(e.value)
    bad.write_text("theme_id,code,name,reason,business,source_title,source_url,note\n"
                   "nosuch,7203,トヨタ,理由,,,https://example.com,\n", encoding="utf-8")
    with pytest.raises(ConfigError):
        load_stocks(themes, bad)
