"""株価・業績の指標を計算する（外部アクセスなしの純粋な関数だけ）。

株価の系列は [["YYYY-MM-DD", 終値], ...] の古い順リストで扱う。
"""

from __future__ import annotations

import math
import statistics
from datetime import date, timedelta

Series = list  # list[tuple[str, float]] / list[list]


def _d(s: str) -> date:
    return date.fromisoformat(s)


def close_on_or_before(series: Series, target: str) -> tuple[str, float] | None:
    """target 以前で最も新しい終値を返す。"""
    found = None
    for d, c in series:
        if d <= target:
            found = (d, c)
        else:
            break
    return found


def close_nearest(series: Series, target: str, tolerance_days: int) -> tuple[str, float] | None:
    """target に最も近い日の終値（前後 tolerance_days 日以内）。同じ近さなら前の日を優先。"""
    t = _d(target)
    best = None
    for d, c in series:
        diff = abs((_d(d) - t).days)
        if diff > tolerance_days:
            continue
        if best is None or diff < best[0] or (diff == best[0] and d <= target):
            best = (diff, (d, c))
    return best[1] if best else None


def period_return(series: Series, end: str, days: int, tolerance_days: int = 10) -> float | None:
    """end 時点の終値と、ちょうど days 日前に最も近い終値から騰落率を計算する。

    その近く（前後 tolerance_days 日）に株価がない場合（上場が新しいなど）は None。
    """
    if not series:
        return None
    e = close_on_or_before(series, end)
    if e is None:
        return None
    target = (_d(end) - timedelta(days=days)).isoformat()
    s = close_nearest(series, target, tolerance_days)
    if s is None or s[0] >= e[0] or s[1] <= 0:
        return None
    return e[1] / s[1] - 1.0


def window(series: Series, end: str, days: int) -> Series:
    start = (_d(end) - timedelta(days=days)).isoformat()
    return [(d, c) for d, c in series if start <= d <= end]


def simple_returns(closes: list[float]) -> list[float]:
    return [closes[i] / closes[i - 1] - 1.0 for i in range(1, len(closes)) if closes[i - 1] > 0]


def annualized_volatility(series: Series, end: str, days: int = 365, periods_per_year: int = 52,
                          min_points: int = 26) -> float | None:
    """週足の変化率の標準偏差を年率換算（×√52）した「値動きの大きさ」。"""
    w = window(series, end, days)
    if len(w) < min_points:
        return None
    r = simple_returns([c for _, c in w])
    if len(r) < 2:
        return None
    return statistics.stdev(r) * math.sqrt(periods_per_year)


def max_drawdown(series: Series, end: str | None = None, days: int | None = None) -> dict | None:
    """最大下落率（ピークからの最大の落ち込み）。値は負の割合（-0.25 = -25%）。"""
    s = series
    if end and days:
        s = window(series, end, days)
    if len(s) < 2:
        return None
    peak_v, peak_d = s[0][1], s[0][0]
    worst = 0.0
    out = {"value": 0.0, "peak": s[0][0], "trough": s[0][0]}
    for d, c in s:
        if c > peak_v:
            peak_v, peak_d = c, d
        dd = c / peak_v - 1.0 if peak_v > 0 else 0.0
        if dd < worst:
            worst = dd
            out = {"value": dd, "peak": peak_d, "trough": d}
    return out


def weekly_from_daily(daily: Series) -> Series:
    """日足から各週（月〜日）の最後の終値を取り出す。日付はその週の最後の取引日。"""
    out: dict[tuple[int, int], tuple[str, float]] = {}
    for d, c in daily:
        y, w, _ = _d(d).isocalendar()
        out[(y, w)] = (d, c)
    return [out[k] for k in sorted(out)]


def merge_weekly(fetched: Series, daily: Series) -> Series:
    """取得した週足と、日足から作った週足をまとめる。同じ週は日足側（新しい方）を優先。"""
    by_week: dict[tuple[int, int], tuple[str, float]] = {}
    for d, c in fetched:
        y, w, _ = _d(d).isocalendar()
        by_week[(y, w)] = (d, c)
    for d, c in weekly_from_daily(daily):
        y, w, _ = _d(d).isocalendar()
        by_week[(y, w)] = (d, c)
    return [by_week[k] for k in sorted(by_week)]


