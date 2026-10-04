// --- Mercado: analise do item na pagina do item ------------------------------
// Quatro numeros (vendas por dia, RAP, a venda agora, donos), dois graficos
// pequenos alinhados de 90 dias (preco medio de venda e vendas por dia, um
// eixo cada, mesma guia de hover) e o resto em "Mais numeros", fechado.
// Fonte: pagina do item no Rolimon's (ver analiseItem no background); a
// resale-data da Roblox parou em jan/2025.
const MERCADO_COR = { claro: "#2a78d6", escuro: "#3987e5" }; // validado (dataviz) nas duas superficies

const dataCurta = (t) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
const dataLonga = (t) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const compacto = (n) => (n == null ? "—" : RL.num(n, n >= 10_000));

function temaEscuro() {
  const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
  return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2] < 128;
}

// Variacao com seta + texto (cor nunca sozinha). bom = subir e bom?
function delta(atual, antes, rotulo, bom = true) {
  if (atual == null || !antes) return null;
  const p = ((atual - antes) / antes) * 100;
  if (Math.abs(p) < 0.5) return RL.el("span", { class: "rl-m-delta" }, `estável ${rotulo}`);
  const sobe = p > 0;
  const cls = sobe === bom ? "rl-m-bom" : "rl-m-ruim";
  const txt = `${sobe ? "▲" : "▼"} ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: p > -10 && p < 10 ? 1 : 0 }).format(Math.abs(p))}% ${rotulo}`;
  return RL.el("span", { class: `rl-m-delta ${cls}` }, txt);
}

function tile(rotulo, valor, extra) {
  return RL.el("div", { class: "rl-m-tile" }, RL.el("span", { class: "rl-m-rot" }, rotulo), RL.el("strong", {}, valor), extra || "");
}

// --- graficos (SVG na mao) ---------------------------------------------------------
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const ticks = (max) => {
  const passo = 10 ** Math.floor(Math.log10(max || 1));
  const topo = Math.ceil(max / passo) * passo;
  return topo;
};

