// --- Card de info do item -------------------------------------------------------
// Passou o mouse num limitado (catalogo, inventario, troca): card com Value,
// RAP, demanda, tendencia, avisos do Rolimon's e o grafico do RAP dos ultimos
// meses. RoPro chama isso de "Item Info Card" e cobra no Plus.
const CARDS_ITEM = ".item-card-container, li.trade-item-card, .trade-request-item, .trade-inventory-card";
const DEM = ["Terrível", "Baixa", "Normal", "Alta", "Absurda"];
const TEND = ["Caindo", "Instável", "Estável", "Subindo", "Oscilando"];

function grafico(pontos) {
  if (!pontos || pontos.length < 2) return RL.el("div", { class: "rl-ic-vazio" }, "Sem histórico de vendas");
  const w = 240, h = 56, min = Math.min(...pontos), max = Math.max(...pontos);
  const y = (v) => (max === min ? h / 2 : h - 4 - ((v - min) / (max - min)) * (h - 8));
  const d = pontos.map((v, i) => `${i ? "L" : "M"}${((i / (pontos.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "rl-ic-graf");
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`;
  return RL.el(
    "div",
    {},
    svg,
    RL.el("div", { class: "rl-ic-eixo" }, RL.el("span", {}, `mín ${RL.num(min, true)}`), RL.el("span", {}, `máx ${RL.num(max, true)}`))
  );
}

let icAtual = null, icTimer = null;
const fecharIc = () => {
  clearTimeout(icTimer);
  icAtual?.remove();
  icAtual = null;
};

async function abrirIc(card, ref) {
  const b = await RL.rolimons();
  const it = RL.dado(b, ref);
  if (!it) return;
  const [nome, sigla, rap, value, , demanda, tendencia, projetado, hyped, raro] = it;
  const avisos = [projetado === 1 && "PROJECTED", hyped === 1 && "Hyped", raro === 1 && "Raro"].filter(Boolean);
  const graf = RL.el("div", { class: "rl-ic-graf-box" }, RL.el("div", { class: "rl-ic-vazio" }, "carregando gráfico..."));

  fecharIc();
  const pop = RL.el(
    "div",
    { class: "rl-ic", role: "tooltip" },
    RL.el("div", { class: "rl-ic-nome" }, nome, sigla ? RL.el("span", { class: "rl-ic-sigla" }, sigla) : ""),
    avisos.length ? RL.el("div", { class: "rl-ic-avisos" }, avisos.map((a) => RL.el("span", { class: `rl-ic-aviso rl-ic-${a.toLowerCase()}` }, a))) : "",
    RL.el(
      "div",
      { class: "rl-ic-grade" },
      [["Value", value > 0 ? RL.num(value) : "—"], ["RAP", RL.num(rap)], ["Demanda", DEM[demanda] ?? "—"], ["Tendência", TEND[tendencia] ?? "—"]].map(
        ([k, v]) => RL.el("div", {}, RL.el("small", {}, k), RL.el("strong", {}, v))
      )
    ),
    RL.el("div", { class: "rl-ic-sub" }, "Preço médio de venda, 90 dias"),
    graf,
    RL.el("a", { class: "rl-ic-link", href: RL.linkRolimons(ref), target: "_blank", rel: "noopener" }, "Ver no Rolimon's →")
  );
  pop.addEventListener("mouseenter", () => clearTimeout(icTimer));
  pop.addEventListener("mouseleave", () => (icTimer = setTimeout(fecharIc, 200)));
  document.body.append(pop);
  icAtual = pop;

  // Do lado do card; se nao cabe a direita, vai pra esquerda.
  const r = card.getBoundingClientRect();
  const larg = pop.offsetWidth;
  const x = r.right + 8 + larg < innerWidth ? r.right + 8 : Math.max(8, r.left - 8 - larg);
  pop.style.left = `${x + scrollX}px`;
  pop.style.top = `${Math.max(scrollY + 8, r.top + scrollY)}px`;

  // Vem do Rolimon's (a resale-data da Roblox parou em jan/2025); serve item e pacote.
  const pontos = await RL.call("revenda", { assetId: ref.id, pacote: ref.pacote }).catch(() => null);
  if (icAtual === pop) graf.replaceChildren(grafico(pontos));
}

let icLigado = false;
RL.register({
  id: "cardItem",
  test: () => true,
  mount() {
    if (icLigado) return;
    icLigado = true;
    // Um listener so, delegado: pega cards que chegam depois sem re-montar nada.
    document.addEventListener("mouseover", (e) => {
      const card = e.target.closest?.(CARDS_ITEM);
      if (!card || card.contains(e.relatedTarget)) return;
      const ref = RL.refDoCard(card);
      if (!ref) return;
      clearTimeout(icTimer);
      icTimer = setTimeout(() => abrirIc(card, ref).catch(() => {}), 350);
      card.addEventListener("mouseleave", () => (clearTimeout(icTimer), (icTimer = setTimeout(fecharIc, 200))), { once: true });
    });
  },
});
