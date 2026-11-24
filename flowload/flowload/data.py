"""Leitura de planilhas (CSV/TSV/TXT e XLSX)."""

from __future__ import annotations

import csv
import io
from pathlib import Path


class Table:
    def __init__(self, headers: list[str], rows: list[dict[str, str]], source: str):
        self.headers = headers
        self.rows = rows
        self.source = source
        # busca sem diferenciar maiúsculas/espaços, mas preservando o nome original
        self.lookup = {h.strip().lower(): h for h in headers}

    def column(self, name: str) -> str | None:
        return self.lookup.get(name.strip().lower())


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def load_table(path: str | Path, sheet: str | None = None) -> Table:
    path = Path(path)
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        return _load_xlsx(path, sheet)
    text = _decode(path.read_bytes())
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
    except csv.Error:
        delim = "\t" if "\t" in sample else ";" if sample.count(";") > sample.count(",") else ","
        dialect = type("Guess", (csv.excel,), {"delimiter": delim})
    reader = csv.reader(io.StringIO(text), dialect)
    matrix = [r for r in reader]
    return _from_matrix(matrix, str(path))


def _load_xlsx(path: Path, sheet: str | None) -> Table:
    try:
        import openpyxl
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("para ler .xlsx instale: pip install openpyxl (ou salve como CSV)") from exc
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    matrix = []
    for row in ws.iter_rows(values_only=True):
        matrix.append(["" if v is None else _cell(v) for v in row])
    wb.close()
    return _from_matrix(matrix, f"{path}[{ws.title}]")


def _cell(v) -> str:
    import datetime

    if isinstance(v, datetime.datetime):
        return v.strftime("%d/%m/%Y") if v.time() == datetime.time() else v.strftime("%d/%m/%Y %H:%M:%S")
    if isinstance(v, datetime.date):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _from_matrix(matrix: list[list[str]], source: str) -> Table:
    while matrix and not any(c.strip() for c in matrix[-1]):
        matrix.pop()
    if not matrix:
        raise ValueError(f"{source}: planilha vazia")
    headers = [h.strip() or f"col{i + 1}" for i, h in enumerate(matrix[0])]
    seen = set()
    for h in headers:
        if h.lower() in seen:
            raise ValueError(f"{source}: coluna repetida '{h}'")
        seen.add(h.lower())
    rows = []
    for raw in matrix[1:]:
        if not any(c.strip() for c in raw):
            continue  # linha totalmente vazia
        cells = list(raw) + [""] * (len(headers) - len(raw))
        rows.append(dict(zip(headers, cells)))
    return Table(headers, rows, source)
