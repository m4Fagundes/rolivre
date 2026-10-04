// --- Calculadora de troca ------------------------------------------------------
// Serve as duas telas de troca da Roblox:
//  - detalhe de uma troca (/trades) ........... .trade-list-detail-offer
//  - montar troca (/users/:id/trade) .......... .trade-request-window-offer
// Nas duas a Roblox poe a SUA oferta primeiro (ordenam por isMyOffer no
// Trades.js deles). Cada item tem um link /catalog/:id, e e dali que sai o id
// pra buscar o Value. Em cada lado entra uma linha "Value (Rolimon's)" clonada
// do "Valor total" nativo; depois do segundo lado, o saldo da troca.
const OFERTA = ".trade-list-detail-offer, .trade-request-window-offer";
const ITEM = "li.trade-item-card, .trade-request-item";

const digitos = (t) => Number(String(t || "").replace(/\D/g, "")) || 0;

// Demanda: RL.DEMANDA (core.js). -1 = "Not Assigned" (quase todo item sem
// Value), e esse fica fora da media.

function lerOferta(of, b) {
  const itens = [];
  for (const card of of.querySelectorAll(ITEM)) {
    const ref = RL.refDoCard(card);
    if (!ref) continue; // slot vazio da janela de troca
    const id = ref.id;
    const rl = RL.dado(b, ref);
    // Item fora do Rolimon's (limitado UGC novo): vale o RAP que a Roblox mostra.
    const rapTela = digitos(card.querySelector(".text-robux-tile, .item-value .text-robux")?.textContent);
    const rap = rl ? rl[2] : rapTela;
    itens.push({
      id,
      pacote: ref.pacote,
      // RAP da Roblox que a carta mostra (mais atual que o do Rolimon's).
      rapAgora: rapTela || rap,
      rapBased: !(rl && rl[3] > 0),
      nome: rl?.[0] || card.querySelector(".item-card-name, .item-name")?.textContent.trim() || id,
      rap,
      value: rl && rl[3] > 0 ? rl[3] : rap,
      projetado: rl?.[7] === 1,
      demanda: rl ? rl[5] : -1,
      tendencia: rl ? rl[6] : -1,
      semDados: !rl,
    });
  }
  // Linhas de Robux nativas: [Robux depois da taxa]? + [Valor total]. A nossa nao conta.
  const linhas = [...of.querySelectorAll(".robux-line:not(.rl-troca-linha)")];
  const robux = linhas.length >= 2 ? digitos(linhas[0].querySelector(".robux-line-value")?.textContent) : 0;
  const soma = (k) => itens.reduce((s, i) => s + i[k], 0) + robux;
  return { itens, robux, value: soma("value"), rap: soma("rap"), totalNativo: linhas.at(-1) };
}

function linhaValue(of, lado) {
  let l = of.querySelector(".rl-troca-linha");
  if (!l) {
    if (!lado.totalNativo) return;
    l = RL.limpar(lado.totalNativo.cloneNode(true));
    l.classList.add("rl-troca-linha");
    lado.totalNativo.after(l);
  }
  const [rotulo] = l.children;
  const valor = l.querySelector(".robux-line-value");
  // Ícone de Value (raio azul) no lugar do de Robux: Value não é Robux.
  l.querySelectorAll('[class*="icon-robux"]').forEach((i) => i.replaceWith(RL.el("span", { class: "rl-ico-valor", title: "Value do Rolimon's" })));
  if (rotulo) rotulo.textContent = "Value (Rolimon's)";
  if (valor) valor.textContent = RL.num(lado.value);
}

// Media ponderada pelo Value: o item caro e o que decide se o lado gira facil.
function demandaDoLado(lado) {
  const com = lado.itens.filter((i) => i.demanda >= 0);
  const peso = com.reduce((s, i) => s + i.value, 0);
  return peso ? com.reduce((s, i) => s + i.demanda * i.value, 0) / peso : null;
}

