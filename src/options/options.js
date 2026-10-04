// Pagina de configuracoes. Le e grava direto no chrome.storage.local; o
// content script escuta a mudanca, entao ligar um recurso vale na hora.
const $ = (id) => document.getElementById(id);

const TEMAS = [
  { id: "nenhum", nome: "Padrão da Roblox", cor: "transparent" },
  { id: "roxo", nome: "Roxo", cor: "#1a1030" },
  { id: "verde", nome: "Verde", cor: "#0d1f16" },
  { id: "vermelho", nome: "Vermelho", cor: "#220f12" },
  { id: "personalizado", nome: "Personalizado" }, // cor vem do seletor
];

const todas = RL_CATALOGO.flatMap((g) => g.features);
let flags = {};
const ligado = (id) => flags[id] ?? RL_PADROES[id] ?? true;

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.flat());
  return n;
}

const slug = (s) => "sec-" + s.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();

// --- recursos ----------------------------------------------------------------
function montarGrupos() {
  const box = $("grupos");
  for (const g of RL_CATALOGO) {
    const card = el("div", { class: "card" });
    for (const f of g.features) {
      const input = el("input", { type: "checkbox", id: `f-${f.id}`, "aria-describedby": `d-${f.id}` });
      input.checked = ligado(f.id);
      input.addEventListener("change", () => salvar(f, input.checked));
      card.append(
        el(
          "label",
          { class: "linha", for: `f-${f.id}`, "data-busca": `${f.nome} ${f.desc} ${f.onde}`.toLowerCase() },
          el(
            "div",
            { class: "txt" },
            el(
              "div",
              { class: "nome" },
              f.nome,
              f.novo ? el("span", { class: "tag-novo" }, "novo") : "",
              f.ropro ? el("span", { class: "tag-ropro", title: `No RoPro isso é do plano ${f.ropro}` }, `pago no RoPro ${f.ropro}`) : ""
            ),
            el("div", { class: "desc", id: `d-${f.id}` }, f.desc),
            f.config === "regiao" ? seletorDeRegiao() : "",
            f.config === "recusa" ? configDeRecusa() : "",
            f.config === "protecao" ? configDeProtecao() : "",
            f.config === "som" ? configDeSom() : "",
            f.config === "pedem" ? resumoOfertas() : "",
            f.config === "historico" ? painelDeHistorico() : "",
            el("span", { class: "onde" }, f.onde)
          ),
          el("span", { class: "sw" }, input, el("span"))
        )
      );
    }
    box.append(el("section", { class: "grupo", id: slug(g.grupo) }, el("h2", {}, g.grupo), card));
  }
}

async function salvar(f, on) {
  flags = { ...flags, [f.id]: on };
  await chrome.storage.local.set({ features: flags });
  if (f.id === "autoRecusa") {
    const { recusa } = await chrome.storage.local.get({ recusa: {} });
    await chrome.storage.local.set({ recusa: { ...recusa, desde: on ? Date.now() : null } });
  }
  resumo();
  avisar(
    on ? `${f.nome}: ligado. Já vale nas abas abertas.` : `${f.nome}: desligado. Some quando a página recarregar.`,
    !on
  );
}

function resumo() {
  const n = todas.filter((f) => ligado(f.id)).length;
  const pagos = todas.filter((f) => f.ropro).length;
  $("resumo").textContent = `${n} de ${todas.length} recursos ligados · ${pagos} são pagos no RoPro`;
}

// Cidade pra "Entrar na sua regiao". Guarda {city, cc, country} em regiaoPref.
function seletorDeRegiao() {
  const sel = el("select", { class: "select", "aria-label": "Região preferida" }, el("option", { value: "" }, "Escolha uma cidade..."));
  Promise.all([call("listaRegioes"), chrome.storage.local.get({ regiaoPref: null })]).then(([lista, { regiaoPref }]) => {
    for (const r of lista || [])
      sel.append(el("option", { value: JSON.stringify(r) }, `${r.city} · ${r.country}`));
    if (regiaoPref) sel.value = JSON.stringify(lista.find((r) => r.city === regiaoPref.city) || "");
  });
  sel.addEventListener("change", async () => {
    const r = sel.value ? JSON.parse(sel.value) : null;
    await chrome.storage.local.set({ regiaoPref: r });
    avisar(r ? `Região: ${r.city}. O botão aparece na próxima vez que abrir um jogo.` : "Região apagada.");
  });
  return el("div", { class: "config" }, sel);
}

