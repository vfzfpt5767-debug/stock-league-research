"""控えめにアクセスするための HTTP クライアント。

- 同じサイト（ドメイン）には最低 `min_interval` 秒あけてアクセスする
- 1回の実行でのアクセス回数に上限を設ける（うっかり大量アクセスを防ぐ）
- 取得結果はローカルの .cache/ に保存し、有効期限内なら再取得しない
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

from . import USER_AGENT


class BudgetExceeded(RuntimeError):
    """アクセス回数の上限に達した。"""


class PageNotFound(RuntimeError):
    """404 など、やり直しても取れないページ。"""


class SiteRestricted(RuntimeError):
    """相手のサイトが「高負荷のため表示制限中」などを返した。この実行ではそのサイトへのアクセスをやめる。"""


# 相手サイトが制限中であることを示す文字列（見つけたらキャッシュせず、そのサイトへのアクセスを止める）
# （例：「高負荷につき表示制限中」）
RESTRICTION_MARKERS = ["表示制限中".encode("utf-8")]


def _site_key(url: str) -> str:
    return urlparse(url).hostname or ""


def _block_key(url: str) -> str:
    """制限を受けたときに止める範囲（f.irbank.net と irbank.net は同じ運営者なのでまとめて止める）。"""
    host = urlparse(url).hostname or ""
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


class PoliteClient:
    def __init__(
        self,
        cache_dir: str | Path = ".cache/http",
        min_interval: float = 3.0,
        max_requests: int = 800,
        host_intervals: dict[str, float] | None = None,
        timeout: float = 40.0,
        offline: bool = False,
        log=print,
    ):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.min_interval = min_interval
        self.max_requests = max_requests
        self.timeout = timeout
        self.offline = offline
        self.log = log
        self.count = 0
        self.host_intervals = host_intervals or {}
        self.blocked: set[str] = set()
        self._last: dict[str, float] = {}
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.5"})

    def _cache_path(self, url: str) -> Path:
        return self.cache_dir / hashlib.sha1(url.encode("utf-8")).hexdigest()

    def _read_cache(self, url: str, ttl: float | None) -> bytes | None:
        p = self._cache_path(url)
        meta = p.with_suffix(".json")
        if not p.exists() or not meta.exists():
            return None
        info = json.loads(meta.read_text())
        if ttl is not None and not self.offline and time.time() - info.get("fetched", 0) > ttl:
            return None
        body = p.read_bytes()
        if any(m in body[:4000] for m in RESTRICTION_MARKERS):
            return None
        return body

    def _write_cache(self, url: str, body: bytes) -> None:
        p = self._cache_path(url)
        p.write_bytes(body)
        p.with_suffix(".json").write_text(json.dumps({"url": url, "fetched": time.time()}))

    def get(self, url: str, ttl: float | None = 6 * 3600) -> bytes:
        """URL を取得して本文（bytes）を返す。ttl 秒以内のキャッシュがあればそれを使う。"""
        cached = self._read_cache(url, ttl)
        if cached is not None:
            return cached
        if self.offline:
            raise FileNotFoundError(f"offline mode: no cache for {url}")
        if self.count >= self.max_requests:
            raise BudgetExceeded(f"request budget ({self.max_requests}) exhausted before {url}")
        if _block_key(url) in self.blocked:
            raise SiteRestricted(f"{_block_key(url)} は制限中のため、この実行ではアクセスしません")
        key = _site_key(url)
        interval = self.host_intervals.get(key, self.min_interval)
        wait = self._last.get(key, 0) + interval - time.time()
        if wait > 0:
            time.sleep(wait)
        last_err: Exception | None = None
        for attempt in range(3):
            self.count += 1
            try:
                r = self.session.get(url, timeout=self.timeout)
                self._last[key] = time.time()
                if r.status_code in (429, 500, 502, 503, 504):
                    last_err = RuntimeError(f"HTTP {r.status_code} for {url}")
                    time.sleep(interval * (attempt + 2) * 2)
                    continue
                if r.status_code in (401, 403):
                    # アクセスを拒否された：この実行ではそのサイトに二度とアクセスしない（回避もしない）
                    self.blocked.add(_block_key(url))
                    raise SiteRestricted(f"HTTP {r.status_code}: {url} へのアクセスが拒否されました。この実行では {_block_key(url)} へのアクセスを止めます")
                if 400 <= r.status_code < 500:
                    # 404 などはやり直しても同じなので、すぐにエラーにする
                    raise PageNotFound(f"HTTP {r.status_code} for {url}")
                r.raise_for_status()
                if any(m in r.content[:4000] for m in RESTRICTION_MARKERS):
                    self.blocked.add(_block_key(url))
                    raise SiteRestricted(f"{url} が「表示制限中」を返しました。この実行では {_block_key(url)} へのアクセスを止めます")
                self._write_cache(url, r.content)
                return r.content
            except requests.RequestException as e:  # 通信エラーは少し待って再試行
                self._last[key] = time.time()
                last_err = e
                time.sleep(interval * (attempt + 2))
        raise RuntimeError(f"failed to fetch {url}: {last_err}")

    def get_text(self, url: str, ttl: float | None = 6 * 3600, encoding: str = "utf-8") -> str:
        return self.get(url, ttl).decode(encoding, errors="replace")
