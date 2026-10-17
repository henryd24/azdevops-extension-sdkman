import * as tl from "azure-pipelines-task-lib";
import { parsePositiveInt } from "./config";

export interface SdkmanInputs {
  /** Carpeta de SDKMAN (SDKMAN_DIR). Vacío = la ya configurada o <Agent.ToolsDirectory>/sdkman. */
  sdkmanDir: string;
  installUrl: string;
  candidatesApi: string;
  bashPath: string;
  /** Sin red: solo versiones ya instaladas. */
  offline: boolean;
  connectTimeout?: number;
  maxTime?: number;
  insecureSsl: boolean;
  /** `system.debug` de Azure Pipelines. */
  debug: boolean;
}

export const DEFAULT_INSTALL_URL = "https://get.sdkman.io?rcupdate=false";

/** Inputs compartidos por SdkmanSetup y SdkmanInstall (bootstrap de SDKMAN). */
export function getSdkmanInputs(): SdkmanInputs {
  return {
    sdkmanDir: (tl.getInput("sdkmanDir", false) ?? "").trim(),
    installUrl: (tl.getInput("installUrl", false) ?? "").trim() || DEFAULT_INSTALL_URL,
    candidatesApi: (tl.getInput("candidatesApi", false) ?? "").trim(),
    bashPath: (tl.getInput("bashPath", false) ?? "").trim(),
    offline: tl.getBoolInput("offline", false),
    connectTimeout: parsePositiveInt("connectTimeout", tl.getInput("connectTimeout", false)),
    maxTime: parsePositiveInt("maxTime", tl.getInput("maxTime", false)),
    insecureSsl: tl.getBoolInput("insecureSsl", false),
    debug: (tl.getVariable("system.debug") ?? "").toLowerCase() === "true",
  };
}
