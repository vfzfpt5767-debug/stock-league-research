from slr.numbers import jp_amount, to_float


def test_to_float():
    assert to_float("1,234") == 1234
    assert to_float("15.5倍") == 15.5
    assert to_float("2.5%") == 2.5
    assert to_float("-1.5%") == -1.5
    assert to_float("△1,200") == -1200
    assert to_float("-") is None
    assert to_float("") is None
    assert to_float(None) is None


def test_jp_amount():
    assert jp_amount("12兆3456億円") == 12 * 10**12 + 3456 * 10**8
    assert jp_amount("7890億") == 7890 * 10**8
    assert jp_amount("1兆") == 10**12
    assert jp_amount("-") is None
