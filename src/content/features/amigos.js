// --- Amizades em comum, como mais uma pill do perfil -------------------------
// Fica logo depois de "Seguindo". Clique abre a lista com rosto e nome.
RL.register({
  id: "amigosComum",
  test: () => /^\/users\/\d+/.test(RL.path()),

  async mount() {
    const row = RL.pillRow();
    if (!row || !RL.once(row, "Amg")) return;

    const userId = RL.userIdDaUrl();
    const eu = await RL.call("meuId").catch(() => null);
    if (!eu || String(eu) === userId) return; // deslogado ou o proprio perfil

    let lista;
    try {
      lista = await RL.call("amigosEmComum", { userId });
    } catch {
      return; // fora do ar ou limite de requisicoes
    }

    const pill = lista.privado
      ? RL.clonePill("— em comum", "Essa pessoa esconde a lista de amizades")
      : RL.clonePill(
          `${lista.length} em comum`,
          lista.length ? "Ver amizades em comum" : "Nenhuma amizade em comum"
        );
    if (!pill) return;

    if (lista.length) {
      pill.style.cursor = "pointer";
      pill.addEventListener("click", (e) => {
        e.preventDefault();
        RL.popover(
          pill,
          RL.el("div", { class: "rl-pop-titulo" }, `Amizades em comum (${lista.length})`),
          RL.el(
            "div",
            { class: "rl-pessoas" },
            lista.map((p) =>
              RL.el(
                "a",
                { class: "rl-pessoa", href: `https://www.roblox.com/users/${p.id}/profile` },
                p.rosto ? RL.el("img", { src: p.rosto, alt: "" }) : RL.el("span", { class: "rl-sem-rosto" }),
                RL.el("span", {}, RL.el("strong", {}, p.nome), RL.el("small", {}, `@${p.user}`))
              )
            )
          )
        );
      });
    }

    // Depois da ultima pill nativa, antes das nossas (RAP, Value).
    const nativas = [...row.querySelectorAll(":scope > a")].filter((a) => !a.dataset.rlPill);
    nativas.at(-1).after(pill);
  },
});
