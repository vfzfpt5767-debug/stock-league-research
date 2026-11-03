"""アクセス制御（間隔・回数上限・制限ページの検知）のテスト。ネットには出ない。"""

import pytest

from slr.http import BudgetExceeded, PageNotFound, PoliteClient, SiteRestricted


class FakeResp:
    def __init__(self, status=200, body=b"ok"):
        self.status_code = status
        self.content = body

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.HTTPError(f"HTTP {self.status_code}")


def make_client(tmp_path, responses, **kw):
    c = PoliteClient(cache_dir=tmp_path, min_interval=0, **kw)
    calls = []

    def fake_get(url, timeout):
        calls.append(url)
        return responses.pop(0)

    c.session.get = fake_get
    return c, calls


def test_cache_is_used(tmp_path):
    c, calls = make_client(tmp_path, [FakeResp(body=b"hello")])
    assert c.get("https://example.org/a") == b"hello"
    assert c.get("https://example.org/a") == b"hello"
    assert len(calls) == 1


def test_budget(tmp_path):
    c, _ = make_client(tmp_path, [FakeResp(), FakeResp()], max_requests=1)
    c.get("https://example.org/a")
    with pytest.raises(BudgetExceeded):
        c.get("https://example.org/b")


def test_restriction_page_blocks_site_and_is_not_cached(tmp_path):
    body = "<title>表示制限中</title>高負荷につき表示制限中".encode("utf-8")
    c, calls = make_client(tmp_path, [FakeResp(body=body), FakeResp(body=b"x")])
    with pytest.raises(SiteRestricted):
        c.get("https://files.example.org/a.csv")
    # 同じ運営者の別ホストにも、この実行ではアクセスしない
    with pytest.raises(SiteRestricted):
        c.get("https://example.org/page")
    assert len(calls) == 1
    assert not list(tmp_path.glob("*.json"))


def test_404_is_not_retried(tmp_path):
    c, calls = make_client(tmp_path, [FakeResp(status=404)])
    with pytest.raises(PageNotFound):
        c.get("https://example.org/missing")
    assert len(calls) == 1


def test_403_stops_all_access_to_site(tmp_path):
    c, calls = make_client(tmp_path, [FakeResp(status=403), FakeResp(body=b"x")])
    with pytest.raises(SiteRestricted):
        c.get("https://example.org/one")
    with pytest.raises(SiteRestricted):
        c.get("https://example.org/two")
    assert len(calls) == 1
