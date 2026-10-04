// --- Explorador de servidores + entrar na sua regiao --------------------------
// O que o RoPro cobra no Plus ("preferred server location", "oldest and newest
// server filters"). Cada servidor passa pelo join-game-instance, que devolve o
// IP (-> cidade) e o ServerClaimedTime (-> ha quanto tempo esta aberto). Aguenta
// ~30 consultas seguidas sem limite; aqui vao 4 em paralelo.
const naPaginaDoJogoExp = () => /^\/games\/\d+/.test(RL.path());
const bandeiraExp = (cc) =>
  cc ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "";

function haQuanto(ms) {
  if (!ms) return "—";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Consulta varios servidores com no maximo `par` requests ao mesmo tempo.
// `achou` recebe cada resultado; se devolver true, para tudo.
async function consultar(placeId, servidores, achou, par = 4) {
  let i = 0, parar = false;
  const trabalhador = async () => {
    while (!parar && i < servidores.length) {
      const s = servidores[i++];
      try {
        const g = await RL.call("region", { placeId, gameId: s.id });
        if (achou({ ...s, ...g })) parar = true;
      } catch {
        achou({ ...s, erro: true });
      }
    }
  };
  await Promise.all(Array.from({ length: par }, trabalhador));
}

// --- Painel na aba Servidores ----------------------------------------------------
const ORDENS = {
  vazio: ["Mais vazio", (a, b) => a.playing - b.playing],
  cheio: ["Mais cheio", (a, b) => b.playing - a.playing],
  novo: ["Mais novo", (a, b) => (b.desde || 0) - (a.desde || 0)],
  antigo: ["Mais antigo", (a, b) => (a.desde || Infinity) - (b.desde || Infinity)],
  ping: ["Menor ping", (a, b) => (a.ping ?? 999) - (b.ping ?? 999)],
};

RL.register({
  id: "explorador",
  test: naPaginaDoJogoExp,

  mount() {
    const aba = document.querySelector("#game-instances, #running-game-instances-container");
    if (!aba || !RL.once(aba, "Exp")) return;
    const placeId = RL.placeIdDaUrl();

    const estado = { lista: [], cursor: "", fila: [], regiao: "", ordem: "vazio", ocupado: false };
    const chips = RL.el("div", { class: "rl-exp-chips" });
    const ordem = RL.el(
      "select",
      { class: "rl-exp-select", "aria-label": "Ordenar servidores" },
      Object.entries(ORDENS).map(([k, [nome]]) => RL.el("option", { value: k }, nome))
    );
    const lista = RL.el("div", { class: "rl-exp-lista" });
    const status = RL.el("span", { class: "rl-exp-status" }, "Mostra a cidade e há quanto tempo cada servidor está aberto.");
    const botao = RL.el("button", { class: "rl-exp-btn", type: "button" }, "Escanear servidores");

    const desenhar = () => {
      const ok = estado.lista.filter((s) => !s.erro);
      const porCidade = {};
      for (const s of ok) {
        const k = s.city || "?";
        porCidade[k] ||= { n: 0, cc: s.cc };
        porCidade[k].n++;
      }
      chips.replaceChildren(
        ...[["", { n: ok.length }], ...Object.entries(porCidade).sort((a, b) => b[1].n - a[1].n)].map(([cidade, { n, cc }]) => {
          const c = RL.el(
            "button",
            { class: "rl-exp-chip", type: "button", "aria-pressed": String(estado.regiao === cidade) },
            cidade ? `${bandeiraExp(cc)} ${cidade} (${n})` : `Todas (${n})`
          );
          c.addEventListener("click", () => {
            estado.regiao = cidade;
            desenhar();
          });
          return c;
        })
      );

      const linhas = ok
        .filter((s) => !estado.regiao || (s.city || "?") === estado.regiao)
        .sort(ORDENS[estado.ordem][1])
        .slice(0, 60)
        .map((s) => {
          const entrar = RL.el("button", { class: "rl-exp-entrar", type: "button" }, "Entrar");
          entrar.addEventListener("click", () => RL.join(placeId, s.id));
          return RL.el(
            "div",
            { class: "rl-exp-linha" },
            RL.el("span", { class: "rl-exp-cidade", title: s.ip || "" }, s.city ? `${bandeiraExp(s.cc)} ${s.city}` : s.ip || "?"),
            RL.el("span", {}, `${s.playing}/${s.maxPlayers}`),
            RL.el("span", { title: s.desde ? new Date(s.desde).toLocaleString("pt-BR") : "" }, `aberto há ${haQuanto(s.desde)}`),
            RL.el("span", {}, s.ping != null ? `ping ${s.ping}` : ""),
            entrar
          );
        });
      lista.replaceChildren(...linhas);
    };

    ordem.addEventListener("change", () => {
      estado.ordem = ordem.value;
      desenhar();
    });

    botao.addEventListener("click", async () => {
      if (estado.ocupado) return;
      estado.ocupado = true;
      botao.disabled = true;
      try {
        // Pega mais uma pagina da lista quando a fila acaba.
        if (!estado.fila.length && estado.cursor !== null) {
          const r = await RL.call("servers", { placeId, ordem: "Desc", semCheios: true, cursor: estado.cursor });
          estado.fila = r.data || [];
          estado.cursor = r.nextPageCursor || null;
        }
        const lote = estado.fila.splice(0, 40);
        const t0 = Date.now();
        let feitos = 0;
        await consultar(placeId, lote, (s) => {
          estado.lista.push(s);
          status.textContent = `Escaneando... ${++feitos}/${lote.length}`;
          desenhar();
        });
        const total = estado.lista.filter((s) => !s.erro).length;
        status.textContent = `${total} servidores escaneados (${Math.round((Date.now() - t0) / 1000)}s).`;
      } catch (e) {
        status.textContent = `Falhou: ${e.message}`;
      } finally {
        estado.ocupado = false;
        botao.disabled = false;
        const acabou = !estado.fila.length && estado.cursor === null;
        botao.textContent = acabou ? "Todos escaneados" : "Escanear mais 40";
        botao.disabled = acabou;
      }
    });

    const painel = RL.el(
      "div",
      { class: "rl-exp" },
      RL.el(
        "div",
        { class: "rl-exp-topo" },
        RL.el("h3", {}, "Explorador de servidores"),
        RL.el("div", { class: "rl-exp-acoes" }, ordem, botao)
      ),
      chips,
      lista,
      status
    );
    const outros = aba.querySelector("#rbx-public-running-games");
    if (outros) outros.before(painel);
    else aba.prepend(painel);
  },
});

// --- Botao "entrar na sua regiao", abaixo do Jogar -----------------------------
RL.register({
  id: "regiaoPreferida",
  test: naPaginaDoJogoExp,

  async mount() {
    const cont = document.querySelector("#game-details-play-button-container");
    if (!cont || !RL.once(cont, "Pref")) return;
    const { regiaoPref } = await chrome.storage.local.get({ regiaoPref: null });
    if (!regiaoPref) return; // escolhe nas configuracoes

    const placeId = RL.placeIdDaUrl();
    const rotulo = `Entrar em servidor: ${bandeiraExp(regiaoPref.cc)} ${regiaoPref.city}`;
    const btn = RL.el("button", { class: "rl-native-btn" }, rotulo);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      let alvo = null, vistos = 0, cursor = "";
      try {
        // Ate 2 paginas (200 servidores): da pra achar quase qualquer regiao
        // em jogo grande sem martelar a API.
        for (let pag = 0; pag < 2 && !alvo && cursor !== null; pag++) {
          const r = await RL.call("servers", { placeId, ordem: "Desc", semCheios: true, cursor });
          cursor = r.nextPageCursor || null;
          const comVaga = (r.data || []).filter((s) => s.playing < s.maxPlayers - 1);
          await consultar(placeId, comVaga, (s) => {
            btn.textContent = `procurando ${regiaoPref.city}... ${++vistos}`;
            if (!s.erro && s.city === regiaoPref.city) {
              alvo = s;
              return true;
            }
          });
        }
        if (!alvo) {
          btn.textContent = `nenhum em ${regiaoPref.city} (${vistos} vistos)`;
          return;
        }
        btn.textContent = `entrando (${alvo.playing}/${alvo.maxPlayers})...`;
        RL.join(placeId, alvo.id);
      } catch {
        btn.textContent = "falhou — tenta de novo";
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = rotulo;
        }, 5000);
      }
    });
    // Depois do "mais vazio", se ele existir.
    (cont.parentElement.querySelector(":scope > .rl-native-btn:last-of-type") || cont).after(btn);
  },
});
