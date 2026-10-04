// Ofertas: anuncios do Rolimon's que pedem itens seus. A lista vem do
// background (alarme de 2 min + "Buscar de novo"); aqui so desenha.
// Ordem: a mais recente primeiro (pedido dele, 30/09/2026) - quem acabou de
// anunciar ainda esta online. A primeira vai em destaque, as outras em linha.
const $ = (id) => document.getElementById(id);
const POR_VEZ = 5;

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  n.append(...kids.flat().filter((c) => c != null && c !== ""));
  return n;
}

const call = (k, p = {}) =>
  chrome.runtime.sendMessage({ k, ...p }).then((r) => {
    if (!r?.ok) throw new Error((r?.error || "sem resposta").replace(/^Error: /, ""));
    return r.data;
  });

const num = (n) => new Intl.NumberFormat("pt-BR").format(n);
const pct = (p) => (p > 0 ? "+" : p < 0 ? "−" : "") + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(p)) + "%";
function haQuanto(t) {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
}

let dados = null, nomes = {}, fotos = {}, mostrar = POR_VEZ;
let filtro = { perco: false, parcial: false };

const SETA = () => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", "22");
  s.setAttribute("height", "22");
  s.setAttribute("class", "seta");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = '<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
};

const tile = (id) => el("span", { class: "tile", title: nomes[id] || `Item ${id}` }, el("img", { src: fotos[id] || "", alt: nomes[id] || "" }));
const tileRobux = (r) => el("span", { class: "tile robux", title: `${num(r)} Robux` }, el("span", {}, `+${num(r)}`), el("small", {}, "R$"));

function lado(ids, robux, valor, rotulo, comRotulo) {
  return el("div", { class: "lado" },
    el("div", { class: "fotos" }, ids.map(tile), robux ? tileRobux(robux) : ""),
    comRotulo ? el("span", { class: "valor" }, num(valor)) : "",
    comRotulo ? el("small", {}, rotulo) : "");
}

const linkQuem = (a) => el("a", { href: `https://www.rolimons.com/player/${a.uid}`, target: "_blank", rel: "noopener" }, a.nome);
const linkTroca = (a) => el("a", { class: "abrir", href: `https://www.roblox.com/users/${a.uid}/trade`, target: "_blank", rel: "noopener" }, "Abrir troca");
const classeGanho = (p) => "ganho " + (p > 0 ? "pos" : p < 0 ? "neg" : "");

function destaque(a) {
  return el("article", { class: "destaque" },
    el("div", { class: classeGanho(a.pct) }, pct(a.pct)),
    el("div", { class: "troca" },
      lado(a.pedido, 0, a.dou, "você dá", true),
      SETA(),
      lado(a.oferta, a.robux, a.recebo, "você recebe", true)),
    el("div", { class: "rodape" },
      el("span", { class: "quem" }, linkQuem(a), `, ${haQuanto(a.t)}`),
      linkTroca(a)));
}

function linha(a) {
  return el("li", { class: "linha" },
    el("span", { class: classeGanho(a.pct) }, pct(a.pct)),
    el("div", { class: "meio" },
      el("div", { class: "troca" }, lado(a.pedido, 0), SETA(), lado(a.oferta, a.robux)),
      el("span", { class: "quem" }, linkQuem(a), `, ${haQuanto(a.t)}`)),
    linkTroca(a));
}

function vazio(titulo, texto, botao, acao) {
  return el("div", { class: "vazio" }, el("h2", {}, titulo), el("p", {}, texto), botao ? el("button", { type: "button", onclick: acao }, botao) : "");
}

function carregando() {
  const b = (w, h) => el("div", { class: "bloco", style: `width:${w};height:${h}px` });
  return el("div", { class: "carregando" }, el("div", { class: "destaque" }, b("40%", 64), b("70%", 76), b("100%", 36)));
}

function visiveis() {
  return (dados?.anuncios || [])
    .filter((a) => (filtro.parcial || a.tenhoTudo) && (filtro.perco || a.pct >= 0))
    .sort((a, b) => b.t - a.t);
}

async function garantirImagens(lista) {
  const ids = [...new Set(lista.flatMap((a) => [...a.oferta, ...a.pedido]))];
  const faltam = ids.filter((id) => !(id in fotos));
  for (let i = 0; i < faltam.length; i += 100)
    Object.assign(fotos, await call("thumbs", { ids: faltam.slice(i, i + 100) }).catch(() => ({})));
  faltam.forEach((id) => (fotos[id] ??= ""));
}