// Limite da auto-recusa + as ultimas recusadas. Mora dentro do <label> do
// switch: clique em texto solto ligaria/desligaria o recurso, entao barro.
function configDeRecusa() {
  const limite = el("input", { type: "number", min: "1", max: "90", step: "1", class: "select num", "aria-label": "Perda máxima em %" });
  const proj = el("input", { type: "checkbox" });
  const log = el("div", { class: "recusas" });
  const guardar = async () => {
    const { recusa } = await chrome.storage.local.get({ recusa: {} });
    const n = Math.min(90, Math.max(1, parseInt(limite.value, 10) || 10));
    limite.value = n;
    await chrome.storage.local.set({ recusa: { ...recusa, limite: n, projetado: proj.checked } });
    avisar(`Recusa: perda acima de ${n}%${proj.checked ? " ou item PROJECTED" : ""}.`);
  };
  limite.addEventListener("change", guardar);
  proj.addEventListener("change", guardar);

  call("recusas").then((o) => {
    limite.value = o?.recusa?.limite ?? 10;
    proj.checked = !!o?.recusa?.projetado;
    const lista = o?.recusadas || [];
    if (!lista.length) return log.append(el("div", { class: "desc" }, "Nenhuma troca recusada ainda."));
    const n = new Intl.NumberFormat("pt-BR");
    log.append(
      el("div", { class: "desc" }, "Últimas recusadas:"),
      ...lista.slice(0, 5).map((r) =>
        el("div", { class: "recusa" },
          el("strong", {}, r.nome),
          ` · dava ${n.format(r.dou)} · recebia ${n.format(r.recebo)} · ${r.motivo} · `,
          new Date(r.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))),
      el("a", { class: "link-azul", href: "https://www.roblox.com/trades?tab=Inactive", target: "_blank" }, "Ver na Roblox (Inativas)")
    );
  });

  const box = el("div", { class: "config config-recusa" },
    el("div", { class: "cfg-linha" }, "Recusar quando eu perder mais de", limite, "% de Value"),
    el("label", { class: "cfg-linha" }, proj, "Recusar também se tiver item PROJECTED do outro lado"),
    log);
  box.addEventListener("click", (e) => {
    if (!e.target.closest("input, select, button, a, label.cfg-linha")) e.preventDefault();
  });
  return box;
}

// Quem quer seus itens: aqui so o resumo; a lista mora em src/ofertas/.
function resumoOfertas() {
  const txt = el("span", { class: "desc" }, "…");
  call("contaOfertas").then((n) => (txt.textContent = n ? `${n} ${n === 1 ? "oferta boa" : "ofertas boas"} nas últimas 24h` : "Nenhuma oferta boa agora"));
  const abrir = el("button", { class: "btn btn-claro" }, "Ver ofertas");
  abrir.addEventListener("click", (e) => (e.preventDefault(), call("abrirOfertas")));
  const box = el("div", { class: "config cfg-linha" }, abrir, txt);
  box.addEventListener("click", (e) => {
    if (!e.target.closest("button")) e.preventDefault();
  });
  return box;
}

// Voz de troca: qual evento fala, e botao pra ouvir.
function configDeSom() {
  const linha = (qual, texto) => {
    const cb = el("input", { type: "checkbox" });
    cb.addEventListener("change", async () => {
      const { som } = await chrome.storage.local.get({ som: {} });
      await chrome.storage.local.set({ som: { recebida: true, concluida: true, ...som, [qual]: cb.checked } });
    });
    call("som").then((s) => (cb.checked = s?.[qual] ?? true));
    const ouvir = el("button", { class: "btn" }, "Ouvir");
    ouvir.addEventListener("click", (e) => {
      e.preventDefault();
      new Audio(chrome.runtime.getURL(`sons/troca-${qual}.mp3`)).play();
    });
    return el("div", { class: "cfg-linha" }, el("label", { class: "cfg-linha" }, cb, texto), ouvir);
  };
  const box = el("div", { class: "config config-recusa" }, linha("recebida", "Troca recebida"), linha("concluida", "Troca concluída"));
  box.addEventListener("click", (e) => {
    if (!e.target.closest("input, select, button, a, label.cfg-linha")) e.preventDefault();
  });
  return box;
}

// Protecao de troca enviada: limite de perda, PROJECTED e o que fazer.
function configDeProtecao() {
  const limite = el("input", { type: "number", min: "0", max: "90", step: "1", class: "select num", "aria-label": "Perda tolerada em %" });
  const proj = el("input", { type: "checkbox" });
  const modo = el("select", { class: "select", "aria-label": "O que fazer" },
    el("option", { value: "avisar" }, "me avisar (com botão pra cancelar)"),
    el("option", { value: "cancelar" }, "cancelar sozinho"));
  const guardar = async () => {
    const n = Math.min(90, Math.max(0, parseInt(limite.value, 10) || 0));
    limite.value = n;
    await chrome.storage.local.set({ protecao: { limite: n, projetado: proj.checked, modo: modo.value } });
    avisar(modo.value === "cancelar" ? `Cancela sozinho troca enviada que perde mais de ${n}%.` : `Avisa quando troca enviada perder mais de ${n}%.`);
  };
  [limite, proj, modo].forEach((x) => x.addEventListener("change", guardar));
  call("protecao").then((p) => {
    limite.value = p?.limite ?? 0;
    proj.checked = p?.projetado ?? true;
    modo.value = p?.modo || "avisar";
  });
  const box = el("div", { class: "config config-recusa" },
    el("div", { class: "cfg-linha" }, "Quando eu perder mais de", limite, "% de Value,", modo),
    el("label", { class: "cfg-linha" }, proj, "Também se aparecer item PROJECTED do outro lado"));
  box.addEventListener("click", (e) => {
    if (!e.target.closest("input, select, button, a, label.cfg-linha")) e.preventDefault();
  });
  return box;
}