const chipDemanda = (d) =>
  d == null
    ? RL.el("span", { class: "rl-dem rl-dem-sem" }, "sem dado")
    : RL.el("span", { class: `rl-dem rl-dem-${Math.round(d)}` }, RL.DEMANDA[Math.round(d)]);

// --- Indicador de RAP (item sem Value, que vale pelo RAP) -----------------------
// O RAP e uma media que anda a cada venda, puxada ~10% na direcao do preco da
// venda. A proxima venda sai pelo menor preco a venda agora: acima do RAP, o
// RAP sobe; abaixo, cai. Margem de 5% pra nao chamar de alta o ruido.
function rumoDoRap(rap, melhor) {
  if (!rap) return null;
  if (!melhor) return { seta: "–", cls: "sem", txt: "sem ninguém vendendo agora: o RAP fica parado" };
  const dif = (melhor - rap) / rap;
  const prox = Math.round(rap + (melhor - rap) * 0.1);
  const base = `Menor preço ${RL.num(melhor)} · RAP ${RL.num(rap)} (${dif > 0 ? "+" : ""}${Math.round(dif * 100)}%). Próxima venda: RAP ≈ ${RL.num(prox)}`;
  if (dif > 0.05) return { seta: "↑", cls: "sobe", txt: base, dif, melhor };
  if (dif < -0.05) return { seta: "↓", cls: "cai", txt: base, dif, melhor };
  return { seta: "→", cls: "parado", txt: base, dif, melhor };
}

let precosTroca = {}, precosTrocaEm = 0;
async function precosDaTroca(lados) {
  if (Date.now() - precosTrocaEm > 5 * 60_000) (precosTroca = {}), (precosTrocaEm = Date.now()); // preco muda rapido
  const itens = lados.flatMap((l) => l.itens).filter((i) => i.rapBased).map((i) => ({ id: i.id, tipo: i.pacote ? "Bundle" : "Asset" }));
  const faltam = itens.filter((i) => !(`${i.tipo}:${i.id}` in precosTroca));
  if (faltam.length) Object.assign(precosTroca, await RL.call("precosRevenda", { itens: faltam }).catch(() => ({})));
  for (const l of lados)
    for (const i of l.itens) if (i.rapBased) i.rumo = rumoDoRap(i.rapAgora, precosTroca[`${i.pacote ? "Bundle" : "Asset"}:${i.id}`]);
}

// Selo no canto do item sem Value: RAP ↑ / ↓ / →. O canto e o mesmo da
// demanda, que item sem Value nao tem.
function rapNosCards(of, lado) {
  const porId = new Map(lado.itens.map((i) => [i.id, i]));
  for (const card of of.querySelectorAll(ITEM)) {
    const ref = RL.refDoCard(card);
    const it = ref && porId.get(ref.id);
    const alvo = card.querySelector(".item-card-thumb-container");
    if (!it?.rumo || !alvo) continue;
    const chave = `${RL.chaveRef(ref)}:${it.rumo.cls}`;
    if (card.dataset.rlRap === chave) continue;
    card.dataset.rlRap = chave;
    alvo.querySelectorAll(".rl-rap").forEach((n) => n.remove());
    alvo.append(RL.el("span", { class: `rl-rap rl-rap-${it.rumo.cls}`, title: it.rumo.txt }, `RAP ${it.rumo.seta}`));
  }
}

// Linha "raio + Value" embaixo do preco de cada item, como no RoPro. Clona a
// linha de preco nativa (mesma fonte) e troca icone e numero. Item sem Value
// mostra o RAP apagado.
function valorNosCards(of, b) {
  for (const card of of.querySelectorAll(ITEM)) {
    const ref = RL.refDoCard(card);
    const preco = card.querySelector(".item-card-price");
    if (!ref || !preco) continue;
    const chave = RL.chaveRef(ref);
    if (card.dataset.rlValor === chave && card.querySelector(".rl-valor-item")) continue;
    card.dataset.rlValor = chave;
    card.querySelectorAll(".rl-valor-item").forEach((n) => n.remove());
    const it = RL.dado(b, ref);
    const temValue = it && it[3] > 0;
    const linha = RL.limpar(preco.cloneNode(true));
    linha.classList.add("rl-valor-item");
    linha.classList.toggle("rl-valor-sem", !temValue);
    linha.title = temValue ? "Value do Rolimon's" : "Sem Value no Rolimon's: mostrando o RAP";
    linha.replaceChildren(RL.el("span", { class: "rl-ico-valor" }), RL.el("span", { class: "rl-valor-num" }, it ? RL.num(temValue ? it[3] : it[2]) : "—"));
    preco.after(linha);
  }
}

