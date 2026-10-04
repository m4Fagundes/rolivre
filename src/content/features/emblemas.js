// --- Emblemas: quais voce ja tem ---------------------------------------------
// Na lista de emblemas do jogo: total no titulo ("12 de 40"), um selo do lado
// do nome de cada emblema e os que faltam apagados.
// A lista cresce no "Ver mais": o observer chama de novo e so as linhas novas
// sao processadas.
RL.register({
  id: "emblemas",
  test: () => /^\/games\/\d+/.test(RL.path()) && !!document.querySelector(".game-badges-list"),

  async mount() {
    const lista = document.querySelector(".game-badges-list");
    const universeId = RL.universeId();
    if (!universeId) return;

    const titulo = lista.querySelector(".container-header h2, .container-header h3");
    const precisaTitulo = titulo && RL.once(titulo, "Emb");
    const linhas = [...lista.querySelectorAll("li.badge-row")].filter((li) => RL.once(li, "Emb"));
    if (!precisaTitulo && !linhas.length) return;

    const { total, ganhos } = await RL.call("emblemas", { universeId });

    if (precisaTitulo) {
      const tenho = Object.keys(ganhos).length;
      titulo.append(
        RL.el("span", { class: "rl-emb-total", title: "Emblemas que você já ganhou neste jogo" }, `${tenho} de ${total}`)
      );
    }

    for (const li of linhas) {
      const id = (li.querySelector('a[href*="/badges/"]')?.href.match(/\/badges\/(\d+)/) || [])[1];
      if (!id) continue;
      const data = ganhos[id];
      li.classList.add(data ? "rl-emb-tem" : "rl-emb-falta");

      // Do lado do nome, e nao como mais uma estatistica: a grade de stats
      // tem 3 colunas e uma quarta empurrava "Ganharam antes" pra baixo.
      const nome = li.querySelector(".badge-name");
      if (!nome) continue;
      nome.append(
        RL.el(
          "span",
          { class: `rl-emb-chip ${data ? "rl-emb-chip-ok" : ""}` },
          data ? `Você tem · ${new Date(data).toLocaleDateString("pt-BR")}` : "Falta"
        )
      );
    }
  },
});
