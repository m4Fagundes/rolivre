import { api } from "./lib/api.js";
import { REGIOES } from "./lib/regioes.js";
import "./lib/catalogo.js"; // define globalThis.RL_PADROES

const HORA = 60 * 60 * 1000;
const PADRAO = { features: {}, dropsCreator: 1, tema: "nenhum" };

const ler = (d) => chrome.storage.local.get(d);
const gravar = (o) => chrome.storage.local.set(o);

async function ligado(id) {
  const { features } = await ler({ features: {} });
  return features[id] ?? RL_PADROES[id] ?? true;
}

async function cached(key, ttl, produce) {
  const now = Date.now();
  const hit = (await ler(key))[key];
  if (hit && now - hit.t < ttl) return hit.v;
  const v = await produce();
  if (v != null) await gravar({ [key]: { t: now, v } }); // falha nao vira cache
  return v;
}

// ------------------------------------------------------- valor do perfil ----
// RAP soma o "recent average price" que a propria Roblox devolve.
// Value e a avaliacao do Rolimon's, que so existe pros itens raros.
async function valorDoInventario(userId) {
  const base = await cached("rolimons3", 6 * HORA, () => api.rolimons());
  let cursor = "", rap = 0, value = 0, itens = 0;

  for (let pagina = 0; pagina < 10; pagina++) {
    let r;
    try {
      r = await api.collectibles(userId, cursor);
    } catch (e) {
      if (e.status === 403 && pagina === 0) return { privado: true };
      throw e;
    }
    for (const it of r.data) {
      itens++;
      rap += it.recentAveragePrice || 0;
      const rl = base.items?.[it.assetId];
      value += rl && rl[3] > 0 ? rl[3] : it.recentAveragePrice || 0;
    }
    cursor = r.nextPageCursor;
    if (!cursor) break;
  }
  return { rap, value, itens, cortado: !!cursor };
}

// ------------------------------------------------------ lancamento de item --
// Guarda os ids ja vistos e avisa so do que e novo. Na primeira rodada so
// grava a linha de base: senao voce leva 30 notificacoes de uma vez.
async function checarDrops(silencioso = false) {
  if (!(await ligado("drops"))) return [];
  const { dropsCreator, dropsSeen } = await ler({ dropsCreator: 1, dropsSeen: null });

  const r = await api.itensDoCriador(dropsCreator, 30);
  const itens = (r.data || [])
    .map((i) => ({
      id: i.id,
      tipo: i.itemType,
      nome: i.name,
      preco: i.price ?? i.lowestPrice ?? null,
      criado: i.itemCreatedUtc,
      criador: i.creatorName,
    }))
    .sort((a, b) => new Date(b.criado) - new Date(a.criado));

  const ids = itens.map((i) => i.id);
  const primeiraVez = dropsSeen === null;
  const vistos = new Set(dropsSeen || []);
  const novos = primeiraVez ? [] : itens.filter((i) => !vistos.has(i.id));

  // Thumbnail serve de icone da notificacao e da lista no popup.
  try {
    const t = await api.thumbs(ids.slice(0, 30));
    const mapa = Object.fromEntries(t.data.map((x) => [x.targetId, x.imageUrl]));
    itens.forEach((i) => (i.thumb = mapa[i.id] || null));
  } catch (_) {}

  await gravar({ dropsSeen: ids, dropsList: itens.slice(0, 20) });

  if (!silencioso)
    for (const it of novos.slice(0, 5)) {
      chrome.notifications.create(`drop:${it.id}:${it.tipo}`, {
        type: "basic",
        iconUrl: it.thumb || chrome.runtime.getURL("icons/128.png"),
        title: "Item novo na Roblox",
        message: it.nome,
        contextMessage:
          it.preco === 0 ? "Gratis" : it.preco ? `${it.preco} Robux` : it.criador,
        priority: 2,
      });
    }
  return novos;
}

// ------------------------------------------------------------ quem sou eu ----
// Varias features precisam do seu id. 10 min de cache: trocar de conta leva no
// maximo isso pra refletir.
const MIN = 60 * 1000;
const meuId = () => cached("me", 10 * MIN, () => api.me()).then((m) => m.id);

// ---------------------------------------------------------------- emblemas ----
// Todos os emblemas do jogo + quais voce tem. Duas APIs: a do jogo lista, a
// awarded-dates responde ate 100 ids por vez com a data em que voce ganhou.
async function emblemasDoJogo(universeId) {
  const ids = [];
  let ativos = 0, cursor = "";
  for (let p = 0; p < 10; p++) {
    const r = await api.emblemasDoJogo(universeId, cursor);
    for (const b of r.data) {
      ids.push(b.id);
      if (b.enabled !== false) ativos++;
    }
    cursor = r.nextPageCursor;
    if (!cursor) break;
  }
  const eu = await meuId();
  const ganhos = {};
  for (let i = 0; i < ids.length; i += 100) {
    const r = await api.emblemasGanhos(eu, ids.slice(i, i + 100));
    for (const b of r.data) ganhos[b.badgeId] = b.awardedDate;
  }
  return { total: ativos, ganhos };
}

// ------------------------------------------------------- amizades em comum ----
async function idsDeAmigos(userId) {
  const ids = [];
  let cursor = "";
  for (let p = 0; p < 25; p++) {
    const r = await api.amigos(userId, cursor);
    ids.push(...(r.PageItems || []).map((x) => x.id));
    cursor = r.NextCursor;
    if (!cursor) break;
  }
  return ids;
}

// Quem esconde a lista de amizades responde 403 ("target user is invalid").
async function amigosEmComum(userId) {
  const eu = await meuId();
  let meus, deles;
  try {
    [meus, deles] = await Promise.all([
      cached(`amg:${eu}`, 10 * MIN, () => idsDeAmigos(eu)),
      idsDeAmigos(userId),
    ]);
  } catch (e) {
    if (e.status === 403) return { privado: true };
    throw e;
  }
  const meusSet = new Set(meus);
  const comum = deles.filter((id) => meusSet.has(id)).slice(0, 100);
  if (!comum.length) return [];

  const [u, t] = await Promise.all([
    api.usuarios(comum),
    api.rostos(comum).catch(() => ({ data: [] })),
  ]);
  const rosto = Object.fromEntries(t.data.map((x) => [x.targetId, x.imageUrl]));
  return u.data.map((x) => ({ id: x.id, nome: x.displayName, user: x.name, rosto: rosto[x.id] || null }));
}

// ----------------------------------------------------------- aviso de preco ----
// "desejos" no storage: { [id]: { id, tipo, nome, thumb, atual } }. A cada 5 min
// pergunta o preco de todos numa chamada so e avisa quando cai ou volta a venda.
function precoAtual(d) {
  const limitado = (d.itemRestrictions || []).some((r) => /Limited|Collectible/i.test(r));
  const vendeDireto = limitado
    ? d.unitsAvailableForConsumption > 0
    : d.priceStatus !== "Off Sale" && d.priceStatus !== "No Resellers";
  const opcoes = [];
  if (vendeDireto && d.price != null) opcoes.push(d.price);
  if (d.lowestResalePrice > 0) opcoes.push(d.lowestResalePrice);
  return opcoes.length ? Math.min(...opcoes) : null;
}

async function checarPrecos() {
  if (!(await ligado("avisoPreco"))) return;
  const lista = Object.values((await ler({ desejos: {} })).desejos);
  if (!lista.length) return;

  const novos = {};
  for (let i = 0; i < lista.length; i += 100) {
    const r = await api.catalogo(lista.slice(i, i + 100));
    for (const d of r.data || []) novos[d.id] = precoAtual(d);
  }

  // Rele antes de gravar: o usuario pode ter adicionado/tirado item no meio.
  const { desejos } = await ler({ desejos: {} });
  for (const [id, agora] of Object.entries(novos)) {
    const it = desejos[id];
    if (!it) continue;
    const antes = it.atual;
    it.atual = agora;
    if (agora == null || (antes != null && agora >= antes)) continue;
    chrome.notifications.create(`preco:${id}:${it.tipo}`, {
      type: "basic",
      iconUrl: it.thumb || chrome.runtime.getURL("icons/128.png"),
      title: antes == null ? "Voltou a venda" : "Preco baixou",
      message: it.nome,
      contextMessage:
        antes == null ? `${agora} Robux` : `${antes} → ${agora} Robux`,
      priority: 2,
    });
  }
  await gravar({ desejos });
}

// ------------------------------------------------------- aviso de troca nova ----
// A cada 2 min olha as trocas recebidas. Troca nova vira notificacao com o
// Value de cada lado. Na primeira rodada so grava quais ja existiam.
const TAXA_ROBUX = 0.3; // /v1/trades/metadata: tradeSystemRobuxFee

