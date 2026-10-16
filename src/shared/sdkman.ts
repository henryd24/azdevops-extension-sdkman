import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as tl from "azure-pipelines-task-lib";
import { IExecOptions, IExecSyncOptions } from "azure-pipelines-task-lib/toolrunner";
import * as tool from "azure-pipelines-tool-lib/tool";
import {
  bashCandidates,
  detectOs,
  isBashSupported,
  missingToolsMessage,
  noBashMessage,
  parseBashMajor,
  REQUIRED_TOOLS,
  SdkmanOs,
} from "./platform";

/**
 * Contrato común de las tareas para localizar / preparar / ejecutar SDKMAN.
 * `sdk` es una función de bash, así que cada invocación va en `bash -c 'source init && sdk "$@"'`
 * con los argumentos como parámetros posicionales (sin interpolación: no hay inyección).
 */

export const DEFAULT_CANDIDATES_API = "https://api.sdkman.io/2";

export interface EnsureSdkmanOptions {
  /** SDKMAN_DIR pedido por el usuario (vacío = automático). */
  dir?: string;
  /** Instala SDKMAN si no se encuentra. */
  autoInstall: boolean;
  installUrl: string;
  candidatesApi?: string;
  bashPath?: string;
}

export interface SdkmanInfo {
  /** SDKMAN_DIR en formato nativo del agente. */
  dir: string;
  /** bash utilizable (ruta absoluta). */
  bash: string;
  os: SdkmanOs;
  /** Versión del CLI de SDKMAN (archivo var/version). */
  version: string;
  /** true si SDKMAN ya estaba instalado (no se descargó). */
  cacheHit: boolean;
  candidatesApi: string;
}

export interface RunSdkOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Falla si el comando devuelve exit code != 0 (default true). */
  failOnError?: boolean;
  /** No mostrar la salida en vivo (se devuelve igualmente en stdout). */
  silent?: boolean;
}

export interface RunSdkResult {
  exitCode: number;
  stdout: string;
}

/**
 * Script de `bash -c`. Los argumentos de `sdk` llegan como "$@", nunca dentro del string.
 * `exec </dev/null` cierra stdin (task-lib no lo cierra): cualquier pregunta de SDKMAN (`read`) recibe EOF y toma su valor
 * por defecto en vez de bloquear el paso. No se pueden forzar `sdkman_auto_answer`/colores desde aquí: `sdk()` vuelve a
 * cargar `etc/config` en cada llamada, y ese archivo es del usuario (en self-hosted puede ser `~/.sdkman`), así que no se toca.
 */
const CHECK_INIT = '[ -s "$SDKMAN_DIR/bin/sdkman-init.sh" ] || { echo "SDKMAN is not installed in $SDKMAN_DIR" >&2; exit 97; }; ';
const SOURCE_INIT = 'source "$SDKMAN_DIR/bin/sdkman-init.sh" >/dev/null 2>&1; ';

export const SDK_SCRIPT = `exec </dev/null; ${CHECK_INIT}${SOURCE_INIT}sdk "$@"`;

/**
 * Modo shell: `$1` es el comando del usuario (aquí la ejecución de texto libre es el propósito; los args de `sdk` nunca pasan por aquí).
 * `sdkman-init.sh` reescribe el entorno (antepone `candidates/*\/current/bin` al PATH y fija `JAVA_HOME=.../java/current`). Se guarda el
 * entorno exportado antes del `source` y se restaura después, para que el comando vea lo mismo que los pasos `script` siguientes
 * (la versión activa que exportó SdkmanInstall/SdkmanEnv, no `current`) pero con la función `sdk` disponible.
 */
export const SHELL_SCRIPT = `exec </dev/null; __sdkman_env="$(export -p)"; ${CHECK_INIT}${SOURCE_INIT}eval "$__sdkman_env" 2>/dev/null; unset __sdkman_env; eval "$1"`;

/** Ejecuta el instalador oficial con stdin cerrado. */
export const INSTALLER_SCRIPT = 'exec </dev/null; exec bash "$1"';

/** Argumentos de bash para ejecutar un comando de texto libre con SDKMAN cargado. */
export function shellBashArgs(command: string): string[] {
  return ["--noprofile", "--norc", "-c", SHELL_SCRIPT, "sdkman-shell", command];
}

/** Argumentos de bash para ejecutar `sdk <args>`. */
export function sdkBashArgs(args: string[]): string[] {
  return ["--noprofile", "--norc", "-c", SDK_SCRIPT, "sdk", ...args];
}

/** Entorno de SDKMAN (`bashDir` = SDKMAN_DIR en formato POSIX). */
export function sdkEnvironment(bashDir: string, candidatesApi?: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = { SDKMAN_DIR: bashDir };
  if (candidatesApi) env.SDKMAN_CANDIDATES_API = candidatesApi;
  return { ...env, ...extra };
}

/** Carpeta de una versión instalada: <SDKMAN_DIR>/candidates/<candidate>/<version>. */
export function candidateHome(sdkmanDir: string, candidate: string, version: string): string {
  return path.join(sdkmanDir, "candidates", candidate, version);
}

