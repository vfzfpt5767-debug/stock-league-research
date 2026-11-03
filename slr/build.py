"""データを集めて docs/data/ に JSON を書き出す。

使い方:
    python -m slr.build            # ふだんの更新
    python -m slr.build --offline  # ネットに出ず、手元のキャッシュと既存データだけで作り直す

公開してよいデータだけを書き出す（どのデータ源を使い、どれを使わないかは DECISIONS.md）。
- 業種・決算日・EDINETコード：金融庁 EDINET コードリスト（公共データ利用規約 PDL1.0）
- 決算の数字（売上・利益・1株配当・株主総利回りなど）：金融庁 EDINET API（環境変数 EDINET_API_KEY があるときだけ）
株価・時価総額・PER などの市場データは、規約上問題なく取得・公開できるデータ源がないため扱わない。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import metrics, sources
from .config import ROOT, group_by_code, load_rules, load_stocks, load_themes
from .http import PoliteClient

DOCS_DATA = ROOT / "docs" / "data"
JST = timezone(timedelta(hours=9))
COMPANY_REFRESH_DAYS = 7  # EDINETコードリストを取り直す間隔


def now_jst() -> datetime:
    return datetime.now(JST)


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def older_than(iso: str | None, days: int, today: date) -> bool:
    if not iso:
        return True
    try:
        return (today - date.fromisoformat(iso[:10])).days >= days
    except ValueError:
        return True


class Builder:
    def __init__(self, args):
        self.args = args
        self.today = now_jst().date()
        self.client = PoliteClient(
            cache_dir=ROOT / ".cache" / "http",
            min_interval=args.delay,
            max_requests=args.max_requests,
            offline=args.offline,
            log=self.log,
        )
        self.warnings: list[str] = []
        self.listing_ok: dict[str, bool] = {}
        self.fin: dict[str, dict] = {}

    def log(self, *a):
        print(*a, flush=True)

    def warn(self, msg: str):
        self.warnings.append(msg)
        self.log("WARN:", msg)

    # ---------------- 設定 ----------------
    def load_config(self):
        self.themes = load_themes()
        self.rules = load_rules()
        self.stock_rows = load_stocks(self.themes)
        self.stocks = group_by_code(self.stock_rows)
        self.log(f"themes={len([t for t in self.themes if t['enabled']])} stocks={len(self.stocks)}")

    # ---------------- 会社情報（EDINET）と上場チェック（JPX） ----------------
    def update_companies(self):
        path = DOCS_DATA / "companies.json"
        data = read_json(path, {"fetched_at": None, "data": {}})
        missing = [c for c in self.stocks if c not in data["data"]]
        if self.args.offline or (not older_than(data.get("fetched_at"), COMPANY_REFRESH_DAYS, self.today) and not missing):
            self.companies = data["data"]
            return
        try:
            blob = self.client.get(sources.EDINET_CODELIST_URL, ttl=7 * 86400)
            allc = sources.parse_edinet_codelist(blob)
            data = {"fetched_at": self.today.isoformat(),
                    "source": "EDINETコードリスト（金融庁）PDL1.0",
                    "data": {c: allc[c] for c in self.stocks if c in allc}}
            write_json(path, data)
            for c in self.stocks:
                info = allc.get(c)
                if info is None:
                    self.warn(f"{c} {self.stocks[c]['name']}: EDINETコードリストに見つかりません")
                elif not info.get("listed"):
                    self.warn(f"{c} {self.stocks[c]['name']}: EDINETで「非上場」になっています（上場廃止の可能性）")
        except Exception as e:  # noqa: BLE001
            self.warn(f"EDINETコードリストを取得できませんでした: {e}")
        self.companies = data["data"]

    def check_listing(self):
        """JPX 一覧で上場しているかを確認（警告を出すだけ。JPXのデータは保存も公開もしない）。"""
        if self.args.offline or self.args.skip_jpx:
            return
        try:
            blob = self.client.get(sources.JPX_LIST_URL, ttl=7 * 86400)
            codes = sources.parse_jpx_codes(blob)
        except Exception as e:  # noqa: BLE001
            self.warn(f"JPXの上場銘柄一覧でのチェックをスキップしました: {e}")
            return
        for c in self.stocks:
            seg = codes.get(c)
            ok = bool(seg) and sources.is_domestic_stock(seg)
            self.listing_ok[c] = ok
            if not ok:
                self.warn(f"{c} {self.stocks[c]['name']}: JPXの上場銘柄一覧（国内株式）に見つかりません。CSVのコードを確認してください")

    # ---------------- 決算（EDINET API、キーがあるときだけ） ----------------
    def update_financials(self):
        path = DOCS_DATA / "financials.json"
        data = read_json(path, {"fetched_at": None, "data": {}})
        self.fin = data.get("data", {})
        key = os.environ.get("EDINET_API_KEY", "").strip()
        if self.args.offline or self.args.skip_financials:
            return
        if not key:
            self.log("EDINET_API_KEY がないため、決算データの取得はスキップします")
            return
        try:
            from . import edinet
        except ImportError:
            return
        try:
            data = edinet.update(self.client, key, self.companies, data, self.today, log=self.log, warn=self.warn,
                                 max_days=self.args.edinet_max_days)
            write_json(path, data)
            self.fin = data.get("data", {})
        except Exception as e:  # noqa: BLE001
            self.warn(f"EDINETから決算データを取得できませんでした: {e}")

    # ---------------- 書き出し ----------------
    def compute(self):
        out = []
        for code, s in self.stocks.items():
            comp = self.companies.get(code, {})
            f = self.fin.get(code) or {}
            hist = f.get("history", [])
            fin = metrics.fin_summary({h["fy"]: h for h in hist}) if hist else {"history": []}
            rec = {
                "code": code,
                "name": s["name"],
                "themes": s["themes"],
                "reasons": s["reasons"],
                "business": s["business"],
                "industry": comp.get("industry"),
                "fiscal_year_end": comp.get("fiscal_year_end"),
                "edinet_code": comp.get("edinet_code"),
                "listed_check": self.listing_ok.get(code),
                "fin_history": fin.pop("history", []),
                "fin": fin,
                "fin_source": f.get("source"),
                "filings": f.get("filings", [])[:12],
            }
            out.append(rec)
        self.stocks_out = out

    def theme_summary(self):
        out = []
        by_code = {s["code"]: s for s in self.stocks_out}
        for t in self.themes:
            if not t["enabled"]:
                continue
            members = [by_code[r["code"]] for r in self.stock_rows if r["theme_id"] == t["id"] and r["code"] in by_code]

            def col(key):
                return [(m.get("fin") or {}).get(key) for m in members]

            out.append({
                "id": t["id"],
                "count": len(members),
                "with_fin": sum(1 for m in members if m.get("fin_history")),
                "median": {k: metrics.median(col(k)) for k in
                           ("sales_cagr_3y", "op_margin", "roe_actual", "equity_ratio", "payout_ratio",
                            "tsr_1y", "tsr_3y", "tsr_5y", "tsr_5y_vs_index")},
                "loss_making": sum(1 for m in members if (m["fin"].get("net_income") or 0) < 0),
                "industries": _count([m.get("industry") or "不明" for m in members]),
            })
        self.themes_out = out

    def write(self):
        write_json(DOCS_DATA / "stocks.json", self.stocks_out)
        write_json(DOCS_DATA / "themes.json", self.themes_out)
        fys = sorted({h.get("fy") for s in self.stocks_out for h in s.get("fin_history", []) if h.get("fy")})
        meta = {
            "generated_at": now_jst().isoformat(timespec="minutes"),
            "fin_latest_fy": fys[-1] if fys else None,
            "themes": self.themes,
            "rules": self.rules,
            "counts": {"stocks": len(self.stocks_out), "rows": len(self.stock_rows),
                       "with_fin": sum(1 for s in self.stocks_out if s.get("fin_history"))},
            "warnings": self.warnings[-50:],
            "requests": self.client.count,
            "sources": [
                {"name": "金融庁 EDINET（EDINETコードリスト・EDINET API）",
                 "url": "https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html",
                 "use": "業種・決算日、有価証券報告書の主要な経営指標（公共データ利用規約 PDL1.0。出典を明記し、必要な項目を抜き出して加工）"},
                {"name": "日本経済新聞社 man@bow（日経STOCKリーグ公式）", "url": "https://manabow.com/sl/", "use": "ルールの要点（要約）"},
            ],
        }
        write_json(DOCS_DATA / "meta.json", meta)

    def run(self):
        t0 = time.time()
        self.load_config()
        self.update_companies()
        self.check_listing()
        self.update_financials()
        self.compute()
        self.theme_summary()
        self.write()
        self.log(f"done in {time.time() - t0:.0f}s, requests={self.client.count}, warnings={len(self.warnings)}")


def _count(values):
    out: dict[str, int] = {}
    for v in values:
        out[v] = out.get(v, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def main(argv=None):
    ap = argparse.ArgumentParser(description="STOCKリーグ用テーマ別リサーチのデータを作る")
    ap.add_argument("--offline", action="store_true", help="ネットに出ずに作り直す")
    ap.add_argument("--skip-financials", action="store_true")
    ap.add_argument("--skip-jpx", action="store_true")
    ap.add_argument("--delay", type=float, default=2.0, help="同じサイトへのアクセス間隔（秒）")
    ap.add_argument("--max-requests", type=int, default=900, help="1回の実行でのアクセス回数の上限")
    ap.add_argument("--edinet-max-days", type=int, default=60, help="1回の実行でEDINETの提出書類一覧を調べる日数の上限")
    args = ap.parse_args(argv)
    Builder(args).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