async function desenhar() {
  const box = $("lista");
  $("quando").textContent = dados?.em ? haQuanto(dados.em) : "…";
  const lista = visiveis();
  if (!lista.length) {
    const cfg = dados?.cfg || {};
    box.replaceChildren(vazio(
      "Ninguém pedindo seus itens agora",
      cfg.avisar
        ? `Anúncios novos entram sozinhos a cada 2 minutos. Quando alguém oferecer ${cfg.avisarPct}% ou mais, você recebe um aviso.`
        : "Anúncios novos entram sozinhos a cada 2 minutos.",
      "Buscar de novo",
      atualizar));
    return;
  }
  const parte = lista.slice(0, mostrar + 1);
  await garantirImagens(parte);
  const [primeira, ...resto] = parte;
  const faltam = lista.length - parte.length;
  box.replaceChildren(
    destaque(primeira),
    resto.length ? el("ul", { class: "outras" }, resto.map(linha)) : "",
    faltam > 0 ? el("button", { type: "button", class: "mais", onclick: () => ((mostrar += POR_VEZ), desenhar()) }, `Mostrar mais ${Math.min(faltam, POR_VEZ)}`) : "");
}

let timerAviso = null;
function avisar(txt) {
  $("aviso").textContent = txt;
  $("aviso").hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => ($("aviso").hidden = true), 3000);
}

async function atualizar() {
  const b = $("atualizar");
  if (b.getAttribute("aria-busy") === "true") return;
  b.setAttribute("aria-busy", "true");
  $("quando").textContent = "buscando";
  try {
    const n = await call("buscarAnuncios");
    if (n === null) return mostrarDesligado();
    dados = await call("pedemMeus");
    await desenhar();
    avisar(n ? `${n} ${n === 1 ? "anúncio novo" : "anúncios novos"}` : "Nada novo por enquanto");
  } catch (e) {
    mostrarErro(e);
  } finally {
    b.setAttribute("aria-busy", "false");
    $("quando").textContent = dados?.em ? haQuanto(dados.em) : "…";
  }
}

function mostrarErro(e) {
  const semLogin = /401|authenticated|Authorization/i.test(e.message);
  $("lista").replaceChildren(semLogin
    ? vazio("Entre na Roblox neste navegador", "A lista precisa saber quais itens são seus. Abra roblox.com, entre na sua conta e volte aqui.", "Tentar de novo", atualizar)
    : vazio("Não deu pra buscar agora", `O Rolimon's ou a Roblox não responderam (${e.message}). Tente de novo em alguns segundos.`, "Tentar de novo", atualizar));
}

function mostrarDesligado() {
  $("lista").replaceChildren(vazio("A busca de ofertas está desligada", "Ligue pra ver quem está pedindo seus itens.", "Ligar", async () => {
    const { features } = await chrome.storage.local.get({ features: {} });
    await chrome.storage.local.set({ features: { ...features, pedemMeus: true } });
    atualizar();
  }));
}

// --- ajustes --------------------------------------------------------------------
async function montarAjustes() {
  const o = await chrome.storage.local.get({ ofertasFiltro: filtro, pedem: { avisar: true, avisarPct: 10 } });
  filtro = { ...filtro, ...o.ofertasFiltro };
  $("f-perco").checked = filtro.perco;
  $("f-parcial").checked = filtro.parcial;
  $("f-avisar").checked = o.pedem.avisar ?? true;
  $("f-pct").value = o.pedem.avisarPct ?? 10;
  const salvarFiltro = () => {
    filtro = { perco: $("f-perco").checked, parcial: $("f-parcial").checked };
    chrome.storage.local.set({ ofertasFiltro: filtro });
    mostrar = POR_VEZ;
    desenhar();
  };
  const salvarAviso = () =>
    chrome.storage.local.set({ pedem: { avisar: $("f-avisar").checked, avisarPct: Math.max(0, parseInt($("f-pct").value, 10) || 0) } });
  $("f-perco").addEventListener("change", salvarFiltro);
  $("f-parcial").addEventListener("change", salvarFiltro);
  $("f-avisar").addEventListener("change", salvarAviso);
  $("f-pct").addEventListener("change", salvarAviso);
}

// --- inicio ---------------------------------------------------------------------
$("atualizar").addEventListener("click", atualizar);
$("lista").replaceChildren(carregando());

(async () => {
  await montarAjustes();
  const [base, { features }] = await Promise.all([call("values").catch(() => ({})), chrome.storage.local.get({ features: {} })]);
  for (const [id, it] of Object.entries(base.items || {})) nomes[id] = it[0].trim();
  if (features.pedemMeus === false) return mostrarDesligado();
  dados = await call("pedemMeus");
  if (dados.anuncios.length || dados.em) await desenhar();
  // Mais de 3 min sem buscar: busca ja.
  if (Date.now() - (dados.em || 0) > 3 * 60_000) atualizar();
})().catch(mostrarErro);

// O alarme de 2 min atualiza a lista com a pagina aberta: redesenha sozinho.
chrome.storage.onChanged.addListener(async (c) => {
  if (!c.pedemMeus) return;
  dados = await call("pedemMeus").catch(() => dados);
  desenhar();
});
setInterval(() => dados?.em && ($("quando").textContent = haQuanto(dados.em)), 30_000);
