// --- Botao "Ofertas" na barra lateral da Roblox -------------------------------
// Clona o item "Trade" da barra da esquerda e poe logo abaixo. Abre a lista de
// anuncios do Rolimon's que pedem itens seus (options.html#ofertas) numa aba.
// O contador e o numero de ofertas boas das ultimas 24h.
let ofertasN = null, ofertasEm = 0;

const ICONE_OFERTAS =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

RL.register({
  id: "pedemMeus",
  test: () => !!document.querySelector('ul a[href$="/trades"]'),
  async mount() {
    const trade = document.querySelector('ul a[href$="/trades"]')?.closest("li");
    if (!trade) return;
    let li = trade.parentElement.querySelector("li[data-rl-ofertas]");
    if (!li) {
      li = RL.limpar(trade.cloneNode(true));
      li.dataset.rlOfertas = "1";
      const a = li.querySelector("a");
      a.setAttribute("href", "#");
      a.setAttribute("title", "Anúncios do Rolimon's que pedem itens seus (RoLivre)");
      a.className = a.className.replace(/\bbg-shift-\d+\b/g, ""); // "ativo" do Trade
      a.addEventListener("click", (e) => {
        e.preventDefault();
        RL.call("abrirOfertas").catch(() => {});
      });
      const icone = a.querySelector(".icon")?.parentElement;
      if (icone) icone.innerHTML = ICONE_OFERTAS;
      const rotulo = [...a.querySelectorAll("span")].find((s) => s.textContent.trim() === "Trade");
      if (rotulo) rotulo.textContent = "Ofertas";
      trade.after(li);
    }
    // Contador: pergunta no maximo 1x por minuto (o observer chama muito).
    if (Date.now() - ofertasEm > 60_000) {
      ofertasEm = Date.now();
      ofertasN = await RL.call("contaOfertas").catch(() => null);
    }
    // Sem troca recebida, o Trade vem sem contador: pego o de outro botao
    // (Messages costuma ter) so pelo visual.
    if (!li.querySelector(".foundation-web-badge") && ofertasN) {
      // So botao de link comum (li > a > span > badge): o cartao "Share Plus"
      // tambem tem selo, mas e outra estrutura.
      const outro = trade.parentElement.querySelector("li:not([data-rl-ofertas]) > a > span > .foundation-web-badge")?.parentElement;
      if (outro) li.querySelector("a")?.append(RL.limpar(outro.cloneNode(true)));
    }
    const badge = li.querySelector(".foundation-web-badge");
    const num = badge?.querySelector("span");
    if (badge) badge.style.display = ofertasN ? "" : "none";
    if (num && ofertasN) num.textContent = ofertasN > 99 ? "99+" : String(ofertasN);
  },
});
