"""Validação e execução de scripts FlowLoad sobre uma planilha."""

from __future__ import annotations

import csv
import re
import time
from dataclasses import dataclass, field
from typing import Callable

from .backends import Backend, StopRequested
from .data import Table
from .keys import Chord, KeySpecError, parse_chords, translate_legacy
from .lang import COMMANDS, Block, Command, Script

_VAR = re.compile(r"\{\{|\}\}|\{([^{}]+)\}")
BUILTIN_VARS = {"linha", "row", "total", "data_hoje", "hora"}


class SkipRow(Exception):
    pass


class StopScript(Exception):
    pass


@dataclass
class Problem:
    line: int
    message: str

    def __str__(self) -> str:
        return f"linha {self.line}: {self.message}"


@dataclass
class RowResult:
    row: int
    status: str  # ok | pulada | erro | parada
    message: str = ""
    seconds: float = 0.0


@dataclass
class RunReport:
    results: list[RowResult] = field(default_factory=list)
    stopped: bool = False

    def count(self, status: str) -> int:
        return sum(1 for r in self.results if r.status == status)

    def summary(self) -> str:
        parts = [f"{self.count('ok')} ok", f"{self.count('pulada')} puladas", f"{self.count('erro')} com erro"]
        if self.stopped:
            parts.append("execução interrompida")
        return ", ".join(parts)

    def write_csv(self, path: str) -> None:
        with open(path, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh, delimiter=";")
            w.writerow(["linha", "status", "mensagem", "segundos"])
            for r in self.results:
                w.writerow([r.row, r.status, r.message, f"{r.seconds:.2f}"])


# ---------------------------------------------------------------------------
# Validação (antes de tocar no teclado)
# ---------------------------------------------------------------------------

def _vars(text: str) -> list[str]:
    return [m.group(1).strip() for m in _VAR.finditer(text) if m.group(1)]


def _num(arg: str, line: int, problems: list[Problem], what: str) -> None:
    try:
        float(arg.replace(",", "."))
    except ValueError:
        problems.append(Problem(line, f"{what} precisa ser um número (recebi '{arg}')"))


def validate(script: Script, table: Table | None) -> list[Problem]:
    problems: list[Problem] = []

    def check_var(name: str, line: int) -> None:
        if name.lower() in BUILTIN_VARS:
            return
        if table is not None and table.column(name) is None:
            problems.append(Problem(line, f"coluna '{name}' não existe na planilha (colunas: {', '.join(table.headers)})"))

    def walk(items, in_row: bool, stack: tuple = ()):
        for it in items:
            if isinstance(it, Block):
                if it.kind == "se":
                    try:
                        cond = _parse_condition(it.header)
                        for v in _vars(cond[0] + " " + cond[2]):
                            check_var(v, it.line)
                    except ValueError as e:
                        problems.append(Problem(it.line, str(e)))
                elif it.kind == "repetir":
                    n = it.header.split(None, 1)[1] if " " in it.header else ""
                    if not n.rstrip("xX ").strip().isdigit():
                        problems.append(Problem(it.line, "use: repetir 3:"))
                walk(it.body, in_row, stack)
                continue
            _check_command(it, in_row, script, problems, check_var, stack, walk)

    walk(script.before, False)
    walk(script.per_row, True)
    walk(script.after, False)
    for name, block in script.macros.items():
        walk(block.body, True, (name,))
    for key, (arg, line) in script.settings.items():
        if key == "ao_erro":
            if arg.lower() not in ("parar", "continuar", "pular"):
                problems.append(Problem(line, "ao_erro aceita: parar, continuar"))
        else:
            _num(arg, line, problems, key)
    return problems


def _check_command(c: Command, in_row, script, problems, check_var, stack, walk):
    for v in _vars(c.arg):
        if not in_row and v.lower() not in BUILTIN_VARS:
            problems.append(Problem(c.line, f"'{{{v}}}' só faz sentido dentro de 'para cada linha:'"))
        else:
            check_var(v, c.line)
    n = c.name
    if n in ("tecla",):
        try:
            parse_chords(c.arg)
        except KeySpecError as e:
            problems.append(Problem(c.line, str(e)))
    elif n in ("tab", "shift_tab", "enter", "esc", "cima", "baixo", "esquerda", "direita"):
        if c.arg and not c.arg.isdigit():
            problems.append(Problem(c.line, f"'{n}' aceita só uma quantidade, ex.: {n} 3"))
    elif n == "esperar":
        _num(c.arg or "1", c.line, problems, "esperar")
    elif n in ("janela", "esperar_janela"):
        if not c.arg:
            problems.append(Problem(c.line, f"'{n}' precisa do título da janela"))
    elif n in ("clicar", "clique_duplo", "clique_direito"):
        if not re.fullmatch(r"\s*-?\d+\s*[, ]\s*-?\d+\s*", c.arg):
            problems.append(Problem(c.line, f"use: {n} 120, 340"))
    elif n == "legado":
        for tok in _split_legacy(c.arg):
            try:
                translate_legacy(tok)
            except (KeySpecError, ValueError) as e:
                problems.append(Problem(c.line, f"token legado '{tok}': {e}"))
    elif n in ("escrever", "colar", "log", "pausa", "pular_linha", "parar", "limpar"):
        pass
    elif n.lower() in script.macros:
        if n.lower() in stack:
            problems.append(Problem(c.line, f"o comando '{n}' chama a si mesmo"))
    else:
        problems.append(Problem(c.line, f"comando desconhecido '{n}'. {_suggest(n, script)}"))


