// Roda no mundo da PAGINA (world: MAIN). Duas coisas que o content script
// isolado nao alcanca: o Roblox.GameLauncher e as props do React.

window.addEventListener("message", (e) => {
  if (e.source !== window || !["join", "play"].includes(e.data?.rl)) return;
  const { rl, placeId, gameId } = e.data;
  const gl = window.Roblox?.GameLauncher;
  try {
    if (rl === "join") gl.joinGameInstance(Number(placeId), gameId);
    else gl.joinMultiplayerGame(Number(placeId));
  } catch (err) {
    console.warn(`[RoLivre] ${rl} falhou:`, err);
  }
});

// --- id do servidor em cada card da aba Servidores ---------------------------
// A lista de servidores e React e o id (um UUID) so existe nas props. Subo
// pela arvore do React a partir do <li> ate achar uma prop com cara de id de
// servidor e carimbo no DOM, onde o content script consegue ler.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fiberDe(el) {
  const k = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
  );
  return k ? el[k] : null;
}

function uuidNasProps(props, prof = 0) {
  if (!props || typeof props !== "object" || prof > 2) return null;
  for (const [k, v] of Object.entries(props))
    if (typeof v === "string" && /id$/i.test(k) && UUID.test(v)) return v;
  for (const v of Object.values(props))
    if (v && typeof v === "object" && !Array.isArray(v) && !v.$$typeof && !(v instanceof Node)) {
      const r = uuidNasProps(v, prof + 1);
      if (r) return r;
    }
  return null;
}

function carimbar() {
  const cards = document.querySelectorAll(
    "li[class*='game-server-item']:not([data-rl-gameid]):not([class*='private'])"
  );
  for (const li of cards) {
    let f = fiberDe(li);
    for (let i = 0; f && i < 8; i++, f = f.return) {
      const id = uuidNasProps(f.memoizedProps);
      if (id) {
        li.dataset.rlGameid = id;
        break;
      }
    }
  }
}

let agendado = null;
new MutationObserver(() => {
  clearTimeout(agendado);
  agendado = setTimeout(carimbar, 150);
}).observe(document.body, { childList: true, subtree: true });
carimbar();