function valorDaOferta(oferta, base) {
  let value = 0, rap = 0, projetado = false;
  for (const it of oferta?.items || []) {
    const alvo = it.itemTarget;
    const rl = (alvo?.itemType === "Bundle" ? base.bundles : base.items)?.[alvo?.targetId];
    const r = rl ? rl[2] : it.recentAveragePrice || 0;
    rap += r;
    value += rl && rl[3] > 0 ? rl[3] : r;
    projetado ||= rl?.[7] === 1;
  }
  const robux = Math.floor((oferta?.robux || 0) * (1 - TAXA_ROBUX));
  return { value: value + robux, rap: rap + robux, projetado };
}

// Auto-recusar: so troca que CHEGA depois de ligar (a caixa que ja existe
// nao e tocada). Perda medida em Value do Rolimon's, igual a calculadora.
// `desde` = quando foi ligado (gravado pelas configuracoes): a lista de
// "vistas" pode estar velha se o aviso de troca estava desligado, entao a
// data da troca e o que garante que a caixa antiga fica intocada.
const RECUSA_PADRAO = { limite: 10, projetado: false, desde: null };

function motivoDeRecusa(dou, recebo, pct, cfg) {
  if (cfg.projetado && recebo.projetado) return "item PROJECTED do outro lado";
  if (dou.value > 0 && pct <= -cfg.limite) return `você perdia ${Math.abs(pct)}%`;
  return null;
}

// ------------------------------------------------------------------ som ----
// Voz "Trade received" / "Trade completed" (sons/, voz neural da Microsoft +
// um sininho; refazer com tools/gerar-sons.sh). O service worker nao toca audio: quem toca e um
// documento offscreen, criado na primeira vez.
const SOM_PADRAO = { recebida: true, concluida: true };
async function tocarSom(qual) {
  if (!(await ligado("somTrocas"))) return;
  const { som } = await ler({ som: SOM_PADRAO });
  if (!{ ...SOM_PADRAO, ...som }[qual]) return;
  try {
    await chrome.offscreen.createDocument({
      url: "src/offscreen/som.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Voz avisando troca recebida ou concluída",
    });
  } catch (_) {
    // ja existe: so pode ter um documento offscreen por vez
  }
  return chrome.runtime.sendMessage({ som: `sons/troca-${qual}.mp3` }).catch((e) => ({ tocou: false, erro: String(e) }));
}

// Troca concluida: compara as 10 ultimas com as ja vistas. Toca a voz, avisa
// e ja atualiza o historico, que assim guarda o Value de perto da hora.
async function checarConcluidas() {
  const [som, historico, avisar] = await Promise.all([ligado("somTrocas"), ligado("historicoTrocas"), ligado("avisoTroca")]);
  if (!som && !historico && !avisar) return;
  const { concluidasVistas } = await ler({ concluidasVistas: null });
  const lista = (await api.trocas("Completed", 10)).data || [];
  const vistas = new Set(concluidasVistas || []);
  const novas = concluidasVistas === null ? [] : lista.filter((t) => !vistas.has(t.id));
  await gravar({ concluidasVistas: [...new Set([...lista.map((t) => t.id), ...(concluidasVistas || [])])].slice(0, 50) });
  if (!novas.length) return;
  tocarSom("concluida");
  if (historico) await atualizarHistorico().catch(() => {});
  if (!avisar) return;
  const [eu, base] = await Promise.all([meuId(), cached("rolimons3", 6 * HORA, () => api.rolimons())]);
  for (const t of novas.slice(0, 3)) {
    try {
      const s = saldoDaTroca(await detalheTroca(t.id), eu, base);
      chrome.notifications.create(`concluida:${t.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128.png"),
        title: `Troca concluída com ${s.nome}`,
        message: `Você deu ${s.dou.toLocaleString("pt-BR")} · recebeu ${s.recebo.toLocaleString("pt-BR")}`,
        contextMessage: s.saldo >= 0 ? `Ganhou +${s.saldo.toLocaleString("pt-BR")} de Value` : `Perdeu ${Math.abs(s.saldo).toLocaleString("pt-BR")} de Value`,
        priority: 1,
      });
    } catch (_) {}
  }
}

async function checarTrocas(silencioso = false) {
  const [avisar, recusar, som] = await Promise.all([ligado("avisoTroca"), ligado("autoRecusa"), ligado("somTrocas")]);
  if (!avisar && !recusar && !som) return;
  const { trocasVistas, recusa, recusadas } = await ler({ trocasVistas: null, recusa: RECUSA_PADRAO, recusadas: [] });
  const lista = (await api.trocas("Inbound", 25)).data || [];
  const vistas = new Set(trocasVistas || []);
  const novas = trocasVistas === null ? [] : lista.filter((t) => !vistas.has(t.id));
  await gravar({ trocasVistas: lista.map((t) => t.id) });
  if (silencioso || !novas.length) return;

  const [eu, base] = await Promise.all([meuId(), cached("rolimons3", 6 * HORA, () => api.rolimons())]);
  let avisadas = 0, recusadasAgora = 0;
  for (const t of novas) {
    // Sem recusa, so as 5 primeiras viram notificacao: nem busca o resto.
    if (!recusar && avisadas >= 5) break;
    try {
      const d = await api.troca(t.id);
      const ofertas = [d.participantAOffer, d.participantBOffer];
      const minha = ofertas.find((o) => o.user?.id === eu);
      const dele = ofertas.find((o) => o !== minha);
      const dou = valorDaOferta(minha, base), recebo = valorDaOferta(dele, base);
      const saldo = recebo.value - dou.value;
      const pct = dou.value ? Math.round((saldo / dou.value) * 100) : 0;
      const nome = dele?.user?.displayName || t.user?.displayName || "alguém";
      const resumo = `Você dava ${dou.value.toLocaleString("pt-BR")} · recebia ${recebo.value.toLocaleString("pt-BR")}`;

      const cfg = { ...RECUSA_PADRAO, ...recusa };
      const depois = cfg.desde && new Date(t.created).getTime() > cfg.desde;
      const motivo = recusar && depois && motivoDeRecusa(dou, recebo, pct, cfg);
      if (motivo) {
        await api.recusarTroca(t.id);
        recusadasAgora++;
        recusadas.unshift({ id: t.id, nome, dou: dou.value, recebo: recebo.value, pct, motivo, t: Date.now() });
        chrome.notifications.create(`recusa:${t.id}`, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/128.png"),
          title: `Recusei a troca de ${nome}`,
          message: resumo,
          contextMessage: `Motivo: ${motivo}`,
          priority: 1,
        });
        continue;
      }
      if (!avisar || avisadas >= 5) continue;
      avisadas++;
      chrome.notifications.create(`troca:${t.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128.png"),
        title: `Troca nova de ${nome}`,
        message: `Você dá ${dou.value.toLocaleString("pt-BR")} · recebe ${recebo.value.toLocaleString("pt-BR")}`,
        contextMessage:
          (saldo >= 0 ? `Ganha +${pct}%` : `Perde ${Math.abs(pct)}%`) + (recebo.projetado ? " · tem item PROJECTED" : ""),
        priority: 2,
      });
    } catch (_) {
      // troca que sumiu no meio (aceita/cancelada) ou rate limit: segue com as outras
    }
  }
  await gravar({ recusadas: recusadas.slice(0, 20) });
  // Voz so pra troca que ficou na caixa (a recusada nao conta).
  if (novas.length > recusadasAgora) tocarSom("recebida");
}


// ------------------------------------------- saldo, protecao e historico ----
// A oferta de uma troca nunca muda depois de criada: o detalhe fica guardado
// (os 400 mais recentes) e o saldo e recalculado com a base do dia.
async function detalheTroca(id) {
  const { trocasDet } = await ler({ trocasDet: {} });
  if (trocasDet[id]) return trocasDet[id];
  const d = await api.troca(id);
  const reduz = (o) => ({
    user: { id: o?.user?.id, displayName: o?.user?.displayName || o?.user?.name },
    robux: o?.robux || 0,
    items: (o?.items || []).map((it) => ({ itemTarget: it.itemTarget, recentAveragePrice: it.recentAveragePrice })),
  });
  const det = { a: reduz(d.participantAOffer), b: reduz(d.participantBOffer), t: Date.now() };
  const atual = (await ler({ trocasDet: {} })).trocasDet;
  atual[id] = det;
  const ids = Object.keys(atual);
  if (ids.length > 400) ids.sort((x, y) => atual[x].t - atual[y].t).slice(0, ids.length - 400).forEach((k) => delete atual[k]);
  await gravar({ trocasDet: atual });
  return det;
}

function saldoDaTroca(det, eu, base) {
  const minha = det.a.user?.id === eu ? det.a : det.b;
  const dele = minha === det.a ? det.b : det.a;
  const dou = valorDaOferta(minha, base), recebo = valorDaOferta(dele, base);
  const saldo = recebo.value - dou.value;
  return {
    dou: dou.value,
    recebo: recebo.value,
    saldo,
    pct: dou.value ? Math.round((saldo / dou.value) * 1000) / 10 : 0,
    projetado: recebo.projetado,
    nome: dele.user?.displayName || "alguém",
    uid: dele.user?.id,
  };
}