// Selo de demanda no canto de cada item da troca. Marca pelo id, igual o
// selo de Value: a tela reaproveita o card quando voce troca de troca.
function chipsNosCards(of, b) {
  for (const card of of.querySelectorAll(ITEM)) {
    const ref = RL.refDoCard(card);
    const chave = RL.chaveRef(ref);
    const alvo = card.querySelector(".item-card-thumb-container");
    if (!ref || !alvo || card.dataset.rlDem === chave) continue;
    alvo.querySelectorAll(".rl-dem").forEach((n) => n.remove());
    card.dataset.rlDem = chave;
    const d = RL.dado(b, ref)?.[5];
    if (d == null || d < 0) continue;
    const chip = chipDemanda(d);
    chip.title = `Demanda no Rolimon's: ${RL.DEMANDA[d]}`;
    alvo.append(chip);
  }
}

const pct = (de, para) =>
  de ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format((para - de) / de) : "";

// Entra logo abaixo da nossa linha "Value (Rolimon's)", no mesmo container das
// linhas nativas: assim tem a largura da coluna de valores. Irma da oferta, ia
// ate a borda da pagina.
// --- Veredito ----------------------------------------------------------------
// Uma palavra decide: Boa (ganho de Value >= 5%), Justa (-2% a 5%) ou Ruim.
// Alerta pesado (PROJECTED do outro lado) derruba pra Ruim; alerta medio
// (demanda menor, item caindo, RAP caindo, metade do recebido sem Value) segura
// uma Boa em Justa. O motivo mais importante aparece numa linha so; o resto
// fica em Detalhes, fechado de comeco (quadro denso foi rejeitado, 30/09/2026).
const VEREDITO = {
  boa: "Boa troca",
  justa: "Troca justa",
  ruim: "Troca ruim",
};
let detalhesAbertos = false;
chrome.storage.local.get({ calcDetalhes: false }).then((o) => (detalhesAbertos = o.calcDetalhes));

