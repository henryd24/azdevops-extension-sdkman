import * as fs from "node:fs";
import * as path from "node:path";
import * as tl from "azure-pipelines-task-lib";
import { ensureSdkman, fetchDefaultVersion, formatTable, group, homeVariableName, mdTable, publishSummary, runSdk, section } from "../../../shared";
import { getInputs } from "./utils/inputs";
import { InstalledCandidate, installCandidates } from "./utils/install";

/** Exporta <CANDIDATE>_HOME, el PATH y SDKMAN_<CANDIDATE>_VERSION de la versión activa de cada candidate. */
function exportActive(installed: InstalledCandidate[], setHomeVariables: boolean, addToPath: boolean): void {
  for (const item of installed.filter((i) => i.active)) {
    const homeVar = homeVariableName(item.candidate);
    if (setHomeVariables) {
      const previous = process.env[homeVar];
      if (previous && path.resolve(previous) !== path.resolve(item.home)) {
        tl.warning(`${homeVar} was '${previous}' and is now '${item.home}' for the following steps`);
      }
      tl.setVariable(homeVar, item.home);
    }
    tl.setVariable(`SDKMAN_${item.candidate.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_VERSION`, item.version);
    const bin = path.join(item.home, "bin");
    if (addToPath && fs.existsSync(bin)) tl.prependPath(bin);
  }
}

function report(installed: InstalledCandidate[]): void {
  const headers = ["", "Candidate", "Version", "Source", "Home"];
  const rows = installed.map((i) => [i.active ? "active" : "", i.candidate, i.version, i.installedNow ? "installed now" : "already installed", i.home]);
  section("SDKMAN candidates ready");
  console.log(formatTable(headers, rows));
  publishSummary("sdkman-install", `## SdkmanInstall\n\n✔ ${installed.length} candidate(s) ready\n\n${mdTable(headers, rows)}`);
}

/**
 * Tarea "SdkmanInstall": instala candidates con SDKMAN y exporta su entorno a los pasos siguientes.
 * Outputs: sdkmanDir, sdkmanInstalled (JSON).
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    console.log(`Candidates: ${inputs.candidates.map((c) => `${c.candidate} ${c.version ?? "(default)"}`).join(", ")}`);

    const sdk = await ensureSdkman({
      dir: inputs.sdkmanDir,
      autoInstall: inputs.autoInstallSdkman,
      installUrl: inputs.installUrl,
      candidatesApi: inputs.candidatesApi,
      bashPath: inputs.bashPath,
    });

    const installed = await group("Install candidates", () =>
      installCandidates(inputs.candidates, {
        sdkmanDir: sdk.dir,
        run: (args) => runSdk(sdk, args, { failOnError: false }),
        exists: fs.existsSync,
        defaultVersion: (candidate) => fetchDefaultVersion(sdk.candidatesApi, candidate),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        log: (message) => console.log(message),
      }),
    );

    exportActive(installed, inputs.setHomeVariables, inputs.addToPath);
    report(installed);

    tl.setVariable("sdkmanDir", sdk.dir, false, true);
    tl.setVariable("sdkmanInstalled", JSON.stringify(installed), false, true);
    tl.setResult(tl.TaskResult.Succeeded, installed.map((i) => `${i.candidate} ${i.version}`).join(", ") + " ready");
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
  }
}

run();
