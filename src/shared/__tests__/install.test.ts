import * as path from "node:path";
import { InstallDeps, installCandidates, isPermanentFailure } from "../install";

function makeDeps(overrides: Partial<InstallDeps> = {}) {
  const installedDirs = new Set<string>();
  const calls: string[][] = [];
  const deps: InstallDeps = {
    sdkmanDir: "/sdk",
    run: async (args) => {
      calls.push(args);
      if (args[0] === "install") installedDirs.add(path.join("/sdk", "candidates", args[1], args[2]));
      return { exitCode: 0 };
    },
    exists: (dir) => installedDirs.has(dir),
    defaultVersion: async () => "3.10.0",
    sleep: async () => undefined,
    log: () => undefined,
    ...overrides,
  };
  return { deps, calls, installedDirs };
}

describe("installCandidates", () => {
  it("installs each candidate and marks the first version of each as active", async () => {
    const { deps, calls } = makeDeps();
    const result = await installCandidates(
      [{ candidate: "java", version: "21.0.5-tem" }, { candidate: "maven", version: "3.9.9" }, { candidate: "java", version: "17.0.13-tem" }],
      deps,
    );
    expect(result.map((r) => [r.candidate, r.version, r.active])).toEqual([
      ["java", "21.0.5-tem", true],
      ["maven", "3.9.9", true],
      ["java", "17.0.13-tem", false],
    ]);
    expect(calls.filter((c) => c[0] === "install")).toHaveLength(3);
    // java tiene dos versiones: `current` se devuelve a la activa
    expect(calls[calls.length - 1]).toEqual(["default", "java", "21.0.5-tem"]);
    expect(calls.filter((c) => c[0] === "default")).toHaveLength(1);
  });

  it("is idempotent: an installed version is not downloaded again", async () => {
    const { deps, calls, installedDirs } = makeDeps();
    installedDirs.add(path.join("/sdk", "candidates", "java", "21.0.5-tem"));
    const [item] = await installCandidates([{ candidate: "java", version: "21.0.5-tem" }], deps);
    expect(item.installedNow).toBe(false);
    expect(calls).toEqual([]);
  });

  it("uses SDKMAN's default version when none is given", async () => {
    const { deps, calls } = makeDeps();
    const [item] = await installCandidates([{ candidate: "maven" }], deps);
    expect(item.version).toBe("3.10.0");
    expect(calls[0]).toEqual(["install", "maven", "3.10.0"]);
  });

  it("retries a transient failure and then succeeds", async () => {
    let attempts = 0;
    const { deps, installedDirs } = makeDeps({
      run: async (args) => {
        attempts++;
        if (attempts < 3) return { exitCode: 1 };
        installedDirs.add(path.join("/sdk", "candidates", args[1], args[2]));
        return { exitCode: 0 };
      },
    });
    const sleeps: number[] = [];
    deps.sleep = async (ms) => void sleeps.push(ms);
    await installCandidates([{ candidate: "java", version: "21" }], deps, [10, 20]);
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it("fails after exhausting the retries", async () => {
    const { deps } = makeDeps({ run: async () => ({ exitCode: 1 }) });
    await expect(installCandidates([{ candidate: "java", version: "99" }], deps, [1])).rejects.toThrow("failed (exit code 1) after 2 attempt(s)");
  });

  it("fails when sdk reports success but the version folder is missing", async () => {
    const { deps } = makeDeps({ run: async () => ({ exitCode: 0 }) });
    await expect(installCandidates([{ candidate: "java", version: "21" }], deps, [])).rejects.toThrow("failed");
  });

  it("does not retry permanent failures", async () => {
    const attempts: string[][] = [];
    const { deps } = makeDeps({
      run: async (args) => {
        attempts.push(args);
        return { exitCode: 1, output: "Stop! java 99 is not available. Possible causes:\n * 99 is an invalid version" };
      },
    });
    await expect(installCandidates([{ candidate: "java", version: "99" }], deps, [1, 1])).rejects.toThrow("retrying will not help");
    expect(attempts).toHaveLength(1);
  });

  it("names the network endpoints when transient failures persist", async () => {
    const { deps } = makeDeps({ run: async () => ({ exitCode: 1, output: "Stop! java 21 is not available. Internet unreachable." }) });
    await expect(installCandidates([{ candidate: "java", version: "21" }], deps, [1])).rejects.toThrow("api.sdkman.io");
  });

  it("classifies SDKMAN failure messages", () => {
    expect(isPermanentFailure("Stop! nopelib is not a valid candidate.")).toBe(true);
    expect(isPermanentFailure("Invalid path! Refusing to link java 17 to /nope.")).toBe(true);
    expect(isPermanentFailure("Stop! gradle 8.10 is not available. Internet unreachable.")).toBe(false);
    expect(isPermanentFailure("Stop! The archive was corrupt and has been removed!")).toBe(false);
    expect(isPermanentFailure(undefined)).toBe(false);
  });

  it("offline: uses what is on disk, refuses to download and needs explicit versions", async () => {
    const { deps, calls, installedDirs } = makeDeps({ offline: true });
    installedDirs.add(path.join("/sdk", "candidates", "java", "21.0.5-tem"));
    const [item] = await installCandidates([{ candidate: "java", version: "21.0.5-tem" }], deps);
    expect(item.installedNow).toBe(false);
    await expect(installCandidates([{ candidate: "java", version: "17" }], deps)).rejects.toThrow("offline mode is on");
    await expect(installCandidates([{ candidate: "maven" }], deps)).rejects.toThrow("explicit version");
    expect(calls).toEqual([]);
  });

  it("installs a local folder with sdk install <candidate> <version> <path>", async () => {
    const { deps, calls, installedDirs } = makeDeps();
    installedDirs.add("/opt/jdk-21");
    const [item] = await installCandidates([{ candidate: "java", version: "21-custom", localPath: "/opt/jdk-21" }], deps);
    expect(calls[0]).toEqual(["install", "java", "21-custom", "/opt/jdk-21"]);
    expect(item.home).toBe(path.join("/sdk", "candidates", "java", "21-custom"));
  });

  it("rejects a local path that does not exist before calling sdk", async () => {
    const { deps, calls } = makeDeps();
    await expect(installCandidates([{ candidate: "java", version: "21-custom", localPath: "/nope" }], deps)).rejects.toThrow("does not exist");
    expect(calls).toEqual([]);
  });
});
