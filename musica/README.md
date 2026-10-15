# Sonora

Player de música para web, com visual e funções inspirados nos grandes apps
de streaming, mas escrito do zero. As músicas vêm do
[Jamendo](https://www.jamendo.com): um catálogo de mais de 600 mil faixas
de artistas independentes, com licença Creative Commons, livre para ouvir.

## O que tem

- **Início** com prateleiras: em alta na semana, lançamentos, gêneros e mais tocadas.
- **Busca** de músicas, artistas e álbuns, e navegação por 16 gêneros.
- **Páginas de álbum e de artista** (com discografia).
- **Player completo**: tocar/pausar, anterior/próxima, barra de progresso,
  volume, modo aleatório, repetir (todas / uma), fila editável e controles
  na tela de bloqueio do celular.
- **Sua Biblioteca**: Músicas Curtidas e playlists próprias (criar,
  renomear, excluir, adicionar e remover músicas). Ficam salvas no navegador.
- **Celular**: barra de navegação inferior, mini player e player em tela cheia.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
cd musica
npm install
npm run dev
```

Abra o endereço que aparecer (normalmente http://localhost:5173).

### Client ID do Jamendo (gratuito)

Na primeira vez, o app pede um _Client ID_ do Jamendo:

1. Crie uma conta em <https://devportal.jamendo.com>.
2. Clique em **Create a new app**, dê qualquer nome e salve.
3. Copie o **Client ID** e cole na tela do app.

Ele fica salvo só no seu navegador. Para não precisar digitar, copie
`.env.example` para `.env.local` e preencha `VITE_JAMENDO_CLIENT_ID`.

## Publicar

```bash
npm run build
```

Gera a pasta `dist/`, que pode ser publicada em qualquer hospedagem de site
estático (GitHub Pages, Netlify, Vercel, Cloudflare Pages…). Atenção: se o
Client ID estiver no `.env.local`, ele vai junto no site publicado, e
qualquer visitante consegue vê-lo. O Client ID do Jamendo é feito para uso
em apps no navegador, mas respeite os
[termos de uso da API](https://devportal.jamendo.com/api_terms_of_use)
(uso não comercial no plano gratuito).

## Testes

```bash
npm test            # lógica do player e da API
npm run test:e2e    # o app inteiro num navegador Chromium de verdade
```

O teste de navegador usa respostas de exemplo no lugar do Jamendo, então
roda sem internet e sem Client ID. Para apontar para outro Chromium, use
`CHROMIUM_PATH=/caminho/do/chrome npm run test:e2e`.

## Estrutura

| Pasta             | O que tem                                                       |
| ----------------- | --------------------------------------------------------------- |
| `src/api/`        | Chamadas à API do Jamendo e conversão dos dados                 |
| `src/player/`     | Fila, aleatório e repetir (`queue.ts`) e o player de áudio      |
| `src/library/`    | Curtidas e playlists salvas no navegador                        |
| `src/pages/`      | Telas: Início, Buscar, Álbum, Artista, Gênero, Biblioteca, Fila |
| `src/components/` | Barra lateral, player, lista de músicas, cards, menus           |
| `e2e/`            | Teste ponta a ponta no navegador                                |

## Licença das músicas

Cada faixa do Jamendo tem sua própria licença Creative Commons, mostrada na
página do álbum. Ouvir é livre; para usar uma música em outro projeto,
confira a licença dela.
