import * as fs from "node:fs";
import { splitArgs } from "../../../../shared/args";
import { formatDuration } from "../../../../shared/output";
import { RunSdkOptions, RunSdkResult } from "../../../../shared/sdkman";
import { RunMode } from "./inputs";

export interface CommandResult {
  /** Texto mostrado: `sdk <comando>` en modo sdk, el comando tal cual en modo shell. */
  label: string;
  exitCode: number;
  /** Duración en milisegundos. */
  durationMs: number;
}

export interface RunSummary {
  /** 0 si todo salió bien; si no, el exit code del primer comando que falló. */
  exitCode: number;
  failed: string[];
  /** Un resultado por cada comando que llegó a ejecutarse, en orden. */
  results: CommandResult[];
}

export interface RunDeps {
  runSdk(args: string[], options: RunSdkOptions): Promise<RunSdkResult>;
  runShell(command: string, options: RunSdkOptions): Promise<RunSdkResult>;
}

export interface RunPlan {
  commands: string[];
  mode: RunMode;
  workingDirectory: string;
  failOnError: boolean;
  env: Record<string, string>;
}

/**
 * Ejecuta los comandos en orden. Con `failOnError` se detiene en el primero que falla; si no,
 * ejecuta todos y los fallos quedan en el resumen. En modo `sdk` cada línea se tokeniza y llega
 * a bash como argumentos posicionales (sin interpolación); en modo `shell` la línea es texto de shell.
 */
export async function runCommands(plan: RunPlan, deps: RunDeps, exists: (p: string) => boolean = fs.existsSync): Promise<RunSummary> {
  if (!exists(plan.workingDirectory)) throw new Error(`The working directory does not exist: ${plan.workingDirectory}`);
  const summary: RunSummary = { exitCode: 0, failed: [], results: [] };
  const options: RunSdkOptions = { cwd: plan.workingDirectory, env: plan.env, failOnError: false };

  for (const command of plan.commands) {
    const label = plan.mode === "sdk" ? `sdk ${command}` : command;
    // Tokeniza antes de abrir el grupo: una comilla sin cerrar falla la tarea con un mensaje claro.
    const args = plan.mode === "sdk" ? splitArgs(command) : [];
    console.log(`##[group]${label}`);
    const started = Date.now();
    try {
      const { exitCode } = plan.mode === "sdk" ? await deps.runSdk(args, options) : await deps.runShell(command, options);
      const durationMs = Date.now() - started;
      summary.results.push({ label, exitCode, durationMs });
      if (exitCode !== 0) {
        summary.failed.push(label);
        if (summary.exitCode === 0) summary.exitCode = exitCode;
        console.log(`✖ ${label} failed with exit code ${exitCode} (${formatDuration(durationMs)})`);
      } else {
        console.log(`✔ ${label} (${formatDuration(durationMs)})`);
      }
    } finally {
      console.log("##[endgroup]");
    }
    if (summary.failed.length > 0 && plan.failOnError) break;
  }
  return summary;
}
