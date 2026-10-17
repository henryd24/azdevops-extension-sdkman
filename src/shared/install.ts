import * as path from "node:path";
import { CandidateRequest } from "./candidates";

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
  /** Sin red: solo se aceptan versiones ya instaladas y con versión explícita. */
  offline?: boolean;
  run(args: string[]): Promise<{ exitCode: number; output?: string }>;
  exists(dir: string): boolean;
  defaultVersion(candidate: string): Promise<string>;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}

/**
 * Fallos de `sdk install` que no mejoran reintentando (texto verificado con SDKMAN 5.23): versión no disponible para la plataforma,
 * candidate inexistente y ruta local inválida. Todo lo demás (red, archivo corrupto) se trata como transitorio.
 */
const PERMANENT_FAILURE = /is not available\. Possible causes|is not a valid candidate|Invalid path!|Refusing to link/i;

export function isPermanentFailure(output: string | undefined): boolean {
  return PERMANENT_FAILURE.test(output ?? "");
}

const NETWORK_HINT = "Check access to api.sdkman.io and to the vendor's download host (or use the 'candidatesApi' input with a mirror).";

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
    if (deps.offline && !request.version) {
      throw new Error(`Offline mode needs an explicit version for '${request.candidate}' (the default version is resolved over the network).`);
    }
    if (request.localPath && !request.version) throw new Error(`'${request.candidate}' has a local path but no version: use '${request.candidate} <version> <path>'.`);
    const version = request.version ?? (await deps.defaultVersion(request.candidate));
    const home = path.join(deps.sdkmanDir, "candidates", request.candidate, version);
    let installedNow = false;

    if (deps.exists(home)) {
      deps.log(`${request.candidate} ${version} is already installed`);
    } else {
      if (deps.offline) {
        throw new Error(`${request.candidate} ${version} is not installed and offline mode is on. Restore SDKMAN_DIR (for example from a pipeline cache) or turn offline mode off.`);
      }
      if (request.localPath && !deps.exists(request.localPath)) {
        throw new Error(`The local path for ${request.candidate} ${version} does not exist: ${request.localPath}`);
      }
      installedNow = true;
      const args = ["install", request.candidate, version, ...(request.localPath ? [request.localPath] : [])];
      const label = `sdk ${args.join(" ")}`;
      for (let attempt = 0; ; attempt++) {
        const { exitCode, output } = await deps.run(args);
        if (exitCode === 0 && deps.exists(home)) break;
        if (isPermanentFailure(output)) {
          throw new Error(`'${label}' failed (exit code ${exitCode}) and retrying will not help: the version is not available for this platform, the candidate is invalid or the local path is not usable. Run 'sdk list ${request.candidate}' to see what is available.`);
        }
        if (attempt >= retryDelays.length) {
          throw new Error(`'${label}' failed (exit code ${exitCode}) after ${attempt + 1} attempt(s). ${NETWORK_HINT}`);
        }
        deps.log(`'${label}' failed (exit code ${exitCode}); retrying in ${retryDelays[attempt] / 1000}s`);
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
