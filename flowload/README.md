# FlowLoad

Automação de entrada de dados a partir de planilhas, no estilo do DataLoad,
com uma linguagem de comandos simples em português.

```
flowload exemplo                       # cria exemplo.flow + exemplo.csv
flowload verificar exemplo.flow exemplo.csv
flowload simular   exemplo.flow exemplo.csv      # mostra cada ação, não digita nada
flowload rodar     exemplo.flow exemplo.csv --relatorio resultado.csv   # Windows
flowload comandos                      # lista tudo que a linguagem aceita
```

Requisitos: Python 3.10+. Nenhuma dependência obrigatória. Para ler `.xlsx`,
instale `pip install openpyxl` (ou salve a planilha como CSV).

Instalação local: `pip install -e .` dentro desta pasta, ou rode com
`python -m flowload ...`.

## A linguagem (`.flow`)

```flow
# comentário
atraso 0.1              # pausa entre comandos, em segundos
timeout_janela 20       # quanto esperar por uma janela
ao_erro parar           # ou: continuar

comando salvar_e_novo:  # você cria seus próprios comandos
    tecla CTRL+S
    esperar 1
    baixo

antes:                  # roda uma vez, antes da primeira linha
    janela "Oracle Applications"

para cada linha:        # roda para cada linha da planilha
    se {nome} vazio: pular_linha
    escrever {nome}
    tab
    escrever {cnpj}
    se {tipo} = PJ:
        tecla ALT+J
    tab 2
    colar {observacao}
    salvar_e_novo

depois:                 # roda uma vez, no final
    log Terminado às {hora}
```

`{coluna}` é trocado pelo valor da coluna (sem diferenciar maiúsculas). Também
existem `{linha}`, `{total}`, `{data_hoje}` e `{hora}`. Use `{{` e `}}` para
chaves literais. Se o arquivo não tiver `para cada linha:`, o script inteiro
roda para cada linha.

| Comando                                                                   | O que faz                                                                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `escrever texto`                                                          | digita (Unicode: acentos funcionam sempre)                                                                                          |
| `colar texto`                                                             | cola pela área de transferência, rápido para textos longos                                                                          |
| `tecla CTRL+S`, `tecla TAB x3`, `tecla ALT+F, S`                          | teclas e combinações                                                                                                                |
| `tab [n]`, `shift_tab`, `enter`, `esc`, `cima/baixo/esquerda/direita [n]` | atalhos                                                                                                                             |
| `limpar`                                                                  | apaga o campo atual                                                                                                                 |
| `esperar 1,5`                                                             | espera segundos                                                                                                                     |
| `janela "título"`                                                         | traz para frente a janela cujo título contém o texto                                                                                |
| `esperar_janela "título"`                                                 | espera a janela aparecer                                                                                                            |
| `clicar x, y`, `clique_duplo x, y`, `clique_direito x, y`                 | mouse                                                                                                                               |
| `log msg`, `pausa msg`                                                    | mensagem no log / caixa de confirmação                                                                                              |
| `pular_linha`, `parar`                                                    | controle de fluxo                                                                                                                   |
| `se <condição>:`                                                          | `vazio`, `não vazio`, `= v`, `!= v`, `contém v`, `não contém v`                                                                     |
| `repetir N:`                                                              | repete o bloco                                                                                                                      |
| `legado ...`                                                              | tokens no formato antigo do DataLoad (`TAB`, `\{F4}`, `\^s`, `*SL(2)`, `*CW(janela)`, `*ML(x,y)`, `*MR(x,y)`, `*DL(x,y)`, `*CLEAR`) |

Os comandos também aceitam nomes em inglês (`type`, `key`, `wait`, `focus`,
`click`...).

## O que melhora em relação ao DataLoad

- **Validação antes de rodar**: coluna inexistente, comando com erro de digitação
  (com sugestão), tecla inválida ou bloco mal indentado são apontados com o
  número da linha, antes de qualquer tecla ser enviada.
- **Simulação** (`simular`) mostra exatamente o que seria digitado.
- **Relatório por linha** (`--relatorio`): ok / pulada / erro + mensagem + tempo.
- **Retomar de onde parou**: `--de 57 --ate 120`.
- **Política de erro**: parar na primeira falha ou continuar e registrar.
- **Unicode real** (`SendInput` com `KEYEVENTF_UNICODE`): não depende da página
  de código, problema que o DataLoad tratava com uma lista de character sets.
