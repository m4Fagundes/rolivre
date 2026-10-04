// --- Aviso de preco, na pagina do item -----------------------------------------
// Fica do lado da estrelinha de favorito. O background confere o preco a cada
// 5 min e manda notificacao quando cai ou quando o item volta a venda.
const SINO = (cheio) => `
<svg viewBox="0 0 24 24" width="20" height="20" fill="${cheio ? "currentColor" : "none"}" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
</svg>`;

RL.register({
  id: "avisoPreco",
  test: () => !!(RL.catalogIdDaUrl() || RL.bundleIdDaUrl()),

  async mount() {
    const fav = document.querySelector(".favorites-button-container");
    if (!fav || !RL.once(fav, "Aviso")) return;

    const id = RL.catalogIdDaUrl() || RL.bundleIdDaUrl();
    const tipo = RL.catalogIdDaUrl() ? "Asset" : "Bundle";
    const btn = RL.el("button", { class: "rl-aviso", type: "button" });

    const pintar = (ativo, atual) => {
      btn.innerHTML = SINO(ativo);
      btn.append(ativo ? "Avisando" : "Avisar preço");
      btn.setAttribute("aria-pressed", String(ativo));
      btn.title = ativo
        ? `Te aviso quando baixar de ${atual == null ? "fora de venda" : `${RL.num(atual)} Robux`}. Clica pra parar.`
        : "Te aviso quando o preço baixar ou alguém puser à venda";
    };

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const r = await RL.call("alternarDesejo", {
          id,
          tipo,
          nome: document.querySelector(".item-details-name-row h1, h1")?.textContent.trim(),
          thumb: document.querySelector('meta[property="og:image"]')?.content,
        });
        pintar(!!r, r?.atual);
      } finally {
        btn.disabled = false;
      }
    });

    const atual = await RL.call("desejo", { id }).catch(() => null);
    pintar(!!atual, atual?.atual);
    // O favorito e um bloco sozinho dentro de um <div>: sem virar flex, o
    // botao cairia na linha de baixo.
    fav.parentElement.classList.add("rl-linha-fav");
    fav.after(btn);
  },
});
