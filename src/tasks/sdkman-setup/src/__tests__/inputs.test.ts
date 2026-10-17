import * as tl from "azure-pipelines-task-lib";
import { getSdkmanInputs } from "../../../../shared/inputs";

jest.mock("azure-pipelines-task-lib", () => ({ getInput: jest.fn(), getBoolInput: jest.fn(), getVariable: jest.fn() }));
const mocked = tl as jest.Mocked<typeof tl>;

function setInputs(values: Record<string, string>, debug?: string) {
  mocked.getInput.mockImplementation((name: string) => values[name]);
  mocked.getBoolInput.mockImplementation((name: string) => values[name] === "true");
  mocked.getVariable.mockImplementation((name: string) => (name === "system.debug" ? debug : undefined));
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
      offline: false,
      connectTimeout: undefined,
      maxTime: undefined,
      insecureSsl: false,
      debug: false,
    });
  });

  it("reads the network options and system.debug", () => {
    setInputs({ offline: "true", connectTimeout: "20", maxTime: " 120 ", insecureSsl: "true" }, "true");
    expect(getSdkmanInputs()).toMatchObject({ offline: true, connectTimeout: 20, maxTime: 120, insecureSsl: true, debug: true });
  });

  it("rejects non numeric timeouts", () => {
    setInputs({ connectTimeout: "soon" });
    expect(() => getSdkmanInputs()).toThrow("positive whole number");
    setInputs({ maxTime: "0" });
    expect(() => getSdkmanInputs()).toThrow("positive whole number");
  });

  it("trims and passes through mirrors and bash path", () => {
    setInputs({ sdkmanDir: " /opt/sdkman ", installUrl: " https://mirror/install ", candidatesApi: "https://mirror/2", bashPath: "/opt/homebrew/bin/bash" });
    expect(getSdkmanInputs()).toMatchObject({
      sdkmanDir: "/opt/sdkman",
      installUrl: "https://mirror/install",
      candidatesApi: "https://mirror/2",
      bashPath: "/opt/homebrew/bin/bash",
    });
  });
});