function graficos(serie, cor) {
  const caixa = RL.el("div", { class: "rl-m-graficos", tabindex: "0", role: "img",
    "aria-label": `Preço médio de venda e vendas por dia nos últimos ${serie.length} dias. Use as setas pra ver cada dia.` });
  const dica = RL.el("div", { class: "rl-m-dica", hidden: "" });
  const desenhar = () => {
    caixa.querySelectorAll("svg, .rl-m-gtit").forEach((n) => n.remove());
    const W = Math.max(280, caixa.clientWidth), ESQ = 4, DIR = 56; // direita: rotulos do eixo
    const larg = W - ESQ - DIR;
    const x = (i) => ESQ + (serie.length === 1 ? larg / 2 : (i / (serie.length - 1)) * larg);

    // Preco medio de venda: linha 2px + lavado 10%, eixo com min/max redondos.
    const H1 = 120, T1 = 10, B1 = 18;
    const precos = serie.map((p) => p.preco).filter((v) => v > 0);
    const pmin = Math.min(...precos), pmax = Math.max(...precos);
    const folga = (pmax - pmin) * 0.12 || pmax * 0.05 || 1;
    const lo = Math.max(0, pmin - folga), hi = pmax + folga;
    const y1 = (v) => T1 + (1 - (v - lo) / (hi - lo)) * (H1 - T1 - B1);
    const g1 = svg("svg", { width: W, height: H1, class: "rl-m-svg" });
    for (const v of [pmin, pmax]) {
      g1.append(svg("line", { x1: ESQ, x2: ESQ + larg, y1: y1(v), y2: y1(v), class: "rl-m-grade" }));
      const t = svg("text", { x: W - DIR + 8, y: y1(v) + 4, class: "rl-m-eixo" });
      t.textContent = RL.num(Math.round(v));
      g1.append(t);
    }
    const pts = serie.map((p, i) => (p.preco > 0 ? [x(i), y1(p.preco)] : null)).filter(Boolean);
    const d = pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join("");
    g1.append(svg("path", { d: `${d}L${pts.at(-1)[0]},${H1 - B1}L${pts[0][0]},${H1 - B1}Z`, fill: cor, "fill-opacity": "0.1" }));
    g1.append(svg("path", { d, fill: "none", stroke: cor, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const [ex, ey] = pts.at(-1);
    g1.append(svg("circle", { cx: ex, cy: ey, r: "4", fill: cor, class: "rl-m-anel" }));
    for (const [i, a] of [[0, "start"], [serie.length - 1, "end"]]) {
      const t = svg("text", { x: i ? ESQ + larg : ESQ, y: H1 - 3, "text-anchor": a, class: "rl-m-eixo" });
      t.textContent = dataCurta(serie[i].t);
      g1.append(t);
    }

    // Vendas por dia: colunas finas, topo arredondado, base reta, 2px de ar.
    const H2 = 70, T2 = 6;
    const vmax = ticks(Math.max(...serie.map((p) => p.vendas), 1));
    const slot = larg / serie.length;
    const bw = Math.max(1, Math.min(24, slot - 2));
    const y2 = (v) => T2 + (1 - v / vmax) * (H2 - T2 - 2);
    const g2 = svg("svg", { width: W, height: H2, class: "rl-m-svg" });
    g2.append(svg("line", { x1: ESQ, x2: ESQ + larg, y1: H2 - 2, y2: H2 - 2, class: "rl-m-grade" }));
    g2.append(svg("line", { x1: ESQ, x2: ESQ + larg, y1: y2(vmax), y2: y2(vmax), class: "rl-m-grade" }));
    const tv = svg("text", { x: W - DIR + 8, y: y2(vmax) + 4, class: "rl-m-eixo" });
    tv.textContent = RL.num(vmax);
    g2.append(tv);
    serie.forEach((p, i) => {
      if (!p.vendas) return;
      const cx = ESQ + i * slot + (slot - bw) / 2, topo = y2(p.vendas), base = H2 - 2, r = Math.min(2, bw / 2);
      g2.append(svg("path", { d: `M${cx},${base}V${topo + r}Q${cx},${topo} ${cx + r},${topo}H${cx + bw - r}Q${cx + bw},${topo} ${cx + bw},${topo + r}V${base}Z`, fill: cor }));
    });

    // Guia vertical nos dois graficos + uma dica com os dois numeros.
    const guias = [g1, g2].map((g, k) => {
      const l = svg("line", { y1: 0, y2: k ? H2 : H1 - B1, class: "rl-m-guia", visibility: "hidden" });
      g.append(l);
      return l;
    });
    const tit1 = RL.el("span", { class: "rl-m-gtit" }, "Preço médio de venda");
    const tit2 = RL.el("span", { class: "rl-m-gtit" }, "Vendas por dia");
    caixa.prepend(tit1, g1, tit2, g2);
    let atual = serie.length - 1;
    const mostrar = (i) => {
      atual = Math.max(0, Math.min(serie.length - 1, i));
      const p = serie[atual], px = ESQ + atual * slot + slot / 2;
      guias.forEach((l) => (l.setAttribute("x1", px), l.setAttribute("x2", px), l.setAttribute("visibility", "visible")));
      dica.replaceChildren(
        RL.el("small", {}, dataLonga(p.t)),
        RL.el("div", {}, RL.el("strong", {}, p.preco > 0 ? RL.num(p.preco) : "—"), " preço médio"),
        RL.el("div", {}, RL.el("strong", {}, RL.num(p.vendas)), p.vendas === 1 ? " venda" : " vendas"));
      dica.hidden = false;
      const lado = px > W / 2 ? px - dica.offsetWidth - 12 : px + 12;
      dica.style.left = `${Math.max(0, lado)}px`;
    };
    const esconder = () => ((dica.hidden = true), guias.forEach((l) => l.setAttribute("visibility", "hidden")));
    caixa.onpointermove = (e) => mostrar(Math.floor((e.clientX - caixa.getBoundingClientRect().left - ESQ) / slot));
    caixa.onpointerleave = esconder;
    caixa.onblur = esconder;
    caixa.onfocus = () => mostrar(atual);
    caixa.onkeydown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        mostrar(atual + (e.key === "ArrowLeft" ? -1 : 1));
      }
    };
  };
  caixa.append(dica);
  requestAnimationFrame(desenhar);
  let t;
  new ResizeObserver(() => (clearTimeout(t), (t = setTimeout(desenhar, 150)))).observe(caixa);
  return caixa;
}

function tabela(serie) {
  return RL.el("table", { class: "rl-m-tabela" },
    RL.el("thead", {}, RL.el("tr", {}, RL.el("th", {}, "Dia"), RL.el("th", {}, "Preço médio"), RL.el("th", {}, "Vendas"))),
    RL.el("tbody", {}, [...serie].reverse().slice(0, 30).map((p) =>
      RL.el("tr", {}, RL.el("td", {}, dataLonga(p.t)), RL.el("td", {}, p.preco > 0 ? RL.num(p.preco) : "—"), RL.el("td", {}, RL.num(p.vendas))))));
}

function painelMercado(a, ref, nome) {
  const cor = temaEscuro() ? MERCADO_COR.escuro : MERCADO_COR.claro;
  const hoardPct = a.hoard != null && a.copias ? (a.hoard / a.copias) * 100 : null;
  const linha = (k, v) => (v == null || v === "" ? "" : [RL.el("dt", {}, k), RL.el("dd", {}, v)]);
  const mais = RL.el("details", { class: "rl-m-mais" },
    RL.el("summary", {}, "Mais números"),
    RL.el("dl", {},
      linha("Vendas nos últimos 30 dias", a.vendas30 != null ? RL.num(a.vendas30) : null),
      linha("Donos Premium", a.donosPremium != null ? RL.num(a.donosPremium) : null),
      linha("Cópias existentes", a.copias != null ? RL.num(a.copias) : null),
      linha("Cópias apagadas", a.apagadas != null ? RL.num(a.apagadas) : null),
      linha("Em hoard", a.hoard != null ? `${RL.num(a.hoard)}${hoardPct != null ? ` (${hoardPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)` : ""}` : null),
      linha("Favoritos", a.favoritos != null ? RL.num(a.favoritos) : null),
      linha("Último ajuste de Value", a.ultimoValue ? `${a.ultimoValue.de ? RL.num(a.ultimoValue.de) + " → " : ""}${RL.num(a.ultimoValue.para)} em ${dataLonga(a.ultimoValue.t)}` : null),
      linha("Lançado", a.criado ? dataLonga(a.criado) : null),
      linha("Virou limitado", a.limitado ? dataLonga(a.limitado) : null)),
    a.serie.length ? RL.el("details", { class: "rl-m-tab" }, RL.el("summary", {}, "Tabela dos últimos 30 dias"), tabela(a.serie)) : "");

  return RL.el("section", { class: `rl-mercado${temaEscuro() ? " rl-m-escuro" : ""}`, "aria-label": `Mercado de ${nome}` },
    RL.el("div", { class: "rl-m-topo" },
      RL.el("h2", {}, "Mercado"),
      RL.el("a", { href: RL.linkRolimons(ref), target: "_blank", rel: "noopener" }, "Dados do Rolimon's")),
    RL.el("div", { class: "rl-m-kpis" },
      tile("Vendas por dia", a.vendasDia != null ? RL.num(Math.round(a.vendasDia * 10) / 10) : "—", delta(a.vendasDia, a.vendasDiaAnt, "vs mês anterior")),
      tile("RAP", compacto(a.rap), delta(a.rap, a.rap30, "em 30 dias")),
      tile("À venda agora", a.vendedores != null ? RL.num(a.vendedores) : "—", a.melhor ? RL.el("span", { class: "rl-m-delta" }, `a partir de ${RL.num(a.melhor)}`) : ""),
      tile("Donos", compacto(a.donos), hoardPct != null ? RL.el("span", { class: "rl-m-delta" }, `${hoardPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em hoard`) : "")),
    a.serie.length > 1 ? graficos(a.serie, cor) : RL.el("p", { class: "rl-m-vazio" }, "Sem vendas registradas nos últimos 90 dias."),
    mais);
}

// --- Item NAO limitado ------------------------------------------------------------
// A Roblox nao mostra vendas de item normal (so pro criador). Os quatro numeros
// sao o que da pra medir: ranking de mais vendidos da semana na categoria,
// favoritos (e o quanto cresceu desde a sua ultima visita), preco/status e,
// em item de quantidade limitada, quantos ja sairam.
function haTempo(t) {
  const dias = Math.floor((Date.now() - t) / 86_400_000);
  if (dias < 1) return "hoje";
  if (dias < 31) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  if (dias < 365) return `há ${Math.round(dias / 30)} ${Math.round(dias / 30) === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(dias / 365); // 10,5 anos e "10 anos", nao 11
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

function painelNormal(a) {
  const sub = (txt, cls = "") => RL.el("span", { class: `rl-m-delta ${cls}` }, txt);
  const r = a.ranking;
  const rank = !r
    ? tile("Mais vendidos da semana", "—", sub("essa categoria não tem ranking"))
    : r.pos
      ? tile("Mais vendidos da semana", `#${RL.num(r.pos)}`, sub(`em ${r.nome}`))
      : tile("Mais vendidos da semana", r.ate ? `Fora do top ${RL.num(r.ate)}` : "—", sub(r.parcial ? "a Roblox limitou a busca; tente depois" : `em ${r.nome}`));

  let favExtra = "";
  if (a.favAntes && a.favoritos != null) {
    const dif = a.favoritos - a.favAntes.n;
    favExtra = sub(`${dif >= 0 ? "▲ +" : "▼ "}${RL.num(dif)} desde ${dataCurta(a.favAntes.t)}`, dif > 0 ? "rl-m-bom" : "");
  } else if (a.criado && a.favoritos != null) {
    const dias = Math.max(1, (Date.now() - a.criado) / 86_400_000);
    favExtra = sub(`≈ ${RL.num(Math.round(a.favoritos / dias))} por dia desde o lançamento`);
  }

  const status = a.saiEm && a.saiEm > Date.now()
    ? `sai de venda ${haTempo(2 * Date.now() - a.saiEm).replace("há", "em")}`
    : a.status === "Off Sale" ? "fora de venda" : "à venda";

  const quarto = a.total
    ? tile("Vendidos", RL.num(a.total - (a.restam || 0)), sub(`de ${RL.num(a.total)} (restam ${RL.num(a.restam || 0)})`))
    : tile("No catálogo", a.criado ? haTempo(a.criado).replace("há ", "") : "—", a.criado ? sub(`desde ${dataLonga(a.criado)}`) : "");

  const linha = (k, v) => (v == null || v === "" ? "" : [RL.el("dt", {}, k), RL.el("dd", {}, v)]);
  const criadorLink = a.criador
    ? RL.el("a", { href: a.criadorTipo === "Group" ? `https://www.roblox.com/communities/${a.criadorId}` : `https://www.roblox.com/users/${a.criadorId}/profile`, target: "_blank", rel: "noopener" }, a.criador)
    : null;
  return RL.el("section", { class: `rl-mercado${temaEscuro() ? " rl-m-escuro" : ""}`, "aria-label": `Mercado de ${a.nome}` },
    RL.el("div", { class: "rl-m-topo" }, RL.el("h2", {}, "Mercado"), RL.el("span", { class: "rl-m-fonte" }, "Dados da Roblox")),
    RL.el("div", { class: "rl-m-kpis" },
      rank,
      tile("Favoritos", RL.num(a.favoritos ?? 0, (a.favoritos ?? 0) >= 10_000), favExtra),
      tile("Preço", a.preco === 0 ? "Grátis" : a.preco != null ? RL.num(a.preco) : "—", sub(status)),
      quarto),
    RL.el("details", { class: "rl-m-mais" },
      RL.el("summary", {}, "Mais números"),
      RL.el("dl", {},
        linha("Criador", criadorLink),
        linha("Lançado", a.criado ? dataLonga(a.criado) : null),
        linha("Limite por pessoa", a.limitePessoa ? RL.num(a.limitePessoa) : null),
        linha("Vendas", "a Roblox só mostra pro criador do item"))));
}

RL.register({
  id: "analiseItem",
  test: () => !!RL.refDaUrl() && !!document.querySelector("#asset-resale-data-container, #item-info-container-frontend"),
  async mount() {
    const ref = RL.refDaUrl();
    const chave = RL.chaveRef(ref);
    const existente = document.querySelector(".rl-mercado");
    if (existente?.dataset.rlItem === chave) return;
    const b = await RL.rolimons();
    const it = RL.dado(b, ref); // limitado: dados do Rolimon's; normal: da Roblox
    if (document.querySelector(".rl-mercado-carregando")?.dataset.rlItem === chave) return;
    existente?.remove();
    const espera = RL.el("div", { class: "rl-mercado-carregando" });
    espera.dataset.rlItem = chave;
    const ancora = document.querySelector("#asset-resale-data-container");
    ancora ? ancora.before(espera) : document.querySelector("#item-info-container-frontend").after(espera);
    try {
      const a = await RL.call(it ? "analiseItem" : "analiseNormal", { id: ref.id, pacote: ref.pacote });
      if (RL.chaveRef(RL.refDaUrl()) !== chave) return espera.remove(); // mudou de item no meio
      const painel = it ? painelMercado(a, ref, it[0]) : painelNormal(a);
      painel.dataset.rlItem = chave;
      espera.replaceWith(painel);
    } catch (e) {
      espera.remove();
      throw e;
    }
  },
});
