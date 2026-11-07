// Garante que bun.lock (usado pelo Lovable) e package-lock.json (usado pelo CI)
// declaram as mesmas dependências do package.json. Sem isso, os dois builds
// resolveriam versões diferentes sem ninguém perceber.
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const npmRoot = JSON.parse(fs.readFileSync("package-lock.json", "utf8")).packages[""];
// bun.lock é JSONC: aceita vírgula sobrando.
const bunText = fs.readFileSync("bun.lock", "utf8").replace(/,(\s*[}\]])/g, "$1");
const bunRoot = JSON.parse(bunText).workspaces[""];

const specs = (o) => ({ ...(o.dependencies ?? {}), ...(o.devDependencies ?? {}) });
const expected = specs(pkg);

let failed = false;
for (const [name, root] of [
  ["package-lock.json", npmRoot],
  ["bun.lock", bunRoot],
]) {
  const actual = specs(root);
  const problems = [];
  for (const dep of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if (expected[dep] !== actual[dep]) {
      problems.push(
        `  ${dep}: package.json=${expected[dep] ?? "—"} | ${name}=${actual[dep] ?? "—"}`,
      );
    }
  }
  if (problems.length) {
    failed = true;
    console.error(`${name} está fora de sincronia com o package.json:\n${problems.join("\n")}`);
  } else {
    console.log(`${name}: em sincronia (${Object.keys(expected).length} dependências)`);
  }
}
if (failed) {
  console.error("\nAtualize os dois lockfiles (veja a seção Deploy do README).");
  process.exit(1);
}
