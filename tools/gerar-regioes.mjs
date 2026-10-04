// Gera src/lib/regioes.js: faixa /24 da Roblox (128.116.0.0/17) -> cidade.
// Roda uma vez, na maquina de quem mantem a extensao:  node tools/gerar-regioes.mjs
//
// Por que tabela e nao consulta na hora: o ipinfo devolve "San Mateo" (sede da
// Roblox) pra quase todo IP deles. O ip-api acerta o datacenter, mas e http e
// tem limite de 45/min — entao consulto aqui, em lote, e embuto o resultado.
import { writeFileSync } from "node:fs";

const ips = Array.from({ length: 128 }, (_, i) => `128.116.${i}.1`);

// O lang=pt-BR do ip-api mistura portugues de Portugal e ingles. Acerto aqui.
const NOMES = {
  "Amesterdão": "Amsterdã",
  "Nova Iorque": "Nova York",
  "Cidade de Londres": "Londres",
  Warsaw: "Varsóvia",
  "Frankfurt am Main": "Frankfurt",
  Victoria: "Hong Kong",
  EUA: "Estados Unidos",
};
const nome = (s) => NOMES[s] || s;
const saida = {};

for (let i = 0; i < ips.length; i += 100) {
  const r = await fetch("http://ip-api.com/batch?fields=status,query,city,countryCode,country&lang=pt-BR", {
    method: "POST",
    body: JSON.stringify(ips.slice(i, i + 100)),
  });
  for (const x of await r.json()) {
    if (x.status !== "success") continue;
    const faixa = x.query.split(".").slice(0, 3).join(".");
    saida[faixa] = [nome(x.city), x.countryCode, nome(x.country)];
  }
}

const linhas = Object.entries(saida)
  .map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`)
  .join("\n");

writeFileSync(
  new URL("../src/lib/regioes.js", import.meta.url),
  `// GERADO por tools/gerar-regioes.mjs em ${new Date().toISOString().slice(0, 10)}. Nao editar na mao.
// Faixa /24 do IP do servidor -> [cidade, codigo do pais, pais].
export const REGIOES = {
${linhas}
};
`
);
console.log(`${Object.keys(saida).length} faixas gravadas`);
