import { RunDeps, RunPlan, runCommands } from "../utils/run";
import { parseCommands } from "../utils/inputs";

function deps(exitCodes: Record<string, number> = {}) {
  const calls: { kind: string; value: string[] | string }[] = [];
  const impl: RunDeps = {
    runSdk: async (args) => {
      calls.push({ kind: "sdk", value: args });
      return { exitCode: exitCodes[args.join(" ")] ?? 0, stdout: "", output: "" };
    },
    runShell: async (command) => {
      calls.push({ kind: "shell", value: command });
      return { exitCode: exitCodes[command] ?? 0, stdout: "", output: "" };
    },
  };
  return { impl, calls };
}
const plan = (over: Partial<RunPlan> = {}): RunPlan => ({ commands: [], mode: "sdk", workingDirectory: ".", failOnError: true, env: {}, ...over });
const exists = () => true;

describe("parseCommands", () => {
  it("drops comments and blanks, and the optional sdk prefix in sdk mode only", () => {
    const text = "list java\n# c\n\nsdk current";
    expect(parseCommands(text, "sdk")).toEqual(["list java", "current"]);
    expect(parseCommands(text, "shell")).toEqual(["list java", "sdk current"]);
  });
});

describe("runCommands", () => {
  it("tokenizes sdk commands and passes them as separate arguments, never as one string", async () => {
    const { impl, calls } = deps();
    await runCommands(plan({ commands: ["install java 21; rm -rf /", 'home java "21.0.5-tem"'] }), impl, exists);
    expect(calls).toEqual([
      { kind: "sdk", value: ["install", "java", "21;", "rm", "-rf", "/"] },
      { kind: "sdk", value: ["home", "java", "21.0.5-tem"] },
    ]);
  });

  it("sends each line to the shell as is in shell mode", async () => {
    const { impl, calls } = deps();
    await runCommands(plan({ mode: "shell", commands: ["java -version", "mvn -v"] }), impl, exists);
    expect(calls).toEqual([
      { kind: "shell", value: "java -version" },
      { kind: "shell", value: "mvn -v" },
    ]);
  });

  it("stops at the first failure with failOnError and reports its exit code", async () => {
    const { impl, calls } = deps({ "current java": 3 });
    const summary = await runCommands(plan({ commands: ["current java", "list java"] }), impl, exists);
    expect(summary).toMatchObject({ exitCode: 3, failed: ["sdk current java"] });
    expect(calls).toHaveLength(1);
  });

  it("runs everything without failOnError", async () => {
    const { impl, calls } = deps({ "current java": 3 });
    const summary = await runCommands(plan({ commands: ["current java", "list java"], failOnError: false }), impl, exists);
    expect(summary.failed).toEqual(["sdk current java"]);
    expect(summary.results).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("rejects a missing working directory and unclosed quotes", async () => {
    const { impl } = deps();
    await expect(runCommands(plan({ commands: ["version"], workingDirectory: "/nope" }), impl, () => false)).rejects.toThrow("working directory");
    await expect(runCommands(plan({ commands: ['home "java'] }), impl, exists)).rejects.toThrow("Unclosed");
  });
});
