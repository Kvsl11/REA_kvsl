"""Linha de comando: flowload verificar | simular | rodar | comandos | exemplo."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from . import __version__
from .backends import SimulatedBackend
from .data import load_table
from .engine import Runner, validate
from .lang import COMMANDS, FlowSyntaxError, parse

HELP = {
    "escrever": "digita o texto (aceita {coluna}). Ex.: escrever {fornecedor}",
    "colar": "cola o texto pela área de transferência (rápido, bom p/ textos longos)",
    "tecla": "tecla ou combinação. Ex.: tecla CTRL+S  |  tecla TAB x3  |  tecla ALT+F, S",
    "tab": "TAB (opcional: quantidade). Ex.: tab 2",
    "shift_tab": "volta um campo (SHIFT+TAB)",
    "enter": "ENTER", "esc": "ESC",
    "cima": "seta p/ cima", "baixo": "seta p/ baixo", "esquerda": "seta p/ esquerda", "direita": "seta p/ direita",
    "limpar": "apaga o campo atual (CTRL+A, DELETE)",
    "esperar": "espera N segundos. Ex.: esperar 1,5",
    "janela": "traz a janela (título contém o texto) para frente. Ex.: janela \"Oracle Applications\"",
    "esperar_janela": "espera uma janela aparecer (até timeout_janela)",
    "clicar": "clique esquerdo em x, y", "clique_duplo": "clique duplo em x, y", "clique_direito": "clique direito em x, y",
    "log": "escreve uma mensagem no log",
    "pausa": "mostra uma caixa e espera você confirmar",
    "pular_linha": "pula o resto desta linha da planilha",
    "parar": "encerra a execução",
    "legado": "executa tokens no formato antigo do DataLoad. Ex.: legado TAB \\{F4} *SL(2)",
}

EXAMPLE_FLOW = '''# Exemplo FlowLoad: cadastro de fornecedores
# Rode primeiro com:  flowload simular exemplo.flow exemplo.csv

atraso 0.1          # pausa entre comandos (segundos)
timeout_janela 20
ao_erro parar       # ou: continuar

# um comando seu, reutilizável
comando salvar_e_novo:
    tecla CTRL+S
    esperar 1
    baixo

antes:
    janela "Oracle Applications"
    log Iniciando {total} linhas

para cada linha:
    se {nome} vazio: pular_linha
    escrever {nome}
    tab
    escrever {cnpj}
    tab
    se {tipo} = PJ:
        tecla ALT+J
    tab 2
    colar {observacao}
    salvar_e_novo

depois:
    log Terminado às {hora}
'''

EXAMPLE_CSV = "nome;cnpj;tipo;observacao\nAcme Ltda;12.345.678/0001-90;PJ;Cliente desde 2019\n;;;linha vazia, será pulada\nJoão da Silva;123.456.789-00;PF;Ação & reação: acentos funcionam\n"


def _load(script_path: str, data_path: str | None, sheet: str | None):
    script = parse(Path(script_path).read_text(encoding="utf-8-sig"))
    table = load_table(data_path, sheet) if data_path else None
    return script, table


def _check(script, table) -> bool:
    problems = validate(script, table)
    for p in problems:
        print(f"✖ {p}", file=sys.stderr)
    return not problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="flowload", description="Automação de entrada de dados a partir de planilhas")
    ap.add_argument("--version", action="version", version=f"flowload {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    for name, helptext in (("verificar", "valida script e planilha sem executar nada"),
                           ("simular", "mostra cada ação que seria feita, sem tocar no teclado"),
                           ("rodar", "executa de verdade (Windows)")):
        p = sub.add_parser(name, help=helptext)
        p.add_argument("script")
        p.add_argument("dados", nargs="?" if name == "verificar" else None)
        p.add_argument("--aba", help="aba do .xlsx")
        if name != "verificar":
            p.add_argument("--de", type=int, default=1, help="primeira linha de dados (1 = primeira após o cabeçalho)")
            p.add_argument("--ate", type=int, help="última linha")
            p.add_argument("--relatorio", help="grava resultado por linha em CSV")
            p.add_argument("--ao-erro", choices=["parar", "continuar"])
        if name == "rodar":
            p.add_argument("--contagem", type=int, default=5, help="segundos antes de começar (default 5)")
            p.add_argument("--tecla-parar", default="ESC")

    sub.add_parser("comandos", help="lista os comandos da linguagem")
    ex = sub.add_parser("exemplo", help="cria exemplo.flow e exemplo.csv")
    ex.add_argument("pasta", nargs="?", default=".")

    a = ap.parse_args(argv)

    if a.cmd == "comandos":
        for canon, alts in COMMANDS.items():
            al = f"  (também: {', '.join(alts)})" if alts else ""
            print(f"{canon:15} {HELP.get(canon, '')}{al}")
        print("\nBlocos: antes:  para cada linha:  depois:  se <cond>:  repetir N:  comando nome:")
        print("Condições: vazio | não vazio | = valor | != valor | contém valor | não contém valor")
        print("Ajustes: atraso S | atraso_tecla S | timeout_janela S | ao_erro parar|continuar")
        print("Variáveis: {coluna}  {linha}  {total}  {data_hoje}  {hora}   ({{ e }} = chaves literais)")
        return 0

    if a.cmd == "exemplo":
        d = Path(a.pasta)
        d.mkdir(parents=True, exist_ok=True)
        for fn, content in (("exemplo.flow", EXAMPLE_FLOW), ("exemplo.csv", EXAMPLE_CSV)):
            target = d / fn
            if target.exists():
                print(f"já existe, não sobrescrevi: {target}")
                continue
            target.write_text(content, encoding="utf-8")
            print(f"criado: {target}")
        return 0

    try:
        script, table = _load(a.script, a.dados, a.aba)
    except FlowSyntaxError as e:
        print(f"✖ erro de sintaxe, {e}", file=sys.stderr)
        return 2
    except (OSError, ValueError, RuntimeError) as e:
        print(f"✖ {e}", file=sys.stderr)
        return 2

    if not _check(script, table):
        return 2
    if a.cmd == "verificar":
        extra = f", {len(table.rows)} linhas em {table.source}" if table else ""
        print(f"✔ script ok{extra}")
        return 0

    if a.cmd == "simular":
        backend = SimulatedBackend(echo=print)
    else:
        from .backends import WindowsBackend

        try:
            backend = WindowsBackend(stop_key=a.tecla_parar)
        except RuntimeError as e:
            print(f"✖ {e}", file=sys.stderr)
            return 2
        print(f"Começando em {a.contagem}s. Segure {a.tecla_parar} para parar a qualquer momento.")
        for i in range(a.contagem, 0, -1):
            print(f"  {i}...")
            time.sleep(1)

    runner = Runner(script, table, backend, log=print, on_error=a.ao_erro)
    report = runner.run(start=a.de, end=a.ate)
    print("Resumo:", report.summary())
    if a.relatorio:
        report.write_csv(a.relatorio)
        print(f"relatório: {a.relatorio}")
    return 0 if not report.count("erro") and not report.stopped else 1


if __name__ == "__main__":
    sys.exit(main())
