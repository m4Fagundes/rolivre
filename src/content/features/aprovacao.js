// --- Aprovacao em %, como mais uma estatistica nativa -----------------------
// A pagina do jogo so mostra "4M+" e "446K+". Aqui vira 90,8%, com os numeros
// exatos no title.
RL.register({
  id: "aprovacao",
  test: () => /^\/games\/\d+/.test(RL.path()),

  async mount() {
    const lista = document.querySelector("ul.game-stat-container");
    const universeId = RL.universeId();
    if (!lista || !universeId || !RL.once(lista, "Aprov")) return;

    const v = await RL.call("votos", { universeId });
    const total = v ? v.up + v.down : 0;
    const pct = total
      ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(v.up / total)
      : "—";
    const li = RL.cloneStat("Aprovação", pct);
    if (!li) return;
    if (total) li.title = `${RL.num(v.up)} likes · ${RL.num(v.down)} dislikes`;
    lista.append(li);
  },
});

// --- Likes ao vivo ----------------------------------------------------------------
// Os contadores nativos ("4M+", "446K+") viram o numero exato e se atualizam a
// cada 10 s, junto com a barra e a nossa estatistica de Aprovacao.
RL.register({
  id: "likesAoVivo",
  test: () => /^\/games\/\d+/.test(RL.path()),

  mount() {
    const up = document.getElementById("vote-up-text");
    const down = document.getElementById("vote-down-text");
    const universeId = RL.universeId();
    if (!up || !down || !universeId || !RL.once(up, "AoVivo")) return;

    const pintar = (v) => {
      const total = v.up + v.down;
      up.textContent = RL.num(v.up);
      down.textContent = RL.num(v.down);
      up.title = down.title = "Ao vivo · atualiza a cada 10 s";
      const barra = document.querySelector(".vote-percentage");
      if (barra && total) barra.style.width = `${(v.up / total) * 100}%`;
      const stat = [...document.querySelectorAll("li.game-stat")].find((l) => /Aprova/.test(l.textContent));
      const valor = stat?.querySelectorAll("p")[1];
      if (valor && total)
        valor.textContent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(v.up / total);
    };

    const timer = setInterval(async () => {
      if (!document.contains(up)) return clearInterval(timer); // saiu da pagina (SPA)
      if (document.hidden) return; // aba em segundo plano nao precisa
      const v = await RL.call("votos", { universeId, fresco: true }).catch(() => null);
      if (v) pintar(v);
    }, 10000);
    RL.call("votos", { universeId, fresco: true }).then(pintar, () => {});
  },
});
