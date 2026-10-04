# RoLivre

Extensao MV3 pro site da Roblox. Refaz, com API publica, as features que o
RoPro cobra — e tudo aparece **dentro da UI da Roblox**, nao num painel
flutuante.

## Instalar

1. `chrome://extensions` → liga **Modo do desenvolvedor**
2. **Carregar sem compactacao** → escolhe esta pasta
3. Recarrega a aba da Roblox (F5). Content script nao entra em aba ja aberta.

Mexeu no `background.js`? Reloada a extensao — service worker nao recarrega sozinho.

## O que ela faz e onde aparece

| Feature | Onde injeta |
|---|---|
| RAP, Value, Demanda, Tendencia, aviso de PROJECTED | linhas novas abaixo do preco, na pagina do item |
| Mercado do item | item NAO limitado: ranking de mais vendidos da semana na categoria, favoritos (+ quanto cresceu desde a ultima visita), preco/status, vendidos se tiver quantidade limitada. Limitado: painel acima do "Price Chart" da Roblox: vendas/dia (30 dias, vs mes anterior), RAP (30 dias), a venda agora, donos/hoard; graficos de 90 dias de preco medio de venda e de vendas por dia; "Mais numeros" fechado |
| Badge de valor nos cards | canto da miniatura, em qualquer grade (catalogo, perfil, inventario) |
| Entrar no servidor mais vazio | botao logo abaixo do Jogar |
| Regiao do servidor | chip em cada servidor, na aba Servidores |
| Seu tempo de jogo | mais uma estatistica na barra Ativo / Favoritos / Visitas |
| RAP e Value do inventario | mais duas pills ao lado de Amizades / Seguidores |
| Aviso de item novo da Roblox | notificacao do Chrome + lista no popup |
| Icone RoLivre | na barra do topo, ao lado da engrenagem (so logado) |
| Emblemas que voce tem | "7 de 25" no titulo, selo com a data em cada emblema, os que faltam em cinza |
| Aprovacao em % | mais uma estatistica na barra do jogo |
| Jogar direto do card | botao de play na capa de cada jogo (inicio, busca) |
| Amizades em comum | pill no perfil; clique abre a lista |
| Aviso de preco | botao do lado da estrela, na pagina do item; lista nas configuracoes |
| Esconder anuncios | some com jogos patrocinados e banners |
| Calculadora de troca | quadro com uma palavra (Boa troca / Troca justa / Troca ruim), o % grande, uma frase e no maximo um motivo; valores, demanda, RAP, tendencia e todos os alertas dentro de "Detalhes" (fechado); linha "Value (Rolimon's)" em cada lado; selos de demanda e de RAP ↑/↓ nos itens; raio + Value embaixo de cada item |
| Explorador de servidores | painel no topo da aba Servidores: cidade, lotacao, idade e ping; filtro por cidade, ordena por mais novo/antigo/vazio/ping |
| Entrar na sua regiao | botao abaixo do Jogar; cidade escolhida nas configuracoes |
| Likes ao vivo | numero exato de likes/dislikes, atualiza a cada 10 s |
| Card de info do item | hover em limitado: Value, RAP, demanda, tendencia, grafico do RAP |
| Busca de limitados | campo no menu do icone RoLivre, por nome ou sigla |
| Aviso de troca nova | notificacao com o Value de cada lado |
| Auto-recusar troca ruim | desligado por padrao; limite de perda em % (e PROJECTED opcional) nas configuracoes |
| Quem quer seus itens | botao "Ofertas" na barra lateral da Roblox (abaixo de Trade, com contador) abre `src/ofertas/ofertas.html`: a mais recente em destaque, as outras em linha por ordem de tempo (5 por vez), um botao "Abrir troca"; filtros e aviso dentro de "Ajustes" |
| Voz de troca | "Trade received" / "Trade completed" (sons/), com o navegador aberto; liga/desliga cada um e botao Ouvir nas configuracoes |
| Modo print | botao "Esconder #" na calculadora: borra todo numero de serie ("#536") dos cards ate desligar |
| Saldo na lista de trocas | selo "+12%" / "-30%" ao lado do nome em cada linha (Recebidas, Enviadas, Concluidas, Fechadas) |
| Protecao de troca enviada | a cada 5 min; avisa (com botao pra cancelar) ou cancela sozinho a troca que voce mandou e ficou ruim |
| Historico de lucro | configuracoes: ganho/perda de Value em 7 dias, 30 dias e total, com as ultimas trocas |
| Enviar troca | configuracoes: monta 1 troca (ate 4 seus por 1 item), trava de Value, lista de donos recentes com Premium e item fora de hold; um clique por troca |
| Anuncio no Rolimon's | monta nas configuracoes; posta na hora ou reposta sozinho a cada 25 min |