export function initScriptPath(sdkmanDir: string): string {
  return path.join(sdkmanDir, "bin", "sdkman-init.sh");
}

/**
 * Carpeta de SDKMAN: input > SDKMAN_DIR del entorno (p. ej. fijado por SdkmanSetup) >
 * ~/.sdkman si ya está instalado > <Agent.ToolsDirectory>/sdkman.
 */
export function resolveSdkmanDir(
  requested: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = fs.existsSync,
  home: string = os.homedir(),
): string {
  if (requested) return path.resolve(requested);
  if (env.SDKMAN_DIR) return env.SDKMAN_DIR;
  const homeDir = path.join(home, ".sdkman");
  if (exists(initScriptPath(homeDir))) return homeDir;
  return path.join(env.AGENT_TOOLSDIRECTORY || home, "sdkman");
}

/** Versión del CLI según el archivo `var/version` que escribe el instalador. */
export function readSdkmanVersion(sdkmanDir: string): string {
  try {
    return fs.readFileSync(path.join(sdkmanDir, "var", "version"), "utf8").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g;
/** Segmentos de la barra de progreso de curl (`#=#=#`, `##O=#  #`, `100.0%`), que SDKMAN imprime aunque no haya TTY. */
const PROGRESS_RE = /^[\s#=O-]*(\d+(\.\d+)?%)?\s*$/;

/**
 * Limpia la salida de `sdk` para el log del agente: quita códigos de color (SDKMAN los fija en el `source`,
 * antes de que podamos desactivarlos) y la barra de progreso de curl. Conserva el resto tal cual.
 */
export function cleanSdkOutput(text: string): string {
  return text
    .replace(ANSI_RE, "")
    .split("\n")
    .flatMap((line) => {
      if (line === "") return [line];
      const kept = line.split("\r").filter((segment) => !PROGRESS_RE.test(segment)).join("\r");
      return kept === "" ? [] : [kept];
    })
    .join("\n");
}

/**
 * Aplica `cleanSdkOutput` por líneas completas (los trozos de stdout se parten a mitad de línea).
 * `push` recibe datos; `flush` vacía el resto al terminar.
 */
export function createOutputCleaner(write: (text: string) => void): { push(data: string): void; flush(): void } {
  let pending = "";
  const emit = (text: string) => {
    const clean = cleanSdkOutput(text);
    if (clean.trim()) write(clean.endsWith("\n") ? clean : `${clean}\n`);
  };
  return {
    push(data) {
      pending += data;
      const end = pending.lastIndexOf("\n");
      if (end < 0) return;
      emit(pending.slice(0, end + 1));
      pending = pending.slice(end + 1);
    },
    flush() {
      if (pending) emit(pending);
      pending = "";
    },
  };
}

/** Versión por defecto: "3.10.0\n" -> "3.10.0". */
export function parseDefaultVersion(body: string): string {
  const version = body.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(version)) throw new Error(`Unexpected default version response: '${version.slice(0, 80)}'`);
  return version;
}

function bashMajor(bash: string): number | undefined {
  const result = tl.tool(bash).arg(["-c", "echo ${BASH_VERSINFO[0]}"]).execSync({ silent: true } as IExecSyncOptions);
  return result.code === 0 ? parseBashMajor(result.stdout) : undefined;
}

/** Localiza un bash >= 4 (macOS: Homebrew primero; Windows: Git Bash, nunca el de WSL). */
export function findBash(osName: SdkmanOs, explicit?: string): string {
  const candidates = explicit ? [explicit] : bashCandidates(osName);
  let found: { path: string; major?: number } | undefined;
  for (const candidate of candidates) {
    const resolved = candidate === "PATH" ? tl.which("bash", false) : fs.existsSync(candidate) ? candidate : "";
    if (!resolved) continue;
    const major = bashMajor(resolved);
    if (isBashSupported(major)) return resolved;
    found ??= { path: resolved, major };
  }
  throw new Error(noBashMessage(osName, found));
}

/** Convierte una ruta nativa a POSIX (solo Windows / Git Bash); en el resto es la identidad. */
function toBashPath(bash: string, osName: SdkmanOs, p: string): string {
  if (osName !== "win32") return p;
  const result = tl.tool(bash).arg(["-c", 'cygpath -u "$1"', "_", p]).execSync({ silent: true } as IExecSyncOptions);
  if (result.code !== 0) throw new Error(`Could not convert '${p}' with cygpath: ${result.stderr}`);
  return result.stdout.trim();
}

function missingTools(bash: string): string[] {
  const script = `for t in ${REQUIRED_TOOLS.join(" ")}; do command -v "$t" >/dev/null 2>&1 || echo "$t"; done`;
  const result = tl.tool(bash).arg(["-c", script]).execSync({ silent: true } as IExecSyncOptions);
  return result.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

async function installSdkman(info: { bash: string; os: SdkmanOs; dir: string }, options: EnsureSdkmanOptions): Promise<void> {
  const missing = missingTools(info.bash);
  if (missing.length > 0) throw new Error(missingToolsMessage(missing, info.os));

  console.log(`Downloading the SDKMAN installer from ${options.installUrl}`);
  const script = await tool.downloadTool(options.installUrl);
  const bashDir = toBashPath(info.bash, info.os, info.dir);
  fs.mkdirSync(info.dir, { recursive: true });

  const runner = tl.tool(info.bash).arg(["--noprofile", "--norc", "-c", INSTALLER_SCRIPT, "sdkman-installer", toBashPath(info.bash, info.os, script)]);
  let output = "";
  const collect = (data: Buffer) => {
    output += data.toString();
  };
  runner.on("stdout", collect);
  runner.on("stderr", collect);
  const exitCode = await runner.exec({
    env: { ...process.env, ...sdkEnvironment(bashDir, options.candidatesApi) } as { [key: string]: string },
    silent: true,
    ignoreReturnCode: true,
  } as IExecOptions);
  if (exitCode !== 0) {
    console.log(output);
    throw new Error(`The SDKMAN installer failed with exit code ${exitCode}`);
  }
  if (!fs.existsSync(initScriptPath(info.dir))) {
    console.log(output);
    throw new Error(`The SDKMAN installer finished but ${initScriptPath(info.dir)} does not exist`);
  }
}

/**
 * Orden de resolución:
 *  1. SDKMAN ya instalado en la carpeta resuelta (input, SDKMAN_DIR, ~/.sdkman)
 *  2. requisitos (bash >= 4, curl, zip, unzip) -> instalador oficial con rcupdate=false
 * Deja SDKMAN_DIR como variable para los pasos siguientes (permite `source $SDKMAN_DIR/bin/sdkman-init.sh`).
 */
export async function ensureSdkman(options: EnsureSdkmanOptions): Promise<SdkmanInfo> {
  const osName = detectOs();
  const bash = findBash(osName, options.bashPath);
  const dir = resolveSdkmanDir(options.dir);
  const candidatesApi = options.candidatesApi || DEFAULT_CANDIDATES_API;

  let cacheHit = true;
  if (!fs.existsSync(initScriptPath(dir))) {
    if (!options.autoInstall) {
      throw new Error(
        `SDKMAN was not found in ${dir} and automatic installation is disabled. Add a SdkmanSetup step or enable 'Install SDKMAN if missing'.`,
      );
    }
    cacheHit = false;
    await installSdkman({ bash, os: osName, dir }, options);
  }

  tl.setVariable("SDKMAN_DIR", dir);
  const version = readSdkmanVersion(dir);
  console.log(`Using SDKMAN ${version} (${dir})${cacheHit ? "" : " - installed now"}`);
  return { dir, bash, os: osName, version, cacheHit, candidatesApi };
}

/** Ejecuta `sdk <args>` con SDKMAN cargado. La salida se muestra en vivo (limpia) y se devuelve tal cual en `stdout`. */
export async function runSdk(sdk: SdkmanInfo, args: string[], options: RunSdkOptions = {}): Promise<RunSdkResult> {
  return runBash(sdk, sdkBashArgs(args), `sdk ${args.join(" ")}`, options);
}

/** Ejecuta un comando de texto libre (`mvn -v`, `java -version`...) con la función `sdk` cargada y el entorno del paso. */
export async function runShell(sdk: SdkmanInfo, command: string, options: RunSdkOptions = {}): Promise<RunSdkResult> {
  return runBash(sdk, shellBashArgs(command), command, options);
}

async function runBash(sdk: SdkmanInfo, bashArgs: string[], label: string, options: RunSdkOptions): Promise<RunSdkResult> {
  const runner = tl.tool(sdk.bash).arg(bashArgs);
  let stdout = "";
  const cleaner = createOutputCleaner((text) => {
    if (!options.silent) process.stdout.write(text);
  });
  runner.on("stdout", (data: Buffer) => {
    stdout += data.toString();
    cleaner.push(data.toString());
  });
  runner.on("stderr", (data: Buffer) => cleaner.push(data.toString()));
  const env = sdkEnvironment(toBashPath(sdk.bash, sdk.os, sdk.dir), sdk.candidatesApi, options.env);
  const exitCode = await runner.exec({
    cwd: options.cwd,
    env: { ...process.env, ...env } as { [key: string]: string },
    silent: true, // la salida se muestra ya limpia (cleanSdkOutput)
    ignoreReturnCode: true,
  } as IExecOptions);
  cleaner.flush();
  if (exitCode !== 0 && options.failOnError !== false) {
    throw new Error(`'${label}' failed with exit code ${exitCode}`);
  }
  return { exitCode, stdout };
}

/** Versión por defecto de un candidate según la API de SDKMAN (o el mirror configurado). */
export async function fetchDefaultVersion(api: string, candidate: string): Promise<string> {
  const file = await tool.downloadTool(`${api.replace(/\/+$/, "")}/candidates/default/${encodeURIComponent(candidate)}`);
  return parseDefaultVersion(fs.readFileSync(file, "utf8"));
}