// (1) Saldo de cada troca da lista da aba (Inbound/Outbound/Completed/Inactive).
// A lista da Roblox vem na mesma ordem da API; o content script casa pelo nome.
const ABAS_TROCA = ["Inbound", "Outbound", "Completed", "Inactive"];
async function saldosDaLista({ tipo, limite = 25 }) {
  if (!ABAS_TROCA.includes(tipo)) throw new Error("aba de troca desconhecida");
  const [eu, base, lista] = await Promise.all([
    meuId(),
    cached("rolimons3", 6 * HORA, () => api.rolimons()),
    api.trocas(tipo, Math.min(100, limite <= 25 ? 25 : limite <= 50 ? 50 : 100)),
  ]);
  const out = [];
  for (const t of (lista.data || []).slice(0, limite)) {
    try {
      const s = saldoDaTroca(await detalheTroca(t.id), eu, base);
      out.push({ id: t.id, created: t.created, uidLista: t.user?.id, nome: t.user?.displayName, user: t.user?.name, ...s });
    } catch (_) {
      out.push({ id: t.id, created: t.created, uidLista: t.user?.id, nome: t.user?.displayName, user: t.user?.name, erro: true });
    }
  }
  return out;
}

// (2) Protecao de troca ENVIADA: a cada 5 min olha as trocas que voce mandou e
// que ainda estao abertas. Se o Value mudou e agora voce perde mais que o
// limite (ou tem PROJECTED do outro lado), avisa uma vez - ou cancela, se voce
// escolheu isso. Cancelar a propria troca e o mesmo decline.
const PROTECAO_PADRAO = { limite: 0, projetado: true, modo: "avisar" };
async function protegerEnviadas() {
  if (!(await ligado("protecaoEnviada"))) return;
  const { protecao, enviadasAvisadas } = await ler({ protecao: PROTECAO_PADRAO, enviadasAvisadas: {} });
  const cfg = { ...PROTECAO_PADRAO, ...protecao };
  const [eu, base, lista] = await Promise.all([meuId(), cached("rolimons3", 6 * HORA, () => api.rolimons()), api.trocas("Outbound", 50)]);
  const abertas = lista.data || [];
  const avisadas = {};
  for (const t of abertas) {
    if (enviadasAvisadas[t.id]) {
      avisadas[t.id] = enviadasAvisadas[t.id];
      continue;
    }
    try {
      const s = saldoDaTroca(await detalheTroca(t.id), eu, base);
      const motivo =
        s.pct < -cfg.limite ? `você perde ${Math.abs(s.pct).toLocaleString("pt-BR")}% de Value`
        : cfg.projetado && s.projetado ? "tem item PROJECTED do outro lado"
        : null;
      if (!motivo) continue;
      avisadas[t.id] = Date.now();
      const resumo = `Você dá ${s.dou.toLocaleString("pt-BR")} · recebe ${s.recebo.toLocaleString("pt-BR")}`;
      if (cfg.modo === "cancelar") {
        await api.recusarTroca(t.id);
        chrome.notifications.create(`enviada:${t.id}`, {
          type: "basic", iconUrl: chrome.runtime.getURL("icons/128.png"),
          title: `Cancelei a troca que você mandou pra ${s.nome}`, message: resumo, contextMessage: `Motivo: ${motivo}`, priority: 1,
        });
      } else {
        chrome.notifications.create(`enviada:${t.id}`, {
          type: "basic", iconUrl: chrome.runtime.getURL("icons/128.png"),
          title: `Troca que você mandou pra ${s.nome} ficou ruim`, message: resumo, contextMessage: `Motivo: ${motivo}`,
          buttons: [{ title: "Cancelar essa troca" }], requireInteraction: true, priority: 2,
        });
      }
    } catch (_) {
      // troca que fechou no meio ou limite de taxa: tenta de novo na proxima rodada
    }
  }
  // So guarda as que ainda estao abertas: a lista nao cresce pra sempre.
  await gravar({ enviadasAvisadas: avisadas });
}

// (3) Historico de lucro: cada troca concluida guarda o Value dos dois lados.
// As que ja existiam quando o recurso ligou sao contadas com os valores de
// hoje (aprox: true); as novas, com o valor de quando foram vistas.
async function atualizarHistorico() {
  const [eu, base] = await Promise.all([meuId(), cached("rolimons3", 6 * HORA, () => api.rolimons())]);
  const { historico } = await ler({ historico: {} });
  const primeira = !Object.keys(historico).length;
  const novas = [];
  let cursor = "";
  for (let p = 0; p < 4; p++) {
    const r = await api.trocas("Completed", 100, cursor);
    const pagina = r.data || [];
    novas.push(...pagina.filter((t) => !historico[t.id]));
    cursor = r.nextPageCursor;
    if (!cursor || pagina.some((t) => historico[t.id])) break; // chegou no que ja tinha
  }
  for (const t of novas.slice(0, 200)) {
    try {
      const s = saldoDaTroca(await detalheTroca(t.id), eu, base);
      historico[t.id] = { t: Date.parse(t.created) || Date.now(), nome: s.nome, dou: s.dou, recebo: s.recebo, aprox: primeira };
    } catch (_) {}
  }
  await gravar({ historico, historicoEm: Date.now() });
  return resumoHistorico(historico);
}

function resumoHistorico(historico) {
  const lista = Object.entries(historico).map(([id, h]) => ({ id, ...h, saldo: h.recebo - h.dou })).sort((a, b) => b.t - a.t);
  const soma = (dias) => lista.filter((h) => !dias || Date.now() - h.t < dias * 24 * HORA).reduce((s, h) => s + h.saldo, 0);
  const conta = (dias) => lista.filter((h) => !dias || Date.now() - h.t < dias * 24 * HORA).length;
  return {
    total: soma(0), n: conta(0),
    dias30: soma(30), n30: conta(30),
    dias7: soma(7), n7: conta(7),
    aprox: lista.filter((h) => h.aprox).length,
    ultimas: lista.slice(0, 20),
  };
}

chrome.notifications.onButtonClicked.addListener(async (id) => {
  if (!id.startsWith("enviada:")) return;
  const tradeId = id.split(":")[1];
  try {
    await api.recusarTroca(tradeId);
    chrome.notifications.clear(id);
    chrome.notifications.create(`enviada-ok:${tradeId}`, {
      type: "basic", iconUrl: chrome.runtime.getURL("icons/128.png"), title: "Troca cancelada", message: "A troca que você tinha mandado foi cancelada.", priority: 0,
    });
  } catch (e) {
    chrome.notifications.create(`enviada-erro:${tradeId}`, {
      type: "basic", iconUrl: chrome.runtime.getURL("icons/128.png"), title: "Não deu pra cancelar", message: String(e.message || e), priority: 1,
    });
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("pedem:")) {
    chrome.tabs.create({ url: `https://www.roblox.com/users/${id.split(":")[1]}/trade` });
    return chrome.notifications.clear(id);
  }
  if (id.startsWith("concluida:")) {
    chrome.tabs.create({ url: "https://www.roblox.com/trades?tab=Completed" });
    return chrome.notifications.clear(id);
  }
  if (id.startsWith("enviada")) {
    chrome.tabs.create({ url: "https://www.roblox.com/trades?tab=Outbound" });
    return chrome.notifications.clear(id);
  }
  if (id.startsWith("anuncio:")) {
    chrome.runtime.openOptionsPage();
    return chrome.notifications.clear(id);
  }
  if (id.startsWith("recusa:")) {
    chrome.tabs.create({ url: "https://www.roblox.com/trades?tab=Inactive" });
    return chrome.notifications.clear(id);
  }
  if (id.startsWith("troca:")) {
    chrome.tabs.create({ url: "https://www.roblox.com/trades?tab=Inbound" });
    return chrome.notifications.clear(id);
  }
  const [, item, tipo] = id.split(":");
  if (!item) return;
  const caminho = tipo === "Bundle" ? "bundles" : "catalog";
  chrome.tabs.create({ url: `https://www.roblox.com/${caminho}/${item}` });
  chrome.notifications.clear(id);
});

// ---------------------------------------------- anuncio no Rolimon's ----
// O usuario monta o anuncio nas configuracoes e a extensao reposta sozinha.
// 25 min, nao 15: o cooldown e 15, mas o limite e 60 anuncios em 24h; de 15
// em 15 o limite trava depois de 15h. De 25 em 25 da 57 por dia e nunca trava.
const ANUNCIO_MIN = 25;
const ANUNCIO_MAX_DIA = 60;
const TAGS_ANUNCIO = ["any", "demand", "rares", "robux", "upgrade", "downgrade", "rap", "wishlist", "projecteds", "adds"];
const ANUNCIO_PADRAO = { oferta: [], pedido: [], tags: [], robux: 0, auto: false };

