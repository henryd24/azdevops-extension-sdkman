import * as fs from "node:fs";
import * as path from "node:path";
import * as tl from "azure-pipelines-task-lib";
import { homeVariableName, CandidateRequest } from "./candidates";
import { InstalledCandidate, installCandidates } from "./install";
import { formatTable, group, mdTable, publishSummary, section } from "./output";
import { fetchDefaultVersion, runSdk, SdkmanInfo } from "./sdkman";

export interface ActivateOptions {
  setHomeVariables: boolean;
  addToPath: boolean;
  /** Nombre del resumen markdown y de la tarea en el título (SdkmanInstall, SdkmanEnv). */
  taskName: string;
}

/** Exporta <CANDIDATE>_HOME, el PATH y SDKMAN_<CANDIDATE>_VERSION de la versión activa de cada candidate. */
export function exportActive(installed: InstalledCandidate[], setHomeVariables: boolean, addToPath: boolean): void {
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

function report(taskName: string, installed: InstalledCandidate[]): void {
  const headers = ["", "Candidate", "Version", "Source", "Home"];
  const rows = installed.map((i) => [i.active ? "active" : "", i.candidate, i.version, i.installedNow ? "installed now" : "already installed", i.home]);
  section("SDKMAN candidates ready");
  console.log(formatTable(headers, rows));
  publishSummary(taskName.toLowerCase(), `## ${taskName}\n\n✔ ${installed.length} candidate(s) ready\n\n${mdTable(headers, rows)}`);
}

/**
 * Flujo común de SdkmanInstall y SdkmanEnv: instala, exporta el entorno, informa y publica los outputs
 * (`sdkmanDir`, `sdkmanInstalled`). Devuelve lo instalado.
 */
export async function installAndActivate(sdk: SdkmanInfo, requests: CandidateRequest[], options: ActivateOptions): Promise<InstalledCandidate[]> {
  const installed = await group("Install candidates", () =>
    installCandidates(requests, {
      sdkmanDir: sdk.dir,
      offline: sdk.offline,
      run: (args) => runSdk(sdk, args, { failOnError: false }),
      exists: fs.existsSync,
      defaultVersion: (candidate) => fetchDefaultVersion(sdk.candidatesApi, candidate),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (message) => console.log(message),
    }),
  );
  exportActive(installed, options.setHomeVariables, options.addToPath);
  report(options.taskName, installed);
  tl.setVariable("sdkmanDir", sdk.dir, false, true);
  tl.setVariable("sdkmanInstalled", JSON.stringify(installed), false, true);
  return installed;
}
