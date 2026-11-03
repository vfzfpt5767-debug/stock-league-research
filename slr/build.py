"""データを集めて docs/data/ に JSON を書き出す。

使い方:
    python -m slr.build                 # ふだんの更新（株価・指標・必要なら決算や開示）
    python -m slr.build --only 7203,6758  # 一部の銘柄だけ
    python -m slr.build --offline       # ネットに出ず、キャッシュと既存データだけで作り直す
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import irbank, metrics, sources
from .config import ROOT, load_rules, load_stocks, load_themes, group_by_code
from .http import BudgetExceeded, PageNotFound, PoliteClient, SiteRestricted

DOCS_DATA = ROOT / "docs" / "data"
PRICES = DOCS_DATA / "prices"
JST = timezone(timedelta(hours=9))

HISTORY_REFRESH_DAYS = 30   # 週足・月足を取り直す間隔（株式分割などの修正を反映するため）
EVENTS_REFRESH_DAYS = 6     # 適時開示の一覧を取り直す間隔
FIN_REFRESH_DAYS = 7        # 決算CSVを取り直す間隔
COMPANY_REFRESH_DAYS = 14   # EDINETコードリストを取り直す間隔


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


def _pairs(rows: list[dict]) -> list[list]:
    return [[r["date"], r["close"]] for r in rows if r.get("close") is not None]


class Builder:
    def __init__(self, args):
        self.args = args
        self.today = now_jst().date()
        self.client = PoliteClient(
            cache_dir=ROOT / ".cache" / "http",
            min_interval=args.delay,
            max_requests=args.max_requests,
            # IR BANK は「過剰アクセス禁止」。株価ページは4秒、CSVファイル置き場は10秒あける
            host_intervals={"irbank.net": max(args.delay, 4.0), "f.irbank.net": max(args.delay, 10.0)},
            offline=args.offline,
            log=self.log,
        )
        self.warnings: list[str] = []
        self.history_fetches = 0

    def log(self, *a):
        print(*a, flush=True)

    def warn(self, msg: str):
        self.warnings.append(msg)
        self.log("WARN:", msg)

    # ---------------- 設定 ----------------
    def load_config(self):
        self.themes = load_themes()
        self.rules = load_rules()
        rows = load_stocks(self.themes)
        self.stock_rows = rows
        self.stocks = group_by_code(rows)
        only = [c.strip().upper() for c in (self.args.only or "").split(",") if c.strip()]
        self.target_codes = [c for c in self.stocks if not only or c in only]
        self.log(f"themes={len([t for t in self.themes if t['enabled']])} stocks={len(self.stocks)} targets={len(self.target_codes)}")

    # ---------------- 会社情報（EDINET）と上場チェック（JPX） ----------------
    def update_companies(self):
        path = DOCS_DATA / "companies.json"
        data = read_json(path, {"fetched_at": None, "data": {}})
        missing = [c for c in self.stocks if c not in data["data"]]
        if self.args.offline or (not older_than(data["fetched_at"], COMPANY_REFRESH_DAYS, self.today) and not missing):
            self.companies = data["data"]
            return
        try:
            blob = self.client.get(sources.EDINET_CODELIST_URL, ttl=7 * 86400)
            allc = sources.parse_edinet_codelist(blob)
            data = {"fetched_at": self.today.isoformat(),
                    "source": "EDINETコードリスト（金融庁）PDL1.0",
                    "data": {c: allc[c] for c in self.stocks if c in allc}}
            write_json(path, data)
        except Exception as e:  # noqa: BLE001
            self.warn(f"EDINETコードリストを取得できませんでした: {e}")
        self.companies = data["data"]

    def check_listing(self):
        """JPX 一覧で上場しているかを確認（結果は警告として記録するだけで、JPXのデータは保存しない）。"""
        self.listing_ok: dict[str, bool] = {}
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

    # ---------------- 株価 ----------------
    def update_prices(self):
        for i, code in enumerate(self.target_codes, 1):
            if self.args.skip_prices:
                break
            try:
                self.update_price_one(code)
            except BudgetExceeded as e:
                self.warn(f"アクセス回数の上限に達したため株価の更新を途中で止めました: {e}")
                break
            except SiteRestricted as e:
                self.warn(f"IR BANK が高負荷のため表示制限中でした。株価の更新を途中で止め、次回に回します: {e}")
                break
            except Exception as e:  # noqa: BLE001
                self.warn(f"{code}: 株価を取得できませんでした: {e}")
                traceback.print_exc()
            if i % 10 == 0:
                self.log(f"prices {i}/{len(self.target_codes)} (requests so far: {self.client.count})")

    def update_price_one(self, code: str):
        path = PRICES / f"{code}.json"
        cur = read_json(path, {"code": code, "daily": [], "weekly": [], "monthly": [], "header": {}})
        if self.args.offline:
            return
        if cur.get("updated") == self.today.isoformat() and not self.args.force:
            return
        page = irbank.parse_chart_page(self.client.get_text(irbank.chart_url(code), ttl=3 * 3600))
        daily_new = _pairs(page["rows"])
        if not daily_new:
            raise RuntimeError("株価の表が空でした")
        adjusted = metrics.detect_adjustment(cur.get("daily", []), daily_new)
        need_history = (
            adjusted or self.args.refresh_history or not cur.get("weekly")
            or older_than(cur.get("history_refreshed"), HISTORY_REFRESH_DAYS, self.today)
        )
        if adjusted:
            self.log(f"{code}: 過去の株価が修正されています（株式分割など）。履歴を取り直します")
        weekly = cur.get("weekly", [])
        monthly = cur.get("monthly", [])
        daily = metrics.merge_series([] if adjusted else cur.get("daily", []), daily_new)
        if need_history and self.history_fetches >= self.args.max_history_fetch:
            need_history = False  # 今回はここまで。残りは次回の実行で取る（アクセスを分散）
        if need_history:
            self.history_fetches += 1
            w1 = _pairs(irbank.parse_chart_page(self.client.get_text(irbank.chart_url(code, mw=1), ttl=20 * 3600))["rows"])
            w2 = []
            if w1 and w1[0][0] > (self.today - timedelta(days=365 * 3 + 30)).isoformat():
                older_end = (date.fromisoformat(w1[0][0]) - timedelta(days=1)).isoformat()
                try:
                    w2 = _pairs(irbank.parse_chart_page(self.client.get_text(irbank.chart_url(code, mw=1, y=older_end), ttl=20 * 3600))["rows"])
                except PageNotFound:
                    w2 = []  # 上場から日が浅い銘柄は古いページがない
            weekly = metrics.merge_series(w2, w1)
            monthly = []
            cur["history_refreshed"] = self.today.isoformat()
        weekly = metrics.merge_weekly(weekly, daily_new)
        # 日足は直近 400 日分だけ持つ（ファイルを小さく保つ）
        cutoff = (self.today - timedelta(days=400)).isoformat()
        daily = [p for p in daily if p[0] >= cutoff]
        cur.update({
            "code": code,
            "name_irbank": page.get("name"),
            "updated": self.today.isoformat(),
            "header": page["header"],
            "daily": [list(p) for p in daily],
            "weekly": [list(p) for p in weekly],
            "monthly": [list(p) for p in monthly],
            "source": irbank.chart_url(code),
        })
        write_json(path, cur)

    # ---------------- 適時開示（最近の主な出来事・ニュース） ----------------
    def update_events(self):
        path = DOCS_DATA / "events.json"
        data = read_json(path, {"data": {}})
        if self.args.offline or self.args.skip_events:
            self.events = data["data"]
            return
        # 古い順に、1回あたり最大 max_event_fetch 社まで取り直す（アクセスを分散）
        todo = sorted(self.target_codes, key=lambda c: (data["data"].get(c) or {}).get("fetched_at") or "")
        n = 0
        for code in todo:
            ent = data["data"].get(code) or {}
            if not older_than(ent.get("fetched_at"), EVENTS_REFRESH_DAYS, self.today) and not self.args.force:
                continue
            if n >= self.args.max_event_fetch:
                break
            try:
                items = irbank.parse_ir_page(self.client.get_text(irbank.ir_url(code), ttl=20 * 3600))
                data["data"][code] = {"fetched_at": self.today.isoformat(), "items": items}
                n += 1
            except BudgetExceeded:
                self.warn("アクセス回数の上限に達したため開示情報の更新を途中で止めました")
                break
            except SiteRestricted as e:
                self.warn(f"IR BANK が表示制限中のため開示情報の更新を途中で止めました: {e}")
                break
            except Exception as e:  # noqa: BLE001
                self.warn(f"{code}: 開示情報を取得できませんでした: {e}")
        data["source"] = "IR BANK（適時開示の一覧）"
        write_json(path, data)
        self.events = data["data"]

    # ---------------- 決算 ----------------
    def update_financials(self):
        path = DOCS_DATA / "financials.json"
        data = read_json(path, {"fetched_at": None, "data": {}})
        missing = [c for c in self.stocks if c not in data["data"]]
        refresh = self.args.refresh_fin or older_than(data.get("fetched_at"), FIN_REFRESH_DAYS, self.today) or missing
        if self.args.offline or self.args.skip_financials or not refresh:
            self.fin = data["data"]
            return
        codes = set(self.stocks)
        merged: dict = {}
        ok = True
        for kind, folder in irbank.FIN_PLAN:
            url = irbank.fin_url(folder, kind)
            try:
                text = self.client.get_text(url, ttl=5 * 86400, encoding="utf-8-sig")
            except (BudgetExceeded, SiteRestricted) as e:
                self.warn(f"決算データの更新を途中で止めました（次回に再取得）: {e}")
                ok = False
                break
            except Exception as e:  # noqa: BLE001
                self.warn(f"決算CSV {folder}/{kind} を取得できませんでした: {e}")
                ok = False
                continue
            irbank.merge_fin(merged, irbank.parse_fin_csv(text, kind, codes), kind)
        if merged and ok:
            data = {"fetched_at": self.today.isoformat(), "source": "IR BANK 決算・財務データ（全銘柄一括CSV）", "data": merged}
            write_json(path, data)
        elif merged:
            # 途中で止まった場合は、取れた分だけ上書きし、fetched_at は更新しない（次回また取りにいく）
            for code, years in merged.items():
                for fy, rec in years.items():
                    data["data"].setdefault(code, {}).setdefault(fy, {}).update({k: v for k, v in rec.items() if v is not None})
            write_json(path, data)
        self.fin = data["data"]

    # ---------------- 指標の計算と書き出し ----------------
    def compute(self):
        stocks_out = []
        weekly_by_code = {}
        latest_dates = []
        for code, s in self.stocks.items():
            p = read_json(PRICES / f"{code}.json", {})
            header = p.get("header") or {}
            daily = [tuple(x) for x in p.get("daily", [])]
            weekly = [tuple(x) for x in p.get("weekly", [])]
            # 騰落率の計算には「週足＋最新の日足」を使う
            combo = metrics.merge_series(weekly, daily[-30:]) if weekly else daily
            end = daily[-1][0] if daily else (weekly[-1][0] if weekly else None)
            if end:
                latest_dates.append(end)
            price = daily[-1][1] if daily else None
            fin = metrics.fin_summary(self.fin.get(code, {})) if self.fin.get(code) else {"history": []}
            comp = self.companies.get(code, {})
            rec = {
                "code": code,
                "name": s["name"],
                "themes": s["themes"],
                "reasons": s["reasons"],
                "business": s["business"],
                "industry": comp.get("industry"),
                "fiscal_year_end": comp.get("fiscal_year_end"),
                "price": price,
                "price_date": end,
                "market_cap": header.get("market_cap"),
                "per": header.get("per"),
                "per_forecast": header.get("per_forecast"),
                "pbr": header.get("pbr"),
                "dividend_yield": header.get("dividend_yield"),
                "dividend_forecast": header.get("dividend_yield_forecast"),
                "roe": header.get("roe"),
                "return_1m": metrics.period_return(combo, end, 30, 6) if end else None,
                "return_6m": metrics.period_return(combo, end, 182, 8) if end else None,
                "return_1y": metrics.period_return(combo, end, 365, 10) if end else None,
                "return_3y": metrics.period_return(combo, end, 365 * 3, 12) if end else None,
                "vol_1y": metrics.annualized_volatility(weekly, end, 365, min_points=40) if end else None,
                "vol_3y": metrics.annualized_volatility(weekly, end, 365 * 3, min_points=120) if end else None,
                "mdd_3y": (metrics.max_drawdown(weekly, end, 365 * 3) or {}).get("value") if (end and len(weekly) > 100) else None,
                "fin": {k: v for k, v in fin.items() if k != "history"},
                "fin_history": fin.get("history", []),
                "listed_check": self.listing_ok.get(code) if hasattr(self, "listing_ok") else None,
                "history_start": weekly[0][0] if weekly else None,
            }
            # 3年分の週足がそろっていなければ3年の指標は出さない
            if weekly and weekly[0][0] > (date.fromisoformat(end) - timedelta(days=365 * 3 + 10)).isoformat():
                rec["mdd_3y"] = None
            stocks_out.append(rec)
            if weekly:
                weekly_by_code[code] = weekly
        self.stocks_out = stocks_out
        self.data_date = max(latest_dates) if latest_dates else None
        self.weekly_by_code = weekly_by_code

    def theme_summary(self):
        out = []
        by_code = {s["code"]: s for s in self.stocks_out}
        for t in self.themes:
            if not t["enabled"]:
                continue
            members = [by_code[r["code"]] for r in self.stock_rows if r["theme_id"] == t["id"] and r["code"] in by_code]

            def col(key, src=None):
                return [((m.get(src) or {}).get(key) if src else m.get(key)) for m in members]

            per_vals = [v for v in col("per") if v is not None and v > 0]
            out.append({
                "id": t["id"],
                "count": len(members),
                "with_price": sum(1 for m in members if m.get("price") is not None),
                "median": {
                    "market_cap": metrics.median(col("market_cap")),
                    "per": metrics.median(per_vals),
                    "pbr": metrics.median(col("pbr")),
                    "dividend_yield": metrics.median(col("dividend_yield")),
                    "return_1y": metrics.median(col("return_1y")),
                    "return_3y": metrics.median(col("return_3y")),
                    "vol_1y": metrics.median(col("vol_1y")),
                    "mdd_3y": metrics.median(col("mdd_3y")),
                    "sales_cagr_3y": metrics.median(col("sales_cagr_3y", "fin")),
                    "op_margin": metrics.median(col("op_margin", "fin")),
                },
                "mean": {
                    "return_1y": metrics.mean(col("return_1y")),
                    "return_3y": metrics.mean(col("return_3y")),
                    "vol_1y": metrics.mean(col("vol_1y")),
                },
                "loss_making": sum(1 for m in members if (m["fin"].get("net_income") or 0) < 0),
                "per_unavailable": sum(1 for m in members if not (m.get("per") and m["per"] > 0)),
                "min_price_100": sorted(m["price"] * 100 for m in members if m.get("price"))[:1],
                "industries": _count([m.get("industry") or "不明" for m in members]),
            })
        self.themes_out = out

    def benchmark(self):
        """全候補銘柄を同じ金額ずつ持った場合（等金額平均）の週ごとの推移。3年前=100。"""
        if not self.weekly_by_code or not self.data_date:
            self.bench = None
            return
        start = (date.fromisoformat(self.data_date) - timedelta(days=365 * 3)).isoformat()
        # 共通の週の並び（全銘柄の週の和集合）
        weeks = sorted({d for w in self.weekly_by_code.values() for d, _ in w if d >= start})
        series = []
        base = {}
        for code, w in self.weekly_by_code.items():
            b = metrics.close_on_or_before(w, start) or (w[0] if w and w[0][0] <= weeks[0] else None)
            if b and (date.fromisoformat(start) - date.fromisoformat(b[0])).days <= 14:
                base[code] = b[1]
        if not base:
            self.bench = None
            return
        last_val = {c: base[c] for c in base}
        idx_maps = {c: dict((d, v) for d, v in self.weekly_by_code[c]) for c in base}
        for d in weeks:
            for c in base:
                v = idx_maps[c].get(d)
                if v is not None:
                    last_val[c] = v
            series.append([d, round(100 * sum(last_val[c] / base[c] for c in base) / len(base), 3)])
        self.bench = {"start": start, "members": len(base), "series": series,
                      "note": "このサイトの全テーマの候補銘柄を、3年前に同じ金額ずつ買って持ち続けた場合の平均（株価のみ・配当なし）"}

    def news(self):
        out = {}
        names = {s["code"]: s["name"] for s in self.stocks_out}
        for t in self.themes:
            if not t["enabled"]:
                continue
            codes = [r["code"] for r in self.stock_rows if r["theme_id"] == t["id"]]
            items = []
            for c in codes:
                for it in (self.events.get(c) or {}).get("items", []):
                    items.append({**it, "code": c, "name": names.get(c, c)})
            items.sort(key=lambda x: (x["date"], x["code"]), reverse=True)
            out[t["id"]] = items[:40]
        self.news_out = out

    def write(self):
        write_json(DOCS_DATA / "stocks.json", self.stocks_out)
        write_json(DOCS_DATA / "themes.json", self.themes_out)
        write_json(DOCS_DATA / "news.json", {"generated_at": now_jst().isoformat(timespec="minutes"), "themes": self.news_out})
        if self.bench:
            write_json(DOCS_DATA / "benchmark.json", self.bench)
        meta = {
            "generated_at": now_jst().isoformat(timespec="minutes"),
            "data_date": self.data_date,
            "themes": self.themes,
            "rules": self.rules,
            "counts": {"stocks": len(self.stocks_out), "rows": len(self.stock_rows),
                       "with_price": sum(1 for s in self.stocks_out if s.get("price") is not None)},
            "warnings": self.warnings[-50:],
            "requests": self.client.count,
            "sources": [
                {"name": "IR BANK", "url": "https://irbank.net/", "use": "株価（前営業日終値）・時価総額・PER・PBR・配当利回り・決算データ・適時開示の一覧"},
                {"name": "EDINETコードリスト（金融庁）", "url": "https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html",
                 "use": "業種・決算日（公共データ利用規約 PDL1.0。出典を明記し、業種・決算日の列だけを抜き出して加工）"},
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
        self.update_prices()
        self.update_events()
        self.compute()
        self.theme_summary()
        self.benchmark()
        self.news()
        self.write()
        self.log(f"done in {time.time() - t0:.0f}s, requests={self.client.count}, warnings={len(self.warnings)}")


def _count(values):
    out: dict[str, int] = {}
    for v in values:
        out[v] = out.get(v, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def main(argv=None):
    ap = argparse.ArgumentParser(description="STOCKリーグ用テーマ別リサーチのデータを作る")
    ap.add_argument("--only", help="カンマ区切りの証券コードだけ更新")
    ap.add_argument("--offline", action="store_true", help="ネットに出ずに作り直す")
    ap.add_argument("--force", action="store_true", help="今日すでに更新済みでも取り直す")
    ap.add_argument("--refresh-history", action="store_true", help="週足・月足も取り直す")
    ap.add_argument("--refresh-fin", action="store_true", help="決算CSVを取り直す")
    ap.add_argument("--skip-prices", action="store_true")
    ap.add_argument("--skip-events", action="store_true")
    ap.add_argument("--skip-financials", action="store_true")
    ap.add_argument("--skip-jpx", action="store_true")
    ap.add_argument("--delay", type=float, default=3.0, help="同じサイトへのアクセス間隔（秒）")
    ap.add_argument("--max-requests", type=int, default=700, help="1回の実行でのアクセス回数の上限")
    ap.add_argument("--max-event-fetch", type=int, default=40, help="1回の実行で開示情報を取り直す社数の上限")
    ap.add_argument("--max-history-fetch", type=int, default=35, help="1回の実行で週足の履歴を取り直す社数の上限")
    args = ap.parse_args(argv)
    Builder(args).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
