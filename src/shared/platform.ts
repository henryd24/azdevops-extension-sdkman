import * as path from "node:path";

/**
 * Plataforma y requisitos de SDKMAN. Funciones puras: la búsqueda real de binarios vive en sdkman.ts.
 */

export type SdkmanOs = "linux" | "darwin" | "win32";

/** Bash mínimo que exige el instalador de SDKMAN. */
export const MIN_BASH_MAJOR = 4;

/** Herramientas que el instalador y `sdk install` necesitan además de bash. */
export const REQUIRED_TOOLS = ["curl", "zip", "unzip"] as const;

export function detectOs(platform: string = process.platform): SdkmanOs {
  if (platform === "linux" || platform === "darwin" || platform === "win32") return platform;
  throw new Error(`SDKMAN is not supported on '${platform}'. Use a Linux, macOS or Windows (Git Bash) agent.`);
}

/**
 * Rutas donde buscar un bash válido, en orden de preferencia. `"PATH"` significa "el bash del PATH".
 * En Windows nunca se usa el PATH: `bash.exe` de System32 es WSL, no Git Bash.
 */
export function bashCandidates(osName: SdkmanOs, env: NodeJS.ProcessEnv = process.env): string[] {
  if (osName === "win32") {
    const roots = [env["ProgramFiles"], env["ProgramW6432"], env["ProgramFiles(x86)"], env["LOCALAPPDATA"] && path.win32.join(env["LOCALAPPDATA"], "Programs")];
    return [...new Set(roots.filter((r): r is string => !!r))].map((root) => path.win32.join(root, "Git", "bin", "bash.exe"));
  }
  // Homebrew primero: /bin/bash en macOS es 3.2, demasiado antiguo para SDKMAN.
  if (osName === "darwin") return ["/opt/homebrew/bin/bash", "/usr/local/bin/bash", "PATH"];
  return ["PATH"];
}

/** "5" -> 5; basura -> undefined. Salida de `echo ${BASH_VERSINFO[0]}`. */
export function parseBashMajor(output: string): number | undefined {
  const match = /^\s*(\d+)\s*$/m.exec(output);
  return match ? Number(match[1]) : undefined;
}

export function isBashSupported(major: number | undefined): boolean {
  return major !== undefined && major >= MIN_BASH_MAJOR;
}

/** Mensaje accionable cuando faltan herramientas en el agente. */
export function missingToolsMessage(missing: string[], osName: SdkmanOs): string {
  const list = missing.join(", ");
  const hints: Record<SdkmanOs, string> = {
    linux:
      "Install them on the agent, e.g. `apt-get install -y curl zip unzip` (Debian/Ubuntu), " +
      "`apk add bash curl zip unzip` (Alpine) or `dnf install -y curl zip unzip` (Fedora/RHEL).",
    darwin: "Install them with Homebrew, e.g. `brew install curl zip unzip`.",
    win32:
      "Git Bash does not ship `zip`/`unzip`: install them (for example from MSYS2 or GnuWin32) into Git's `usr\\bin` or `mingw64\\bin` folder " +
      "so they are on the PATH of Git Bash. The Azure Pipelines agent also needs `unzip` support to unpack tools.",
  };
  return `SDKMAN needs ${list} on the agent. ${hints[osName]}`;
}

/** Mensaje cuando no hay un bash utilizable. */
export function noBashMessage(osName: SdkmanOs, found?: { path: string; major?: number }): string {
  const seen = found ? ` Found ${found.path}${found.major !== undefined ? ` (bash ${found.major})` : ""}.` : "";
  const hints: Record<SdkmanOs, string> = {
    linux: "Install bash 4 or newer (it is the default on every mainstream distribution; on Alpine: `apk add bash`).",
    darwin: "macOS ships bash 3.2. Install a modern one with `brew install bash`.",
    win32: "Install Git for Windows (it provides Git Bash) or set the 'bashPath' input to a Git Bash `bash.exe`. WSL's bash is not supported.",
  };
  return `SDKMAN requires bash ${MIN_BASH_MAJOR} or newer.${seen} ${hints[osName]}`;
}
