// --- Valor do inventario no cabecalho do perfil ------------------------------
// Vira mais duas pills do lado de Amizades / Seguidores. Sempre mostra alguma
// coisa: antes, inventario vazio ou privado nao mostrava nada e parecia bug.
RL.register({
  id: "valorPerfil",
  test: () => /^\/users\/\d+/.test(RL.path()),

  async mount() {
    const row = RL.pillRow();
    if (!row || !RL.once(row, "Rap")) return;

    const userId = RL.userIdDaUrl();
    const rolimons = `https://www.rolimons.com/player/${userId}`;
    const pills = [];
    try {
      const v = await RL.call("inventario", { userId });
      if (v.privado) {
        pills.push(RL.clonePill("Inventário privado", "Não dá pra calcular RAP de inventário fechado"));
      } else {
        const mais = v.cortado ? "+" : "";
        pills.push(
          RL.clonePill(`${RL.num(v.rap, true)}${mais} RAP`, `RAP exato: ${RL.num(v.rap)}`, rolimons),
          RL.clonePill(
            `${RL.num(v.value, true)}${mais} Value`,
            `Value Rolimon's · ${v.itens} limitados${v.cortado ? " (só os primeiros 1000)" : ""}`,
            rolimons
          )
        );
      }
    } catch (e) {
      pills.push(RL.clonePill("RAP indisponível", String(e.message || e)));
    }
    for (const p of pills) if (p) row.append(p);
  },
});