// Historico de lucro: resumo das trocas concluidas + as ultimas.
function painelDeHistorico() {
  const box = el("div", { class: "config config-recusa historico" });
  const n = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + new Intl.NumberFormat("pt-BR").format(Math.abs(x));
  const cor = (x) => (x > 0 ? "ganho" : x < 0 ? "perda" : "");
  const desenhar = (h) => {
    const atualizar = el("button", { class: "btn" }, "Atualizar");
    atualizar.addEventListener("click", async () => {
      atualizar.disabled = true;
      atualizar.textContent = "Buscando trocas...";
      try {
        desenhar({ ...(await callP("atualizarHistorico")), em: Date.now() });
      } catch (e) {
        avisar(e.message);
        atualizar.disabled = false;
        atualizar.textContent = "Atualizar";
      }
    });
    const bloco = (rot, v, qtd) => el("div", { class: "hist-bloco" }, el("small", {}, rot), el("strong", { class: cor(v) }, n(v)), el("small", {}, `${qtd} troca(s)`));
    box.replaceChildren(
      h?.n
        ? el("div", { class: "hist-resumo" }, bloco("7 dias", h.dias7, h.n7), bloco("30 dias", h.dias30, h.n30), bloco("Total", h.total, h.n))
        : el("div", { class: "desc" }, "Nenhuma troca concluída ainda. Clique em Atualizar pra buscar."),
      ...(h?.ultimas || []).slice(0, 8).map((x) =>
        el("div", { class: "recusa" }, el("strong", {}, x.nome), ` · deu ${fmt(x.dou)} · recebeu ${fmt(x.recebo)} · `,
          el("span", { class: cor(x.saldo) }, n(x.saldo)), " · ", new Date(x.t).toLocaleDateString("pt-BR"))),
      h?.aprox ? el("div", { class: "desc" }, `${h.aprox} troca(s) antigas contadas com o Value de hoje: o valor da época não existe mais.`) : "",
      el("div", { class: "cfg-linha" }, atualizar, h?.em ? el("span", { class: "desc" }, `Atualizado ${new Date(h.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`) : "")
    );
  };
  call("historico").then(desenhar);
  box.addEventListener("click", (e) => {
    if (!e.target.closest("input, select, button, a, label.cfg-linha")) e.preventDefault();
  });
  return box;
}

// --- navegacao lateral ---------------------------------------------------------
function montarNav() {
  const secoes = [
    ...RL_CATALOGO.map((g) => [slug(g.grupo), g.grupo]),
    ["sec-envio", "Enviar troca"],
    ["sec-anuncio", "Anúncio no Rolimon's"],
    ["sec-desejos", "Avisos de preço"],
    ["sec-aparencia", "Aparência"],
    ["sec-dados", "Dados"],
  ];
  const links = secoes.map(([id, nome]) => el("a", { href: `#${id}` }, nome));
  $("nav").append(...links);

  // Destaca a secao que esta na tela.
  const obs = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.classList.toggle("ativo", a.hash === `#${e.target.id}`));
      }
    },
    { rootMargin: "-20% 0px -70% 0px" }
  );
  secoes.forEach(([id]) => obs.observe($(id)));
}

// --- busca ------------------------------------------------------------------------
$("busca").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  for (const sec of document.querySelectorAll("#grupos .grupo")) {
    let visiveis = 0;
    for (const l of sec.querySelectorAll("label.linha")) {
      l.hidden = q && !l.dataset.busca.includes(q);
      if (!l.hidden) visiveis++;
    }
    sec.hidden = !visiveis;
  }
  for (const id of ["sec-envio", "sec-anuncio", "sec-desejos", "sec-aparencia", "sec-dados"]) $(id).hidden = !!q;
});

// --- avisos de preco ----------------------------------------------------------------
// Os itens que o botao "Avisar preço" da pagina do item guardou.
async function montarDesejos() {
  const box = $("desejos");
  const lista = (await call("desejos")) || [];
  box.textContent = "";
  if (!lista.length) {
    box.append(
      el("div", { class: "linha" },
        el("div", { class: "txt" },
          el("div", { class: "desc" }, "Nenhum item. Abre um item no catálogo e clica em Avisar preço, do lado da estrelinha.")))
    );
    return;
  }
  for (const it of lista) {
    const caminho = it.tipo === "Bundle" ? "bundles" : "catalog";
    const tirar = el("button", { class: "btn" }, "Parar");
    tirar.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ k: "alternarDesejo", id: it.id, tipo: it.tipo });
      montarDesejos();
    });
    box.append(
      el("div", { class: "linha" },
        it.thumb ? el("img", { class: "thumb", src: it.thumb, alt: "" }) : el("span", { class: "thumb" }),
        el("div", { class: "txt" },
          el("a", { class: "nome link", href: `https://www.roblox.com/${caminho}/${it.id}`, target: "_blank" }, it.nome || `Item ${it.id}`),
          el("div", { class: "desc" },
            it.atual == null ? "Fora de venda agora" : `Agora: ${new Intl.NumberFormat("pt-BR").format(it.atual)} Robux`)),
        tirar)
    );
  }
}

