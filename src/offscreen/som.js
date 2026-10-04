// Recebe { som: "sons/arquivo.mp3" } do background, toca e responde se tocou.
chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (!m?.som) return false;
  const a = new Audio(chrome.runtime.getURL(m.som));
  a.volume = m.volume ?? 1;
  a.play().then(
    () => responder({ tocou: true, duracao: a.duration }),
    (e) => responder({ tocou: false, erro: String(e) })
  );
  return true;
});
