// --- Servidores: entrar no mais vazio + regiao -------------------------------
const naPaginaDoJogo = () => /^\/games\/\d+/.test(RL.path());

// Botao logo abaixo do Jogar. Classe propria, estilo neutro: usar as classes
// do design system deles aqui quebraria no proximo deploy.
RL.register({
  id: "maisVazio",
  test: naPaginaDoJogo,

  mount() {
    const placeId = RL.placeIdDaUrl();
    const cont = document.querySelector("#game-details-play-button-container");
    if (!cont || !RL.once(cont, "Vazio")) return;

    const rotulo = "Entrar no servidor mais vazio";
    const btn = RL.el("button", { class: "rl-native-btn" }, rotulo);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "procurando...";
      try {
        const r = await RL.call("servers", { placeId });
        const s = (r.data || [])
          .filter((x) => x.playing < x.maxPlayers)
          .sort((a, b) => a.playing - b.playing)[0];
        if (!s) {
          btn.textContent = "nenhum servidor público";
          return;
        }
        btn.textContent = `entrando (${s.playing}/${s.maxPlayers})...`;
        RL.join(placeId, s.id);
      } catch {
        btn.textContent = "falhou — tenta de novo";
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = rotulo;
        }, 4000);
      }
    });
    cont.after(btn);
  },
});

// "DE" -> bandeira da Alemanha (dois regional indicators).
const bandeira = (cc) =>
  cc ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "";

// Um chip por servidor na aba Servidores. O id do servidor nao esta no HTML:
// o page-bridge.js le do React e carimba em data-rl-gameid. Sob clique de
// proposito: cada consulta gasta um join-game-instance, que tem rate limit.
RL.register({
  id: "regiao",
  test: naPaginaDoJogo,

  mount() {
    const placeId = RL.placeIdDaUrl();
    for (const card of document.querySelectorAll("[data-rl-gameid], [data-gameid]")) {
      const gameId = card.dataset.rlGameid || card.dataset.gameid;
      if (!gameId || !RL.once(card, "Regiao")) continue;

      const chip = RL.el("button", { class: "rl-chip-inline" }, "ver região");
      const mostrar = (g) => {
        chip.textContent = g.city ? `${bandeira(g.cc)} ${g.city}`.trim() : g.ip;
        chip.title = [g.city, g.country, g.ip].filter(Boolean).join(" · ");
        chip.classList.add("rl-chip-ok");
      };

      // Ja consultado antes (cache de 12h): mostra direto, sem gastar request.
      RL.call("regionCache", { gameId }).then((g) => g && mostrar(g), () => {});

      chip.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (chip.classList.contains("rl-chip-ok")) return;
        chip.disabled = true;
        chip.textContent = "...";
        try {
          mostrar(await RL.call("region", { placeId, gameId }));
        } catch (err) {
          const m = err.message;
          chip.textContent = /429/.test(m) ? "limite, espera 1 min" : /cheio|sem acesso/.test(m) ? m : "falhou";
          chip.title = err.message;
        } finally {
          chip.disabled = false;
        }
      });

      const status = card.querySelector(".rbx-game-status, [class*='server-status']");
      if (status) status.after(chip);
      else (card.querySelector("[class*='server-details']") || card).append(chip);
    }
  },
});