// --- anuncio no Rolimon's ---------------------------------------------------------------
// Monta o anuncio (ate 4 itens de cada lado, tags contam no pedido) e liga o
// repost automatico. Quem posta e o background; aqui so edita e mostra o status.
const TAG_NOME = {
  any: "Qualquer", demand: "Demanda", rares: "Raros", robux: "Robux", upgrade: "Upgrade",
  downgrade: "Downgrade", rap: "RAP", wishlist: "Wishlist", projecteds: "Projecteds", adds: "Adds",
};
const callP = (k, p = {}) =>
  chrome.runtime.sendMessage({ k, ...p }).then((r) => {
    if (!r?.ok) throw new Error((r?.error || "sem resposta").replace(/^Error: /, ""));
    return r.data;
  });
const fmt = (n) => new Intl.NumberFormat("pt-BR").format(n);
const hora = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

let an = null, anInfo = null, anInv = [], anBase = {}, anThumbs = {}, filtroInv = "";

async function montarAnuncio() {
  const box = $("anuncio");
  anInfo = await callP("anuncio");
  an = { ...anInfo.anuncio };
  if (!anInfo.conta) {
    box.replaceChildren(
      el("div", { class: "linha" },
        el("div", { class: "txt" },
          el("div", { class: "nome" }, "Você não está verificado no Rolimon's"),
          el("div", { class: "desc" }, "Entra no rolimons.com neste navegador, verifica a sua conta da Roblox e volta aqui. Criar anúncio também exige Roblox Premium.")),
        el("a", { class: "btn btn-claro", href: "https://www.rolimons.com/verify", target: "_blank" }, "Abrir Rolimon's"),
        el("button", { class: "btn", onclick: montarAnuncio }, "Já verifiquei"))
    );
    return;
  }
  const [inv, base] = await Promise.all([callP("inventarioAnuncio"), callP("values")]);
  anInv = inv || [];
  anBase = base.items || {};
  for (const it of anInv) anThumbs[it.id] = it.thumb;
  await thumbsDoPedido();
  desenharAnuncio();
}

async function thumbsDoPedido() {
  const faltam = an.pedido.filter((id) => !(id in anThumbs));
  if (faltam.length) Object.assign(anThumbs, await callP("thumbs", { ids: faltam }).catch(() => ({})));
}

const valorDe = (id) => {
  const it = anBase[id];
  return it ? { nome: it[0], rap: it[2], value: it[3] > 0 ? it[3] : it[2] } : { nome: id, rap: 0, value: 0 };
};

async function salvarAnuncio(patch = {}) {
  an = { ...an, ...patch };
  try {
    await callP("salvarAnuncio", { anuncio: an });
  } catch (e) {
    avisar(String(e.message));
  }
  anInfo = await callP("anuncio");
  an = { ...anInfo.anuncio };
  desenharAnuncio();
}

function slot(conteudo, titulo, onclick) {
  if (!conteudo) return el("div", { class: "an-slot vazio" });
  return el("button", { class: "an-slot", title: titulo, onclick }, conteudo);
}

function lado(titulo, slots, rodape) {
  return el("div", { class: "an-lado" }, el("div", { class: "an-lado-tit" }, titulo), el("div", { class: "an-slots" }, slots), el("div", { class: "an-total" }, rodape));
}

