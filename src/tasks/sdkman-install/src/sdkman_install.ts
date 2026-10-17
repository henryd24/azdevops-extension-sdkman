import * as tl from "azure-pipelines-task-lib";
import { ensureSdkman, toEnsureOptions, installAndActivate } from "../../../shared";
import { getInputs } from "./utils/inputs";

/**
 * Tarea "SdkmanInstall": instala candidates con SDKMAN y exporta su entorno a los pasos siguientes.
 * Outputs: sdkmanDir, sdkmanInstalled (JSON).
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    console.log(`Candidates: ${inputs.candidates.map((c) => `${c.candidate} ${c.version ?? "(default)"}`).join(", ")}`);

    const sdk = await ensureSdkman(toEnsureOptions(inputs, inputs.autoInstallSdkman));
    const installed = await installAndActivate(sdk, inputs.candidates, {
      setHomeVariables: inputs.setHomeVariables,
      addToPath: inputs.addToPath,
      taskName: "SdkmanInstall",
    });
    tl.setResult(tl.TaskResult.Succeeded, installed.map((i) => `${i.candidate} ${i.version}`).join(", ") + " ready");
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
  }
}

run();
