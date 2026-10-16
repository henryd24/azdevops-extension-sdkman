// Aplica en GitHub Actions lo que un agente de Azure Pipelines haría con los logging commands de una tarea:
// `##vso[task.setvariable]` -> $GITHUB_ENV y `##vso[task.prependpath]` -> $GITHUB_PATH. Las variables isOutput se ignoran.
// Usage: node scripts/apply-vso.js <log-file>
const fs = require("node:fs");

const [file] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/apply-vso.js <log-file>");
  process.exit(2);
}
const envFile = process.env.GITHUB_ENV;
const pathFile = process.env.GITHUB_PATH;
if (!envFile || !pathFile) {
  console.error("GITHUB_ENV and GITHUB_PATH must be set (run this inside GitHub Actions)");
  process.exit(2);
}

let applied = 0;
for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  const variable = /^##vso\[task\.setvariable ([^\]]*)\](.*)$/.exec(line);
  if (variable) {
    const props = Object.fromEntries(variable[1].split(";").filter(Boolean).map((p) => p.split("=")));
    if (props.isOutput === "true") continue;
    fs.appendFileSync(envFile, `${props.variable}=${variable[2]}\n`);
    console.log(`env  ${props.variable}=${variable[2]}`);
    applied++;
    continue;
  }
  const prepend = /^##vso\[task\.prependpath\](.*)$/.exec(line);
  if (prepend) {
    fs.appendFileSync(pathFile, `${prepend[1]}\n`);
    console.log(`path ${prepend[1]}`);
    applied++;
  }
}
console.log(`${applied} logging command(s) applied`);
