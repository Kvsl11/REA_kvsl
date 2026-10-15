# Sonora

Player de música para web com visual e funções no estilo Spotify, feito
para músicos: além de ouvir, você monta **setlists**, **grava a duração dos
seus shows** música por música e acompanha **estatísticas** de tudo o que
tocou. Toca arquivos do seu aparelho e, opcionalmente, o catálogo livre do
[Jamendo](https://www.jamendo.com).

## O que tem

### Modo show

- **Setlists**: playlists na ordem do show, com tempo previsto, tom e BPM de
  cada música, e setas para reordenar.
- **Gravar o show**: toque em _Iniciar show_ e o app cronometra:
  - a duração total do show;
  - cada música (início, quanto durou e a diferença em relação ao previsto);
  - os intervalos e o tempo entre músicas;
  - quais músicas do setlist ficaram de fora e quais foram extras.
- Dois jeitos de gravar:
  - **Ao vivo**: a banda toca; você toca em _Próxima música_ (ou aperta → / N).
  - **Tocar as músicas**: o app toca o setlist (playback, DJ) e registra sozinho.
- Na tela do show, o tom, o BPM (com metrônomo visual) e as suas notas
  aparecem em letra grande. A tela fica acesa e o show continua gravando
  mesmo se a página recarregar.
- **Relatório** de cada show, com anotações e exportação para planilha (CSV,
  abre no Excel).

### Suas músicas

- **Importe arquivos** (MP3, M4A, FLAC, WAV, OGG, OPUS…) pelo botão ou
  arrastando para a página. Título, artista, álbum, ano, gênero, capa e
  duração são lidos do arquivo. Sem etiquetas, o nome do arquivo
  (“Artista - Música.mp3”) é usado.
- **Edite tudo** o que vier faltando ou errado, inclusive a capa.
- Os arquivos ficam guardados no navegador e tocam sem internet.

### Histórico e estatísticas

- Cada reprodução registra os segundos realmente ouvidos. Conta como
  “tocada” a partir de 30 s (ou metade de músicas curtas), como no Spotify.
- **Estatísticas** por período (7 dias, 30 dias, 12 meses, tudo) e por
  origem (ouvindo × em shows): tempo total, vezes tocadas, músicas e
  artistas mais tocados, gráfico de tempo por dia/mês e histórico recente.
- **Página de cada música** com vezes tocada, minutos, vezes em shows e
  quando tocou.

### Player e biblioteca (estilo Spotify)

- Início com atalhos, “Tocadas recentemente” e prateleiras; busca; páginas
  de álbum, artista e gênero (Jamendo).
- Player com aleatório, repetir, fila editável, volume, tecla de espaço e
  controles na tela de bloqueio.
- Músicas Curtidas, playlists e setlists.
- Versão de celular com barra inferior, mini player e player em tela cheia.

### Backup

- Exporte tudo (playlists, setlists, shows, histórico, tom/BPM/notas e,
  se quiser, os arquivos de áudio) num arquivo e restaure em outro aparelho.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
cd musica
npm install
npm run dev
```

Abra o endereço que aparecer (normalmente http://localhost:5173). Na
primeira vez, escolha **“Pular — usar só minhas músicas”** ou conecte o
Jamendo.

### Jamendo (opcional, gratuito)

1. Crie uma conta em <https://devportal.jamendo.com>.
2. Clique em **Create a new app**, dê qualquer nome e salve.
3. Copie o **Client ID** e cole no app (na tela inicial ou em Configurações).

Para não precisar digitar, copie `.env.example` para `.env.local` e
preencha `VITE_JAMENDO_CLIENT_ID`. O plano gratuito da API do Jamendo é para
uso não comercial; veja os
[termos de uso](https://devportal.jamendo.com/api_terms_of_use).

## Onde os dados ficam

Tudo fica **só no navegador do aparelho** (IndexedDB e localStorage): nada
vai para um servidor. Por isso:

- outro navegador ou aparelho começa vazio. Use **Configurações → Backup**
  para levar os dados;
- limpar os dados do site apaga tudo. Faça backup de vez em quando e use
  _Proteger meus dados_ em Configurações.

## Publicar

```bash
npm run build
```

Gera a pasta `dist/`, que pode ser publicada em qualquer hospedagem de site
estático (GitHub Pages, Netlify, Vercel, Cloudflare Pages…). Se o Client ID
estiver no `.env.local`, ele vai junto no site publicado.

## Testes

```bash
npm test            # lógica: fila, show, estatísticas, importação, backup
npm run test:e2e    # o app inteiro num navegador Chromium de verdade
```

O teste de navegador importa arquivos de áudio gerados, edita dados, monta
um setlist, grava um show ao vivo (avançando o relógio) e um show em
playback, confere relatório, planilha, estatísticas e backup. Ele usa
respostas de exemplo no lugar do Jamendo, então roda sem internet. Para
apontar para outro Chromium: `CHROMIUM_PATH=/caminho/do/chrome npm run test:e2e`.

## Estrutura

| Pasta             | O que tem                                                     |
| ----------------- | ------------------------------------------------------------- |
| `src/show/`       | Lógica do show (`session.ts`) e o estado do show em andamento |
| `src/stats/`      | Histórico de reprodução e cálculo das estatísticas            |
| `src/local/`      | Importação de arquivos, etiquetas, capas e tom/BPM/notas      |
| `src/db/`         | Banco de dados do navegador (IndexedDB)                       |
| `src/player/`     | Fila, aleatório e repetir (`queue.ts`) e o player de áudio    |
| `src/library/`    | Curtidas, playlists e setlists                                |
| `src/api/`        | Catálogo do Jamendo                                           |
| `src/pages/`      | Telas                                                         |
| `src/components/` | Barra lateral, player, listas, menus, diálogos                |
| `e2e/`            | Teste ponta a ponta no navegador                              |