function desenharAnuncio() {
  const box = $("anuncio");
  const soma = (ids, k) => ids.reduce((s, id) => s + valorDe(id)[k], 0);

  const oferta = [0, 1, 2, 3].map((i) => {
    const id = an.oferta[i];
    if (!id) return slot(null);
    const v = valorDe(id);
    return slot([el("img", { src: anThumbs[id] || "", alt: "" }), el("span", {}, v.nome)], `${v.nome} · clique pra tirar`,
      () => salvarAnuncio({ oferta: an.oferta.filter((x) => x !== id) }));
  });
  const pedidos = [...an.pedido.map((id) => ({ id })), ...an.tags.map((t) => ({ tag: t }))];
  const pedido = [0, 1, 2, 3].map((i) => {
    const p = pedidos[i];
    if (!p) return slot(null);
    if (p.tag)
      return slot(el("span", { class: "an-tag" }, TAG_NOME[p.tag]), "Clique pra tirar", () => salvarAnuncio({ tags: an.tags.filter((x) => x !== p.tag) }));
    const v = valorDe(p.id);
    return slot([el("img", { src: anThumbs[p.id] || "", alt: "" }), el("span", {}, v.nome)], `${v.nome} · clique pra tirar`,
      () => salvarAnuncio({ pedido: an.pedido.filter((x) => x !== p.id) }));
  });

  // --- escolher itens da oferta
  const busca = el("input", { type: "search", class: "an-busca", placeholder: "Filtrar seu inventário", value: filtroInv });
  const grade = el("div", { class: "an-grade" });
  const encher = () => {
    const q = filtroInv.toLowerCase();
    grade.replaceChildren(
      ...anInv
        .filter((it) => !q || it.nome.toLowerCase().includes(q) || (it.sigla || "").toLowerCase().includes(q))
        .map((it) => {
          const dentro = an.oferta.includes(it.id);
          return el("button", {
            class: "an-item" + (dentro ? " sel" : ""),
            title: `${it.nome} · Value ${fmt(it.value)} · RAP ${fmt(it.rap)}`,
            onclick: () => {
              if (dentro) return salvarAnuncio({ oferta: an.oferta.filter((x) => x !== it.id) });
              if (an.oferta.length >= 4) return avisar("No máximo 4 itens na oferta.");
              salvarAnuncio({ oferta: [...an.oferta, it.id] });
            },
          }, el("img", { src: it.thumb || "", alt: "", loading: "lazy" }), el("span", { class: "an-item-nome" }, it.nome), el("span", { class: "an-item-v" }, fmt(it.value)));
        })
    );
    if (!grade.children.length) grade.append(el("div", { class: "desc" }, anInv.length ? "Nada com esse nome." : "O Rolimon's não achou limitados no seu inventário."));
  };
  busca.addEventListener("input", () => ((filtroInv = busca.value), encher()));
  encher();

  // --- escolher o pedido: tag ou item por nome
  const cheio = () => an.pedido.length + an.tags.length >= 4;
  const tags = el("div", { class: "an-tags" },
    anInfo.tags.map((t) => el("button", {
      class: "tema" + (an.tags.includes(t) ? " sel" : ""),
      "aria-pressed": String(an.tags.includes(t)),
      onclick: () => {
        if (an.tags.includes(t)) return salvarAnuncio({ tags: an.tags.filter((x) => x !== t) });
        if (cheio()) return avisar("No máximo 4 itens e tags no pedido, somados.");
        salvarAnuncio({ tags: [...an.tags, t] });
      },
    }, TAG_NOME[t])));
  const lista = el("datalist", { id: "an-itens" },
    Object.entries(anBase).map(([id, it]) => el("option", { value: it[1] ? `${it[0].trim()} (${it[1]})` : it[0].trim(), "data-id": id })));
  const pedirItem = el("input", { type: "search", class: "an-busca", list: "an-itens", placeholder: "Pedir um item: digite o nome ou a sigla" });
  pedirItem.addEventListener("change", async () => {
    const op = [...lista.options].find((o) => o.value === pedirItem.value);
    if (!op) return;
    const id = op.dataset.id;
    pedirItem.value = "";
    if (an.pedido.includes(id)) return;
    if (cheio()) return avisar("No máximo 4 itens e tags no pedido, somados.");
    an.pedido = [...an.pedido, id];
    await thumbsDoPedido();
    salvarAnuncio();
  });

  const robux = el("input", { type: "number", min: "0", step: "1", class: "an-robux", value: String(an.robux || 0), "aria-label": "Robux na oferta" });
  robux.addEventListener("change", () => salvarAnuncio({ robux: Math.max(0, parseInt(robux.value, 10) || 0) }));

  // --- automatico + status
  const auto = el("input", { type: "checkbox", id: "an-auto" });
  auto.checked = !!an.auto;
  auto.addEventListener("change", () => salvarAnuncio({ auto: auto.checked }));
  const postar = el("button", { class: "btn btn-claro" }, "Postar agora");
  postar.addEventListener("click", async () => {
    postar.disabled = true;
    try {
      await callP("postarAnuncio");
      avisar("Anúncio postado no Rolimon's.");
    } catch (e) {
      avisar(String(e.message));
    }
    salvarAnuncio();
  });

  const log = anInfo.anuncioLog || {};
  const partes = [];
  if (log.ultimo) partes.push(`Último: ${hora(log.ultimo)}`);
  if (an.auto && anInfo.proximo) partes.push(`Próximo: ${hora(anInfo.proximo)}`);
  partes.push(`${anInfo.hoje} de ${anInfo.max} nas últimas 24h`);
  const status = el("div", { class: "an-status" },
    log.erro && (!log.ultimo || log.erroEm > log.ultimo) ? el("div", { class: "an-erro" }, `⚠ ${log.erro}`) : "",
    el("div", { class: "desc" }, partes.join(" · ")));

  box.replaceChildren(
    el("div", { class: "linha" },
      el("div", { class: "txt" },
        el("div", { class: "nome" }, `Conta: ${anInfo.conta.nome}`),
        el("div", { class: "desc" }, "O anúncio sai no nome dessa conta verificada no Rolimon's. Clique num item do anúncio pra tirar.")),
      el("a", { class: "btn", href: `https://www.rolimons.com/player/${anInfo.conta.id}`, target: "_blank" }, "Ver no Rolimon's")),
    el("div", { class: "an-preview" },
      lado("Você oferece", oferta, `Value ${fmt(soma(an.oferta, "value"))} · RAP ${fmt(soma(an.oferta, "rap"))}` + (an.robux ? ` · +${fmt(an.robux)} Robux` : "")),
      lado("Você pede", pedido, `Value ${fmt(soma(an.pedido, "value"))}` + (an.tags.length ? ` · ${an.tags.length} tag(s)` : ""))),
    el("div", { class: "an-bloco" }, el("div", { class: "nome" }, "Oferecer"), busca, grade,
      el("label", { class: "an-robux-linha" }, "Robux junto (opcional, até 50% do RAP):", robux)),
    el("div", { class: "an-bloco" }, el("div", { class: "nome" }, "Pedir"), tags, pedirItem, lista),
    el("label", { class: "linha", for: "an-auto" },
      el("div", { class: "txt" },
        el("div", { class: "nome" }, `Repostar sozinho a cada ${anInfo.minutos} min`),
        el("div", { class: "desc" }, `Só com o Edge aberto. ${anInfo.minutos} min e não 15 porque o Rolimon's aceita no máximo ${anInfo.max} anúncios por dia. Se der um erro que não resolve sozinho, desliga e te avisa.`)),
      el("span", { class: "sw" }, auto, el("span"))),
    el("div", { class: "linha" }, status, postar)
  );
}

