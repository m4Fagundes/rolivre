// --- Valor de limitados, inline no site inteiro ------------------------------
// Fonte: Rolimon's. A base toda vem de uma vez e fica 6h em cache no
// background, entao consultar item por item aqui nao custa rede nenhuma.

const base = () => RL.rolimons();

// Pagina do item: linhas novas logo abaixo do preco, no mesmo formato da Roblox.
function detalheDoItem(b, ref) {
  const it = RL.dado(b, ref);
  if (!it) return;
  const ancora = document.querySelector(".item-info-row-container");
  const caixa = ancora?.parentElement;
  if (!caixa || !RL.once(caixa, "Valor")) return;

  // [nome, sigla, rap, value, defaultValue, demand, trend, projected, ...]
  const [, , rap, value, , demand, trend, projected] = it;
  const linhas = [
    ["RAP", RL.num(rap)],
    ["Value", value > 0 ? RL.num(value) : "sem value"],
    ["Demanda", RL.DEMANDA[demand] ?? "—"],
    ["Tendência", RL.TENDENCIA[trend] ?? "—"],
  ];
  if (projected === 1) linhas.push(["Alerta", "PROJECTED"]);

  for (const [k, v] of linhas) {
    const r = RL.cloneRow(k, v);
    if (!r) continue;
    r.classList.add("rl-inj");
    if (k === "Alerta") r.classList.add("rl-inj-alerta");
    caixa.append(r);
  }
}

// Qualquer grade de itens do site: catalogo, inventario, perfil, recomendados.
// O Mercado novo so tem .item-card-container; o perfil tem os dois, um dentro
// do outro — o :not(:has()) evita selo duplicado.
const CARDS = ".item-card-container, .item-card:not(:has(.item-card-container))";

// A marca guarda o id do item, nao so "ja passei aqui": a tela de troca
// reaproveita o mesmo card quando voce troca de troca na lista, e o card chega
// antes do link. Com RL.once o card ficava marcado sem selo pra sempre.
function badgesNosCards(b) {
  for (const card of document.querySelectorAll(CARDS)) {
    const ref = RL.refDoCard(card);
    const chave = RL.chaveRef(ref);
    if (!ref || card.dataset.rlBadge === chave) continue;
    card.querySelectorAll(".rl-badge").forEach((n) => n.remove());
    card.dataset.rlBadge = chave;
    const it = RL.dado(b, ref);
    if (!it) continue;

    const [, , rap, value, , , , projected] = it;
    const temValue = value > 0;
    const badge = RL.el(
      "div",
      {
        class: "rl-badge" + (projected === 1 ? " rl-badge-alerta" : ""),
        title: `RAP ${RL.num(rap)}${temValue ? ` · Value ${RL.num(value)}` : ""}${
          projected === 1 ? " · PROJECTED" : ""
        }`,
      },
      (temValue ? "V " : "RAP ") + RL.num(temValue ? value : rap, true)
    );
    (card.querySelector(".item-card-thumb-container") || card).append(badge);
  }
}

RL.register({
  id: "valorItem",
  test: () => !!RL.refDaUrl(),
  async mount() {
    detalheDoItem(await base(), RL.refDaUrl());
  },
});

RL.register({
  id: "badgesCards",
  test: () => !!document.querySelector(CARDS), // qualquer grade do site
  async mount() {
    badgesNosCards(await base());
  },
});