// Codigos da propria pagina deles (tradeadcatalog.js). "para" = nao adianta
// repetir, desliga o automatico e avisa.
const ERROS_ANUNCIO = {
  2: ["Anúncio inválido.", true],
  4: ["Você não está verificado no Rolimon's. Entre em rolimons.com e verifique a conta.", true],
  5: ["Verificação do Rolimon's expirou. Saia e verifique de novo em rolimons.com.", true],
  9: ["O Rolimon's não conseguiu criar o anúncio agora.", false],
  10: ["O Rolimon's não conseguiu criar o anúncio agora.", false],
  14: ["Limite de 60 anúncios em 24h atingido.", false],
  7100: ["Tem um item inválido no anúncio.", true],
  7101: ["Conta da Roblox banida ou desativada.", true],
  7102: ["O Rolimon's desativou seus anúncios (costuma ser por spam de anúncio ruim).", true],
  7103: ["O Rolimon's ainda não escaneou seu nome. Tenta mais tarde.", false],
  7104: ["Um item da oferta não está mais no seu inventário.", true],
  7105: ["Cooldown do Rolimon's ainda não passou.", false],
  7106: ["O Rolimon's nunca escaneou seu inventário.", false],
  7107: ["O Rolimon's não escaneou seu inventário há pouco tempo.", false],
  7108: ["Precisa de Roblox Premium pra criar anúncio.", true],
  7109: ["Sua wishlist no Rolimon's está vazia (a tag Wishlist precisa dela).", true],
};

// Quem esta logado no Rolimon's: o cookie _RoliData e um JWT com player_data.
// So le, nao valida: quem valida e o servidor deles.
async function contaRolimons() {
  const c = await chrome.cookies.get({ url: "https://www.rolimons.com", name: "_RoliData" });
  if (!c?.value) return null;
  try {
    const b64 = c.value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
    const p = JSON.parse(json).player_data;
    return Number.isInteger(p?.id) ? { id: p.id, nome: p.name } : null;
  } catch (_) {
    return null;
  }
}

// O service worker nao leva os cookies do rolimons.com sozinho em todo
// navegador (SameSite / bloqueio de terceiros). Entao copio os cookies deles
// pra uma regra de rede que so vale pro createad e so pra request sem aba
// (o proprio worker): o site do Rolimon's aberto numa aba nao e tocado.
async function cookieRolimons() {
  const cookies = await chrome.cookies.getAll({ domain: "rolimons.com" });
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [2],
    addRules: [
      {
        id: 2,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "Cookie", operation: "set", value: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
            { header: "Origin", operation: "set", value: "https://www.rolimons.com" },
            { header: "Referer", operation: "set", value: "https://www.rolimons.com/tradeadcreate" },
          ],
        },
        condition: { urlFilter: "||api.rolimons.com/tradeads/v1/createad", tabIds: [chrome.tabs.TAB_ID_NONE] },
      },
    ],
  });
}

function problemaDoAnuncio(a, base) {
  if (!a.oferta.length) return "Escolha pelo menos 1 item pra oferecer.";
  if (a.oferta.length > 4) return "No máximo 4 itens na oferta.";
  if (!a.pedido.length && !a.tags.length) return "Escolha pelo menos 1 item ou tag no pedido.";
  if (a.pedido.length + a.tags.length > 4) return "No máximo 4 itens e tags no pedido, somados.";
  const rap = a.oferta.reduce((s, id) => s + (base.items?.[id]?.[2] || 0), 0);
  if (a.robux > Math.floor(rap / 2)) return `Robux passa de 50% do RAP oferecido (máximo ${Math.floor(rap / 2)}).`;
  return null;
}

async function registrarAnuncio(patch) {
  const { anuncioLog } = await ler({ anuncioLog: {} });
  const log = { ...anuncioLog, ...patch };
  await gravar({ anuncioLog: log });
  return log;
}

async function agendarAnuncio(ligar) {
  await chrome.alarms.clear("anuncio");
  if (ligar) chrome.alarms.create("anuncio", { delayInMinutes: ANUNCIO_MIN, periodInMinutes: ANUNCIO_MIN });
  const al = ligar ? await chrome.alarms.get("anuncio") : null;
  return registrarAnuncio({ proximo: al?.scheduledTime || null });
}

// Alarme some quando a extensao atualiza/recarrega e pode sumir ao reabrir o
// navegador. Recria se o automatico estiver ligado, sem resetar um que existe.
async function garantirAlarmeAnuncio() {
  const { anuncio } = await ler({ anuncio: ANUNCIO_PADRAO });
  if (anuncio.auto && !(await chrome.alarms.get("anuncio"))) await agendarAnuncio(true);
}

async function pararAnuncio(motivo) {
  const { anuncio } = await ler({ anuncio: ANUNCIO_PADRAO });
  await gravar({ anuncio: { ...anuncio, auto: false } });
  await agendarAnuncio(false);
  chrome.notifications.create("anuncio:parou", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: "Anúncio automático parou",
    message: motivo,
    priority: 2,
  });
}

async function postarAnuncio(automatico = false) {
  const { anuncio } = await ler({ anuncio: ANUNCIO_PADRAO });
  const falha = async (msg, para) => {
    await registrarAnuncio({ erro: msg, erroEm: Date.now() });
    if (automatico && para) await pararAnuncio(msg);
    throw new Error(msg);
  };

  const conta = await contaRolimons();
  if (!conta) return falha(ERROS_ANUNCIO[4][0], true);
  const base = await cached("rolimons3", 6 * HORA, () => api.rolimons());
  const problema = problemaDoAnuncio(anuncio, base);
  if (problema) return falha(problema, true);

  // Janela de 24h: nao passa de 60 nem se o usuario clicar "Postar agora".
  const { anuncioLog } = await ler({ anuncioLog: {} });
  const dia = (anuncioLog.enviados || []).filter((t) => Date.now() - t < 24 * HORA);
  if (dia.length >= ANUNCIO_MAX_DIA) return falha(ERROS_ANUNCIO[14][0], false);

  // Reescaneia e confere a oferta antes: item trocado/vendido nao vira erro 7104 a cada 25 min.
  const inv = await api.roliInventario(conta.id);
  const tem = inv.playerAssets || {};
  const sumiu = anuncio.oferta.find((id) => !tem[id]?.length);
  if (sumiu) return falha(`${base.items?.[sumiu]?.[0] || sumiu} não está mais no seu inventário.`, true);

  await cookieRolimons();
  try {
    await api.criarAnuncio({
      player_id: conta.id,
      offer_item_ids: anuncio.oferta.map(Number),
      request_item_ids: anuncio.pedido.map(Number),
      request_tags: anuncio.tags,
      ...(anuncio.robux > 0 ? { offer_robux: anuncio.robux } : {}),
    });
  } catch (e) {
    const [msg, para] = ERROS_ANUNCIO[e.code] || [e.message, false];
    return falha(msg, para);
  }
  const al = await chrome.alarms.get("anuncio");
  return registrarAnuncio({ ultimo: Date.now(), enviados: [...dia, Date.now()], erro: null, proximo: al?.scheduledTime || null });
}

// Itens que da pra oferecer: o inventario que o Rolimon's enxerga (o mesmo que
// ele confere no createad), com nome, value e miniatura.
async function inventarioParaAnuncio() {
  const conta = await contaRolimons();
  if (!conta) return null;
  const [inv, base] = await Promise.all([api.roliInventario(conta.id), cached("rolimons3", 6 * HORA, () => api.rolimons())]);
  const itens = Object.entries(inv.playerAssets || {})
    .filter(([id]) => base.items?.[id])
    .map(([id, uaids]) => {
      const [nome, sigla, rap, value] = base.items[id];
      return { id, nome, sigla, rap, value: value > 0 ? value : rap, qtd: uaids.length };
    })
    .sort((a, b) => b.value - a.value);
  const thumbs = {};
  for (let i = 0; i < itens.length; i += 100) {
    const r = await api.thumbs(itens.slice(i, i + 100).map((x) => x.id)).catch(() => ({ data: [] }));
    for (const t of r.data) thumbs[t.targetId] = t.imageUrl;
  }
  itens.forEach((x) => (x.thumb = thumbs[x.id] || null));
  return itens;
}

// ------------------------------------------------ envio de troca (1 clique) ----
// Voce monta UMA troca (ate 4 itens seus por 1 item). A extensao acha os donos
// mais recentes desse item que podem trocar (Premium) com a copia fora de hold,
// e cada troca so sai quando VOCE clica Enviar naquela pessoa. Sem envio em
// massa de proposito: e o que a Roblox trata como spam/bot.
const ENVIO_ESPERA_S = 30; // intervalo minimo entre dois envios
const ENVIO_REPETE_DIAS = 7; // quem ja recebeu nao aparece de novo nesse prazo
// pedidoTipo/tipo: "Asset" ou "Bundle" (rosto limitado virou cabeca dinamica).
const ENVIO_PADRAO = { oferta: [], pedido: null, pedidoTipo: "Asset" };

// Troca salva antes dos pacotes nao tem tipo: tudo era asset.
async function lerEnvio() {
  const { envio } = await ler({ envio: ENVIO_PADRAO });
  return {
    ...ENVIO_PADRAO,
    ...envio,
    pedidoTipo: envio.pedidoTipo || "Asset",
    oferta: (envio.oferta || []).map((o) => ({ tipo: "Asset", ...o })),
  };
}

const dadoRoli = (base, id, tipo) => (tipo === "Bundle" ? base.bundles : base.items)?.[id];

