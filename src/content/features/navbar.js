// --- Icone na barra do topo, ao lado da engrenagem ---------------------------
// Clique abre um menu curto; as configuracoes de verdade ficam na pagina da
// extensao (src/options), que abre numa aba.
const ICONE_RL = `
<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor"
     stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="14" cy="14" r="11"/>
  <path d="M10.5 19.5v-11h4.25a3.25 3.25 0 0 1 0 6.5H10.5M14.5 15l3.5 4.5"/>
</svg>`;

// --- Busca rapida de limitados (dentro do menu) --------------------------------
// Nome ou sigla ("dc", "domino"), direto da base do Rolimon's. O RoPro cobra
// isso no Rex ("quick limited search in navbar").
const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
let indiceBusca = null;
const thumbsBusca = new Map();

async function buscarLimitados(q) {
  q = semAcento(q.trim());
  if (q.length < 2) return [];
  if (!indiceBusca) {
    const b = await RL.rolimons();
    const migrados = new Set(b.migrados || []);
    const linha = (pacote) => ([id, it]) => ({
      id,
      pacote,
      chave: (pacote ? "b" : "a") + id,
      nome: it[0],
      sigla: it[1] || "",
      n: semAcento(it[0]),
      s: semAcento(it[1] || ""),
      value: it[3] > 0 ? it[3] : it[2],
    });
    indiceBusca = [
      ...Object.entries(b.items || {}).filter(([id]) => !migrados.has(id)).map(linha(false)),
      ...Object.entries(b.bundles || {}).map(linha(true)),
    ];
  }
  const nota = (i) =>
    i.s === q ? 0 : i.n === q ? 1 : i.n.startsWith(q) ? 2 : i.s && i.s.startsWith(q) ? 3 : i.n.includes(q) ? 4 : -1;
  return indiceBusca
    .map((i) => ({ ...i, nota: nota(i) }))
    .filter((i) => i.nota >= 0)
    .sort((a, b) => a.nota - b.nota || b.value - a.value)
    .slice(0, 8);
}

function caixaDeBusca() {
  const input = RL.el("input", {
    class: "rl-busca-input",
    type: "search",
    placeholder: "Buscar limitado (nome ou sigla)",
    "aria-label": "Buscar limitado",
  });
  const lista = RL.el("div", { class: "rl-busca-lista", role: "listbox" });
  let ultima = 0;

  input.addEventListener("input", async () => {
    const minha = ++ultima;
    const res = await buscarLimitados(input.value);
    if (minha !== ultima) return; // chegou resposta de uma digitacao antiga
    lista.replaceChildren(
      ...res.map((r) => {
        const img = RL.el("img", { alt: "", src: thumbsBusca.get(r.chave) || "" });
        img.dataset.chave = r.chave;
        return RL.el(
          "a",
          { class: "rl-busca-item", href: `https://www.roblox.com/${r.pacote ? "bundles" : "catalog"}/${r.id}`, role: "option" },
          img,
          RL.el("span", { class: "rl-busca-nome" }, r.nome, r.sigla ? RL.el("small", {}, r.sigla) : ""),
          RL.el("span", { class: "rl-busca-valor" }, RL.num(r.value, true))
        );
      })
    );
    if (!res.length && input.value.trim().length >= 2)
      lista.replaceChildren(RL.el("div", { class: "rl-busca-vazio" }, "Nenhum limitado com esse nome"));

    const faltam = res.filter((r) => !thumbsBusca.has(r.chave));
    if (faltam.length) {
      const [itens, pacotes] = await Promise.all([
        RL.call("thumbs", { ids: faltam.filter((r) => !r.pacote).map((r) => r.id) }).catch(() => ({})),
        RL.call("thumbs", { ids: faltam.filter((r) => r.pacote).map((r) => r.id), pacote: true }).catch(() => ({})),
      ]);
      for (const [id, url] of Object.entries(itens)) thumbsBusca.set("a" + id, url);
      for (const [id, url] of Object.entries(pacotes)) thumbsBusca.set("b" + id, url);
      lista.querySelectorAll("img[data-chave]").forEach((i) => (i.src = thumbsBusca.get(i.dataset.chave) || ""));
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") lista.querySelector("a")?.click();
  });
  return { caixa: RL.el("div", { class: "rl-busca" }, input, lista), input };
}

RL.register({
  id: "iconeNavbar",
  test: () => true,

  mount() {
    if (document.getElementById("rl-nav")) return;
    // O <li> da engrenagem so existe logado; deslogado nao tem onde por.
    const irmao = document.getElementById("navbar-settings")?.closest("li");
    if (!irmao) return;

    const li = RL.el("li", { id: "rl-nav", class: irmao.className });
    const btn = RL.el("button", {
      class: "rl-nav-btn",
      type: "button",
      title: "RoLivre",
      "aria-label": "RoLivre",
      "aria-haspopup": "true",
      "aria-expanded": "false",
    });
    btn.innerHTML = ICONE_RL;

    const todas = RL_CATALOGO.flatMap((g) => g.features);
    const sub = RL.el("div", { class: "rl-nav-sub" });
    const busca = RL.on("buscaLimitados") ? caixaDeBusca() : null;
    const pop = RL.el(
      "div",
      { class: "rl-nav-pop", role: "menu" },
      RL.el("div", { class: "rl-nav-titulo" }, `RoLivre v${chrome.runtime.getManifest().version}`),
      sub,
      busca?.caixa || "",
      RL.el(
        "button",
        {
          class: "rl-nav-acao",
          type: "button",
          role: "menuitem",
          onclick: () => {
            fechar();
            RL.call("abrirConfig").catch(() => {});
          },
        },
        "Configurações"
      )
    );
    pop.hidden = true;

    const fechar = () => {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const ativas = todas.filter((f) => RL.on(f.id)).length;
      sub.textContent = `${ativas} de ${todas.length} recursos ligados`;
      pop.hidden = !pop.hidden;
      btn.setAttribute("aria-expanded", String(!pop.hidden));
      if (!pop.hidden) busca?.input.focus();
    });
    document.addEventListener("click", (e) => !li.contains(e.target) && fechar());
    document.addEventListener("keydown", (e) => e.key === "Escape" && fechar());

    li.append(btn, pop);
    irmao.after(li);
  },
});