- **Comandos do usuário** (`comando nome:`) substituem os "Command Groups" que o
  DataLoad lia do `commands.dat`.
- Scripts são texto puro: dá para versionar no Git e revisar.
- Parada segura: segure `ESC` (configurável com `--tecla-parar`).

## Como o DataLoad funciona (análise do `DataLoad.exe`)

Análise estática feita com o REA (`inspect-pe-resources`) e inspeção de
strings e imports; o programa não foi executado. SHA-256 analisado:
`346cbac3e041af5b9ed313d410aacd6844eca50f7c95c9cd1208443d2ec933cd`.

**Observado**

- PE32 GUI x86, escrito em **C++Builder 2010 (RAD Studio 7.0) / VCL**.
- 22 formulários VCL nos recursos RCDATA (`TFRMDATALOAD`, `TFRMCOMMANDS`,
  `TFRMDELAY`, `TFRMOPTIONS`, `TFRMRECORDER`, `TFRMDATABASES`, ...).
- Tela principal: grade de dados (`grdDataLoad`) com grades de cabeçalho e
  rodapé, abas **Data / Source / Script**, combos _Command Group_ e _Window_
  (janela alvo), importação do Excel, gravador de macro, "Start Load (F5)".
- Envio de entrada via Win32: `SendInput`, `keybd_event`, `mouse_event`,
  `SetCursorPos`, `SetForegroundWindow`, `ShowWindow`, área de transferência;
  `SetWindowsHookExW`/`GetAsyncKeyState` para ESC parar a carga; espera do
  cursor de ampulheta (`GetCursorInfo`, opção `HourGlass`).
- Modo "Browser Control" para Internet Explorer via COM (`IWebBrowser2`,
  `IHTMLElement`): `GOURL(`, `GOBACK`, `WAITONBUSY(`, `PROMPT(`, `*LOV(`.
- Tokens de comando: `TAB`, `ENTER`, `{TAB}`, `{F1}`–`{F24}`, `+{INSERT}`
  (estilo SendKeys), `*SL`, `*CW`, `*ML(`, `*MR(`, `*DL(`, `*CLEAR`, `*LOV(`.
- Arquivo `.dld` em seções de texto: `begindelays/enddelays`
  (`DataDelay`, `CellDelay`, `FormDelay`, `KeyHold`, `SystemHold`,
  `CWTimeout`, `BrowserTimeout`, `FieldTimeout`), `beginheader`, `beginother`
  (`Window=`, `Description=`, `CommandGroup=`), `begindata` (com `%TB%`,
  `%CR%`, `%LF%`, `%CRLF%`), `beginoptions` (`AutoTab`, `AutoInsert`,
  `SkipBlank`, `PasteLoad`, ...), `beginformat`, `begincommands`,
  `beginhdrgrid`, `beginftrgrid`, `beginscript`. `.dldx` é a versão cifrada.
- Importa _Forms Playback_ do Oracle (`.fld`, "# Forms Event File",
  `WINDOW`, `VALUE`, `USER_EXIT LOV`, `CLICK`, `FNDSCSGN`).
- Script PHP embutido (`PHP\php.exe`) com ganchos `OnStartLoad`, `OnRow(`,
  `OnCell(`, `OnCompleteLoad`, `OnOpenFile`, `OnSaveFile`.
- Conexão a bancos/Oracle E-Business Suite (`PHP\databases.cfg`, EZConnect).
- Arquivos externos: `commands.dat` (apelidos dos Command Groups),
  `droplists.dat`, `regkey.dat` (licença).

**Inferido / não verificado**

- O conteúdo exato dos Command Groups padrão (ex.: atalhos do Oracle Forms)
  vem do `commands.dat`, que não estava no material analisado.
- O formato `.dld` acima foi deduzido das strings; sem um arquivo de exemplo
  não implementei um importador. Envie um `.dld` para criar o conversor.

## Limitações atuais

- Modo `rodar` só no Windows (o motor e a simulação rodam em qualquer sistema).
- O modo real não foi testado neste ambiente (Linux); foi validado via
  simulação e testes automatizados (`python -m unittest discover -s tests -t .`).
- Ainda sem: espera da ampulheta, gravador de macro, controle de navegador
  (o IE morreu; a alternativa moderna seria Playwright), interface gráfica.
