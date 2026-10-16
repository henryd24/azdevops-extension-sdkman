import * as fs from "node:fs";
import * as path from "node:path";
import * as tl from "azure-pipelines-task-lib";
import { CandidateRequest, parseSdkmanrc } from "../../../../shared/candidates";
import { getSdkmanInputs, SdkmanInputs } from "../../../../shared/inputs";

export interface EnvInputs extends SdkmanInputs {
  /** Ruta absoluta del .sdkmanrc. */
  file: string;
  strict: boolean;
  autoInstallSdkman: boolean;
  setHomeVariables: boolean;
  addToPath: boolean;
}

export function getInputs(): EnvInputs {
  return {
    ...getSdkmanInputs(),
    file: path.resolve((tl.getInput("sdkmanrcPath", false) ?? "").trim() || ".sdkmanrc"),
    strict: tl.getBoolInput("strict", false),
    autoInstallSdkman: tl.getBoolInput("autoInstallSdkman", false),
    setHomeVariables: tl.getBoolInput("setHomeVariables", false),
    addToPath: tl.getBoolInput("addToPath", false),
  };
}

/**
 * Lee las entradas del archivo. `undefined` = no hay nada que instalar (archivo ausente o vacío) y no es estricto;
 * en modo estricto esos casos son un error.
 */
export function readRequests(inputs: Pick<EnvInputs, "file" | "strict">): { requests?: CandidateRequest[]; reason?: string } {
  if (!fs.existsSync(inputs.file)) {
    const reason = `${inputs.file} does not exist`;
    if (inputs.strict) throw new Error(`${reason}. Set 'strict: false' to skip the step when there is no .sdkmanrc.`);
    return { reason };
  }
  const requests = parseSdkmanrc(fs.readFileSync(inputs.file, "utf8"));
  if (requests.length === 0) {
    const reason = `${inputs.file} does not list any candidate`;
    if (inputs.strict) throw new Error(reason);
    return { reason };
  }
  return { requests };
}
