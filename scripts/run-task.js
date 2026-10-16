// Ejecuta el bundle de una tarea (tasks/<tarea>/index.js) como lo haría el agente:
// los inputs se pasan como variables INPUT_<NOMBRE>. Sirve en local y dentro de un
// paso `script` de Azure Pipelines (el agente interpreta los ##vso que imprime la tarea).
// Usage: node scripts/run-task.js <task> [input=value ...]
// Sale con código 1 si la tarea termina con result=Failed.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const [task, ...pairs] = process.argv.slice(2);
if (!task) {
  console.error("Usage: node scripts/run-task.js <task> [input=value ...]");
  process.exit(2);
}

const bundle = path.resolve(process.env.TASKS_DIR || path.join(__dirname, "..", "tasks"), task, "index.js");
if (!fs.existsSync(bundle)) {
  console.error(`${bundle} does not exist. Run first: npm run package:tasks`);
  process.exit(2);
}

const env = { ...process.env };
// El agente rellena los inputs no indicados con su defaultValue de task.json; aquí hacemos lo mismo.
const manifest = path.join(__dirname, "..", "src", "tasks", task, "task.json");
if (fs.existsSync(manifest)) {
  for (const input of JSON.parse(fs.readFileSync(manifest, "utf8")).inputs ?? []) {
    if (input.defaultValue !== undefined && input.defaultValue !== "") {
      // Expande $(Variable.Name) con las variables del entorno (SYSTEM_DEFAULTWORKINGDIRECTORY…); si no existe, cwd.
      const value = String(input.defaultValue).replace(/\$\(([^)]+)\)/g, (_, name) => {
        return process.env[name.toUpperCase().replace(/\./g, "_")] || process.cwd();
      });
      env[`INPUT_${input.name.toUpperCase().replace(/ /g, "_")}`] = value;
    }
  }
}
for (const pair of pairs) {
  const idx = pair.indexOf("=");
  if (idx <= 0) throw new Error(`Invalid input '${pair}'. Expected format: name=value`);
  // %0A o \n literal = salto de línea (inputs multilínea como `commands`). En cmd.exe %0A lo interpreta el shell, por eso existe \n.
  env[`INPUT_${pair.slice(0, idx).toUpperCase().replace(/ /g, "_")}`] = pair.slice(idx + 1).replace(/%0A|\\n/g, "\n");
}
// Fuera de un agente, la tool-lib necesita estas carpetas.
const base = path.join(os.tmpdir(), "sdkman-local-agent");
env.AGENT_TOOLSDIRECTORY ??= path.join(base, "tools");
env.AGENT_TEMPDIRECTORY ??= path.join(base, "temp");
env.AGENT_WORKFOLDER ??= path.join(base, "work");
for (const dir of [env.AGENT_TOOLSDIRECTORY, env.AGENT_TEMPDIRECTORY, env.AGENT_WORKFOLDER]) fs.mkdirSync(dir, { recursive: true });

let failed = false;
const child = spawn(process.execPath, [bundle], { env, stdio: ["inherit", "pipe", "inherit"] });
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (/##vso\[task\.complete [^\]]*result=Failed/.test(chunk.toString())) failed = true;
});
child.on("close", (code) => process.exit(failed ? 1 : code ?? 1));