// --- enviar troca (um clique por troca) -------------------------------------------------
// Monta a troca, a trava de Value decide se pode, e a lista mostra os donos
// recentes que podem receber. Nao existe "enviar pra todos": cada troca sai
// de um clique seu, com espera entre uma e outra.
let ev = null, evCopias = [], evDonos = [], evPos = 0, evTotal = 0, evEnviados = {}, evTimer = null, evFiltro = "";
let evPacotes = {}, evMigrados = new Set(); // pacotes do Rolimon's e os ids de asset que viraram pacote
const evChaveThumb = (id, tipo) => (tipo === "Bundle" ? "b" : "") + id;
async function evThumb(id, tipo) {
  const k = evChaveThumb(id, tipo);
  if (k in anThumbs) return;
  const r = await callP("thumbs", { ids: [id], pacote: tipo === "Bundle" }).catch(() => ({}));
  anThumbs[k] = r[id] || "";
}
const evNome = (id, tipo) => ((tipo === "Bundle" ? evPacotes : anBase)[id]?.[0] || id).trim();

const haQuanto = (iso) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
};

async function montarEnvio() {
  ev = await callP("envio");
  if (ev.bloqueio) {
    $("envio").replaceChildren(el("div", { class: "linha" }, el("div", { class: "txt" },
      el("div", { class: "nome" }, "Sua conta não pode enviar troca agora"), el("div", { class: "desc" }, ev.bloqueio))));
    return;
  }
  const base = await callP("values");
  if (!Object.keys(anBase).length) anBase = base.items || {};
  evPacotes = base.bundles || {};
  evMigrados = new Set(base.migrados || []);
  if (ev.envio.pedido) await evThumb(ev.envio.pedido, ev.envio.pedidoTipo);
  evCopias = await callP("meusTrocaveis");
  desenharEnvio();
}

async function salvarEnvio(patch) {
  const envio = { ...ev.envio, ...patch };
  await callP("salvarEnvio", { envio });
  evDonos = []; evPos = 0; evTotal = 0; // troca mudou: a lista antiga nao vale
  ev = await callP("envio");
  desenharEnvio();
}

function esperar(seg) {
  clearInterval(evTimer);
  ev.espera = seg;
  const tick = () => {
    for (const b of document.querySelectorAll(".ev-enviar")) {
      b.disabled = ev.espera > 0;
      b.textContent = ev.espera > 0 ? `Aguarde ${ev.espera} s` : "Enviar";
    }
    if (ev.espera-- <= 0) clearInterval(evTimer);
  };
  tick();
  evTimer = setInterval(tick, 1000);
}

