"""Parser da linguagem FlowLoad (.flow).

A linguagem é baseada em linhas e indentação (como Python):

    janela "Oracle Applications"

    para cada linha:
        escrever {fornecedor}
        tab
        se {valor} vazio: pular_linha
        escrever {valor}
        tecla CTRL+S

Cada linha é um comando; blocos terminam em ":" e o corpo fica indentado.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

__all__ = [
    "Command",
    "Block",
    "Script",
    "FlowSyntaxError",
    "parse",
    "COMMANDS",
    "canonical",
]


class FlowSyntaxError(ValueError):
    def __init__(self, line: int, message: str):
        super().__init__(f"linha {line}: {message}")
        self.line = line
        self.message = message


@dataclass
class Command:
    name: str
    arg: str
    line: int


@dataclass
class Block:
    kind: str  # "antes", "linha", "depois", "se", "repetir", "comando"
    header: str
    line: int
    body: list = field(default_factory=list)


@dataclass
class Script:
    before: list
    per_row: list
    after: list
    macros: dict
    settings: dict


# nome canônico -> apelidos aceitos (português e inglês)
COMMANDS: dict[str, tuple[str, ...]] = {
    "escrever": ("digitar", "type", "write"),
    "colar": ("paste",),
    "tecla": ("teclas", "key", "keys", "press", "atalho"),
    "tab": (),
    "shift_tab": ("voltar_campo",),
    "enter": ("ent",),
    "esc": ("escape",),
    "cima": ("up", "acima"),
    "baixo": ("down", "abaixo"),
    "esquerda": ("left",),
    "direita": ("right",),
    "limpar": ("clear",),
    "esperar": ("aguardar", "wait", "sleep"),
    "janela": ("focar", "focus", "window"),
    "esperar_janela": ("aguardar_janela", "wait_window"),
    "clicar": ("click", "clique"),
    "clique_duplo": ("double_click", "duplo_clique"),
    "clique_direito": ("right_click",),
    "log": ("mensagem", "print"),
    "pausa": ("confirmar", "pause"),
    "pular_linha": ("pular", "skip"),
    "parar": ("stop",),
    "legado": ("dataload", "legacy"),
}

SETTINGS = {
    "atraso": ("delay",),  # pausa entre comandos (s)
    "atraso_tecla": ("key_delay",),  # pausa entre caracteres (s)
    "timeout_janela": ("window_timeout",),
    "ao_erro": ("on_error",),  # parar | continuar
}

_ALIASES = {}
for _canon, _alts in {**COMMANDS, **SETTINGS}.items():
    _ALIASES[_canon] = _canon
    for _a in _alts:
        _ALIASES[_a] = _canon


def canonical(word: str) -> str | None:
    return _ALIASES.get(word.lower())


_INDENT = re.compile(r"^[ \t]*")
_NAME = re.compile(r"^[A-Za-z_À-ÿ][\wÀ-ÿ]*$")


def _strip_comment(text: str) -> str:
    out, quote = [], None
    for ch in text:
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#":
            break
        out.append(ch)
    return "".join(out).rstrip()


def _split_header(text: str) -> tuple[str, str] | None:
    """Encontra o ':' que fecha um cabeçalho de bloco (fora de aspas/chaves)."""
    quote, depth = None, 0
    for i, ch in enumerate(text):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == ":" and depth == 0:
            return text[:i].strip(), text[i + 1 :].strip()
    return None


_BLOCK_WORDS = {
    "antes": "antes",
    "inicio": "antes",
    "início": "antes",
    "before": "antes",
    "depois": "depois",
    "final": "depois",
    "after": "depois",
    "para cada linha": "linha",
    "cada linha": "linha",
    "for each row": "linha",
}


def _block_kind(header: str) -> str | None:
    low = header.lower()
    if low in _BLOCK_WORDS:
        return _BLOCK_WORDS[low]
    first = low.split(None, 1)[0] if low else ""
    if first in ("se", "if"):
        return "se"
    if first in ("repetir", "repeat"):
        return "repetir"
    if first in ("comando", "command", "macro"):
        return "comando"
    return None


def _parse_command(text: str, line: int) -> Command:
    parts = text.split(None, 1)
    word = parts[0]
    arg = parts[1].strip() if len(parts) > 1 else ""
    canon = canonical(word)
    name = canon if canon else word  # pode ser um comando do usuário
    return Command(name=name, arg=arg, line=line)


def parse(source: str) -> Script:
    lines = source.replace("\r\n", "\n").split("\n")
    root = Block(kind="raiz", header="", line=0)
    stack: list[tuple[int, Block]] = [(0, root)]
    pending: Block | None = None  # bloco que acabou de abrir e espera corpo

    for number, raw in enumerate(lines, start=1):
        text = _strip_comment(raw)
        if not text.strip():
            continue
        indent = len(_INDENT.match(text.expandtabs(4)).group(0))
        text = text.strip()

        if pending is not None:
            if indent <= stack[-1][0]:
                raise FlowSyntaxError(pending.line, f"o bloco '{pending.header}:' está vazio (indente o corpo)")
            stack.append((indent, pending))
            pending = None

        while indent < stack[-1][0]:
            stack.pop()
        if indent != stack[-1][0]:
            raise FlowSyntaxError(number, "indentação inesperada ou inconsistente")
        parent = stack[-1][1]

        split = _split_header(text)
        kind = _block_kind(split[0]) if split else None
        if split and kind:
            header, inline = split
            block = Block(kind=kind, header=header, line=number)
            if kind in ("antes", "depois", "linha", "comando") and parent is not root:
                raise FlowSyntaxError(number, f"'{header}:' só pode aparecer no nível principal")
            parent.body.append(block)
            if inline:
                block.body.append(_parse_command(inline, number))
            else:
                pending = block
            continue
        parent.body.append(_parse_command(text, number))

    if pending is not None:
        raise FlowSyntaxError(pending.line, f"o bloco '{pending.header}:' está vazio (indente o corpo)")

    return _assemble(root)


def _assemble(root: Block) -> Script:
    before, per_row, after, loose = [], [], [], []
    macros: dict[str, Block] = {}
    settings: dict[str, tuple[str, int]] = {}
    has_row_block = False

    for item in root.body:
        if isinstance(item, Block) and item.kind == "antes":
            before.extend(item.body)
        elif isinstance(item, Block) and item.kind == "depois":
            after.extend(item.body)
        elif isinstance(item, Block) and item.kind == "linha":
            has_row_block = True
            per_row.extend(item.body)
        elif isinstance(item, Block) and item.kind == "comando":
            name = item.header.split(None, 1)[1].strip() if " " in item.header else ""
            if not _NAME.match(name):
                raise FlowSyntaxError(item.line, "use: comando nome_do_comando:")
            if canonical(name):
                raise FlowSyntaxError(item.line, f"'{name}' já é um comando embutido")
            macros[name.lower()] = item
        elif isinstance(item, Command) and item.name in SETTINGS:
            settings[item.name] = (item.arg, item.line)
        else:
            loose.append(item)

    if has_row_block:
        # comandos soltos no topo rodam uma vez, antes de tudo
        before = loose + before
    else:
        per_row = loose + per_row
    return Script(before=before, per_row=per_row, after=after, macros=macros, settings=settings)
