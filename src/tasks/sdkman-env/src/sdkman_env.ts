import * as tl from "azure-pipelines-task-lib";
import { ensureSdkman, installAndActivate } from "../../../shared";
import { getInputs, readRequests } from "./utils/inputs";

/**
 * Tarea "SdkmanEnv": instala lo que pide un `.sdkmanrc` y lo activa para los pasos siguientes
 * (equivale a `sdk env install`, pero con la activación persistente entre pasos).
 * Outputs: sdkmanDir, sdkmanInstalled (JSON).
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const { requests, reason } = readRequests(inputs);
    if (!requests) {
      tl.setResult(tl.TaskResult.SucceededWithIssues, `Skipped: ${reason}`);
      return;
    }
    console.log(`${inputs.file}: ${requests.map((c) => `${c.candidate}=${c.version}`).join(", ")}`);

    const sdk = await ensureSdkman({
      dir: inputs.sdkmanDir,
      autoInstall: inputs.autoInstallSdkman,
      installUrl: inputs.installUrl,
      candidatesApi: inputs.candidatesApi,
      bashPath: inputs.bashPath,
    });
    const installed = await installAndActivate(sdk, requests, {
      setHomeVariables: inputs.setHomeVariables,
      addToPath: inputs.addToPath,
      taskName: "SdkmanEnv",
    });
    tl.setResult(tl.TaskResult.Succeeded, installed.map((i) => `${i.candidate} ${i.version}`).join(", ") + " ready");
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
  }
}

run();