function desenharEnvio() {
  const box = $("envio");
  const { envio, conta } = ev;
  const copia = (id) => evCopias.find((c) => c.instanceId === id);

  const oferta = [0, 1, 2, 3].map((i) => {
    const o = envio.oferta[i];
    if (!o) return slot(null);
    const c = copia(o.instanceId) || { nome: o.assetId };
    return slot([el("img", { src: c.thumb || "", alt: "" }), el("span", {}, c.nome)], `${c.nome} · clique pra tirar`,
      () => salvarEnvio({ oferta: envio.oferta.filter((x) => x.instanceId !== o.instanceId) }));
  });
  const pedido = envio.pedido
    ? slot([el("img", { src: anThumbs[evChaveThumb(envio.pedido, envio.pedidoTipo)] || "", alt: "" }), el("span", {}, evNome(envio.pedido, envio.pedidoTipo))],
        "Clique pra tirar", () => salvarEnvio({ pedido: null }))
    : slot(null);

  // --- seus itens
  const busca = el("input", { type: "search", class: "an-busca", placeholder: "Filtrar seus itens", value: evFiltro });
  const grade = el("div", { class: "an-grade" });
  const encher = () => {
    const q = evFiltro.toLowerCase();
    grade.replaceChildren(...evCopias.filter((c) => !q || c.nome.toLowerCase().includes(q)).map((c) => {
      const dentro = envio.oferta.some((o) => o.instanceId === c.instanceId);
      const b = el("button", {
        class: "an-item" + (dentro ? " sel" : "") + (c.hold ? " hold" : ""),
        title: c.hold ? `${c.nome} · em hold, não dá pra trocar ainda` : `${c.nome} · Value ${c.value == null ? "sem dado" : fmt(c.value)}`,
        onclick: () => {
          if (c.hold) return avisar("Esse item está em hold.");
          if (dentro) return salvarEnvio({ oferta: envio.oferta.filter((o) => o.instanceId !== c.instanceId) });
          if (envio.oferta.length >= 4) return avisar("No máximo 4 itens seus.");
          salvarEnvio({ oferta: [...envio.oferta, { instanceId: c.instanceId, assetId: c.assetId, tipo: c.tipo }] });
        },
      }, el("img", { src: c.thumb || "", alt: "", loading: "lazy" }), el("span", { class: "an-item-nome" }, c.nome),
        el("span", { class: "an-item-v" }, c.hold ? "em hold" : c.value == null ? "—" : fmt(c.value)));
      return b;
    }));
    if (!grade.children.length) grade.append(el("div", { class: "desc" }, evCopias.length ? "Nada com esse nome." : "Você não tem limitado trocável."));
  };
  busca.addEventListener("input", () => ((evFiltro = busca.value), encher()));
  encher();

  // --- item pedido
  // Rosto que virou pacote aparece uma vez so, como pacote.
  const opcao = (tipo) => ([id, it]) =>
    el("option", { value: (it[1] ? `${it[0].trim()} (${it[1]})` : it[0].trim()) + (tipo === "Bundle" ? " · cabeça" : ""), "data-id": id, "data-tipo": tipo });
  const lista = el("datalist", { id: "ev-itens" },
    Object.entries(anBase).filter(([id]) => !evMigrados.has(id)).map(opcao("Asset")),
    Object.entries(evPacotes).map(opcao("Bundle")));
  const pedir = el("input", { type: "search", class: "an-busca", list: "ev-itens", placeholder: "Item que você quer: digite o nome ou a sigla" });
  pedir.addEventListener("change", async () => {
    const op = [...lista.options].find((o) => o.value === pedir.value);
    if (!op) return;
    const { id, tipo } = op.dataset;
    await evThumb(id, tipo);
    salvarEnvio({ pedido: id, pedidoTipo: tipo });
  });

  // --- conta e trava
  const saldo = conta.recebo != null ? conta.recebo - conta.dou : null;
  const trava = conta.problema
    ? el("div", { class: "an-erro" }, `⛔ ${conta.problema}`)
    : el("div", { class: "ev-ok" }, saldo === 0
        ? "✓ Mesmo Value dos dois lados. Pode enviar."
        : `✓ Você ganha ${fmt(saldo)} de Value${conta.dou ? ` (+${Math.round((saldo / conta.dou) * 100)}%)` : ""}. Pode enviar.`);

  // --- donos
  const donos = el("div", { class: "ev-donos" });
  const buscar = el("button", { class: "btn btn-claro" }, evDonos.length ? "Buscar de novo" : "Buscar donos recentes");
  buscar.disabled = !!conta.problema;
  const carregar = async (novo) => {
    buscar.disabled = true;
    buscar.textContent = "Procurando...";
    try {
      const r = await callP("proximosDonos", { pos: novo ? 0 : evPos, n: 8, novo });
      evDonos = novo ? r.donos : [...evDonos, ...r.donos];
      evPos = r.pos; evTotal = r.total;
    } catch (e) {
      avisar(e.message);
    }
    desenharEnvio();
  };
  buscar.addEventListener("click", () => carregar(true));
  for (const d of evDonos) {
    const feito = evEnviados[d.id];
    const b = el("button", { class: "btn btn-claro ev-enviar" }, "Enviar");
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.textContent = "Enviando...";
      try {
        const r = await callP("enviarUma", { userId: d.id });
        evEnviados[d.id] = r.tradeId;
        avisar(`Troca enviada pra ${d.nome}.`);
        desenharEnvio();
        esperar(r.espera);
      } catch (e) {
        avisar(e.message);
        b.disabled = false;
        b.textContent = "Enviar";
      }
    });
    donos.append(el("div", { class: "ev-dono" },
      d.rosto ? el("img", { class: "thumb", src: d.rosto, alt: "" }) : el("span", { class: "thumb" }),
      el("div", { class: "txt" },
        el("a", { class: "nome link", href: `https://www.roblox.com/users/${d.id}/profile`, target: "_blank" }, d.nome),
        el("div", { class: "desc" }, [d.quando ? `Pegou o item ${haQuanto(d.quando)}` : "", d.online ? `online ${haQuanto(d.online)}` : ""].filter(Boolean).join(" · "))),
      feito ? el("a", { class: "ev-feito", href: "https://www.roblox.com/trades?tab=Outbound", target: "_blank" }, "Enviada ✓") : b));
  }
  if (evDonos.length && evPos < evTotal) donos.append(el("button", { class: "btn ev-mais", onclick: () => carregar(false) }, "Mais donos"));
  if (!evDonos.length && evTotal) donos.append(el("div", { class: "desc" }, "Nenhum dono dessa leva pode receber agora (sem Premium ou item em hold)."));

  box.replaceChildren(
    el("div", { class: "linha" }, el("div", { class: "txt" },
      el("div", { class: "nome" }, "Monte a troca e escolha pra quem mandar"),
      el("div", { class: "desc" }, `A lista vem dos donos Premium que o Rolimon's escaneou: quem pegou o item mais recente primeiro, só quem pode trocar e está com ele fora de hold. Cada troca só sai quando você clica, com 30 s entre uma e outra. ${ev.semana} enviada(s) nos últimos 7 dias; quem já recebeu não aparece de novo nesse prazo.`))),
    el("div", { class: "an-preview" },
      lado("Você oferece", oferta, `Value ${fmt(conta.dou)}`),
      lado("Você pede", [pedido], conta.recebo == null ? "—" : `Value ${fmt(conta.recebo)}`)),
    el("div", { class: "an-bloco" }, trava),
    el("div", { class: "an-bloco" }, el("div", { class: "nome" }, "Seus itens"), busca, grade),
    el("div", { class: "an-bloco" }, el("div", { class: "nome" }, "Item que você quer"), pedir, lista),
    el("div", { class: "an-bloco" }, el("div", { class: "ev-topo" }, el("div", { class: "nome" }, "Donos recentes"), buscar), donos)
  );
  if (ev.espera > 0) esperar(ev.espera);
}

