import * as path from "node:path";
import { SHELL_SCRIPT, shellBashArgs, candidateHome, cleanSdkOutput, createOutputCleaner, parseDefaultVersion, resolveSdkmanDir, SDK_SCRIPT, sdkBashArgs, sdkEnvironment } from "../sdkman";

describe("sdkBashArgs", () => {
  it("passes sdk arguments positionally, never inside the script", () => {
    const evil = "21; rm -rf / $(whoami) `id`";
    const args = sdkBashArgs(["install", "java", evil]);
    expect(args.slice(0, 4)).toEqual(["--noprofile", "--norc", "-c", SDK_SCRIPT]);
    expect(args.slice(4)).toEqual(["sdk", "install", "java", evil]);
    expect(SDK_SCRIPT).not.toContain("rm -rf");
    expect(SDK_SCRIPT).toContain('sdk "$@"');
  });

  it("closes stdin first so a SDKMAN prompt cannot block the step", () => {
    expect(SDK_SCRIPT.startsWith("exec </dev/null;")).toBe(true);
    expect(SDK_SCRIPT.indexOf("exec </dev/null")).toBeLessThan(SDK_SCRIPT.indexOf("source"));
  });
});

describe("sdkEnvironment", () => {
  it("sets SDKMAN_DIR", () => {
    expect(sdkEnvironment("/opt/sdkman")).toEqual({ SDKMAN_DIR: "/opt/sdkman" });
  });

  it("adds the candidates API mirror and extras", () => {
    const env = sdkEnvironment("/d", "https://mirror/2", { FOO: "1" });
    expect(env.SDKMAN_CANDIDATES_API).toBe("https://mirror/2");
    expect(env.FOO).toBe("1");
  });
});

describe("resolveSdkmanDir", () => {
  const none = () => false;
  it("prefers the explicit input", () => {
    expect(resolveSdkmanDir("/x/sdk", { SDKMAN_DIR: "/y" }, none, "/home/u")).toBe(path.resolve("/x/sdk"));
  });
  it("then SDKMAN_DIR from the environment", () => {
    expect(resolveSdkmanDir("", { SDKMAN_DIR: "/y" }, none, "/home/u")).toBe("/y");
  });
  it("then an existing ~/.sdkman", () => {
    expect(resolveSdkmanDir("", {}, () => true, "/home/u")).toBe(path.join("/home/u", ".sdkman"));
  });
  it("finally <Agent.ToolsDirectory>/sdkman", () => {
    expect(resolveSdkmanDir("", { AGENT_TOOLSDIRECTORY: "/agent/tools" }, none, "/home/u")).toBe(path.join("/agent/tools", "sdkman"));
  });
});

describe("misc", () => {
  it("builds candidate homes", () => {
    expect(candidateHome("/s", "java", "21.0.5-tem")).toBe(path.join("/s", "candidates", "java", "21.0.5-tem"));
  });
  it("parses the default version response", () => {
    expect(parseDefaultVersion("3.10.0\n")).toBe("3.10.0");
    expect(() => parseDefaultVersion("<html>error</html>")).toThrow("Unexpected");
  });
});

describe("cleanSdkOutput", () => {
  it("removes colour codes", () => {
    expect(cleanSdkOutput("\u001b[1;32mInstalling: java 21\u001b[0m\n")).toBe("Installing: java 21\n");
  });

  it("removes curl progress bars but keeps real output", () => {
    const raw = "Downloading: java 21\nIn progress...\n#=#=#      \r##O=#  #   \r100.0%\n####   46.8%\nRepackaging Java 21...\n";
    expect(cleanSdkOutput(raw)).toBe("Downloading: java 21\nIn progress...\nRepackaging Java 21...\n");
  });

  it("keeps lines that merely contain hashes", () => {
    expect(cleanSdkOutput("# comment line\n")).toBe("# comment line\n");
  });
});

describe("createOutputCleaner", () => {
  it("cleans whole lines even when chunks split them", () => {
    const out: string[] = [];
    const cleaner = createOutputCleaner((t) => out.push(t));
    cleaner.push("Downloading: java\n####      16");
    cleaner.push(".0%\n#####   46.8%\nInstalling: java\nDone");
    cleaner.push(" installing!");
    cleaner.flush();
    expect(out.join("")).toBe("Downloading: java\nInstalling: java\nDone installing!\n");
  });
});

describe("shellBashArgs", () => {
  it("passes the user command as $1 and restores the step environment after sourcing init", () => {
    const args = shellBashArgs("mvn -v && echo $JAVA_HOME");
    expect(args.slice(0, 4)).toEqual(["--noprofile", "--norc", "-c", SHELL_SCRIPT]);
    expect(args.slice(4)).toEqual(["sdkman-shell", "mvn -v && echo $JAVA_HOME"]);
    expect(SHELL_SCRIPT.startsWith("exec </dev/null;")).toBe(true);
    const saved = SHELL_SCRIPT.indexOf("export -p");
    const sourced = SHELL_SCRIPT.indexOf("source ");
    const restored = SHELL_SCRIPT.indexOf('eval "$__sdkman_env"');
    expect(saved).toBeGreaterThan(-1);
    expect(saved).toBeLessThan(sourced);
    expect(sourced).toBeLessThan(restored);
    expect(restored).toBeLessThan(SHELL_SCRIPT.indexOf('eval "$1"'));
  });
});
