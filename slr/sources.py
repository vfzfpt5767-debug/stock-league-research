"""EDINET（金融庁）と JPX のファイルを読む。

- EDINET コードリスト: 公共データ利用規約（PDL1.0）で出典明記のうえ再利用可。業種・決算日を表示に使う。
- JPX 上場銘柄一覧: JPX サイトの規約で二次利用・再配信が禁止されているため、
  「証券コードが上場銘柄として実在するか」のチェックだけに使い、内容は保存・公開しない。
"""

from __future__ import annotations

import csv
import io
import zipfile

EDINET_CODELIST_URL = "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip"
JPX_LIST_URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xlsx"


def sec_code_from_edinet(raw: str) -> str | None:
    """EDINET の5桁の証券コード（例 72030, 285A0）を4桁（7203, 285A）にする。"""
    raw = (raw or "").strip()
    if len(raw) == 5 and raw.endswith("0"):
        return raw[:4]
    return None


def parse_edinet_codelist(zip_bytes: bytes) -> dict[str, dict]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        text = z.read(name).decode("cp932", errors="replace")
    lines = text.splitlines()
    reader = csv.reader(io.StringIO("\n".join(lines[1:])))  # 1行目は「ダウンロード実行日」
    header = next(reader)
    idx = {h: i for i, h in enumerate(header)}
    out: dict[str, dict] = {}
    for row in reader:
        if len(row) < len(header):
            continue
        code = sec_code_from_edinet(row[idx["証券コード"]])
        if not code:
            continue
        out[code] = {
            "edinet_code": row[idx["ＥＤＩＮＥＴコード"]],
            "listed": row[idx["上場区分"]] == "上場",
            "name": row[idx["提出者名"]],
            "industry": row[idx["提出者業種"]],
            "fiscal_year_end": row[idx["決算日"]],
        }
    return out


def parse_jpx_codes(xlsx_bytes: bytes) -> dict[str, str]:
    """JPX の上場銘柄一覧から {コード: 市場・商品区分} を返す（チェック専用。保存しない）。"""
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(xlsx_bytes), read_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    ci = header.index("コード")
    mi = header.index("市場・商品区分")
    out = {}
    for r in rows:
        if r[ci] is None:
            continue
        out[str(r[ci]).strip()] = str(r[mi] or "")
    return out


def is_domestic_stock(segment: str) -> bool:
    return "内国株式" in segment
