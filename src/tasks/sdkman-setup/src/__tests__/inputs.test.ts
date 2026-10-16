import * as tl from "azure-pipelines-task-lib";
import { getSdkmanInputs } from "../../../../shared/inputs";

jest.mock("azure-pipelines-task-lib", () => ({ getInput: jest.fn() }));
const mocked = tl as jest.Mocked<typeof tl>;

function setInputs(values: Record<string, string>) {
  mocked.getInput.mockImplementation((name: string) => values[name]);
}

describe("SdkmanSetup inputs", () => {
  beforeEach(() => jest.resetAllMocks());

  it("defaults to the official installer without rc updates", () => {
    setInputs({});
    expect(getSdkmanInputs()).toEqual({
      sdkmanDir: "",
      installUrl: "https://get.sdkman.io?rcupdate=false",
      candidatesApi: "",
      bashPath: "",
    });
  });

  it("trims and passes through mirrors and bash path", () => {
    setInputs({ sdkmanDir: " /opt/sdkman ", installUrl: " https://mirror/install ", candidatesApi: "https://mirror/2", bashPath: "/opt/homebrew/bin/bash" });
    expect(getSdkmanInputs()).toEqual({
      sdkmanDir: "/opt/sdkman",
      installUrl: "https://mirror/install",
      candidatesApi: "https://mirror/2",
      bashPath: "/opt/homebrew/bin/bash",
    });
  });
});
