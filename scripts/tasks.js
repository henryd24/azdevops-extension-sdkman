// Ejecuta un script de npm (package, test, build…) en cada tarea de src/tasks.
// Usage: node scripts/tasks.js <script> [task]
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const [script, only] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/tasks.js <script> [task]");
  process.exit(1);
}

const root = path.join(__dirname, "..", "src", "tasks");
const tasks = fs
  .readdirSync(root)
  .filter((t) => fs.existsSync(path.join(root, t, "package.json")))
  .filter((t) => !only || t === only);

for (const task of tasks) {
  console.log(`\n▶ ${task}: npm run ${script}`);
  execSync(`npm run ${script}`, { cwd: path.join(root, task), stdio: "inherit" });
}