// Value do Rolimon's (RAP se nao tiver value). A trava: recebe >= da.
function contaDoEnvio(envio, base) {
  const v = (id, tipo) => {
    const it = dadoRoli(base, id, tipo);
    return it ? (it[3] > 0 ? it[3] : it[2]) : null;
  };
  const dou = envio.oferta.reduce((s, o) => s + (v(o.assetId, o.tipo) ?? 0), 0);
  const pedido = envio.pedido && dadoRoli(base, envio.pedido, envio.pedidoTipo);
  const recebo = envio.pedido ? v(envio.pedido, envio.pedidoTipo) : null;
  let problema = null;
  if (!envio.oferta.length) problema = "Escolha pelo menos 1 item seu.";
  else if (envio.oferta.length > 4) problema = "No máximo 4 itens seus.";
  else if (envio.oferta.some((o) => v(o.assetId, o.tipo) == null)) problema = "Um item seu não tem dado no Rolimon's: não dá pra medir o Value.";
  else if (!envio.pedido) problema = "Escolha o item que você quer.";
  else if (!pedido) problema = "O item pedido não tem dado no Rolimon's: não dá pra medir o Value.";
  else if (pedido[7] === 1) problema = "O item pedido está PROJECTED: o RAP dele está inflado e a conta de Value não é confiável.";
  else if (recebo < dou) problema = `Você perderia Value: dá ${dou.toLocaleString("pt-BR")} e recebe ${recebo.toLocaleString("pt-BR")}.`;
  return { dou, recebo, problema };
}

async function meusTrocaveis() {
  const eu = await meuId();
  const itens = [];
  let cursor = "";
  for (let p = 0; p < 10; p++) {
    const r = await api.trocaveis(eu, { cursor });
    itens.push(...(r.items || []));
    cursor = r.nextPageCursor;
    if (!cursor) break;
  }
  const base = await cached("rolimons3", 6 * HORA, () => api.rolimons());
  const copias = [];
  for (const it of itens)
    for (const c of it.instances || []) {
      const tipo = c.itemTarget?.itemType;
      if (tipo !== "Asset" && tipo !== "Bundle") continue;
      const id = c.itemTarget.targetId;
      const rl = dadoRoli(base, id, tipo);
      copias.push({
        instanceId: c.collectibleItemInstanceId,
        assetId: id,
        tipo,
        nome: c.itemName || it.itemName,
        value: rl ? (rl[3] > 0 ? rl[3] : rl[2]) : null,
        hold: !!c.isOnHold,
      });
    }
  const thumbs = {};
  for (const tipo of ["Asset", "Bundle"]) {
    const ids = [...new Set(copias.filter((c) => c.tipo === tipo).map((c) => c.assetId))];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const r = await (tipo === "Bundle" ? api.thumbsPacotes(lote) : api.thumbs(lote)).catch(() => ({ data: [] }));
      for (const t of r.data) thumbs[tipo + t.targetId] = t.imageUrl;
    }
  }
  copias.forEach((c) => (c.thumb = thumbs[c.tipo + c.assetId] || null));
  return copias.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

// Fila de donos: copias Premium (lista do Rolimon's), da troca de dono mais
// recente pra mais antiga, uma pessoa uma vez, sem voce e sem quem recebeu nos
// ultimos 7 dias. So leitura: nada e enviado aqui.
async function filaDeDonos(id, tipo) {
  const eu = await meuId();
  const { envioHist } = await ler({ envioHist: {} });
  const copias = await api.donosPremium(id, tipo);
  copias.sort((a, b) => b.atualizado - a.atualizado);
  const vistos = new Set();
  const fila = [];
  for (const c of copias) {
    if (!c.id || c.id === 1 || c.id === eu || vistos.has(c.id)) continue; // 1 = conta Roblox
    vistos.add(c.id);
    if (Date.now() - (envioHist[c.id] || 0) < ENVIO_REPETE_DIAS * 24 * HORA) continue;
    fila.push({ id: c.id, nome: c.nome, quando: c.atualizado ? new Date(c.atualizado).toISOString() : null, online: c.online || null });
  }
  return fila;
}

// Copia do alvo desse item que da pra pedir agora (fora de hold), ou null.
async function copiaTrocavel(userId, id, tipo, nome) {
  const inv = await api.trocaveis(userId, { busca: nome });
  return (
    (inv.items || [])
      .flatMap((i) => i.instances || [])
      .find((c) => c.itemTarget?.itemType === tipo && c.itemTarget?.targetId === String(id) && !c.isOnHold) || null
  );
}

// Proximos `n` donos que podem receber: Premium (can-trade-with) e copia fora
// de hold. Cada checagem e leitura; o envio e outro handler, por clique.
let filaEnvio = { pedido: null, itens: [] };
async function proximosDonos({ pos = 0, n = 8, novo = false }) {
  const envio = await lerEnvio();
  if (!envio.pedido) throw new Error("Escolha o item que você quer.");
  const chave = envio.pedidoTipo + envio.pedido;
  if (novo || filaEnvio.pedido !== chave) filaEnvio = { pedido: chave, itens: await filaDeDonos(envio.pedido, envio.pedidoTipo) };
  const base = await cached("rolimons3", 6 * HORA, () => api.rolimons());
  const nome = dadoRoli(base, envio.pedido, envio.pedidoTipo)?.[0]?.trim() || "";
  const achados = [];
  let i = pos;
  for (let checados = 0; i < filaEnvio.itens.length && achados.length < n && checados < n * 4; i++, checados++) {
    const alvo = filaEnvio.itens[i];
    const pode = await api.podeTrocarCom(alvo.id).catch(() => null);
    if (!pode?.canTrade) continue;
    const copia = await copiaTrocavel(alvo.id, envio.pedido, envio.pedidoTipo, nome).catch(() => null);
    if (copia) achados.push(alvo);
  }
  const rostos = achados.length ? await api.rostos(achados.map((a) => a.id)).catch(() => ({ data: [] })) : { data: [] };
  const foto = Object.fromEntries(rostos.data.map((x) => [x.targetId, x.imageUrl]));
  achados.forEach((a) => (a.rosto = foto[a.id] || null));
  return { donos: achados, pos: i, total: filaEnvio.itens.length };
}

const ELEGIBILIDADE = {
  CallingUserIneligible: "Sua conta não pode trocar (precisa de Premium).",
  CallingUserPrivacySettingsRestricted: "Sua privacidade de troca está fechada. Abra em Configurações da Roblox → Privacidade.",
  CallingUserAgeCheckRequired: "A Roblox pede verificação de idade pra você trocar.",
  TargetUserIneligible: "Essa pessoa não pode trocar agora (sem Premium ou troca bloqueada).",
};

// UM envio, disparado pelo clique. Confere tudo de novo na hora: Value (a base
// muda), seus itens (podem ter saido), Premium e hold do outro lado.
async function enviarUma({ userId }) {
  const { envioHist, envioUltimo } = await ler({ envioHist: {}, envioUltimo: 0 });
  const envio = await lerEnvio();
  const falta = Math.ceil(ENVIO_ESPERA_S - (Date.now() - envioUltimo) / 1000);
  if (falta > 0) throw new Error(`Espere ${falta} s pra mandar a próxima.`);

  const base = await cached("rolimons3", 6 * HORA, () => api.rolimons());
  const conta = contaDoEnvio(envio, base);
  if (conta.problema) throw new Error(conta.problema);

  const minhas = new Map((await meusTrocaveis()).map((c) => [c.instanceId, c]));
  if (envio.oferta.some((o) => !minhas.get(o.instanceId) || minhas.get(o.instanceId).hold))
    throw new Error("Um item da sua oferta saiu do inventário ou está em hold. Escolha de novo.");

  const pode = await api.podeTrocarCom(userId);
  if (!pode?.canTrade) throw new Error(ELEGIBILIDADE[pode?.mutualTradeEligibility] || "Não dá pra trocar com essa pessoa agora.");
  const copia = await copiaTrocavel(userId, envio.pedido, envio.pedidoTipo, dadoRoli(base, envio.pedido, envio.pedidoTipo)[0].trim());
  if (!copia) throw new Error("A cópia dela está em hold ou saiu do inventário.");

  const eu = await meuId();
  try {
    const r = await api.enviarTroca({
      senderOffer: { userId: eu, robux: 0, collectibleItemInstanceIds: envio.oferta.map((o) => o.instanceId) },
      recipientOffer: { userId, robux: 0, collectibleItemInstanceIds: [copia.collectibleItemInstanceId] },
    });
    envioHist[userId] = Date.now();
    for (const [k, t] of Object.entries(envioHist)) if (Date.now() - t > ENVIO_REPETE_DIAS * 24 * HORA) delete envioHist[k];
    await gravar({ envioHist, envioUltimo: Date.now() });
    return { tradeId: r.tradeId, espera: ENVIO_ESPERA_S };
  } catch (e) {
    if (e.desafio) throw new Error("A Roblox pediu verificação (captcha ou 2 etapas). Mande essa pelo site.");
    if (e.status === 429) throw new Error("A Roblox segurou os envios por um tempo (muitas trocas). Tente mais tarde.");
    throw e;
  }
}


