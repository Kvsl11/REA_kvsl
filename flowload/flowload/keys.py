"""Teclas, combinações e tradução da sintaxe legada do DataLoad."""

from __future__ import annotations

import re
from dataclasses import dataclass

# nome -> código virtual do Windows (VK_*)
VK = {
    "BACKSPACE": 0x08, "BS": 0x08, "TAB": 0x09, "ENTER": 0x0D, "ENT": 0x0D,
    "SHIFT": 0x10, "CTRL": 0x11, "CONTROL": 0x11, "ALT": 0x12, "PAUSE": 0x13,
    "CAPSLOCK": 0x14, "ESC": 0x1B, "ESCAPE": 0x1B, "SPACE": 0x20, "ESPACO": 0x20,
    "PGUP": 0x21, "PAGEUP": 0x21, "PGDN": 0x22, "PAGEDOWN": 0x22,
    "END": 0x23, "FIM": 0x23, "HOME": 0x24, "INICIO": 0x24,
    "LEFT": 0x25, "ESQUERDA": 0x25, "UP": 0x26, "CIMA": 0x26,
    "RIGHT": 0x27, "DIREITA": 0x27, "DOWN": 0x28, "BAIXO": 0x28,
    "PRNTSCRN": 0x2C, "PRINTSCREEN": 0x2C, "INSERT": 0x2D, "INS": 0x2D,
    "DELETE": 0x2E, "DEL": 0x2E, "WIN": 0x5B, "NUMLOCK": 0x90,
}
for _i in range(1, 25):
    VK[f"F{_i}"] = 0x6F + _i
for _c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
    VK[_c] = ord(_c)

MODIFIERS = {"CTRL", "CONTROL", "SHIFT", "ALT", "WIN"}


@dataclass(frozen=True)
class Chord:
    """Uma combinação: modificadores + tecla principal, repetida N vezes."""

    keys: tuple[str, ...]
    times: int = 1

    def __str__(self) -> str:
        s = "+".join(self.keys)
        return f"{s} x{self.times}" if self.times > 1 else s


class KeySpecError(ValueError):
    pass


_TIMES = re.compile(r"\s+[xX]\s*(\d+)$")


def parse_chords(spec: str) -> list[Chord]:
    """Interpreta 'CTRL+S', 'TAB x3', 'ALT+F, S' (vírgula = sequência)."""
    chords = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        times = 1
        m = _TIMES.search(part)
        if m:
            times = int(m.group(1))
            part = part[: m.start()].strip()
        names = [p.strip().upper() for p in part.split("+")]
        for n in names:
            if n not in VK:
                raise KeySpecError(f"tecla desconhecida: '{n}'")
        if not names or (len(names) > 1 and names[-1] in MODIFIERS):
            raise KeySpecError(f"combinação inválida: '{part}'")
        chords.append(Chord(tuple(names), times))
    if not chords:
        raise KeySpecError("nenhuma tecla informada")
    return chords


# --------------------------------------------------------------------------
# Sintaxe legada do DataLoad
#
# Observado no executável (strings): \{TAB}, {ENTER}, {F4}..., "+{INSERT}"
# (prefixos estilo SendKeys: + Shift, ^ Ctrl, % Alt), *SL(n) espera,
# *CW(janela) troca de janela, *ML/*MR/*DL(x,y) cliques, *CLEAR.
# Os apelidos de "Command Group" (ex.: *SAVE) vinham de commands.dat,
# que NÃO está no .exe; recrie-os com blocos "comando nome:".
# --------------------------------------------------------------------------

_LEGACY_MOD = {"+": "SHIFT", "^": "CTRL", "%": "ALT"}
_BRACE = re.compile(r"\{([A-Za-z0-9]+)(?:\s+(\d+))?\}")
_STAR = re.compile(r"^\*(SL|CW|ML|MR|DL|CLEAR)(?:\((.*)\))?$", re.IGNORECASE)


def translate_legacy(token: str) -> list[tuple[str, object]]:
    """Converte um token legado em ações: ('key', Chord), ('text', str),
    ('wait', float), ('focus', str), ('click', (x, y, botão, duplo))."""
    t = token.strip()
    if not t:
        return []
    up = t.upper()
    if up in ("TAB", "ENT", "ENTER"):
        return [("key", Chord(("TAB" if up == "TAB" else "ENTER",)))]
    m = _STAR.match(t)
    if m:
        cmd, arg = m.group(1).upper(), (m.group(2) or "").strip()
        if cmd == "SL":
            return [("wait", float(arg or 1))]
        if cmd == "CW":
            return [("focus", arg.strip("\"'"))]
        if cmd == "CLEAR":
            return [("key", Chord(("CTRL", "A"))), ("key", Chord(("DELETE",)))]
        x, y = (int(v) for v in arg.split(","))
        return [("click", (x, y, "right" if cmd == "MR" else "left", cmd == "DL"))]
    if t.startswith("\\"):
        return _sendkeys(t[1:])
    return [("text", t)]


def _sendkeys(s: str) -> list[tuple[str, object]]:
    out: list[tuple[str, object]] = []
    i, mods = 0, []
    while i < len(s):
        ch = s[i]
        if ch in _LEGACY_MOD:
            mods.append(_LEGACY_MOD[ch])
            i += 1
            continue
        m = _BRACE.match(s, i)
        if m:
            name, n = m.group(1).upper(), int(m.group(2) or 1)
            if name not in VK:
                raise KeySpecError(f"tecla legada desconhecida: '{{{name}}}'")
            out.append(("key", Chord(tuple(mods) + (name,), n)))
            i = m.end()
        else:
            if mods:
                key = ch.upper()
                if key not in VK:
                    raise KeySpecError(f"combinação legada inválida perto de '{ch}'")
                out.append(("key", Chord(tuple(mods) + (key,))))
            else:
                out.append(("text", ch))
            i += 1
        mods = []
    # junta caracteres literais consecutivos
    merged: list[tuple[str, object]] = []
    for kind, val in out:
        if kind == "text" and merged and merged[-1][0] == "text":
            merged[-1] = ("text", merged[-1][1] + val)
        else:
            merged.append((kind, val))
    return merged
