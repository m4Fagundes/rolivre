// A Roblox e uma SPA e carrega metade da pagina depois. Em vez de rodar uma
// vez, observo o DOM e re-rodo as features: cada mount e idempotente (guardado
// por RL.once), entao rodar de novo e barato e pega o conteudo que chegou.
let pendente = null;

function rodar() {
  for (const f of RL.features) {
    if (!RL.on(f.id) || !f.test()) continue;
    Promise.resolve()
      .then(() => f.mount())
      .catch((e) => console.warn(`[RoLivre] ${f.id}:`, e));
  }
}

function agendar() {
  clearTimeout(pendente);
  pendente = setTimeout(rodar, 250);
}

chrome.storage.local.get({ features: {}, tema: "nenhum", temaCor: "#1a1030" }).then((o) => {
  RL.flags = o.features;
  aplicarTema(o.tema, o.temaCor);
  rodar();
  new MutationObserver(agendar).observe(document.body, {
    childList: true,
    subtree: true,
  });
});

// Ligar vale na hora (o proximo rodar() injeta). Desligar so some da tela
// quando a pagina recarrega: arrancar o que ja foi injetado nao compensa.
chrome.storage.onChanged.addListener((c) => {
  if (c.features) {
    RL.flags = c.features.newValue || {};
    agendar();
  }
  if (c.tema || c.temaCor)
    chrome.storage.local.get({ tema: "nenhum", temaCor: "#1a1030" }).then((o) => aplicarTema(o.tema, o.temaCor));
});

// --- tema (escolhido nas configuracoes, aplicado sem recarregar) -------------
const TEMAS = {
  nenhum: null,
  roxo: { bg: "#1a1030", fg: "#eadcff" },
  verde: { bg: "#0d1f16", fg: "#d9ffe9" },
  vermelho: { bg: "#220f12", fg: "#ffe0e4" },
};

// "personalizado": fundo = cor escolhida; texto claro ou escuro conforme o fundo.
function corDoTexto(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#16181c" : "#f2f4f5";
}

function aplicarTema(nome, cor) {
  const t = nome === "personalizado" && cor ? { bg: cor, fg: corDoTexto(cor) } : TEMAS[nome];
  const r = document.documentElement;
  r.classList.toggle("rl-tema", !!t);
  if (!t) return;
  r.style.setProperty("--rl-bg", t.bg);
  r.style.setProperty("--rl-fg", t.fg);
}
