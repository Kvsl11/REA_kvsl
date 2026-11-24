import tempfile
import unittest
from pathlib import Path

from flowload.backends import SimulatedBackend
from flowload.cli import EXAMPLE_CSV, EXAMPLE_FLOW, main
from flowload.data import load_table
from flowload.engine import Runner, validate
from flowload.keys import Chord, KeySpecError, parse_chords, translate_legacy
from flowload.lang import FlowSyntaxError, parse


def table_from(text: str):
    d = tempfile.mkdtemp()
    p = Path(d) / "d.csv"
    p.write_text(text, encoding="utf-8")
    return load_table(p)


def run(src: str, csv_text: str | None = None, **kw):
    script = parse(src)
    table = table_from(csv_text) if csv_text else None
    problems = validate(script, table)
    assert not problems, problems
    b = SimulatedBackend(**kw)
    report = Runner(script, table, b, log=lambda m: None).run()
    return b.actions, report


class LanguageTests(unittest.TestCase):
    def test_loose_commands_run_per_row(self):
        acts, rep = run("escrever {a}\ntab\n", "a\n1\n2\n")
        self.assertEqual(acts, [("escrever", "1"), ("tecla", "TAB"), ("escrever", "2"), ("tecla", "TAB")])
        self.assertEqual(rep.summary(), "2 ok, 0 puladas, 0 com erro")

    def test_blocks_before_after_and_aliases(self):
        src = 'antes:\n    focus "App"\npara cada linha:\n    type {Nome}\n    key CTRL+S\ndepois:\n    enter\n'
        acts, _ = run(src, "nome\nZé\n")
        self.assertEqual(acts, [("janela", "App"), ("escrever", "Zé"), ("tecla", "CTRL+S"), ("tecla", "ENTER")])

    def test_if_inline_and_block_and_repeat(self):
        src = (
            "para cada linha:\n"
            "    se {obs} vazio: pular_linha\n"
            "    se {tipo} = pj:\n"
            "        tecla ALT+J\n"
            "    repetir 2:\n"
            "        baixo\n"
        )
        acts, rep = run(src, "obs;tipo\nx;PJ\n;PJ\ny;PF\n")
        self.assertEqual([r.status for r in rep.results], ["ok", "pulada", "ok"])
        self.assertEqual(acts, [("tecla", "ALT+J"), ("tecla", "DOWN"), ("tecla", "DOWN"), ("tecla", "DOWN"), ("tecla", "DOWN")])

    def test_user_macro(self):
        src = "comando salvar:\n    tecla CTRL+S\n    esperar 1\npara cada linha:\n    salvar\n"
        acts, _ = run(src, "a\n1\n")
        self.assertEqual(acts, [("tecla", "CTRL+S"), ("esperar", 1.0)])

    def test_text_with_colon_is_not_a_block(self):
        acts, _ = run("escrever Valor: {v}\n", "v\n10\n")
        self.assertEqual(acts, [("escrever", "Valor: 10")])

    def test_literal_braces_and_builtins(self):
        acts, _ = run("escrever {{x}} {linha}/{total}\n", "a\n1\n2\n")
        self.assertEqual(acts, [("escrever", "{x} 1/2"), ("escrever", "{x} 2/2")])

    def test_syntax_errors_have_line_numbers(self):
        with self.assertRaises(FlowSyntaxError) as cm:
            parse("tab\n    enter\n")
        self.assertEqual(cm.exception.line, 2)
        with self.assertRaises(FlowSyntaxError):
            parse("para cada linha:\ntab\n")

    def test_validation_reports_unknown_column_command_and_key(self):
        script = parse("escrever {nao_existe}\nescrevr x\ntecla CTRL+QQ\nclicar 10\n")
        problems = validate(script, table_from("a\n1\n"))
        msgs = " | ".join(str(p) for p in problems)
        self.assertIn("linha 1: coluna 'nao_existe'", msgs)
        self.assertIn("Você quis dizer 'escrever'", msgs)
        self.assertIn("tecla desconhecida: 'QQ'", msgs)
        self.assertIn("use: clicar 120, 340", msgs)

    def test_column_var_outside_row_block_is_rejected(self):
        problems = validate(parse("antes:\n    escrever {a}\npara cada linha:\n    tab\n"), table_from("a\n1\n"))
        self.assertTrue(problems)


