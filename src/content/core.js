// Mundo isolado. Todos os content scripts do manifest dividem este escopo,
// entao RL funciona como namespace compartilhado entre os arquivos.
const RL = (window.RL = {
  features: [],
  register(f) {
    RL.features.push(f);
  },

  // Liga/desliga que vem da pagina de configuracoes. boot.js carrega antes
  // do primeiro rodar() e acompanha as mudancas.
  flags: {},
  on: (id) => RL.flags[id] ?? RL_PADROES[id] ?? true,

  // Base do Rolimon's: { items: { [assetId]: [nome, sigla, rap, value, ...] },
  // bundles: { [bundleId]: [...] } }. Uma chamada por aba; o background ainda
  // guarda 6h em cache.
  _rolimons: null,
  rolimons: () => (RL._rolimons ||= RL.call("values").catch((e) => ((RL._rolimons = null), Promise.reject(e)))),

  // Demanda do Rolimon's (indice 5 da base; -1 = sem demanda atribuida).
  DEMANDA: ["Terrível", "Baixa", "Normal", "Alta", "Absurda"],
  // Tendencia do Rolimon's (indice 6): Lowering, Unstable, Stable, Raising, Fluctuating.
  TENDENCIA: ["Caindo", "Instável", "Estável", "Subindo", "Oscilando"],

  // Fala com o service worker (quem realmente faz as chamadas de rede).
  async call(k, params = {}) {
    const r = await chrome.runtime.sendMessage({ k, ...params });
    if (!r?.ok) throw new Error(r?.error || "sem resposta do background");
    return r.data;
  },

  // A Roblox prefixa a URL com o idioma: /pt-br/games/123/Nome.
  // Sem tirar o prefixo, todo regex de rota falha silenciosamente.
  path() {
    return location.pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/)/i, "");
  },
  placeIdDaUrl: () => (RL.path().match(/\/games\/(\d+)/) || [])[1],
  userIdDaUrl: () => (RL.path().match(/\/users\/(\d+)/) || [])[1],
  catalogIdDaUrl: () => (RL.path().match(/\/catalog\/(\d+)/) || [])[1],
  bundleIdDaUrl: () => (RL.path().match(/\/bundles\/(\d+)/) || [])[1],

  // Item e pacote tem ids de espacos diferentes: guardo o tipo junto.
  // Rosto limitado virou cabeca dinamica (pacote) e o site linka /bundles/:id.
  refDaUrl: () => {
    const a = RL.catalogIdDaUrl(), b = RL.bundleIdDaUrl();
    return a ? { id: a, pacote: false } : b ? { id: b, pacote: true } : null;
  },
  refDoCard(card) {
    const href = card.querySelector('a[href*="/catalog/"], a[href*="/bundles/"]')?.getAttribute("href");
    const m = href?.match(/\/(catalog|bundles)\/(\d+)/);
    return m ? { id: m[2], pacote: m[1] === "bundles" } : null;
  },
  chaveRef: (r) => (r ? (r.pacote ? "b" : "a") + r.id : ""),
  dado: (b, r) => (r ? (r.pacote ? b.bundles : b.items)?.[r.id] : undefined),
  linkRolimons: (r) => `https://www.rolimons.com/${r.pacote ? "bundle" : "item"}/${r.id}`,
  universeId: () => document.querySelector("#game-detail-meta-data")?.dataset.universeId,

  num(n, compacto = false) {
    if (n == null) return "—";
    return new Intl.NumberFormat(
      "pt-BR",
      compacto ? { notation: "compact", maximumFractionDigits: 1 } : {}
    ).format(n);
  },

  tempo(secs) {
    const h = Math.floor(secs / 3600),
      m = Math.floor((secs % 3600) / 60);
    return h ? `${h}h ${m}min` : `${m}min`;
  },

  // Marca um elemento como ja processado. Sem isso o MutationObserver
  // injeta a mesma coisa cinco vezes.
  once(el, tag) {
    if (!el || el.dataset["rl" + tag]) return false;
    el.dataset["rl" + tag] = "1";
    return true;
  },

  el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids.flat())
      n.append(c?.nodeType ? c : document.createTextNode(c));
    return n;
  },

  // --- clones de elemento nativo ------------------------------------------
  // Em vez de recriar a marcacao da Roblox (que muda a cada deploy deles),
  // clono um elemento que ja esta na pagina e so reescrevo o texto. O visual
  // acompanha o site de graca, inclusive tema claro/escuro.

  limpar(n) {
    n.querySelectorAll("[id],[data-testid]").forEach((e) => {
      e.removeAttribute("id");
      e.removeAttribute("data-testid");
    });
    return n;
  },

  // <li class="game-stat"> da barra Ativo / Favoritos / Visitas.
  cloneStat(nome, valor) {
    const base = document.querySelector("li.game-stat");
    if (!base) return null;
    const n = RL.limpar(base.cloneNode(true));
    const ps = n.querySelectorAll("p");
    if (ps.length < 2) return null;
    ps[0].textContent = nome;
    ps[1].textContent = valor;
    return n;
  },

  // A fileira de pills do perfil: 20 Amizades / 514 Seguidores / 6 Seguindo.
  // Reconheco pelo conteudo (toda pill comeca com numero), nao pela classe:
  // "primeiro div com dois links" pegava outra coisa no perfil logado.
  pillRow() {
    const cab = document.querySelector(".user-profile-header") || document.body;
    const pill = /^\s*[\d.,]+\s*(mil|mi|bi|[kmb])?\+?\s+\S/i;
    return [...cab.querySelectorAll("div")].find((d) => {
      // As nossas (RAP, "Inventario privado") nao contam: nem todas tem numero.
      const as = [...d.querySelectorAll(":scope > a")].filter((a) => !a.dataset.rlPill);
      return as.length >= 2 && as.every((a) => pill.test(a.textContent));
    });
  },

  clonePill(texto, titulo = "", href = "") {
    const row = RL.pillRow();
    // Pill desabilitada (0 Amizades) vem com opacity e sem cursor: evito.
    const as = [...(row?.querySelectorAll(":scope > a") || [])];
    const base = as.find((a) => a.getAttribute("aria-disabled") !== "true") || as[0];
    if (!base) return null;
    const n = RL.limpar(base.cloneNode(true));
    n.dataset.rlPill = "1";
    n.removeAttribute("href");
    n.removeAttribute("aria-disabled");
    n.className = n.className.replace(/opacity-\[[^\]]+\]/g, "");
    if (href) {
      n.setAttribute("href", href);
      n.setAttribute("target", "_blank");
      n.setAttribute("rel", "noopener");
    }
    if (titulo) n.setAttribute("title", titulo);
    const alvo = [...n.querySelectorAll("*")]
      .reverse()
      .find((e) => !e.children.length && e.textContent.trim());
    if (alvo) alvo.textContent = texto;
    else n.textContent = texto;
    return n;
  },

  // <div class="item-info-row-container"> da pagina do item (label + valor).
  cloneRow(label, valor) {
    const base = document.querySelector(".item-info-row-container");
    if (!base) return null;
    const n = RL.limpar(base.cloneNode(true));
    const l = n.querySelector(".row-label");
    const c = n.querySelector(".row-content");
    if (!l || !c) return null;
    l.textContent = label;
    c.textContent = valor;
    c.className = c.className.replace(/price-info/g, "");
    return n;
  },

  // Entra num servidor usando a propria API da pagina (ver page-bridge.js).
  join(placeId, gameId) {
    window.postMessage({ rl: "join", placeId, gameId }, "*");
  },
  // Entra no jogo, servidor que a Roblox escolher (igual o botao Jogar).
  play(placeId) {
    window.postMessage({ rl: "play", placeId }, "*");
  },

  // Popover solto no <body>. Ancorar dentro da pill nao da: ela tem overflow
  // cortado. Fecha com clique fora ou Esc.
  popover(ancora, ...conteudo) {
    const aberto = document.querySelector(".rl-pop");
    aberto?.remove();
    if (aberto?._ancora === ancora) return null; // segundo clique na ancora fecha
    const pop = RL.el("div", { class: "rl-pop", role: "dialog" }, ...conteudo);
    pop._ancora = ancora;
    const r = ancora.getBoundingClientRect();
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
    pop.style.left = `${Math.max(8, r.left + window.scrollX)}px`;
    document.body.append(pop);
    const fechar = (e) => {
      const dentro = pop.contains(e.target) || ancora.contains(e.target);
      if (e.type === "keydown" ? e.key !== "Escape" : dentro) return;
      pop.remove();
      document.removeEventListener("click", fechar, true);
      document.removeEventListener("keydown", fechar);
    };
    setTimeout(() => {
      document.addEventListener("click", fechar, true);
      document.addEventListener("keydown", fechar);
    });
    return pop;
  },
});
