import * as tl from "azure-pipelines-task-lib";
import { ensureSdkman, formatDuration, formatTable, mdTable, publishSummary, runSdk, runShell, section } from "../../../shared";
import { getInputs } from "./utils/inputs";
import { RunSummary, runCommands } from "./utils/run";

/** Tabla final en el log y resumen markdown en la pestaña "Extensions" de la ejecución. */
function reportSummary(total: number, summary: RunSummary): void {
  const headers = ["", "Command", "Exit", "Time"];
  const rows = summary.results.map((r) => [r.exitCode === 0 ? "✔" : "✖", r.label, String(r.exitCode), formatDuration(r.durationMs)]);
  const skipped = total - summary.results.length;
  section("SdkmanRun summary");
  console.log(formatTable(headers, rows));
  if (skipped > 0) console.log(`${skipped} command(s) not run because an earlier one failed`);

  const status = summary.failed.length === 0 ? "✔ all commands succeeded" : `✖ ${summary.failed.length} command(s) failed`;
  const notRun = skipped > 0 ? `\n\n_${skipped} command(s) not run because an earlier one failed._` : "";
  publishSummary("sdkman-run", `## SdkmanRun\n\n${status}\n\n${mdTable(headers, rows)}${notRun}`);
}

/**
 * Tarea "SdkmanRun": ejecuta comandos `sdk` (modo sdk) o comandos libres con SDKMAN cargado (modo shell).
 * Output: exitCode (0 o el del primer comando que falló).
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const sdk = await ensureSdkman({
      dir: inputs.sdkmanDir,
      autoInstall: inputs.autoInstallSdkman,
      installUrl: inputs.installUrl,
      candidatesApi: inputs.candidatesApi,
      bashPath: inputs.bashPath,
    });
    const summary = await runCommands(inputs, {
      runSdk: (args, options) => runSdk(sdk, args, options),
      runShell: (command, options) => runShell(sdk, command, options),
    });
    reportSummary(inputs.commands.length, summary);
    tl.setVariable("exitCode", String(summary.exitCode), false, true);

    if (summary.failed.length === 0) {
      tl.setResult(tl.TaskResult.Succeeded, `${inputs.commands.length} command(s) completed`);
    } else if (inputs.failOnError) {
      tl.setResult(tl.TaskResult.Failed, `${summary.failed[0]} failed with exit code ${summary.exitCode}`);
    } else {
      tl.setResult(tl.TaskResult.SucceededWithIssues, `${summary.failed.length} of ${inputs.commands.length} command(s) failed: ${summary.failed.join("; ")}`);
    }
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
  }
}

run();
