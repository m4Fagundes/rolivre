// --- Modo print: esconde o numero de serie (#536) --------------------------
// Serie identifica a copia (e o dono). Pra postar print de troca sem expor,
// o botao "Esconder #" da calculadora liga isto: o serial fica borrado ate
// desligar. Na Roblox ele vem em .limited-number-container, partido em dois
// spans ("#" e "743") - o CSS esconde essa caixa direto. A busca pelo TEXTO
// abaixo e o reserva pra outros formatos ("Serial #743", "#743/5000").
const CARDS_SERIAL = "li.trade-item-card, .trade-request-item, .trade-inventory-card, .item-card-container";

function marcarSeriais() {
  for (const card of document.querySelectorAll(CARDS_SERIAL))
    for (const e of card.querySelectorAll("span, div, p")) {
      if (e.children.length || e.classList.contains("rl-serial")) continue;
      if (/^(serial\s*)?#\s?\d{1,7}(\s*\/\s*[\d.,]+)?$/i.test(e.textContent.trim())) e.classList.add("rl-serial");
    }
}

function aplicarSerial(on) {
  document.documentElement.classList.toggle("rl-sem-serial", !!on);
  if (on) marcarSeriais();
  document.querySelectorAll(".rl-print").forEach((b) => {
    b.setAttribute("aria-pressed", String(!!on));
    b.title = on ? "Números de série escondidos. Clique pra mostrar." : "Esconder números de série (#) pra tirar print";
  });
}

RL.alternarSerial = async () => {
  const { ocultarSerial } = await chrome.storage.local.get({ ocultarSerial: false });
  await chrome.storage.local.set({ ocultarSerial: !ocultarSerial });
};

chrome.storage.local.get({ ocultarSerial: false }).then((o) => aplicarSerial(o.ocultarSerial));
chrome.storage.onChanged.addListener((c) => c.ocultarSerial && aplicarSerial(c.ocultarSerial.newValue));

RL.register({
  id: "modoPrint",
  test: () => !!document.querySelector(CARDS_SERIAL),
  mount() {
    // So varre com o modo ligado (inventario grande = muita folha pra testar).
    // aplicarSerial tambem acerta o texto do botao, que nasce depois.
    aplicarSerial(document.documentElement.classList.contains("rl-sem-serial"));
  },
});
