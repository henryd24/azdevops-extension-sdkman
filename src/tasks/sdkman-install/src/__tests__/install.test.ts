import * as path from "node:path";
import { InstallDeps, installCandidates } from "../utils/install";

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
});