class EngineTests(unittest.TestCase):
    def test_error_stops_by_default_and_continue_policy(self):
        src = "janela X\nescrever {a}\n"
        script, table = parse(src), table_from("a\n1\n2\n")
        rep = Runner(script, table, SimulatedBackend(windows=["Outra"]), log=lambda m: None).run()
        self.assertEqual([r.status for r in rep.results], ["erro"])
        self.assertTrue(rep.stopped)
        self.assertIn("script linha 1", rep.results[0].message)
        rep = Runner(script, table, SimulatedBackend(windows=["Outra"]), log=lambda m: None, on_error="continuar").run()
        self.assertEqual([r.status for r in rep.results], ["erro", "erro"])

    def test_stop_and_range(self):
        acts, rep = run("se {a} = 2: parar\nescrever {a}\n", "a\n1\n2\n3\n")
        self.assertEqual(acts, [("escrever", "1")])
        self.assertTrue(rep.stopped)
        script, table = parse("escrever {a}\n"), table_from("a\n1\n2\n3\n")
        b = SimulatedBackend()
        Runner(script, table, b, log=lambda m: None).run(start=2, end=3)
        self.assertEqual(b.actions, [("escrever", "2"), ("escrever", "3")])

    def test_settings(self):
        script = parse("atraso 0\natraso_tecla 0,01\nao_erro continuar\ntab\n")
        r = Runner(script, None, SimulatedBackend())
        self.assertEqual((r.delay, r.b.key_delay, r.on_error), (0.0, 0.01, "continuar"))


class KeyAndLegacyTests(unittest.TestCase):
    def test_chords(self):
        self.assertEqual(parse_chords("ctrl+s"), [Chord(("CTRL", "S"))])
        self.assertEqual(parse_chords("TAB x3, ALT+F"), [Chord(("TAB",), 3), Chord(("ALT", "F"))])
        with self.assertRaises(KeySpecError):
            parse_chords("CTRL+")

    def test_legacy_tokens(self):
        self.assertEqual(translate_legacy("TAB"), [("key", Chord(("TAB",)))])
        self.assertEqual(translate_legacy("*SL(2)"), [("wait", 2.0)])
        self.assertEqual(translate_legacy("*CW(Oracle Applications)"), [("focus", "Oracle Applications")])
        self.assertEqual(translate_legacy("*DL(10,20)"), [("click", (10, 20, "left", True))])
        self.assertEqual(translate_legacy("\\+{INSERT}"), [("key", Chord(("SHIFT", "INSERT")))])
        self.assertEqual(translate_legacy("\\%fs"), [("key", Chord(("ALT", "F"))), ("text", "s")])
        self.assertEqual(translate_legacy("\\{TAB 3}ab"), [("key", Chord(("TAB",), 3)), ("text", "ab")])

    def test_legacy_command_in_script(self):
        acts, _ = run("legado {a} TAB \\^s *SL(1)\n", "a\nxyz\n")
        self.assertEqual(acts, [("escrever", "xyz"), ("tecla", "TAB"), ("tecla", "CTRL+S"), ("esperar", 1.0)])


class DataAndCliTests(unittest.TestCase):
    def test_csv_detection_encoding_and_padding(self):
        d = Path(tempfile.mkdtemp())
        (d / "x.csv").write_bytes("Nome;Cidade\nJosé;São Paulo\nAna\n\n".encode("cp1252"))
        t = load_table(d / "x.csv")
        self.assertEqual(t.rows, [{"Nome": "José", "Cidade": "São Paulo"}, {"Nome": "Ana", "Cidade": ""}])
        self.assertEqual(t.column(" nome "), "Nome")

    def test_duplicate_header_rejected(self):
        with self.assertRaises(ValueError):
            table_from("a,A\n1,2\n")

    def test_example_end_to_end(self):
        d = Path(tempfile.mkdtemp())
        (d / "e.flow").write_text(EXAMPLE_FLOW, encoding="utf-8")
        (d / "e.csv").write_text(EXAMPLE_CSV, encoding="utf-8")
        self.assertEqual(main(["verificar", str(d / "e.flow"), str(d / "e.csv")]), 0)
        self.assertEqual(main(["simular", str(d / "e.flow"), str(d / "e.csv"), "--relatorio", str(d / "r.csv")]), 0)
        self.assertIn("2;pulada", (d / "r.csv").read_text(encoding="utf-8-sig"))


if __name__ == "__main__":
    unittest.main()
