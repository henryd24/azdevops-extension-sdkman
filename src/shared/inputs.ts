import * as tl from "azure-pipelines-task-lib";

export interface SdkmanInputs {
  /** Carpeta de SDKMAN (SDKMAN_DIR). Vacío = la ya configurada o <Agent.ToolsDirectory>/sdkman. */
  sdkmanDir: string;
  installUrl: string;
  candidatesApi: string;
  bashPath: string;
}

export const DEFAULT_INSTALL_URL = "https://get.sdkman.io?rcupdate=false";

/** Inputs compartidos por SdkmanSetup y SdkmanInstall (bootstrap de SDKMAN). */
export function getSdkmanInputs(): SdkmanInputs {
  return {
    sdkmanDir: (tl.getInput("sdkmanDir", false) ?? "").trim(),
    installUrl: (tl.getInput("installUrl", false) ?? "").trim() || DEFAULT_INSTALL_URL,
    candidatesApi: (tl.getInput("candidatesApi", false) ?? "").trim(),
    bashPath: (tl.getInput("bashPath", false) ?? "").trim(),
  };
}