// ------------------------------------------ anuncios que pedem seus itens ----
// Varre os anuncios do Rolimon's e guarda os que PEDEM um item que voce tem
// (inventario que o Rolimon's escaneou). A API so mostra ~3 min, entao o
// alarme de 2 min vai juntando; ao ligar/atualizar, a pagina traz ~26 min.
// Guarda 24h, no maximo 300. So leitura: nada e enviado.
const PEDEM_PADRAO = { avisar: true, avisarPct: 10 };
const TAGS_ROLI = { 1: "Qualquer", 2: "Demanda", 3: "Raros", 4: "Robux", 5: "Upgrade", 6: "Downgrade", 7: "RAP", 8: "Wishlist", 9: "Projecteds", 10: "Adds" };

const meusAssetsRoli = () =>
  cached("meusAssetsRoli", 30 * MIN, async () => Object.keys((await api.roliInventario(await meuId())).playerAssets || {}));

function avaliarAnuncio(ad, eu, meus, base) {
  const [id, ts, uid, nome, oferta = {}, pedido = {}] = ad;
  if (uid === eu) return null;
  const pedidos = (pedido.items || []).map(String);
  const meusPedidos = pedidos.filter((i) => meus.has(i));
  if (!meusPedidos.length) return null;
  const v = (i) => {
    const it = base.items?.[i];
    return it ? (it[3] > 0 ? it[3] : it[2]) : 0;
  };
  const dou = pedidos.reduce((s, i) => s + v(i), 0);
  const robux = oferta.robux || 0;
  const recebo = (oferta.items || []).reduce((s, i) => s + v(String(i)), 0) + Math.floor(robux * (1 - TAXA_ROBUX));
  return {
    id, t: ts * 1000, uid, nome,
    oferta: (oferta.items || []).map(String), robux,
    pedido: pedidos, tags: (pedido.tags || []).map((x) => TAGS_ROLI[x] || x),
    tenhoTudo: meusPedidos.length === pedidos.length,
    dou, recebo, pct: dou ? Math.round(((recebo - dou) / dou) * 1000) / 10 : 0,
  };
}

