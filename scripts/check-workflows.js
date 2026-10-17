// Ejecuta las reglas de scripts/workflow-lint.js sobre los workflows y el pipeline de Azure del repositorio.
// Usage: node scripts/check-workflows.js   (sale con código 1 si hay problemas)
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const { lintAzurePipeline, lintWorkflow } = require("./workflow-lint");

const root = path.join(__dirname, "..");
const problems = [];

const dir = path.join(root, ".github", "workflows");
for (const name of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
  problems.push(...lintWorkflow(yaml.load(fs.readFileSync(path.join(dir, name), "utf8")), `.github/workflows/${name}`));
}
const azure = path.join(root, "azure-pipelines.yml");
if (fs.existsSync(azure)) problems.push(...lintAzurePipeline(yaml.load(fs.readFileSync(azure, "utf8")), "azure-pipelines.yml"));

if (problems.length > 0) {
  console.error(`Workflow security check failed (${problems.length}):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("Workflow security check passed");