def _suggest(word: str, script: Script) -> str:
    import difflib

    names = list(COMMANDS) + [a for alts in COMMANDS.values() for a in alts] + list(script.macros)
    close = difflib.get_close_matches(word.lower(), names, n=1)
    return f"Você quis dizer '{close[0]}'?" if close else "Veja a lista com: flowload comandos"


def _split_legacy(arg: str) -> list[str]:
    # tokens separados por espaço ou '|'; "\{TAB 3}" é mantido junto
    return [t for t in re.findall(r"\\(?:[^\s|{]|\{[^}]*\})+|\*\w+\([^)]*\)|[^\s|]+", arg) if t]


# ---------------------------------------------------------------------------
# Condições do "se"
# ---------------------------------------------------------------------------

_COND = re.compile(
    r"^(?:se|if)\s+(.+?)\s+(n[aã]o\s+vazio|vazio|n[aã]o\s+cont[eé]m|cont[eé]m|!=|=|==|<>)\s*(.*)$",
    re.IGNORECASE,
)


def _parse_condition(header: str) -> tuple[str, str, str]:
    m = _COND.match(header.strip())
    if not m:
        raise ValueError("condição inválida. Exemplos: se {obs} vazio:  /  se {tipo} = NF:  /  se {desc} contém teste:")
    left, op, right = m.group(1), m.group(2).lower(), m.group(3).strip()
    op = re.sub(r"\s+", " ", op).replace("ã", "a").replace("é", "e")
    if op in ("vazio", "nao vazio") and right:
        raise ValueError(f"'{op}' não leva valor depois")
    if op not in ("vazio", "nao vazio") and not right and op not in ("=", "==", "!=", "<>"):
        raise ValueError("falta o valor para comparar")
    return left, op, right.strip("\"'")


# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------

