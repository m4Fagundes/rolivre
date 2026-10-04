// --- Esconder anuncios -----------------------------------------------------------
// So liga uma classe no <html>; quem esconde e o ui.css (html.rl-sem-anuncios).
// CSS pega os cards patrocinados que chegam depois sem precisar de observer.
RL.register({
  id: "semAnuncios",
  test: () => true,
  mount() {
    document.documentElement.classList.add("rl-sem-anuncios");
  },
});
