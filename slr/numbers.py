"""日本語の数値表記（"1,234" "15.5倍" "12兆3456億円" など）を数値に変換する。"""

from __future__ import annotations

import re

_BLANKS = {"", "-", "－", "—", "–", "N/A", "n/a", "赤字", "―"}


def to_float(text: str | None) -> float | None:
    """カンマや単位（倍・%・円）を取り除いて float にする。読めなければ None。"""
    if text is None:
        return None
    s = str(text).strip().replace(",", "").replace("，", "")
    s = s.replace("倍", "").replace("%", "").replace("％", "").replace("円", "").strip()
    s = s.replace("＋", "+").replace("−", "-").replace("▲", "-").replace("△", "-")
    if s in _BLANKS:
        return None
    try:
        return float(s)
    except ValueError:
        return None


_UNIT = {"兆": 10**12, "億": 10**8, "万": 10**4}


def jp_amount(text: str | None) -> float | None:
    """'12兆3456億円' や '7890億' のような金額表記を円単位の数値にする。"""
    if text is None:
        return None
    s = str(text).strip().replace(",", "").replace("円", "")
    if s in _BLANKS:
        return None
    if not re.search(r"[兆億万]", s):
        return to_float(s)
    total = 0.0
    matched = False
    for num, unit in re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*([兆億万])", s):
        total += float(num) * _UNIT[unit]
        matched = True
    rest = re.sub(r"[0-9]+(?:\.[0-9]+)?\s*[兆億万]", "", s).strip()
    if rest:
        tail = to_float(rest)
        if tail is not None:
            total += tail
    return total if matched else None
