// Reglas de seguridad para los workflows de GitHub Actions y el pipeline de Azure de este repositorio.
// Se ejecutan en `npm test` (scripts/check-workflows.js) para que no dependan de que alguien las recuerde.
//
// Modelo de amenaza: cualquiera puede hacer fork y abrir un PR. Su código (incluido package.json, scripts de npm y los
// propios workflows del PR) corre en nuestros runners, así que ningún flujo disparado por un PR debe tener acceso a
// secretos ni a permisos de escritura, y ningún dato controlado por el autor del PR debe llegar interpolado a un shell.

const SAFE_RUN_EXPRESSION = /^(matrix|runner|strategy)\.[\w.-]+$/;
const FORBIDDEN_TRIGGERS = ["pull_request_target", "workflow_run"];

function triggersOf(doc) {
  // js-yaml 4 mantiene `on` como cadena, pero por si acaso se acepta también la clave booleana de YAML 1.1.
  const on = doc.on ?? doc[true];
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on;
  return on ? Object.keys(on) : [];
}

function hasWrite(permissions) {
  if (permissions === undefined) return false;
  if (typeof permissions === "string") return permissions === "write-all";
  return Object.values(permissions).some((v) => v === "write");
}

/** Devuelve la lista de problemas (vacía = el workflow cumple las reglas). */
function lintWorkflow(doc, file) {
  const problems = [];
  const fail = (message) => problems.push(`${file}: ${message}`);
  const triggers = triggersOf(doc);
  const fromPullRequest = triggers.includes("pull_request");

  for (const t of FORBIDDEN_TRIGGERS) {
    if (triggers.includes(t)) fail(`uses the '${t}' trigger, which runs with a privileged token and secrets on untrusted input`);
  }

  if (doc.permissions === undefined) fail("has no top-level 'permissions' (the default token is too broad)");
  else if (hasWrite(doc.permissions)) fail("grants write permissions at the top level: declare them on the job that needs them");

  if (fromPullRequest && JSON.stringify(doc).includes("secrets.")) fail("is triggered by pull_request but references secrets");

  for (const [jobName, job] of Object.entries(doc.jobs ?? {})) {
    const where = `job '${jobName}'`;
    if (typeof job["timeout-minutes"] !== "number") fail(`${where} has no 'timeout-minutes'`);
    if (fromPullRequest && hasWrite(job.permissions)) fail(`${where} has write permissions in a workflow triggered by pull_request`);

    (job.steps ?? []).forEach((step, i) => {
      const label = `${where}, step ${i + 1}${step.name ? ` ('${step.name}')` : ""}`;
      if (step.uses) {
        const pinned = /@[0-9a-f]{40}$/.test(step.uses);
        if (!step.uses.startsWith("actions/") && !pinned) fail(`${label} uses '${step.uses}': third-party actions must be pinned to a commit SHA`);
        if (step.uses.startsWith("actions/checkout") && step.with?.["persist-credentials"] !== false) {
          fail(`${label} checks out without 'persist-credentials: false' (the token would stay in .git/config for later steps)`);
        }
      }
      if (typeof step.run === "string") {
        for (const match of step.run.matchAll(/\$\{\{([^}]*)\}\}/g)) {
          const expression = match[1].trim();
          if (!SAFE_RUN_EXPRESSION.test(expression)) {
            fail(`${label} interpolates '\${{ ${expression} }}' inside a run script: pass it through 'env:' and use a shell variable (script injection)`);
          }
        }
      }
    });
  }
  return problems;
}

function* azureSteps(node) {
  if (Array.isArray(node)) for (const item of node) yield* azureSteps(item);
  else if (node && typeof node === "object") {
    if (typeof node.condition === "string") yield node;
    for (const value of Object.values(node)) yield* azureSteps(value);
  }
}

/** Reglas del pipeline de Azure (azure-pipelines.yml). */
function lintAzurePipeline(doc, file) {
  const problems = [];
  const fail = (message) => problems.push(`${file}: ${message}`);
  if (doc.pr !== "none") {
    fail("must declare 'pr: none': an Azure PR build runs the YAML of the pull request itself, so a fork could change what runs");
  }
  for (const node of azureSteps(doc)) {
    // Una condición propia sustituye al succeeded() por defecto: sin él, el paso corre aunque algo anterior haya fallado.
    if (!/succeeded|always\(\)|failed\(\)/.test(node.condition)) {
      fail(`condition '${node.condition}' replaces the default succeeded(): use and(succeeded(), ...)`);
    }
  }
  return problems;
}

module.exports = { lintWorkflow, lintAzurePipeline };
