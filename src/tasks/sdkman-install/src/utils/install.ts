import * as path from "node:path";
import { CandidateRequest } from "../../../../shared/candidates";

export interface InstalledCandidate {
  candidate: string;
  version: string;
  /** Carpeta de la versión (candidates/<c>/<v>) en formato nativo. */
  home: string;
  installedNow: boolean;
  /** La primera versión pedida de cada candidate es la activa. */
  active: boolean;
}

/** Dependencias externas de la instalación; en los tests se sustituyen. */
export interface InstallDeps {
  sdkmanDir: string;
  run(args: string[]): Promise<{ exitCode: number }>;
  exists(dir: string): boolean;
  defaultVersion(candidate: string): Promise<string>;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}

/** Pausas entre reintentos de `sdk install` (descargas de vendors y api.sdkman.io fallan de forma transitoria). */
export const RETRY_DELAYS_MS = [5_000, 15_000];

/**
 * Instala cada candidate pedido (idempotente: si la carpeta de la versión existe, no se descarga).
 * Sin versión se usa la que SDKMAN marca como default. Si un candidate se pide con varias versiones,
 * al final se ejecuta `sdk default` con la primera, porque `sdk install` mueve `current` a la última instalada.
 */
export async function installCandidates(requests: CandidateRequest[], deps: InstallDeps, retryDelays: number[] = RETRY_DELAYS_MS): Promise<InstalledCandidate[]> {
  const installed: InstalledCandidate[] = [];
  const activeSeen = new Set<string>();

  for (const request of requests) {
    const version = request.version ?? (await deps.defaultVersion(request.candidate));
    const home = path.join(deps.sdkmanDir, "candidates", request.candidate, version);
    let installedNow = false;

    if (deps.exists(home)) {
      deps.log(`${request.candidate} ${version} is already installed`);
    } else {
      installedNow = true;
      for (let attempt = 0; ; attempt++) {
        const { exitCode } = await deps.run(["install", request.candidate, version]);
        if (exitCode === 0 && deps.exists(home)) break;
        if (attempt >= retryDelays.length) {
          throw new Error(`'sdk install ${request.candidate} ${version}' failed (exit code ${exitCode}) after ${attempt + 1} attempt(s)`);
        }
        deps.log(`'sdk install ${request.candidate} ${version}' failed (exit code ${exitCode}); retrying in ${retryDelays[attempt] / 1000}s`);
        await deps.sleep(retryDelays[attempt]);
      }
    }

    const active = !activeSeen.has(request.candidate);
    activeSeen.add(request.candidate);
    installed.push({ candidate: request.candidate, version, home, installedNow, active });
  }

  const perCandidate = new Map<string, number>();
  for (const i of installed) perCandidate.set(i.candidate, (perCandidate.get(i.candidate) ?? 0) + 1);
  for (const i of installed.filter((x) => x.active && (perCandidate.get(x.candidate) ?? 0) > 1)) {
    await deps.run(["default", i.candidate, i.version]);
  }
  return installed;
}
