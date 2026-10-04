// --- Jogar direto do card ------------------------------------------------------
// Botao de play em cima da capa de cada jogo (inicio, busca, descobrir). O
// clique nao deixa o link do card abrir a pagina: entra direto no jogo.
const ICONE_PLAY = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/>
</svg>`;

RL.register({
  id: "jogarCard",
  test: () => !!document.querySelector("a.game-card-link"),

  mount() {
    for (const a of document.querySelectorAll("a.game-card-link")) {
      if (!RL.once(a, "Play")) continue;
      const placeId = (a.getAttribute("href")?.match(/\/games\/(\d+)/) || [])[1];
      const capa = a.querySelector("[class*='thumb-container'], [class*='icon-container']");
      if (!placeId || !capa) continue;

      const b = RL.el("button", { class: "rl-play", type: "button", title: "Jogar agora", "aria-label": "Jogar agora" });
      b.innerHTML = ICONE_PLAY;
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        RL.play(placeId);
      });
      capa.classList.add("rl-play-capa");
      capa.append(b);
    }
  },
});