async function coletarAnuncios(completo = false) {
  if (!(await ligado("pedemMeus"))) return null;
  const [eu, base, meusArr, ads] = await Promise.all([
    meuId(),
    cached("rolimons3", 6 * HORA, () => api.rolimons()),
    meusAssetsRoli(),
    completo ? api.anunciosPagina() : api.anunciosRecentes(),
  ]);
  const meus = new Set(meusArr);
  const { pedemMeus, pedem } = await ler({ pedemMeus: {}, pedem: PEDEM_PADRAO });
  const cfg = { ...PEDEM_PADRAO, ...pedem };
  const novos = [];
  for (const ad of ads) {
    if (pedemMeus[ad[0]]) continue;
    const a = avaliarAnuncio(ad, eu, meus, base);
    if (a) (pedemMeus[a.id] = a), novos.push(a);
  }
  const ids = Object.keys(pedemMeus).filter((k) => Date.now() - pedemMeus[k].t < 24 * HORA).sort((x, y) => pedemMeus[y].t - pedemMeus[x].t);
  const guardar = Object.fromEntries(ids.slice(0, 300).map((k) => [k, pedemMeus[k]]));
  await gravar({ pedemMeus: guardar, pedemEm: Date.now() });

  // Aviso so do que e recente (a busca grande nao vira enxurrada) e bom.
  if (cfg.avisar)
    for (const a of novos.filter((x) => x.tenhoTudo && x.pct >= cfg.avisarPct && Date.now() - x.t < 10 * MIN).slice(0, 3)) {
      const nomeItem = (i) => (base.items?.[i]?.[0] || i).trim();
      chrome.notifications.create(`pedem:${a.uid}:${a.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128.png"),
        title: `${a.nome} quer ${a.pedido.map(nomeItem).join(" + ")}`,
        message: `Oferece ${a.recebo.toLocaleString("pt-BR")} de Value por ${a.dou.toLocaleString("pt-BR")} (+${a.pct.toLocaleString("pt-BR")}%)`,
        contextMessage: "Anúncio no Rolimon's · clique pra abrir a troca",
        priority: 1,
      });
    }
  return novos.length;
}


// ------------------------------------------------------ analise do item ----
// Painel "Mercado" da pagina do item e grafico do card de info. Fonte: pagina
// do item no Rolimon's (vendas por dia, RAP de 30 em 30 min, donos, hoard,
// mudancas de Value). Guarda so o resumo, 30 min por item.
const DIA = 24 * HORA;
async function analiseItem({ id, pacote = false }) {
  return cached(`ana:${pacote ? "b" : "a"}${id}`, 30 * MIN, async () => {
    const pg = await api.paginaRolimons(id, pacote);
    const d = pg.detalhes || {};
    const agora = Date.now() / 1000;

    // Vendas: um ponto por dia (preco medio do dia + quantas vendas).
    const v = pg.vendas || { timestamp: [], avg_daily_sales_price: [], sales_volume: [] };
    const pontos = v.timestamp.map((t, i) => ({ t: t * 1000, preco: v.avg_daily_sales_price[i], vendas: v.sales_volume[i] || 0 }));
    const entre = (de, ate) => pontos.filter((p) => p.t / 1000 > agora - de * 86400 && p.t / 1000 <= agora - ate * 86400);
    const soma = (l) => l.reduce((s, p) => s + p.vendas, 0);
    const ult30 = entre(30, 0), ant30 = entre(60, 30);

    // RAP de 30 dias atras (historico de 30 em 30 min).
    const h = pg.historico || { timestamp: [], rap: [] };
    let rap30 = null;
    for (let i = h.timestamp.length - 1; i >= 0; i--) if (h.timestamp[i] <= agora - 30 * 86400) { rap30 = h.rap[i]; break; }

    const don = pg.donos || { timestamps: [], owners: [] };
    let donos30 = null;
    for (let i = don.timestamps.length - 1; i >= 0; i--) if (don.timestamps[i] <= agora - 30 * 86400) { donos30 = don.owners[i]; break; }

    const ultValue = (pg.values || []).filter((x) => x[1] === 1).at(-1);
    return {
      vendas30: soma(ult30),
      vendasDia: ult30.length ? soma(ult30) / 30 : null,
      vendasDiaAnt: ant30.length ? soma(ant30) / 30 : null,
      rap: d.rap ?? null,
      rap30,
      melhor: d.best_price ?? null,
      vendedores: d.num_sellers ?? null,
      donos: d.owners ?? null,
      donos30,
      donosPremium: d.bc_owners ?? null,
      copias: d.copies ?? null,
      apagadas: d.deleted_copies ?? null,
      hoard: d.hoarded_copies ?? null,
      favoritos: d.favorited ?? null,
      criado: d.created ? d.created * 1000 : null,
      limitado: d.first_timestamp ? d.first_timestamp * 1000 : null,
      ultimoValue: ultValue ? { t: ultValue[0] * 1000, de: Number(ultValue[2]) || null, para: Number(ultValue[3]) || null } : null,
      serie: pontos.filter((p) => p.t / 1000 > agora - 90 * 86400),
    };
  });
}


// ------------------------------------------- analise de item NAO limitado ----
// A Roblox esconde quantas vezes um item normal vendeu (Sales volta 0 pra quem
// nao e o criador). O que da pra medir: posicao no ranking de mais vendidos da
// semana (a propria Roblox ordenando por venda), favoritos (e quanto cresceu
// desde a sua ultima visita), e, em item de quantidade limitada, vendidos =
// total - restantes. Categorias: v1/search/navigation-menu-items.
const CATEGORIA_ASSET = {
  8: ["Accessories", "HeadAccessories", "acessórios de cabeça"],
  41: ["Body", "HairAccessories", "cabelos"],
  42: ["Accessories", "FaceAccessories", "acessórios de rosto"],
  43: ["Accessories", "NeckAccessories", "acessórios de pescoço"],
  44: ["Accessories", "ShoulderAccessories", "acessórios de ombro"],
  45: ["Accessories", "FrontAccessories", "acessórios de frente"],
  46: ["Accessories", "BackAccessories", "acessórios de costas"],
  47: ["Accessories", "WaistAccessories", "acessórios de cintura"],
  19: ["Accessories", "Gear", "gears"],
  2: ["Clothing", "ClassicTShirts", "camisetas clássicas"],
  11: ["Clothing", "ClassicShirts", "camisas clássicas"],
  12: ["Clothing", "ClassicPants", "calças clássicas"],
  64: ["Clothing", "TShirtAccessories", "camisetas 3D"],
  65: ["Clothing", "ShirtAccessories", "camisas 3D"],
  66: ["Clothing", "PantsAccessories", "calças 3D"],
  67: ["Clothing", "JacketAccessories", "jaquetas"],
  68: ["Clothing", "SweaterAccessories", "suéteres"],
  69: ["Clothing", "ShortsAccessories", "shorts"],
  72: ["Clothing", "DressSkirtAccessories", "vestidos e saias"],
  61: ["AvatarAnimations", "EmoteAnimations", "emotes"],
};
const CATEGORIA_PACOTE = {
  DynamicHead: ["Body", "DynamicHeads", "cabeças"],
  BodyParts: ["Body", "BodyPartsBundles", "corpos"],
  AvatarAnimations: ["AvatarAnimations", "AnimationBundles", "pacotes de animação"],
  Shoes: ["Clothing", "ShoesBundles", "sapatos"],
};

async function rankingDaSemana(id, tipo, [cat, sub, nome]) {
  let cursor = "", vistos = 0;
  for (let p = 0; p < 5; p++) {
    let r;
    try {
      r = await api.maisVendidos(cat, sub, cursor);
    } catch (e) {
      return { nome, ate: vistos, parcial: true }; // 429 no meio: fica com o que olhou
    }
    const i = (r.data || []).findIndex((x) => String(x.id) === String(id) && x.itemType === tipo);
    if (i >= 0) return { nome, pos: vistos + i + 1 };
    vistos += (r.data || []).length;
    cursor = r.nextPageCursor;
    if (!cursor) break;
  }
  return { nome, ate: vistos };
}

async function analiseNormal({ id, pacote = false }) {
  const tipo = pacote ? "Bundle" : "Asset";
  const d = await cached(`norm:${tipo}${id}`, 30 * MIN, async () => (await api.catalogo([{ id, tipo }])).data?.[0] || null);
  if (!d) throw new Error("Item não encontrado no catálogo.");

  // Favoritos: guardo um ponto por visita (no maximo 1 por hora) pra mostrar
  // quanto cresceu desde a ultima vez que voce olhou.
  const chave = `${tipo}${id}`;
  const { favHist } = await ler({ favHist: {} });
  const hist = favHist[chave] || [];
  const anterior = [...hist].reverse().find((p) => Date.now() - p[0] > HORA) || null;
  if (d.favoriteCount != null && (!hist.length || Date.now() - hist.at(-1)[0] > HORA)) {
    favHist[chave] = [...hist, [Date.now(), d.favoriteCount]].slice(-30);
    const chaves = Object.keys(favHist);
    if (chaves.length > 300) chaves.sort((a, b) => favHist[a].at(-1)[0] - favHist[b].at(-1)[0]).slice(0, chaves.length - 300).forEach((k) => delete favHist[k]);
    await gravar({ favHist });
  }

  const cat = pacote ? CATEGORIA_PACOTE[d.bundleType] : CATEGORIA_ASSET[d.assetType];
  const ranking = cat ? await cached(`rank:${chave}`, HORA, () => rankingDaSemana(id, tipo, cat)).catch(() => null) : null;
  const criado = d.itemCreatedUtc ? Date.parse(d.itemCreatedUtc) : null;
  return {
    nome: d.name,
    preco: d.price ?? d.lowestPrice ?? null,
    status: d.priceStatus || null,
    saiEm: d.offSaleDeadline ? Date.parse(d.offSaleDeadline) : null,
    favoritos: d.favoriteCount ?? null,
    favAntes: anterior ? { t: anterior[0], n: anterior[1] } : null,
    criado,
    criador: d.creatorName || null,
    criadorId: d.creatorTargetId || null,
    criadorTipo: d.creatorType || null,
    total: d.totalQuantity || null,
    restam: d.unitsAvailableForConsumption ?? null,
    limitePessoa: d.quantityLimitPerUser || null,
    ranking,
  };
}

// ------------------------------------------------------------- handlers ----
const handlers = {
  me: () => api.me(),
  servers: ({ placeId, ...op }) => api.servers(placeId, op),
  values: () => cached("rolimons3", 6 * HORA, () => api.rolimons()),
  inventario: ({ userId }) => cached(`inv:${userId}`, 1 * HORA, () => valorDoInventario(userId)),

  region: ({ placeId, gameId }) =>
    cached(`region:${gameId}`, 12 * HORA, async () => {
      const join = await api.joinScript(placeId, gameId);
      // UdmuxEndpoints e o IP publico. MachineAddress e interno (10.x), nao serve.
      const ip = join?.joinScript?.UdmuxEndpoints?.[0]?.Address;
      // status 2 = pronto pra entrar; 22 = cheio; 12 = sem acesso (ou faltou o
      // User-Agent, ver regraGamejoin). Sem 2 nao vem IP.
      if (!ip) {
        const motivo = { 22: "cheio", 12: "sem acesso" }[join?.status];
        throw new Error(motivo || join?.message || `status ${join?.status}`);
      }
      const [city, cc, country] = REGIOES[ip.split(".").slice(0, 3).join(".")] || [];
      // ServerClaimedTime = quando o servidor abriu. E dai que sai "mais novo".
      return { ip, city, cc, country, desde: join.joinScript.ServerClaimedTime || null };
    }),

  // Cidades conhecidas da tabela, sem repetir (pra escolher a regiao preferida).
  listaRegioes: () => {
    const vistas = new Map();
    for (const [city, cc, country] of Object.values(REGIOES))
      if (city && !vistas.has(city)) vistas.set(city, { city, cc, country });
    return [...vistas.values()].sort((a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city));
  },

  // So le o cache: a aba Servidores mostra direto o que ja foi consultado.
  regionCache: async ({ gameId }) => {
    const hit = (await ler(`region:${gameId}`))[`region:${gameId}`];
    return hit && Date.now() - hit.t < 12 * HORA ? hit.v : null;
  },

  config: () => ler(PADRAO),
  setConfig: async ({ patch }) => {
    await gravar(patch);
    return ler(PADRAO);
  },
  abrirConfig: () => chrome.runtime.openOptionsPage(),
  abrirOfertas: () => chrome.tabs.create({ url: chrome.runtime.getURL("src/ofertas/ofertas.html") }).then(() => true),
  // Contador do botao Ofertas: anuncios das ultimas 24h que pedem so itens
  // seus e em que voce nao perde.
  contaOfertas: async () => {
    const { pedemMeus } = await ler({ pedemMeus: {} });
    return Object.values(pedemMeus).filter((a) => a.tenhoTudo && a.pct >= 0 && Date.now() - a.t < 24 * HORA).length;
  },

  // Apaga o que e so cache (valores, inventarios, regioes, emblemas...).
  // Mantem tempo de jogo, avisos de preco e configuracoes.
  limparCache: async () => {
    const tudo = await ler(null);
    const chaves = Object.keys(tudo).filter((k) =>
      /^(rolimons|me$|inv:|region:|emb:|amg:|votos:|rev:|ana:|norm:|rank:)/.test(k)
    );
    await chrome.storage.local.remove(chaves);
    return chaves.length;
  },
  zerarTempo: () => gravar({ playtime: {} }),
  som: () => ler({ som: SOM_PADRAO }).then((o) => ({ ...SOM_PADRAO, ...o.som })),
  testarSom: ({ qual }) => tocarSom(qual === "concluida" ? "concluida" : "recebida"),

  drops: () => ler({ dropsList: [] }).then((o) => o.dropsList),
  checarDrops: () => checarDrops(false),

  playtime: () => ler({ playtime: {} }).then((o) => o.playtime),

  meuId: () => meuId(),
  emblemas: async ({ universeId }) =>
    cached(`emb:${await meuId()}:${universeId}`, 5 * MIN, () => emblemasDoJogo(universeId)),
  // fresco: pula o cache (contador ao vivo da pagina do jogo).
  votos: ({ universeId, fresco }) =>
    cached(`votos:${universeId}`, fresco ? 0 : 10 * MIN, async () => {
      const v = (await api.votos(universeId)).data?.[0];
      return v ? { up: v.upVotes, down: v.downVotes } : null;
    }),

  // RAP diario pro card de info do item: so os ultimos 90 pontos.
  analiseItem: (o) => analiseItem(o),
  analiseNormal: (o) => analiseNormal(o),
  // Grafico do card de info: preco medio de venda dos ultimos 90 dias.
  revenda: async ({ assetId, pacote }) => (await analiseItem({ id: assetId, pacote })).serie.map((p) => p.preco).filter((x) => x > 0),
  thumbs: ({ ids, pacote }) =>
    ids?.length
      ? (pacote ? api.thumbsPacotes(ids) : api.thumbs(ids)).then((r) => Object.fromEntries(r.data.map((x) => [x.targetId, x.imageUrl])))
      : {},
  amigosEmComum: ({ userId }) => amigosEmComum(userId),

  checarPrecos: () => checarPrecos(),

  // Menor preco de revenda agora, pro indicador de RAP da troca. Uma chamada
  // pra todos os itens que faltam; cada um fica 5 min em cache.
  // itens: [{ id, tipo: "Asset" | "Bundle" }] -> { "Asset:123": 900 | null }
  precosRevenda: async ({ itens }) => {
    const chave = (i) => `${i.tipo}:${i.id}`;
    const { precosRev } = await ler({ precosRev: {} });
    const out = {}, faltam = [];
    for (const i of itens || []) {
      const hit = precosRev[chave(i)];
      if (hit && Date.now() - hit.t < 5 * MIN) out[chave(i)] = hit.v;
      else faltam.push(i);
    }
    for (let k = 0; k < faltam.length; k += 100) {
      const r = await api.catalogo(faltam.slice(k, k + 100));
      for (const d of r.data || []) {
        const v = d.lowestResalePrice > 0 ? d.lowestResalePrice : null;
        out[`${d.itemType}:${d.id}`] = v;
        precosRev[`${d.itemType}:${d.id}`] = { t: Date.now(), v };
      }
    }
    // Poda o que venceu, pra nao crescer pra sempre.
    for (const [k, h] of Object.entries(precosRev)) if (Date.now() - h.t > 5 * MIN) delete precosRev[k];
    await gravar({ precosRev });
    return out;
  },
  checarTrocas: () => checarTrocas(),
  saldosDaLista: (o) => saldosDaLista(o),
  protegerEnviadas: () => protegerEnviadas(),
  protecao: () => ler({ protecao: PROTECAO_PADRAO }).then((o) => ({ ...PROTECAO_PADRAO, ...o.protecao })),
  historico: async () => {
    const { historico, historicoEm } = await ler({ historico: {}, historicoEm: 0 });
    return { ...resumoHistorico(historico), em: historicoEm };
  },
  atualizarHistorico: () => atualizarHistorico(),
  pedemMeus: async () => {
    const { pedemMeus, pedemEm, pedem } = await ler({ pedemMeus: {}, pedemEm: 0, pedem: PEDEM_PADRAO });
    return { anuncios: Object.values(pedemMeus).sort((a, b) => b.t - a.t), em: pedemEm, cfg: { ...PEDEM_PADRAO, ...pedem } };
  },
  buscarAnuncios: () => coletarAnuncios(true),
  recusas: () => ler({ recusa: RECUSA_PADRAO, recusadas: [] }),
  desejo: ({ id }) => ler({ desejos: {} }).then((o) => o.desejos[id] || null),
  desejos: () => ler({ desejos: {} }).then((o) => Object.values(o.desejos)),
  alternarDesejo: async ({ id, tipo, nome, thumb }) => {
    const { desejos } = await ler({ desejos: {} });
    if (desejos[id]) {
      delete desejos[id];
      await gravar({ desejos });
      return null;
    }
    const d = (await api.catalogo([{ id, tipo }])).data?.[0];
    desejos[id] = { id, tipo, nome: d?.name || nome, thumb, atual: d ? precoAtual(d) : null };
    await gravar({ desejos });
    return desejos[id];
  },

  envio: async () => {
    const o = { ...(await ler({ envioHist: {}, envioUltimo: 0 })), envio: await lerEnvio() };
    const base = await cached("rolimons3", 6 * HORA, () => api.rolimons());
    const semana = Object.values(o.envioHist).filter((t) => Date.now() - t < ENVIO_REPETE_DIAS * 24 * HORA).length;
    const eu = await api.podeTrocar().catch(() => null);
    return {
      envio: o.envio,
      conta: contaDoEnvio(o.envio, base),
      semana,
      espera: Math.max(0, Math.ceil(ENVIO_ESPERA_S - (Date.now() - o.envioUltimo) / 1000)),
      bloqueio: eu && eu.canTrade === false ? ELEGIBILIDADE[eu.mutualTradeEligibility] || "Sua conta não pode trocar agora." : null,
    };
  },
  salvarEnvio: ({ envio }) => gravar({ envio: { ...ENVIO_PADRAO, ...envio } }).then(() => true),
  meusTrocaveis: () => meusTrocaveis(),
  proximosDonos: (o) => proximosDonos(o),
  enviarUma: (o) => enviarUma(o),

  anuncio: async () => {
    const [o, conta, al] = await Promise.all([
      ler({ anuncio: ANUNCIO_PADRAO, anuncioLog: {} }),
      contaRolimons(),
      chrome.alarms.get("anuncio"),
    ]);
    const hoje = (o.anuncioLog.enviados || []).filter((t) => Date.now() - t < 24 * HORA).length;
    return { ...o, conta, hoje, max: ANUNCIO_MAX_DIA, minutos: ANUNCIO_MIN, tags: TAGS_ANUNCIO, proximo: al?.scheduledTime || null };
  },
  salvarAnuncio: async ({ anuncio }) => {
    const { anuncio: antes } = await ler({ anuncio: ANUNCIO_PADRAO });
    const novo = { ...ANUNCIO_PADRAO, ...anuncio, tags: (anuncio.tags || []).filter((t) => TAGS_ANUNCIO.includes(t)) };
    await gravar({ anuncio: novo });
    // Ligou agora: posta ja e agenda o resto. So mudou o anuncio: segue o relogio.
    // Erro que nao adianta repetir (sem verificacao, sem Premium) ja desliga aqui.
    if (novo.auto && !antes.auto) {
      await agendarAnuncio(true);
      await postarAnuncio(true).catch(() => {});
    } else if (!novo.auto && antes.auto) await agendarAnuncio(false);
    return novo;
  },
  postarAnuncio: () => postarAnuncio(false),
  inventarioAnuncio: () => inventarioParaAnuncio(),

  // Favoritos vem da Roblox, nao de uma lista nossa: o site ja tem o botao.
  favoritos: async () => {
    const me = await api.me();
    const r = await api.favoritos(me.id);
    return r.data || [];
  },
};

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  const fn = handlers[msg?.k];
  if (!fn) return false;
  Promise.resolve(fn(msg))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // mantem o canal aberto pra resposta async
});

// ------------------------------------------------ user-agent do gamejoin ----
// Sem cara de cliente Roblox, o join-game-instance responde status 12
// ("Unable to join Game 311") e nao manda IP. fetch nao deixa trocar o
// User-Agent, entao uma regra de rede troca. tabIds [-1] = so requests que nao
// vem de aba nenhuma, ou seja, do service worker: o Jogar do site nao e tocado.
async function regraGamejoin() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "User-Agent", operation: "set", value: "Roblox/WinInet" }],
        },
        condition: {
          urlFilter: "||gamejoin.roblox.com/v1/join-game-instance",
          tabIds: [chrome.tabs.TAB_ID_NONE],
        },
      },
    ],
  });
}
regraGamejoin();

// --------------------------------------------------------------- alarmes ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("tick", { periodInMinutes: 1 });
  chrome.alarms.create("drops", { periodInMinutes: 2 });
  chrome.alarms.create("precos", { periodInMinutes: 5 });
  chrome.alarms.create("trocas", { periodInMinutes: 1 });
  chrome.alarms.create("enviadas", { periodInMinutes: 5 });
  chrome.alarms.create("pedem", { periodInMinutes: 2 });
  chrome.alarms.create("historico", { periodInMinutes: 30 });
  checarDrops(true); // linha de base, sem avisar
  checarTrocas(true).catch(() => {});
  checarConcluidas().catch(() => {}); // primeira vez so grava a linha de base
  garantirAlarmeAnuncio();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("tick", { periodInMinutes: 1 });
  chrome.alarms.create("drops", { periodInMinutes: 2 });
  chrome.alarms.create("precos", { periodInMinutes: 5 });
  chrome.alarms.create("trocas", { periodInMinutes: 1 });
  chrome.alarms.create("enviadas", { periodInMinutes: 5 });
  chrome.alarms.create("pedem", { periodInMinutes: 2 });
  chrome.alarms.create("historico", { periodInMinutes: 30 });
  garantirAlarmeAnuncio();
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "drops") return checarDrops().catch(() => {});
  if (a.name === "precos") return checarPrecos().catch(() => {});
  if (a.name === "trocas") return Promise.all([checarTrocas().catch(() => {}), checarConcluidas().catch(() => {})]);
  if (a.name === "enviadas") return protegerEnviadas().catch(() => {});
  if (a.name === "pedem") return coletarAnuncios(false).catch(() => {});
  if (a.name === "historico") return ligado("historicoTrocas").then((on) => on && atualizarHistorico()).catch(() => {});
  if (a.name === "anuncio") return postarAnuncio(true).catch(() => {});
  if (a.name !== "tick") return;

  // A Roblox nao expoe "horas jogadas". O jeito honesto: perguntar de minuto
  // em minuto se voce esta em jogo e somar. Perde precisao, mas e o que da.
  try {
    if (!(await ligado("tempoJogo"))) return;
    const me = await api.me();
    const { userPresences } = await api.presence([me.id]);
    const p = userPresences?.[0];
    if (p?.userPresenceType !== 2 || !p.placeId) return; // 2 = InGame

    const { playtime } = await ler({ playtime: {} });
    const key = String(p.placeId);
    playtime[key] = playtime[key] || { name: p.lastLocation || key, secs: 0 };
    playtime[key].name = p.lastLocation || playtime[key].name;
    playtime[key].secs += 60;
    await gravar({ playtime });
  } catch (_) {
    // deslogado ou rate limit: ignora esse tick
  }
});
