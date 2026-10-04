// Toda chamada de rede mora aqui, no service worker.
// Motivo: com host_permissions o fetch do worker ignora CORS. Chamando
// games.roblox.com direto do content script, metade dos endpoints bloqueia.

let csrf = null;

async function req(url, { method = "GET", body, auth = true } = {}) {
  const opts = {
    method,
    credentials: auth ? "include" : "omit",
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  if (csrf) opts.headers["X-CSRF-TOKEN"] = csrf;

  let r = await fetch(url, opts);

  // A Roblox devolve 403 + o token no header na primeira vez. Repete com ele.
  if (r.status === 403 && r.headers.get("x-csrf-token")) {
    csrf = r.headers.get("x-csrf-token");
    opts.headers["X-CSRF-TOKEN"] = csrf;
    r = await fetch(url, opts);
  }
  if (!r.ok) {
    const corpo = await r.json().catch(() => null);
    const erro = corpo?.errors?.[0];
    const e = new Error(erro?.message || `${method} ${url} -> ${r.status}`);
    e.status = r.status;
    e.code = erro?.code;
    // Captcha / verificacao em 2 etapas: a Roblox manda o tipo nesse header.
    // Nada aqui resolve desafio: quem chamou avisa e manda pro site.
    e.desafio = r.headers.get("rblx-challenge-type");
    throw e;
  }
  return r.json();
}

export const api = {
  // --- conta logada -------------------------------------------------------
  me: () => req("https://users.roblox.com/v1/users/authenticated"),

  presence: (userIds) =>
    req("https://presence.roblox.com/v1/presence/users", {
      method: "POST",
      body: { userIds },
    }),

  // --- jogos / servidores -------------------------------------------------
  // sortOrder Asc = mais vazios primeiro. excludeFullGames tira os lotados.
  servers: (placeId, { cursor = "", ordem = "Asc", semCheios = false } = {}) =>
    req(
      `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&sortOrder=${ordem}` +
        (semCheios ? "&excludeFullGames=true" : "") +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "")
    ),

  // Descobre o IP da maquina que hospeda um servidor (-> regiao) e quando ele
  // abriu. Testado: 30 seguidas em 10 s sem limite. Resultado fica em cache.
  joinScript: (placeId, gameId) =>
    req("https://gamejoin.roblox.com/v1/join-game-instance", {
      method: "POST",
      body: {
        placeId: Number(placeId),
        isTeleport: false,
        gameId,
        gameJoinAttemptId: crypto.randomUUID(),
      },
    }),

  // --- itens --------------------------------------------------------------
  // Base inteira de limitados do Rolimon's (RAP, value, demanda, projected).
  // v2, nao v1: a v1 deixa de fora ~50 limitados (Fall Fairy, Oozing Oscar...).
  // Pacotes vem da v3: a Roblox virou ~160 rostos limitados em cabeca dinamica
  // (pacote, outro id) e o site linka /bundles/:id. A v3 poe esses em
  // `bundles` e tira de `assets`; a v2 continua com o id antigo de asset, que
  // o Rolimon's ainda usa (anuncio, playerassets). Por isso as duas.
  rolimons: async () => {
    const [v2, v3] = await Promise.all([
      req("https://api.rolimons.com/items/v2/itemdetails", { auth: false }),
      req("https://api.rolimons.com/items/v3/itemdetails", { auth: false }).catch(() => ({})),
    ]);
    // `migrados`: ids de asset que viraram pacote (estao na v2, sairam da v3).
    // A busca mostra o pacote no lugar deles.
    const migrados = v3.assets ? Object.keys(v2.items || {}).filter((id) => !v3.assets[id]) : [];
    return { items: v2.items || {}, bundles: v3.bundles || {}, migrados };
  },

  // --- anuncio de troca no Rolimon's ----------------------------------------
  // Mesmas chamadas da pagina /tradeadcreate deles. A playerassets tambem
  // manda o Rolimon's escanear o inventario de novo: sem isso o anuncio volta
  // 7107 ("inventario nao escaneado ha pouco tempo").
  // Anuncios de troca publicos. A API da so os ~3 ultimos minutos; a pagina
  // /trades traz 2000 (~26 min) em `var trade_ads`. Formato de cada um:
  // [adId, timestamp s, userId, nome, { items, robux }, { items, tags }]
  anunciosRecentes: () => req("https://api.rolimons.com/tradeads/v1/getrecentads", { auth: false }).then((r) => r.trade_ads || []),
  anunciosPagina: async () => {
    const r = await fetch("https://www.rolimons.com/trades", { credentials: "omit" });
    const m = (await r.text()).match(/var trade_ads\s*=\s*(\[[\s\S]*?\]);\s*\n/);
    if (!m) throw new Error("A página de anúncios do Rolimon's mudou.");
    return JSON.parse(m[1]);
  },

  roliInventario: (playerId) => req(`https://api.rolimons.com/players/v1/playerassets/${playerId}`, { auth: false }),

  // Sem credentials: o cookie de verificacao entra por regra de rede
  // (ver cookieRolimons no background). Erro vem com o code deles em e.code.
  criarAnuncio: async (corpo) => {
    const r = await fetch("https://api.rolimons.com/tradeads/v1/createad", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) {
      const e = new Error(j?.message || `createad -> ${r.status}`);
      e.status = r.status;
      e.code = j?.code;
      throw e;
    }
    return j;
  },

  // Inventario de colecionaveis de um usuario. Vai logado: assim o seu proprio
  // inventario e o de amigos (quando fechado so pra amigos) tambem abrem.
  collectibles: (userId, cursor = "") =>
    req(
      `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Asc` +
        (cursor ? `&cursor=${cursor}` : "")
    ),

  // Catalogo de um criador, mais recentes primeiro. SortType=3 = recentes.
  // CreatorTargetId=1 / CreatorType=1 e a conta oficial "Roblox".
  itensDoCriador: (creatorId = 1, limit = 30) =>
    req(
      `https://catalog.roblox.com/v1/search/items/details?CreatorTargetId=${creatorId}` +
        `&CreatorType=1&SortType=3&Limit=${limit}`,
      { auth: false }
    ),

  // Preco atual de ate 120 itens numa chamada so (preco, menor revenda, status).
  catalogo: (itens) =>
    req("https://catalog.roblox.com/v1/catalog/items/details", {
      method: "POST",
      body: { items: itens.map(({ id, tipo }) => ({ itemType: tipo || "Asset", id: Number(id) })) },
    }),

  // Mais vendidos de uma subcategoria. sortType 2 = vendas, sortAggregation
  // 3 = semana. 120 por pagina. A busca limita (~12 chamadas seguidas = 429).
  maisVendidos: (categoria, subcategoria, cursor = "") =>
    req(
      `https://catalog.roblox.com/v1/search/items?category=${categoria}` +
        (subcategoria ? `&subcategory=${subcategoria}` : "") +
        `&sortType=2&sortAggregation=3&limit=120` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
      { auth: false }
    ),

  favoritos: (userId) =>
    req(`https://games.roblox.com/v2/users/${userId}/favorite/games?limit=50`),

  // Pagina do item (ou pacote) no Rolimon's: os dados vem em `var x = {...};`.
  // A resale-data da Roblox PAROU em jan/2025 (ultimo ponto 2025-01-31), entao
  // historico de venda/preco vem daqui. Pagina pesada (~2 MB): o background
  // so guarda o resumo calculado.
  paginaRolimons: async (id, pacote = false) => {
    const r = await fetch(`https://www.rolimons.com/${pacote ? "bundle" : "item"}/${id}`, { credentials: "omit" });
    if (!r.ok) throw new Error(`Rolimon's respondeu ${r.status}`);
    const html = await r.text();
    const ler = (nome) => {
      const m = html.match(new RegExp(`var ${nome}\\s*=\\s*([\\[{][\\s\\S]*?[\\]}]);\\s*\\n`));
      try {
        return m ? JSON.parse(m[1]) : null;
      } catch (_) {
        return null;
      }
    };
    return {
      detalhes: ler(pacote ? "bundle_details_data" : "item_details_data"),
      vendas: ler("sales_data"),
      historico: ler("history_data"),
      donos: ler("ownership_data"),
      values: ler("value_changes"),
    };
  },

  // --- trocas ---------------------------------------------------------------
  // Lista: v1. Detalhe: v2, com participantAOffer/participantBOffer (o mesmo
  // que o Trades.js da Roblox usa).
  trocas: (tipo = "Inbound", limit = 25, cursor = "") =>
    req(
      `https://trades.roblox.com/v1/trades/${tipo}?limit=${limit}&sortOrder=Desc` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "")
    ),
  troca: (id) => req(`https://trades.roblox.com/v2/trades/${id}`),
  recusarTroca: (id) => req(`https://trades.roblox.com/v1/trades/${id}/decline`, { method: "POST" }),

  // --- envio de troca, um clique por troca (v2: tudo por collectibleItemInstanceId)
  podeTrocar: () => req("https://trades.roblox.com/v2/users/me/can-trade"),
  // Cobre Premium: sem Premium (ou troca bloqueada) volta TargetUserIneligible.
  podeTrocarCom: (userId) => req(`https://trades.roblox.com/v2/users/${userId}/can-trade-with`),
  // Inventario trocavel com as copias (instances) e o isOnHold de cada uma.
  trocaveis: (userId, { cursor = "", busca = "" } = {}) =>
    req(
      `https://trades.roblox.com/v2/users/${userId}/tradableItems?limit=100` +
        (busca ? `&search=${encodeURIComponent(busca)}` : "") +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "")
    ),
  // Donos Premium de um limitado. A Roblox fecha a lista de donos pra quem
  // esta logado ("You do not have permission to view the owners", so o
  // criador ve). O Rolimon's escaneia e poe na pagina do item, em
  // `var bc_copies_data` (BC = Builders Club = Premium): dono, UAID, quando a
  // copia mudou de dono (ms) e ultimo acesso (s).
  donosPremium: async (id, tipo = "Asset") => {
    const r = await fetch(`https://www.rolimons.com/${tipo === "Bundle" ? "bundle" : "item"}/${id}`, { credentials: "omit" });
    if (!r.ok) throw new Error(`Rolimon's respondeu ${r.status}`);
    const html = await r.text();
    const m = html.match(/var bc_copies_data\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!m) throw new Error("A página do item no Rolimon's mudou: não achei a lista de donos.");
    const d = JSON.parse(m[1]);
    return (d.owner_ids || []).map((id, i) => ({
      id,
      nome: d.owner_names?.[i],
      atualizado: d.bc_updated?.[i] || 0,
      online: (d.bc_last_online?.[i] || 0) * 1000,
    }));
  },
  enviarTroca: (corpo) => req("https://trades.roblox.com/v2/trades/send", { method: "POST", body: corpo }),


  votos: (universeId) => req(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`),

  // --- emblemas -------------------------------------------------------------
  emblemasDoJogo: (universeId, cursor = "") =>
    req(
      `https://badges.roblox.com/v1/universes/${universeId}/badges?limit=100&sortOrder=Asc` +
        (cursor ? `&cursor=${cursor}` : "")
    ),

  // Quais desses emblemas o usuario tem, com a data. Ate 100 ids por chamada.
  emblemasGanhos: (userId, badgeIds) =>
    req(
      `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates?badgeIds=${badgeIds.join(",")}`
    ),

  // --- amizades -------------------------------------------------------------
  // So devolve ids. O /friends antigo voltou vazio pra perfil de terceiros.
  amigos: (userId, cursor = "") =>
    req(
      `https://friends.roblox.com/v1/users/${userId}/friends/find?limit=50` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "")
    ),

  usuarios: (userIds) =>
    req("https://users.roblox.com/v1/users", {
      method: "POST",
      body: { userIds, excludeBannedUsers: true },
    }),

  rostos: (userIds) =>
    req(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIds.join(",")}` +
        `&size=48x48&format=Png`,
      { auth: false }
    ),

  thumbsPacotes: (bundleIds) =>
    req(
      `https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=${bundleIds.join(",")}` +
        `&size=150x150&format=Png`,
      { auth: false }
    ),

  thumbs: (assetIds) =>
    req(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(",")}` +
        `&size=150x150&format=Png`,
      { auth: false }
    ),
};