As marcadas "pago no RoPro" na pagina de configuracoes sao as que o RoPro
cobra no Plus ou no Rex.

Ideias de RoPro e BTRoblox, codigo escrito do zero: o BTRoblox nao tem
licenca, entao copiar o codigo dele nao e permitido.

Cada linha acima liga e desliga na **pagina de configuracoes** (`src/options`):
clique no icone da barra → Configuracoes, ou no popup. Tema e limpeza de cache
tambem moram la.

Popup (icone da extensao): ultimos lancamentos, mais jogados e favoritos.

## A ideia central: clonar, nao recriar

`RL.cloneStat`, `RL.clonePill` e `RL.cloneRow` pegam um elemento que **ja esta
na pagina**, clonam e so trocam o texto. O visual acompanha a Roblox de graca,
inclusive tema claro/escuro, e sobrevive a troca de classes deles. Recriar a
marcacao na mao quebraria a cada deploy.

## Antes de publicar

`node tools/checar-globais.mjs`. Os content scripts dividem o mesmo escopo:
dois `const` com o mesmo nome em arquivos diferentes fazem o segundo arquivo
nao carregar, sem erro visivel no site (derrubou a calculadora de troca na
0.8.1). Teste em replica tem que carregar TODOS os content scripts, na ordem
do manifest, nao so o arquivo mexido.

## Onde fica cada coisa

| Arquivo | Papel |
|---|---|
| `src/lib/api.js` | Todo fetch. Roda no service worker pra escapar do CORS. |
| `src/background.js` | Roteador de mensagens, cache, tick de playtime, checagem de lancamentos. |
| `src/content/core.js` | Helpers e os clones de elemento nativo. |
| `src/content/features/*` | Uma feature por arquivo: `test()` diz onde roda, `mount()` injeta. |
| `src/content/boot.js` | MutationObserver que re-roda as features + tema. |
| `src/content/page-bridge.js` | Unico script no mundo da pagina: `joinGameInstance` e o id de cada servidor. |
| `src/lib/catalogo.js` | Lista de features com nome, descricao e padrao. Lida pelos tres contextos. |
| `src/options/*` | Pagina de configuracoes. |
| `src/ofertas/*` | Pagina Ofertas (quem quer seus itens). Fonte Bricolage Grotesque local (OFL) so nos numeros grandes. |

Feature nova = mais um arquivo em `features/`, a linha dele no `manifest.json`
e uma entrada em `src/lib/catalogo.js` com o mesmo `id` (e ela que aparece na
pagina de configuracoes). Todo `mount()` tem que ser idempotente — use `RL.once(el, "Tag")`, porque o
observer chama de novo a cada mudanca no DOM.

## O que e fragil, e por que

- **Id do servidor** — a aba Servidores nao poe o id no HTML (e React). O
  `page-bridge.js` sobe pela arvore do React a partir de cada card ate achar
  uma prop com UUID e carimba em `data-rl-gameid`. Se a Roblox mudar as props,
  e aqui que quebra.
- **Regiao** — sai do `gamejoin.roblox.com/v1/join-game-instance`, que devolve o
  IP publico do servidor (`UdmuxEndpoints`). So responde com IP se o
  User-Agent for `Roblox/WinInet` — uma regra de `declarativeNetRequest` troca
  isso so nas chamadas do service worker. O IP vira cidade pela tabela
  `src/lib/regioes.js` (faixa /24 → datacenter), gerada por
  `node tools/gerar-regioes.mjs`. Rate limit curto: um clique por servidor,
  12h de cache.
- **Value** — Rolimon's, API nao oficial. Pode sumir sem aviso.
- **Playtime** — a Roblox nao expoe horas jogadas. O background pergunta de
  minuto em minuto se voce esta em jogo e soma. So conta com o Chrome aberto.
- **Inventario** — vai logado, entao o seu e o de amigos abrem. Privado vira a
  pill "Inventario privado"; acima de 1000 limitados o numero ganha um "+".
- **Amizades em comum** — `friends/find` so devolve ids. Quem esconde a lista
  responde 403, e a pill vira "— em comum".
- **Aviso de preco** — `catalog/items/details` (POST, ate 120 itens por vez) a
  cada 5 min. Preco = o menor entre venda direta e revenda; `null` = fora de
  venda. Avisa quando cai ou quando volta a venda.
- **Calculadora de troca** — le o id de cada item pelo link `/catalog/:id` do
  card (`li.trade-item-card` no detalhe, `.trade-request-item` na janela). A
  Roblox poe a sua oferta sempre primeiro (`toSorted` por isMyOffer no
  Trades.js). Testada so numa replica da tela: a conta de teste nao tinha
  troca nem privacidade de troca aberta.
