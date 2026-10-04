// --- Tempo de jogo, como mais uma estatistica nativa -------------------------
RL.register({
  id: "tempoJogo",
  test: () => /^\/games\/\d+/.test(RL.path()),

  async mount() {
    const lista = document.querySelector("ul.game-stat-container");
    if (!lista || !RL.once(lista, "Tempo")) return;

    const pt = await RL.call("playtime");
    const meu = pt?.[RL.placeIdDaUrl()];
    const li = RL.cloneStat("Seu tempo", meu ? RL.tempo(meu.secs) : "—");
    if (li) lista.append(li);
  },
});