class Runner:
    def __init__(self, script: Script, table: Table | None, backend: Backend,
                 log: Callable[[str], None] = print, on_error: str | None = None):
        self.s = script
        self.t = table
        self.b = backend
        self.log = log
        st = script.settings
        f = lambda k, d: float(st[k][0].replace(",", ".")) if k in st else d
        self.delay = f("atraso", 0.05)
        self.b.key_delay = f("atraso_tecla", 0.0)
        self.window_timeout = f("timeout_janela", 15.0)
        self.on_error = (on_error or (st["ao_erro"][0] if "ao_erro" in st else "parar")).lower()
        self.last_window: str | None = None
        self.row_vars: dict[str, str] = {}

    # interpolação {coluna}
    def fill(self, text: str) -> str:
        def rep(m):
            if m.group(0) == "{{":
                return "{"
            if m.group(0) == "}}":
                return "}"
            name = m.group(1).strip()
            low = name.lower()
            if low in self.row_vars:
                return self.row_vars[low]
            if low == "data_hoje":
                return time.strftime("%d/%m/%Y")
            if low == "hora":
                return time.strftime("%H:%M:%S")
            raise RuntimeError(f"variável '{name}' indisponível aqui")
        return _VAR.sub(rep, text)

    def run(self, start: int = 1, end: int | None = None) -> RunReport:
        report = RunReport()
        rows = self.t.rows if self.t else []
        end = len(rows) if end is None else min(end, len(rows))
        self.row_vars = {"total": str(end - start + 1)}
        try:
            self._exec(self.s.before, 0)
            for idx in range(start, end + 1):
                row = rows[idx - 1]
                self.row_vars = {k.strip().lower(): v for k, v in row.items()}
                self.row_vars.update({"linha": str(idx), "row": str(idx), "total": str(end - start + 1)})
                t0 = time.monotonic()
                try:
                    self._exec(self.s.per_row, idx)
                    report.results.append(RowResult(idx, "ok", seconds=time.monotonic() - t0))
                    self.log(f"✔ linha {idx}/{end}")
                except SkipRow:
                    report.results.append(RowResult(idx, "pulada", seconds=time.monotonic() - t0))
                    self.log(f"↷ linha {idx} pulada")
                except (StopRequested, StopScript):
                    raise
                except Exception as e:  # erro na linha
                    report.results.append(RowResult(idx, "erro", str(e), time.monotonic() - t0))
                    self.log(f"✖ linha {idx}: {e}")
                    if self.on_error == "parar":
                        report.stopped = True
                        return report
            self.row_vars = {"total": str(end - start + 1)}
            self._exec(self.s.after, 0)
        except (StopRequested, StopScript) as e:
            report.stopped = True
            self.log("■ parado pelo usuário" if isinstance(e, StopRequested) else "■ comando 'parar' executado")
        return report

    def _exec(self, items, row: int, depth: int = 0):
        if depth > 50:
            raise RuntimeError("comandos aninhados demais (algum comando chama a si mesmo?)")
        for it in items:
            if isinstance(it, Block):
                if it.kind == "se":
                    if self._cond(it.header):
                        self._exec(it.body, row, depth + 1)
                elif it.kind == "repetir":
                    n = int(it.header.split(None, 1)[1].rstrip("xX ").strip())
                    for _ in range(n):
                        self._exec(it.body, row, depth + 1)
                continue
            try:
                self._do(it, row, depth)
            except (SkipRow, StopScript, StopRequested):
                raise
            except Exception as e:
                raise RuntimeError(f"[script linha {it.line}] {e}") from e
            if self.delay:
                self.b.pace(self.delay)

    def _cond(self, header: str) -> bool:
        left, op, right = _parse_condition(header)
        a, b = self.fill(left).strip(), self.fill(right).strip()
        if op == "vazio":
            return a == ""
        if op == "nao vazio":
            return a != ""
        if op in ("=", "=="):
            return a.lower() == b.lower()
        if op in ("!=", "<>"):
            return a.lower() != b.lower()
        if op == "contem":
            return b.lower() in a.lower()
        if op == "nao contem":
            return b.lower() not in a.lower()
        raise ValueError(op)

    def _do(self, c: Command, row: int, depth: int):
        n, arg, b = c.name, c.arg, self.b
        count = lambda: int(arg) if arg else 1
        simple = {"tab": "TAB", "shift_tab": "SHIFT+TAB", "enter": "ENTER", "esc": "ESC",
                  "cima": "UP", "baixo": "DOWN", "esquerda": "LEFT", "direita": "RIGHT"}
        if n in simple:
            for ch in parse_chords(simple[n]):
                b.key(Chord(ch.keys, count()))
        elif n == "escrever":
            b.type_text(self.fill(_unquote(arg)))
        elif n == "colar":
            b.paste(self.fill(_unquote(arg)))
        elif n == "tecla":
            for ch in parse_chords(self.fill(arg)):
                b.key(ch)
        elif n == "limpar":
            b.key(Chord(("CTRL", "A")))
            b.key(Chord(("DELETE",)))
        elif n == "esperar":
            b.sleep(float((arg or "1").replace(",", ".")))
        elif n == "janela":
            title = self.fill(_unquote(arg))
            b.focus(title, self.window_timeout)
            self.last_window = title
        elif n == "esperar_janela":
            b.wait_window(self.fill(_unquote(arg)), self.window_timeout)
        elif n in ("clicar", "clique_duplo", "clique_direito"):
            x, y = (int(v) for v in re.split(r"[,\s]+", arg.strip()) if v)
            b.click(x, y, "right" if n == "clique_direito" else "left", n == "clique_duplo")
        elif n == "log":
            self.log("ℹ " + self.fill(_unquote(arg)))
        elif n == "pausa":
            if not b.pause(self.fill(_unquote(arg)) or "Pausa"):
                raise StopScript()
            if self.last_window:
                b.focus(self.last_window, self.window_timeout)
        elif n == "pular_linha":
            raise SkipRow()
        elif n == "parar":
            raise StopScript()
        elif n == "legado":
            for tok in _split_legacy(self.fill(arg)):
                for kind, val in translate_legacy(tok):
                    if kind == "key":
                        b.key(val)
                    elif kind == "text":
                        b.type_text(val)
                    elif kind == "wait":
                        b.sleep(val)
                    elif kind == "focus":
                        b.focus(val, self.window_timeout)
                        self.last_window = val
                    elif kind == "click":
                        b.click(*val)
        elif n.lower() in self.s.macros:
            self._exec(self.s.macros[n.lower()].body, row, depth + 1)
        else:
            raise RuntimeError(f"comando desconhecido '{n}'")


def _unquote(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    return s
