import math

import pytest

from slr import metrics


def weekly_series(start="2023-01-06", n=200, f=lambda i: 100 + i):
    from datetime import date, timedelta
    d0 = date.fromisoformat(start)
    return [((d0 + timedelta(days=7 * i)).isoformat(), float(f(i))) for i in range(n)]


def test_close_on_or_before():
    s = [("2026-01-05", 10.0), ("2026-01-09", 11.0), ("2026-01-16", 12.0)]
    assert metrics.close_on_or_before(s, "2026-01-10") == ("2026-01-09", 11.0)
    assert metrics.close_on_or_before(s, "2026-01-01") is None


def test_period_return_basic_and_insufficient_history():
    s = weekly_series(n=200, f=lambda i: 100 * (1.01 ** i))
    end = s[-1][0]
    r = metrics.period_return(s, end, 364)
    assert r == pytest.approx(1.01 ** 52 - 1, rel=1e-9)
    # 200週（約3.8年）しかないので5年は計算しない
    assert metrics.period_return(s, end, 365 * 5) is None


def test_volatility_constant_growth_is_zero():
    s = weekly_series(n=60, f=lambda i: 100 * (1.01 ** i))
    v = metrics.annualized_volatility(s, s[-1][0], 365)
    assert v == pytest.approx(0.0, abs=1e-12)


def test_volatility_alternating():
    s = weekly_series(n=60, f=lambda i: 100 if i % 2 == 0 else 110)
    v = metrics.annualized_volatility(s, s[-1][0], 365)
    rets = metrics.simple_returns([c for _, c in metrics.window(s, s[-1][0], 365)])
    import statistics
    assert v == pytest.approx(statistics.stdev(rets) * math.sqrt(52))
    assert v > 0.5


def test_volatility_needs_enough_points():
    s = weekly_series(n=10)
    assert metrics.annualized_volatility(s, s[-1][0], 365) is None


def test_max_drawdown():
    s = [("2026-01-01", 100.0), ("2026-01-08", 120.0), ("2026-01-15", 90.0), ("2026-01-22", 130.0), ("2026-01-29", 117.0)]
    dd = metrics.max_drawdown(s)
    assert dd["value"] == pytest.approx(90 / 120 - 1)
    assert dd["peak"] == "2026-01-08" and dd["trough"] == "2026-01-15"


def test_weekly_from_daily_and_merge():
    daily = [("2026-10-26", 1.0), ("2026-10-27", 2.0), ("2026-10-30", 3.0), ("2026-11-02", 4.0)]
    w = metrics.weekly_from_daily(daily)
    assert w == [("2026-10-30", 3.0), ("2026-11-02", 4.0)]
    fetched = [("2026-10-23", 0.5), ("2026-10-30", 2.9)]
    m = metrics.merge_weekly(fetched, daily)
    assert m == [("2026-10-23", 0.5), ("2026-10-30", 3.0), ("2026-11-02", 4.0)]


def test_detect_adjustment():
    old = [("2026-01-05", 3000.0), ("2026-01-06", 3010.0)]
    same = [("2026-01-06", 3010.0), ("2026-01-07", 3020.0)]
    split = [("2026-01-06", 1505.0), ("2026-01-07", 1510.0)]
    assert metrics.detect_adjustment(old, same) is False
    assert metrics.detect_adjustment(old, split) is True


def test_cagr():
    assert metrics.cagr(100, 133.1, 3) == pytest.approx(0.1)
    assert metrics.cagr(-5, 100, 3) is None
    assert metrics.cagr(None, 100, 3) is None


def test_fin_summary():
    years = {
        "2022/03": {"sales": 100.0, "operating_income": 10.0, "net_income": 5.0},
        "2023/03": {"sales": 110.0, "operating_income": 11.0, "net_income": -1.0},
        "2024/03": {"sales": 121.0, "operating_income": 12.0, "net_income": 6.0},
        "2025/03": {"sales": 133.1, "operating_income": 13.31, "net_income": 7.0, "eps": 10.0},
    }
    f = metrics.fin_summary(years)
    assert f["fy"] == "2025/03"
    assert f["sales_cagr_3y"] == pytest.approx(0.1)
    assert f["op_margin"] == pytest.approx(0.1)
    assert f["profit_years_negative"] == 1
    assert len(f["history"]) == 4


def test_median_ignores_none():
    assert metrics.median([None, 1, 3, 2]) == 2
    assert metrics.median([None]) is None