// --- tema ---------------------------------------------------------------------------
function montarTemas(atual, temaCor) {
  const box = $("temas");
  // O "Personalizado" leva um seletor de cor no lugar da bolinha.
  const seletor = el("input", { type: "color", class: "cor", value: temaCor, "aria-label": "Cor do tema" });
  const botoes = TEMAS.map((t) => {
    const b = el(
      "button",
      { class: "tema", role: "radio", "aria-checked": String(t.id === atual) },
      t.id === "personalizado" ? seletor : el("span", { class: "bolinha", style: `background:${t.cor}` }),
      t.nome
    );
    b.addEventListener("click", async (e) => {
      if (e.target === seletor) return; // abrir o seletor nao troca o tema ainda
      await chrome.storage.local.set({ tema: t.id });
      botoes.forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      avisar(`Tema: ${t.nome}. Já aplicado nas abas abertas.`);
    });
    return b;
  });
  seletor.addEventListener("change", async () => {
    await chrome.storage.local.set({ tema: "personalizado", temaCor: seletor.value });
    botoes.forEach((x) => x.setAttribute("aria-checked", String(x === botoes.at(-1))));
    avisar("Tema personalizado aplicado nas abas abertas.");
  });
  box.append(...botoes);
}

// --- dados --------------------------------------------------------------------------
const call = (k) => chrome.runtime.sendMessage({ k }).then((r) => (r?.ok ? r.data : null));

$("limpar").addEventListener("click", async () => {
  const n = await call("limparCache");
  avisar(n ? `Cache limpo (${n} itens).` : "Não tinha nada em cache.");
});

$("zerar").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (b.dataset.confirma !== "1") {
    b.dataset.confirma = "1";
    b.textContent = "Clica de novo pra confirmar";
    setTimeout(() => {
      b.dataset.confirma = "";
      b.textContent = "Zerar";
    }, 4000);
    return;
  }
  await call("zerarTempo");
  b.dataset.confirma = "";
  b.textContent = "Zerar";
  avisar("Tempo de jogo zerado.");
});

// --- aviso ----------------------------------------------------------------------------
let timerAviso = null;
function avisar(texto, comRecarregar = false) {
  $("aviso-txt").textContent = texto;
  $("recarregar").hidden = !comRecarregar;
  $("aviso").hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => ($("aviso").hidden = true), comRecarregar ? 8000 : 3000);
}

$("recarregar").addEventListener("click", async () => {
  const abas = await chrome.tabs.query({ url: "https://www.roblox.com/*" });
  abas.forEach((t) => chrome.tabs.reload(t.id));
  avisar(abas.length ? `${abas.length} aba(s) recarregada(s).` : "Nenhuma aba da Roblox aberta.");
});

// --- inicio ---------------------------------------------------------------------------
$("versao").textContent = `v${chrome.runtime.getManifest().version}`;
// Endereco antigo da lista de ofertas (0.13.x): manda pra pagina nova.
if (location.hash === "#ofertas") location.replace(chrome.runtime.getURL("src/ofertas/ofertas.html"));

chrome.storage.local.get({ features: {}, tema: "nenhum", temaCor: "#1a1030" }).then((o) => {
  flags = o.features;
  if (location.hash === "#ofertas") return;
  montarGrupos();
  montarNav();
  montarTemas(o.tema, o.temaCor);
  montarDesejos();
  montarEnvio().catch((e) => $("envio").replaceChildren(el("div", { class: "linha" }, el("div", { class: "desc" }, `Não deu pra carregar: ${e.message}`))));
  montarAnuncio().catch((e) => $("anuncio").replaceChildren(el("div", { class: "linha" }, el("div", { class: "desc" }, `Não deu pra carregar: ${e.message}`))));
  resumo();
});