function avisosDaTroca(dou, recebo) {
  const av = []; // { nivel: 3 pesado | 2 medio | 1 info, curto, longo, cls }
  const nomes = (l) => l.map((i) => i.nome).join(", ");
  const proj = recebo.itens.filter((i) => i.projetado);
  if (proj.length) av.push({ nivel: 3, curto: `${nomes(proj)} está PROJECTED: o RAP está inflado`, longo: `⚠ PROJECTED do outro lado: ${nomes(proj)}. O RAP desses está inflado.`, cls: "rl-troca-alerta" });

  const demDou = demandaDoLado(dou), demRecebo = demandaDoLado(recebo);
  // Absurda -> Alta ainda e demanda boa: so pesa se cair 2 niveis ou chegar em Normal ou pior.
  const queda = demDou != null && demRecebo != null ? Math.round(demDou) - Math.round(demRecebo) : 0;
  if (queda >= 1)
    av.push({ nivel: queda >= 2 || Math.round(demRecebo) <= 2 ? 2 : 1, curto: `você recebe demanda ${RL.DEMANDA[Math.round(demRecebo)]}, dá ${RL.DEMANDA[Math.round(demDou)]}`, longo: `⚠ Você dá demanda ${RL.DEMANDA[Math.round(demDou)]} e recebe ${RL.DEMANDA[Math.round(demRecebo)]}: vai ser mais difícil trocar esses itens depois.`, cls: "rl-troca-alerta" });

  const caindo = recebo.itens.filter((i) => i.tendencia === 0);
  if (caindo.length) av.push({ nivel: 2, curto: `${nomes(caindo)} está em queda no Rolimon's`, longo: `⚠ Você recebe item em queda no Rolimon's: ${nomes(caindo)}. O Value tende a baixar.`, cls: "rl-troca-alerta" });

  const rapLinha = (i) => `${i.nome} (à venda por ${RL.num(i.rumo.melhor)}, RAP ${RL.num(i.rapAgora)})`;
  const rapCai = recebo.itens.filter((i) => i.rumo?.cls === "cai");
  if (rapCai.length) av.push({ nivel: 2, curto: `${nomes(rapCai)} está com RAP caindo`, longo: `↓ RAP caindo no que você recebe: ${rapCai.map(rapLinha).join(", ")}. Tem gente vendendo abaixo do RAP.`, cls: "rl-troca-alerta" });

  const semValue = recebo.itens.filter((i) => i.rapBased).reduce((s, i) => s + i.value, 0);
  if (recebo.value && semValue / recebo.value > 0.5)
    av.push({ nivel: 2, curto: "mais da metade do que você recebe não tem Value (conta pelo RAP)", longo: `Mais da metade do que você recebe (${RL.num(semValue)}) é item sem Value no Rolimon's, contado pelo RAP.`, cls: "rl-troca-nota" });

  const subindo = dou.itens.filter((i) => i.tendencia === 3);
  if (subindo.length) av.push({ nivel: 1, longo: `↗ Você dá item em alta no Rolimon's: ${nomes(subindo)}. Ele está valorizando.`, cls: "rl-troca-aviso" });
  const rapSobeDou = dou.itens.filter((i) => i.rumo?.cls === "sobe");
  if (rapSobeDou.length) av.push({ nivel: 1, longo: `↑ RAP subindo no que você dá: ${rapSobeDou.map(rapLinha).join(", ")}.`, cls: "rl-troca-aviso" });
  const rapSobe = recebo.itens.filter((i) => i.rumo?.cls === "sobe");
  if (rapSobe.length) av.push({ nivel: 1, longo: `↑ RAP subindo no que você recebe: ${rapSobe.map(rapLinha).join(", ")}.`, cls: "rl-troca-nota" });
  const instavel = recebo.itens.filter((i) => i.tendencia === 1);
  if (instavel.length) av.push({ nivel: 1, longo: `Instável no Rolimon's: ${nomes(instavel)}. O preço varia bastante.`, cls: "rl-troca-nota" });
  return av.sort((a, b) => b.nivel - a.nivel);
}

function veredito(p, avisos) {
  let v = p >= 5 ? "boa" : p > -2 ? "justa" : "ruim";
  if (avisos.some((a) => a.nivel === 3)) v = "ruim";
  else if (v === "boa" && avisos.some((a) => a.nivel === 2)) v = "justa";
  return v;
}

