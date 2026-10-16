import * as tl from "azure-pipelines-task-lib";
import { getInputs } from "../utils/inputs";

jest.mock("azure-pipelines-task-lib", () => ({ getInput: jest.fn(), getBoolInput: jest.fn() }));
const mocked = tl as jest.Mocked<typeof tl>;

function setInputs(values: Record<string, string>) {
  mocked.getInput.mockImplementation((name: string) => values[name]);
  mocked.getBoolInput.mockImplementation((name: string) => values[name] === "true");
}

describe("SdkmanInstall getInputs", () => {
  beforeEach(() => jest.resetAllMocks());

  it("parses the candidates and applies defaults for the shared inputs", () => {
    setInputs({ candidates: "java 21.0.5-tem\n# c\nmaven", autoInstallSdkman: "true", setHomeVariables: "true", addToPath: "false" });
    const inputs = getInputs();
    expect(inputs.candidates).toEqual([{ candidate: "java", version: "21.0.5-tem" }, { candidate: "maven", version: undefined }]);
    expect(inputs).toMatchObject({ autoInstallSdkman: true, setHomeVariables: true, addToPath: false, installUrl: "https://get.sdkman.io?rcupdate=false", sdkmanDir: "" });
  });

  it("requires at least one candidate", () => {
    setInputs({ candidates: "\n# nothing\n" });
    expect(() => getInputs()).toThrow("empty");
  });

  it("rejects an invalid candidate line before touching the network", () => {
    setInputs({ candidates: "java 21 extra" });
    expect(() => getInputs()).toThrow("Invalid candidate");
  });
});
