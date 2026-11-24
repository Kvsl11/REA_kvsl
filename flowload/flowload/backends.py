"""Backends de execução.

- SimulatedBackend: não toca no sistema; registra cada ação (para testes e
  para o modo --simular).
- WindowsBackend: envia teclas/mouse de verdade com a API Win32 SendInput
  (a mesma família de API que o DataLoad usa: SendInput, keybd_event,
  mouse_event, SetCursorPos, SetForegroundWindow, GetAsyncKeyState).
  Texto é enviado como Unicode (KEYEVENTF_UNICODE), então acentos e
  caracteres especiais não dependem de página de código.
"""

from __future__ import annotations

import sys
import time
from typing import Callable

from .keys import VK, Chord


class StopRequested(Exception):
    """O usuário pediu para parar (tecla ESC ou botão Parar)."""


class Backend:
    key_delay = 0.0

    def focus(self, title: str, timeout: float) -> None: ...
    def wait_window(self, title: str, timeout: float) -> None: ...
    def type_text(self, text: str) -> None: ...
    def paste(self, text: str) -> None: ...
    def key(self, chord: Chord) -> None: ...
    def click(self, x: int, y: int, button: str, double: bool) -> None: ...
    def sleep(self, seconds: float) -> None:
        end = time.monotonic() + seconds
        while True:
            self.check_stop()
            left = end - time.monotonic()
            if left <= 0:
                return
            time.sleep(min(left, 0.05))

    def pace(self, seconds: float) -> None:
        """Pausa automática entre comandos (ajuste 'atraso')."""
        self.sleep(seconds)

    def pause(self, message: str) -> bool:
        return True

    def check_stop(self) -> None: ...


class SimulatedBackend(Backend):
    def __init__(self, echo: Callable[[str], None] | None = None, windows: list[str] | None = None):
        self.actions: list[tuple] = []
        self.echo = echo
        self.windows = windows  # None = qualquer janela "existe"
        self.stop_flag = False

    def _rec(self, *action) -> None:
        self.check_stop()
        self.actions.append(action)
        if self.echo:
            self.echo("  [sim] " + " ".join(str(a) for a in action))

    def _check_window(self, title: str) -> None:
        if self.windows is not None and not any(title.lower() in w.lower() for w in self.windows):
            raise RuntimeError(f"janela não encontrada: '{title}'")

    def focus(self, title, timeout):
        self._check_window(title)
        self._rec("janela", title)

    def wait_window(self, title, timeout):
        self._check_window(title)
        self._rec("esperar_janela", title)

    def type_text(self, text):
        self._rec("escrever", text)

    def paste(self, text):
        self._rec("colar", text)

    def key(self, chord):
        self._rec("tecla", str(chord))

    def click(self, x, y, button, double):
        self._rec("clique", x, y, button, "duplo" if double else "simples")

    def sleep(self, seconds):
        self._rec("esperar", seconds)

    def pace(self, seconds):
        self.check_stop()  # não registra: é só ritmo

    def pause(self, message):
        self._rec("pausa", message)
        return True

    def check_stop(self):
        if self.stop_flag:
            raise StopRequested()


