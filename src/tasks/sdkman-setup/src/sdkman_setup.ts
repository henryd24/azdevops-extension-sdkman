import * as tl from "azure-pipelines-task-lib";
import { ensureSdkman, formatTable, group, mdTable, publishSummary, section } from "../../../shared";
import { getSdkmanInputs } from "../../../shared/inputs";

/**
 * Tarea "SdkmanSetup": instala (o reutiliza) SDKMAN y deja SDKMAN_DIR para los pasos siguientes.
 * Outputs: sdkmanDir, sdkmanVersion, sdkmanCacheHit.
 */
async function run(): Promise<void> {
  try {
    const inputs = getSdkmanInputs();
    const sdk = await group("Set up SDKMAN", () =>
      ensureSdkman({
        dir: inputs.sdkmanDir,
        autoInstall: true,
        installUrl: inputs.installUrl,
        candidatesApi: inputs.candidatesApi,
        bashPath: inputs.bashPath,
      }),
    );

    const rows = [
      ["SDKMAN_DIR", sdk.dir],
      ["Version", sdk.version],
      ["Source", sdk.cacheHit ? "already installed" : "installed now"],
      ["bash", sdk.bash],
    ];
    section("SDKMAN ready");
    console.log(formatTable(["Setting", "Value"], rows));
    publishSummary("sdkman-setup", `## SdkmanSetup\n\n✔ SDKMAN ${sdk.version} ready\n\n${mdTable(["Setting", "Value"], rows)}`);

    tl.setVariable("sdkmanDir", sdk.dir, false, true);
    tl.setVariable("sdkmanVersion", sdk.version, false, true);
    tl.setVariable("sdkmanCacheHit", String(sdk.cacheHit), false, true);
    tl.setResult(tl.TaskResult.Succeeded, `SDKMAN ${sdk.version} ready`);
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
  }
}

run();
