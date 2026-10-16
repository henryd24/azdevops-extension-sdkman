import * as tl from "azure-pipelines-task-lib";
import { CandidateRequest, parseCandidates } from "../../../../shared/candidates";
import { getSdkmanInputs, SdkmanInputs } from "../../../../shared/inputs";

export interface InstallInputs extends SdkmanInputs {
  candidates: CandidateRequest[];
  autoInstallSdkman: boolean;
  setHomeVariables: boolean;
  addToPath: boolean;
}

export function getInputs(): InstallInputs {
  const candidates = parseCandidates(tl.getInput("candidates", true));
  if (candidates.length === 0) throw new Error("'candidates' is empty. List one candidate per line, for example 'java 21.0.5-tem'.");
  return {
    ...getSdkmanInputs(),
    candidates,
    autoInstallSdkman: tl.getBoolInput("autoInstallSdkman", false),
    setHomeVariables: tl.getBoolInput("setHomeVariables", false),
    addToPath: tl.getBoolInput("addToPath", false),
  };
}