class WindowsBackend(Backend):  # pragma: no cover - requer Windows
    def __init__(self, stop_key: str = "ESC"):
        if sys.platform != "win32":
            raise RuntimeError("o modo real só funciona no Windows; use --simular aqui")
        import ctypes
        from ctypes import wintypes

        self.ct = ctypes
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.stop_vk = VK[stop_key.upper()]
        self.stop_flag = False

        ULONG_PTR = ctypes.c_size_t

        class KEYBDINPUT(ctypes.Structure):
            _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                        ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

        class MOUSEINPUT(ctypes.Structure):
            _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

        class HARDWAREINPUT(ctypes.Structure):
            _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]

        class _U(ctypes.Union):
            _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT)]

        class INPUT(ctypes.Structure):
            _anonymous_ = ("u",)
            _fields_ = [("type", wintypes.DWORD), ("u", _U)]

        self.INPUT, self.KEYBDINPUT, self.MOUSEINPUT = INPUT, KEYBDINPUT, MOUSEINPUT
        self.user32.SendInput.argtypes = (wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
        self.user32.GetWindowTextW.argtypes = (wintypes.HWND, wintypes.LPWSTR, ctypes.c_int)
        self.EnumProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    # --- utilidades -------------------------------------------------------
    def check_stop(self):
        if self.stop_flag or (self.user32.GetAsyncKeyState(self.stop_vk) & 0x8000):
            raise StopRequested()

    def _send(self, inputs):
        arr = (self.INPUT * len(inputs))(*inputs)
        sent = self.user32.SendInput(len(inputs), arr, self.ct.sizeof(self.INPUT))
        if sent != len(inputs):
            raise RuntimeError("SendInput foi bloqueado (a janela alvo pode estar rodando como administrador)")

    def _kbd(self, vk=0, scan=0, flags=0):
        return self.INPUT(type=1, ki=self.KEYBDINPUT(wVk=vk, wScan=scan, dwFlags=flags, time=0, dwExtraInfo=0))

    def _find(self, title: str):
        found = []
        needle = title.lower()

        def cb(hwnd, _):
            if self.user32.IsWindowVisible(hwnd):
                buf = self.ct.create_unicode_buffer(512)
                self.user32.GetWindowTextW(hwnd, buf, 512)
                if needle in buf.value.lower():
                    found.append(hwnd)
                    return False
            return True

        self.user32.EnumWindows(self.EnumProc(cb), 0)
        return found[0] if found else None

    # --- ações ------------------------------------------------------------
    def wait_window(self, title, timeout):
        end = time.monotonic() + timeout
        while self._find(title) is None:
            if time.monotonic() > end:
                raise RuntimeError(f"janela '{title}' não apareceu em {timeout:g}s")
            self.sleep(0.2)

    def focus(self, title, timeout):
        self.wait_window(title, timeout)
        hwnd = self._find(title)
        if self.user32.IsIconic(hwnd):
            self.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        # truque do ALT: libera SetForegroundWindow quando outro app está na frente
        self._send([self._kbd(vk=VK["ALT"]), self._kbd(vk=VK["ALT"], flags=2)])
        self.user32.SetForegroundWindow(hwnd)
        end = time.monotonic() + 3
        while self.user32.GetForegroundWindow() != hwnd:
            if time.monotonic() > end:
                raise RuntimeError(f"não consegui trazer '{title}' para frente")
            self.sleep(0.05)

    def type_text(self, text):
        for ch in text:
            self.check_stop()
            if ch == "\n":
                self.key(Chord(("ENTER",)))
                continue
            data = ch.encode("utf-16-le")
            units = [int.from_bytes(data[i:i + 2], "little") for i in range(0, len(data), 2)]
            seq = [self._kbd(scan=u, flags=0x0004) for u in units] + [self._kbd(scan=u, flags=0x0004 | 0x0002) for u in units]
            self._send(seq)
            if self.key_delay:
                time.sleep(self.key_delay)

    def paste(self, text):
        import subprocess

        # clip.exe aceita UTF-16; evita gerenciar memória global via ctypes
        subprocess.run(["clip"], input=text.encode("utf-16-le"), check=True)
        self.key(Chord(("CTRL", "V")))

    def key(self, chord):
        ext = {VK[k] for k in ("INSERT", "DELETE", "HOME", "END", "PGUP", "PGDN", "LEFT", "RIGHT", "UP", "DOWN")}
        for _ in range(chord.times):
            self.check_stop()
            vks = [VK[k] for k in chord.keys]
            down = [self._kbd(vk=v, flags=1 if v in ext else 0) for v in vks]
            up = [self._kbd(vk=v, flags=(1 if v in ext else 0) | 2) for v in reversed(vks)]
            self._send(down + up)
            if self.key_delay:
                time.sleep(self.key_delay)

    def click(self, x, y, button, double):
        self.user32.SetCursorPos(int(x), int(y))
        d, u = (0x0002, 0x0004) if button == "left" else (0x0008, 0x0010)
        mi = lambda f: self.INPUT(type=0, mi=self.MOUSEINPUT(dx=0, dy=0, mouseData=0, dwFlags=f, time=0, dwExtraInfo=0))
        for _ in range(2 if double else 1):
            self._send([mi(d), mi(u)])
            time.sleep(0.05)

    def pause(self, message):
        r = self.user32.MessageBoxW(None, message + "\n\nOK = continuar, Cancelar = parar", "FlowLoad", 0x1 | 0x40 | 0x40000)
        return r == 1