function resumo(depoisDe, dou, recebo) {
  let box = document.querySelector(".rl-troca-resumo");
  if (!box) box = RL.el("div", { role: "status" });
  if (box.previousElementSibling !== depoisDe) depoisDe.after(box);

  const saldo = recebo.value - dou.value;
  const p = dou.value ? (saldo / dou.value) * 100 : 0;
  const avisos = avisosDaTroca(dou, recebo);
  const v = veredito(p, avisos);
  const motivo = avisos.find((a) => a.nivel >= 2);
  const pctTxt = dou.value
    ? (p > 0 ? "+" : p < 0 ? "−" : "") + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(p)) + "%"
    : "—";
  const frase = saldo > 0 ? `Você ganha ${RL.num(saldo)} de Value` : saldo < 0 ? `Você perde ${RL.num(-saldo)} de Value` : "Mesmo Value dos dois lados";
  const demDou = demandaDoLado(dou), demRecebo = demandaDoLado(recebo);

  const detalhes = RL.el(
    "details",
    { class: "rl-v-detalhes" },
    RL.el("summary", {}, "Detalhes"),
    RL.el(
      "div",
      { class: "rl-troca-grade" },
      RL.el("span", {}, "Você dá"),
      RL.el("span", { class: "v" }, RL.num(dou.value)),
      RL.el("span", {}, "Você recebe"),
      RL.el("span", { class: "v" }, RL.num(recebo.value))
    ),
    RL.el("div", { class: "rl-troca-demanda" }, RL.el("span", {}, "Demanda"),
      RL.el("span", {}, "dá ", chipDemanda(demDou), " → recebe ", chipDemanda(demRecebo))),
    RL.el("div", { class: "rl-troca-nota" },
      `RAP: dá ${RL.num(dou.rap)} · recebe ${RL.num(recebo.rap)}` +
        (dou.rap ? ` (${pct(dou.rap, recebo.rap)})` : "") +
        (dou.robux || recebo.robux ? " · Robux contados já sem a taxa" : "")),
    avisos.map((a) => RL.el("div", { class: a.cls }, a.longo)),
    RL.el("div", { class: "rl-troca-nota" }, "Boa: ganho de 5% ou mais sem alerta. Justa: de −2% a 5%, ou ganho com alerta. Ruim: perda maior que 2% ou item PROJECTED.")
  );
  detalhes.open = detalhesAbertos;
  detalhes.addEventListener("toggle", () => {
    detalhesAbertos = detalhes.open;
    chrome.storage.local.set({ calcDetalhes: detalhes.open });
  });

  box.className = `rl-troca-resumo rl-v-${v}`;
  box.replaceChildren(
    RL.el("div", { class: "rl-v-topo" },
      RL.el("span", { class: "rl-v-selo" }, VEREDITO[v]),
      RL.el("button", { class: "rl-print", type: "button", "aria-label": "Esconder números de série (#) pra tirar print", onclick: () => RL.alternarSerial() }, "#")),
    RL.el("div", { class: "rl-v-numero" }, pctTxt),
    RL.el("div", { class: "rl-v-frase" }, frase),
    motivo ? RL.el("div", { class: "rl-v-motivo" }, `Atenção: ${motivo.curto}.`) : "",
    detalhes
  );
}

RL.register({
  id: "calcTroca",
  test: () => /^\/(trades|users\/\d+\/trade)/.test(RL.path()),

  async mount() {
    const ofertas = [...document.querySelectorAll(OFERTA)];
    if (ofertas.length < 2) {
      document.querySelector(".rl-troca-resumo")?.remove(); // troca fechada
      return;
    }
    const b = await RL.rolimons();
    ofertas.slice(0, 2).forEach((of) => (chipsNosCards(of, b), valorNosCards(of, b))); // idempotente: roda sempre
    const [dou, recebo] = ofertas.slice(0, 2).map((of) => lerOferta(of, b));
    await precosDaTroca([dou, recebo]);
    rapNosCards(ofertas[0], dou);
    rapNosCards(ofertas[1], recebo);

    // O observer chama isto a cada mudanca no DOM, inclusive as nossas. So
    // reescreve quando a troca muda, senao entraria em loop.
    const assinatura = JSON.stringify([dou.itens.map((i) => i.id), dou.robux, recebo.itens.map((i) => i.id), recebo.robux]);
    const box = document.querySelector(".rl-troca-resumo");
    const ancora = () => ofertas[1].querySelector(".rl-troca-linha") || ofertas[1];
    const emDia =
      box?.dataset.rlAssinatura === assinatura &&
      box.previousElementSibling === ancora() &&
      ofertas.every((of) => of.querySelector(".rl-troca-linha"));
    if (emDia) return;

    linhaValue(ofertas[0], dou);
    linhaValue(ofertas[1], recebo);
    resumo(ancora(), dou, recebo);
    document.querySelector(".rl-troca-resumo").dataset.rlAssinatura = assinatura;
  },
});
