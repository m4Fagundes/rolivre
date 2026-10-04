const call = (k, extra = {}) =>
  chrome.runtime.sendMessage({ k, ...extra }).then((r) => (r?.ok ? r.data : null));

const $ = (id) => document.getElementById(id);

function linha({ href, img, nome, dir, classeDir }) {
  const a = document.createElement("a");
  a.className = "item";
  a.href = href;
  a.target = "_blank";
  if (img) {
    const i = document.createElement("img");
    i.src = img;
    a.append(i);
  }
  const n = document.createElement("div");
  n.className = "nome";
  n.textContent = nome;
  const d = document.createElement("div");
  d.className = "dir " + (classeDir || "");
  d.textContent = dir || "";
  a.append(n, d);
  return a;
}

function preencher(el, itens, vazio) {
  el.textContent = "";
  if (!itens || !itens.length) {
    const v = document.createElement("div");
    v.className = "vazio";
    v.textContent = vazio;
    el.append(v);
    return;
  }
  itens.forEach((i) => el.append(linha(i)));
}

const horas = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min`;
};

const recente = (iso) => {
  const d = (Date.now() - new Date(iso)) / 86400000;
  if (d < 1) return "hoje";
  if (d < 2) return "ontem";
  return `${Math.floor(d)}d`;
};

async function drops() {
  const lista = await call("drops");
  preencher(
    $("drops"),
    (lista || []).slice(0, 10).map((i) => ({
      href: `https://www.roblox.com/${i.tipo === "Bundle" ? "bundles" : "catalog"}/${i.id}`,
      img: i.thumb,
      nome: i.nome,
      dir: recente(i.criado),
      classeDir: (Date.now() - new Date(i.criado)) / 86400000 < 1 ? "novo" : "",
    })),
    "nada ainda — clica em atualizar"
  );
}

async function resto() {
  const pt = (await call("playtime")) || {};
  preencher(
    $("playtime"),
    Object.entries(pt)
      .sort((a, b) => b[1].secs - a[1].secs)
      .slice(0, 6)
      .map(([placeId, v]) => ({
        href: `https://www.roblox.com/games/${placeId}`,
        nome: v.name,
        dir: horas(v.secs),
      })),
    "nada registrado ainda"
  );

  const favs = await call("favoritos");
  preencher(
    $("favs"),
    (favs || []).slice(0, 8).map((f) => ({
      href: `https://www.roblox.com/games/${f.rootPlace?.id || f.id}`,
      nome: f.name,
      dir: "",
    })),
    "nenhum (ou voce esta deslogado)"
  );
}

// O liga/desliga dos avisos e o mesmo flag "drops" da pagina de configuracoes.
async function config() {
  const { features = {} } = await chrome.storage.local.get({ features: {} });
  $("dropsOn").checked = features.drops ?? true;
  $("dropsOn").onchange = async (e) => {
    const { features = {} } = await chrome.storage.local.get({ features: {} });
    await chrome.storage.local.set({ features: { ...features, drops: e.target.checked } });
  };
}

$("config").onclick = () => chrome.runtime.openOptionsPage();

$("checar").onclick = async () => {
  $("checar").textContent = "...";
  await call("checarDrops");
  await drops();
  $("checar").textContent = "atualizar";
};

drops();
resto();
config();
