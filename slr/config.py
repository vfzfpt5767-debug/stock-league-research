"""config/ の CSV を読み込み、書き間違いがないかチェックする。"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"

CODE_RE = re.compile(r"^[0-9]{3}[0-9A-Z]$")
THEME_ID_RE = re.compile(r"^[a-z][a-z0-9_-]*$")


class ConfigError(ValueError):
    pass


def _read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(f)]


def load_themes(path: Path | None = None) -> list[dict]:
    rows = _read_csv(path or CONFIG / "themes.csv")
    out = []
    seen = set()
    for i, r in enumerate(rows, start=2):
        tid = r.get("id", "")
        if not THEME_ID_RE.match(tid):
            raise ConfigError(f"themes.csv {i}行目: id は半角英小文字で書いてください（今の値: {tid!r}）")
        if tid in seen:
            raise ConfigError(f"themes.csv {i}行目: id {tid!r} が重複しています")
        seen.add(tid)
        if not r.get("name"):
            raise ConfigError(f"themes.csv {i}行目: name（テーマ名）が空です")
        out.append({
            "id": tid,
            "order": int(r.get("order") or 999),
            "enabled": (r.get("enabled", "1") not in ("0", "false", "FALSE", "no", "")),
            "name": r["name"],
            "short_name": r.get("short_name") or r["name"],
            "description": r.get("description", ""),
            "news_keywords": [k for k in (r.get("news_keywords") or "").split(";") if k],
        })
    out.sort(key=lambda t: (t["order"], t["id"]))
    return out


def load_stocks(themes: list[dict], path: Path | None = None) -> list[dict]:
    """stocks.csv を読む。無効（enabled=0）のテーマの行は読み飛ばす。"""
    rows = _read_csv(path or CONFIG / "stocks.csv")
    valid = {t["id"]: t for t in themes}
    out = []
    seen = set()
    for i, r in enumerate(rows, start=2):
        if not any(r.values()):
            continue
        tid, code = r.get("theme_id", ""), r.get("code", "").upper()
        if tid not in valid:
            raise ConfigError(f"stocks.csv {i}行目: theme_id {tid!r} は themes.csv にありません")
        if not CODE_RE.match(code):
            raise ConfigError(f"stocks.csv {i}行目: code {code!r} は4桁の証券コード（例 7203, 285A）ではありません")
        if (tid, code) in seen:
            raise ConfigError(f"stocks.csv {i}行目: テーマ {tid} に {code} が2回出てきます")
        seen.add((tid, code))
        url = r.get("source_url", "")
        if url and not url.startswith(("https://", "http://")):
            raise ConfigError(f"stocks.csv {i}行目: source_url は https:// で始まるURLにしてください")
        if not r.get("reason"):
            raise ConfigError(f"stocks.csv {i}行目: reason（テーマとの関係）が空です")
        if not valid[tid]["enabled"]:
            continue
        out.append({
            "theme_id": tid,
            "code": code,
            "name": r.get("name") or code,
            "reason": r["reason"],
            "business": r.get("business", ""),
            "source_title": r.get("source_title") or url,
            "source_url": url,
            "note": r.get("note", ""),
        })
    return out


def load_rules(path: Path | None = None) -> dict:
    return json.loads((path or CONFIG / "rules.json").read_text(encoding="utf-8"))


def group_by_code(rows: list[dict]) -> dict[str, dict]:
    """同じ会社が複数テーマに入っている場合に1社1件にまとめる。"""
    out: dict[str, dict] = {}
    for r in rows:
        s = out.setdefault(r["code"], {"code": r["code"], "name": r["name"], "business": r["business"],
                                       "themes": [], "reasons": {}})
        s["themes"].append(r["theme_id"])
        s["reasons"][r["theme_id"]] = {"reason": r["reason"], "source_title": r["source_title"],
                                       "source_url": r["source_url"], "note": r["note"]}
        if not s["business"] and r["business"]:
            s["business"] = r["business"]
    return out