def merge_series(*parts: Series) -> Series:
    """複数の系列を日付でまとめる（後の引数を優先）。"""
    m: dict[str, float] = {}
    for p in parts:
        for d, c in p:
            m[d] = c
    return [(d, m[d]) for d in sorted(m)]


def detect_adjustment(old: Series, new: Series, threshold: float = 0.02) -> bool:
    """同じ日付の終値が threshold 以上ずれていたら True（株式分割などで過去の値が修正された合図）。"""
    old_map = dict((d, c) for d, c in old)
    for d, c in new:
        o = old_map.get(d)
        if o and c and abs(o / c - 1.0) > threshold:
            return True
    return False


def cagr(first: float | None, last: float | None, years: float) -> float | None:
    """年平均成長率。first・last が正のときだけ計算する。"""
    if first is None or last is None or years <= 0 or first <= 0 or last <= 0:
        return None
    return (last / first) ** (1.0 / years) - 1.0


def median(values) -> float | None:
    v = [x for x in values if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if not v:
        return None
    return statistics.median(v)


def mean(values) -> float | None:
    v = [x for x in values if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if not v:
        return None
    return sum(v) / len(v)


def fin_summary(years: dict[str, dict]) -> dict:
    """年度ごとの決算データから、表示用の推移と成長率をまとめる。

    years: {"2026/03": {"sales":..., "operating_income":..., ...}, ...}
    """
    fys = sorted(years)[-6:]
    hist = [{"fy": fy, **years[fy]} for fy in fys]
    out: dict = {"history": hist}
    if not hist:
        return out
    last = hist[-1]
    out["fy"] = last["fy"]
    sales = [h.get("sales") for h in hist]
    if len(hist) >= 4:
        out["sales_cagr_3y"] = cagr(hist[-4].get("sales"), last.get("sales"), 3)
        out["op_cagr_3y"] = cagr(hist[-4].get("operating_income"), last.get("operating_income"), 3)
    if len(hist) >= 2:
        prev = hist[-2]
        out["sales_growth_1y"] = cagr(prev.get("sales"), last.get("sales"), 1)
    s = last.get("sales")
    op = last.get("operating_income")
    out["op_margin"] = (op / s) if (s and op is not None and s > 0) else None
    out["sales"] = s
    out["operating_income"] = op
    out["net_income"] = last.get("net_income")
    out["eps"] = last.get("eps")
    out["bps"] = last.get("bps")
    out["dps"] = last.get("dps")
    out["roe_actual"] = last.get("roe")
    out["equity_ratio"] = last.get("equity_ratio")
    out["payout_ratio"] = last.get("payout_ratio")
    out["per_fy_end"] = last.get("per")
    out["profit_years_negative"] = sum(1 for h in hist if (h.get("net_income") or 0) < 0)
    out["sales_points"] = sum(1 for x in sales if x is not None)
    # 株主総利回り（TSR）：有価証券報告書の値は「5年前の期末＝100」の累積（%）。比較指標（例：配当込みTOPIX）も同じ。
    def tsr_change(key, years):
        if len(hist) <= years:
            return None
        a, b = hist[-1 - years].get(key), last.get(key)
        return (b / a - 1.0) if (a and b and a > 0) else None

    for k, src in (("tsr", "tsr"), ("tsr_index", "tsr_index")):
        suffix = "" if k == "tsr" else "_index"
        out[f"tsr_1y{suffix}"] = tsr_change(src, 1)
        out[f"tsr_3y{suffix}"] = tsr_change(src, 3)
        out[f"tsr_5y{suffix}"] = (last.get(src) / 100.0 - 1.0) if last.get(src) else None
    out["tsr_index_name"] = last.get("tsr_index_name")
    t5, i5 = out.get("tsr_5y"), out.get("tsr_5y_index")
    out["tsr_5y_vs_index"] = (t5 - i5) if (t5 is not None and i5 is not None) else None
    return out
