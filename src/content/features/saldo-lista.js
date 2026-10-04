// --- Saldo na lista de trocas ------------------------------------------------
// Cada linha da lista (.trade-row) ganha um selo com o ganho/perda em Value,
// sem abrir a troca. A Roblox nao poe o id da troca na linha; poe o link do
// perfil de quem esta do outro lado. A lista da API vem na mesma ordem da
// tela, entao casa linha a linha pelo id do usuario (mesma pessoa com duas
// trocas: a proxima dela na ordem).
//
// Aba ativa: os botoes Received / Sent / Completed / Closed, pela POSICAO do
// que esta com aria-pressed (o texto muda com o idioma).
const ABAS_LISTA = ["Inbound", "Outbound", "Completed", "Inactive"];
let saldoCache = { tipo: null, t: 0, n: 0, dados: [] };

function abaDaLista() {
  const botoes = [...document.querySelectorAll(".trade-filter-chips button")];
  const i = botoes.findIndex((b) => b.getAttribute("aria-pressed") === "true");
  if (i >= 0) return ABAS_LISTA[i];
  const q = new URLSearchParams(location.search).get("tab");
  return ABAS_LISTA.find((a) => a.toLowerCase() === (q || "").toLowerCase()) || "Inbound";
}

async function saldosDaAba(tipo, n) {
  // O observer chama isto a cada mudanca de DOM: so pergunta de novo se mudou
  // de aba, se chegaram mais linhas ou depois de 1 min.
  const velho = Date.now() - saldoCache.t > 60_000;
  if (saldoCache.tipo !== tipo || n > saldoCache.n || velho) {
    const dados = await RL.call("saldosDaLista", { tipo, limite: Math.min(100, Math.max(25, n)) });
    saldoCache = { tipo, t: Date.now(), n: Math.max(25, n), dados };
  }
  return saldoCache.dados;
}

function seloDeSaldo(s) {
  if (s.erro) return RL.el("span", { class: "rl-saldo-lista", title: "Não deu pra calcular" }, "?");
  const cor = s.pct > 0 ? "rl-saldo-ganha" : s.pct < 0 ? "rl-saldo-perde" : "";
  const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(s.pct) + "%";
  return RL.el(
    "span",
    {
      class: `rl-saldo-lista ${cor}`,
      title: `Você dá ${RL.num(s.dou)} · recebe ${RL.num(s.recebo)} (Value do Rolimon's)` + (s.projetado ? " · tem item PROJECTED do outro lado" : ""),
    },
    pct + (s.projetado ? " ⚠" : "")
  );
}

RL.register({
  id: "saldoLista",
  test: () => /^\/trades/.test(RL.path()) && !!document.querySelector(".trade-row"),
  async mount() {
    const linhas = [...document.querySelectorAll(".trade-row")];
    const tipo = abaDaLista();
    const dados = await saldosDaAba(tipo, linhas.length);
    let k = 0;
    for (const linha of linhas) {
      const uid = Number((linha.querySelector('a[href*="/users/"]')?.getAttribute("href")?.match(/\/users\/(\d+)/) || [])[1]);
      // Proxima troca da lista com essa pessoa, a partir de onde parou.
      let j = k;
      // uid = quem esta do outro lado, lido do detalhe; uidLista = o da lista.
      while (j < dados.length && (dados[j].uid ?? dados[j].uidLista) !== uid) j++;
      const s = dados[j];
      const nome = linha.querySelector(".text-lead");
      if (!s || !nome) continue;
      k = j + 1;
      const chave = `${tipo}:${s.id}:${s.pct}:${s.projetado}`;
      if (linha.dataset.rlSaldo === chave) continue;
      linha.dataset.rlSaldo = chave;
      linha.querySelectorAll(".rl-saldo-lista").forEach((n) => n.remove());
      nome.append(seloDeSaldo(s));
    }
  },
});
