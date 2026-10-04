// node tools/checar-globais.mjs
// Os content scripts do manifest rodam no MESMO escopo (mundo isolado, script
// classico). Dois `const X` com o mesmo nome em arquivos diferentes = o
// segundo arquivo nem carrega ("Identifier 'X' has already been declared"),
// sem erro visivel no site. Foi o que derrubou a calculadora de troca na
// 0.8.1 (DEMANDA em values.js e troca.js). Roda antes de publicar.
import fs from "fs";
const raiz = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(fs.readFileSync(raiz + "manifest.json", "utf8"));
const vistos = new Map();
let erro = 0;
for (const cs of manifest.content_scripts) {
  if (cs.world === "MAIN") continue;
  for (const f of cs.js) {
    for (const linha of fs.readFileSync(raiz + f, "utf8").split("\n")) {
      const m = linha.match(/^(?:const|let|var|class|(?:async\s+)?function\*?)\s+([A-Za-z_$][\w$]*)/);
      if (!m) continue;
      if (vistos.has(m[1])) {
        console.log(`DUPLICADO: ${m[1]} em ${vistos.get(m[1])} e ${f}`);
        erro = 1;
      } else vistos.set(m[1], f);
    }
  }
}
console.log(erro ? "falhou" : `ok: ${vistos.size} nomes globais, nenhum repetido`);
process.exit(erro);