- **Idade do servidor** — `ServerClaimedTime` do mesmo join-game-instance da
  regiao. O explorador faz 4 consultas em paralelo; 30 seguidas em 10 s
  passaram sem limite.
- **Aviso de troca nova** — lista em `/v1/trades/Inbound`, detalhe em
  `/v2/trades/:id` (`participantAOffer`/`participantBOffer`). Robux entra com
  a taxa de 30% ja descontada. Nunca testado com troca real.
- **Pacotes (cabeca dinamica)** — a Roblox virou ~160 rostos limitados em
  pacote DynamicHead, com id novo (Snowflake Eyes: asset 76233968067050 ->
  bundle 259144677693420), e o site linka `/bundles/:id`. A base e a v2
  (assets, ainda com o id antigo, que o Rolimon's usa em anuncio e
  playerassets) + `bundles` da `items/v3/itemdetails`. Tudo que le card ou
  link passa por `RL.refDoCard`/`RL.dado`, que sabem o tipo. Pacote nao tem
  grafico de RAP (o resale-data da Roblox e so de asset).
- **Saldo na lista** — a tela e React (`.trades-react`): linha = `.trade-row`,
  nome em `.text-lead`, e o unico id na linha e o link `/users/:id/profile` de
  quem esta do outro lado. Casa com a lista da API na ordem (mesma pessoa com
  duas trocas: a proxima dela). A lista v1 veio SEM `user.id` na pratica,
  apesar do swagger: o id vem do detalhe v2. Aba ativa = posicao do botao com
  `aria-pressed` (Received/Sent/Completed/Closed; o texto muda com o idioma).
  Detalhe de troca fica em `trocasDet` (400 ultimos): a oferta nao muda.
  Validado na conta real em 29/09/2026.
- **Quem quer seus itens** — `getrecentads` so cobre ~3 min (~187
  anuncios); a pagina `/trades` embute 2000 em `var trade_ads` (~26 min). O
  alarme de 2 min junta os recentes; "Buscar agora" usa a pagina. Anuncio =
  `[id, ts, uid, nome, {items, robux}, {items, tags}]`, ids de ASSET; tags
  1 Qualquer, 2 Demanda, 3 Raros, 4 Robux, 5 Upgrade, 6 Downgrade, 7 RAP,
  8 Wishlist, 9 Projecteds, 10 Adds. "Seus itens" = playerassets do
  Rolimon's (30 min de cache). Robux da oferta conta com a taxa de 30%.
  Botao da barra: clone do `li` do Trade (`ul a[href$="/trades"]`), tira o
  `bg-shift-*` (marca de ativo); sem troca recebida o Trade nao tem selo, e o
  contador e emprestado de `li > a > span > .foundation-web-badge` (o cartao
  "Share Plus" tambem tem selo, com outra estrutura - nao pegar dele).
- **Voz de troca** — `sons/troca-*.mp3` = sininho (ffmpeg, senoides) + voz
  neural da Microsoft (edge-tts, padrao `en-US-AvaNeural`), normalizado em
  -16 LUFS. Refazer/trocar a voz: `tools/gerar-sons.sh <voz>` (o `say` do
  macOS soou robotico pro usuario). O
  service worker nao toca audio: `src/offscreen/som.html` (permissao
  `offscreen`, reason AUDIO_PLAYBACK) toca e responde `{tocou}`. Recebida =
  troca nova no poll de 1 min que nao foi auto-recusada; concluida = id novo
  nas 10 ultimas Completed (tambem dispara o historico). Primeira rodada so
  grava a linha de base.
- **Modo print** — a Roblox parte o serial em dois spans (`#` e `743`)
  dentro de `.limited-number-container`: o CSS borra essa caixa direto (a
  busca pelo texto inteiro "#743" nao pegava - bug da 0.14.0). A busca por
  texto (`Serial #123`, `#12/500`) ficou de reserva e so varre com o modo
  ligado. Estado em `ocultarSerial`. Validado na troca real em 29/09/2026.
- **Mercado do item** — a `economy/v1/assets/:id/resale-data` da Roblox
  PAROU em 31/01/2025 (o "Price Chart" da propria Roblox usa ela). Fonte nova:
  pagina do item/pacote no Rolimon's (`sales_data` diario, `history_data` de
  30 em 30 min, `ownership_data`, `value_changes`, `item_details_data` ou
  `bundle_details_data`). Pagina de ~2 MB, ~3 s: o background guarda so o
  resumo (`ana:*`, 30 min). O grafico do card de info usa a mesma fonte.
  Cor do grafico validada com o validador do dataviz (#2a78d6 claro, #3987e5
  escuro). Validado na pagina real em 01/10/2026.
