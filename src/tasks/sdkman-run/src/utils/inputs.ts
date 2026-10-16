import * as tl from "azure-pipelines-task-lib";
import { parseEnv } from "../../../../shared/args";
import { getSdkmanInputs, SdkmanInputs } from "../../../../shared/inputs";

export type RunMode = "sdk" | "shell";

export interface RunInputs extends SdkmanInputs {
  /** Un comando por línea. En modo `sdk`, sin el prefijo `sdk`. */
  commands: string[];
  mode: RunMode;
  workingDirectory: string;
  failOnError: boolean;
  env: Record<string, string>;
  autoInstallSdkman: boolean;
}

/** Líneas no vacías ni comentadas; en modo `sdk` se quita el prefijo opcional `sdk `. */
export function parseCommands(value: string | undefined, mode: RunMode): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith("#"))
    .map((c) => (mode === "sdk" ? c.replace(/^sdk\s+/, "") : c));
}

export function getInputs(): RunInputs {
  const mode = ((tl.getInput("mode", false) ?? "").trim() || "sdk") as RunMode;
  if (mode !== "sdk" && mode !== "shell") throw new Error(`Invalid mode '${mode}'. Use 'sdk' or 'shell'.`);
  const commands = parseCommands(tl.getInput("commands", true), mode);
  if (commands.length === 0) throw new Error("The 'commands' input needs at least one command");
  return {
    ...getSdkmanInputs(),
    commands,
    mode,
    workingDirectory: tl.getPathInput("workingDirectory", false) || process.cwd(),
    failOnError: tl.getBoolInput("failOnError", false),
    env: parseEnv(tl.getInput("env", false)),
    autoInstallSdkman: tl.getBoolInput("autoInstallSdkman", false),
  };
}