- **Mercado de item normal** — vendas sao escondidas (`Sales` = 0 pra quem
  nao e o criador). Ranking: `catalog/v1/search/items` com `sortType=2`
  (vendas) e `sortAggregation=3` (semana), 120 por pagina, ate 600; a busca
  da 429 depois de ~12 chamadas seguidas, entao 1 h de cache e para no
  primeiro erro. Categoria pelo `assetType`/`bundleType` do catalog details
  (nomes de `v1/search/navigation-menu-items`: cabelo e `Body/HairAccessories`,
  roupa 3D e `Clothing/*Accessories`). Favoritos: `favHist`, um ponto por
  visita (max 1/h). Validado em 01/10/2026 (#37 e #5 da semana).
- **Indicador de RAP** — item sem Value vale pelo RAP, que anda ~10% na
  direcao do preco a cada venda. A proxima venda sai pelo menor preco a venda
  (`lowestResalePrice` do POST `catalog/v1/catalog/items/details`, ate 120 por
  chamada, 5 min de cache): acima do RAP = sobe, abaixo = cai, margem de 5%.
  O RAP comparado e o que a carta da Roblox mostra (mais atual que o do
  Rolimon's). Validado na conta real em 29/09/2026.
- **Historico de lucro** — trocas que ja existiam quando ligou contam com o
  Value de hoje (`aprox`); as novas, com o do momento em que foram vistas. A
  data e a de criacao da troca (a API nao da a de conclusao).
- **Veredito da calculadora** — Boa >= +5% de Value, Justa de -2% a +5%,
  Ruim abaixo. Alerta nivel 3 (PROJECTED do outro lado) derruba pra Ruim;
  nivel 2 (demanda caindo 2 niveis ou pra Normal/pior, item em queda no
  Rolimon's, RAP caindo, mais da metade do recebido sem Value) segura Boa em
  Justa e vira a linha "Atencao". O usuario achou o quadro antigo (6 linhas
  + alertas) confuso: tudo alem disso vai em Detalhes.
- **Auto-recusar troca ruim** — roda no mesmo poll de 1 min do aviso de troca
  e recusa com `POST /v1/trades/:id/decline`. So troca com `created` depois de
  `recusa.desde` (gravado ao ligar): a lista de vistas pode estar velha se o
  aviso estava desligado, e sem a data a caixa antiga seria recusada inteira.
  Testado com o background rodando no Node e a API da Roblox simulada; nunca
  recusou troca real.
- **Enviar troca** — SEMIAUTOMATICO DE PROPOSITO: cada troca sai de um clique,
  com 30 s entre uma e outra, e quem recebeu some da lista por 7 dias. Envio
  automatico pra varios donos e o que a Roblox pune como spam/bot; o usuario
  decidiu nao fazer (28/09/2026). Donos: a Roblox responde 403 no
  `inventory/v2/assets/:id/owners` pra quem esta logado (so o criador ve);
  a lista vem de `var bc_copies_data` na pagina do item no Rolimon's (copias
  Premium, com `bc_updated` e `bc_last_online`), ordenada pela troca de dono
  mais recente. Premium/elegivel: `v2 can-trade-with`.
  Hold: `v2 tradableItems` do alvo. Envio: `POST v2/trades/send` com
  `collectibleItemInstanceIds`. Trava: so envia se Value recebido >= dado;
  bloqueia item pedido PROJECTED ou sem dado no Rolimon's. Testado com a
  Roblox simulada; nunca enviou troca real.
- **Anuncio no Rolimon's** — mesma chamada da pagina `/tradeadcreate` deles:
  `POST api.rolimons.com/tradeads/v1/createad` com `player_id`,
  `offer_item_ids`, `request_item_ids`, `request_tags` (e `offer_robux`). O
  `player_id` sai do cookie `_RoliData` (JWT). Os cookies do rolimons.com
  entram por regra de rede so pro createad vindo do worker: sem isso o worker
  nao leva cookie (SameSite). Antes de postar chama `playerassets/:id`, que
  reescaneia o inventario (senao volta 7107). Limites deles: cooldown 15 min,
  60 por 24h, Premium obrigatorio. Testado ate o servidor responder code 5
  (cookie chegou, verificacao falsa); nunca postou um anuncio de verdade.
- **Lancamentos** — poll de 2 min no catalogo da conta oficial (id 1). A
  primeira rodada so grava a linha de base, pra nao disparar 30 notificacoes.

Nao da pra medir ping de verdade pelo navegador — o que existe e a regiao do
datacenter pelo IP do servidor.
