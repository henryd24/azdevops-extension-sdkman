import { bashCandidates, detectOs, isBashSupported, missingToolsMessage, noBashMessage, parseBashMajor } from "../platform";

describe("platform", () => {
  it("detects supported systems and rejects the rest", () => {
    expect(detectOs("linux")).toBe("linux");
    expect(detectOs("win32")).toBe("win32");
    expect(() => detectOs("freebsd")).toThrow("not supported");
  });

  it("prefers Homebrew bash on macOS and never the PATH bash on Windows", () => {
    expect(bashCandidates("darwin")).toEqual(["/opt/homebrew/bin/bash", "/usr/local/bin/bash", "PATH"]);
    expect(bashCandidates("linux")).toEqual(["PATH"]);
    const win = bashCandidates("win32", { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" });
    expect(win).toEqual(["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"]);
    expect(win).not.toContain("PATH");
  });

  it.each([
    ["5\n", 5, true],
    ["3\n", 3, false],
    ["4", 4, true],
    ["oops", undefined, false],
  ])("bash version %j", (out, major, supported) => {
    expect(parseBashMajor(out)).toBe(major);
    expect(isBashSupported(parseBashMajor(out))).toBe(supported);
  });

  it("explains how to install missing tools per OS", () => {
    expect(missingToolsMessage(["zip", "unzip"], "linux")).toContain("apt-get install -y curl zip unzip");
    expect(missingToolsMessage(["zip"], "darwin")).toContain("brew install");
    expect(missingToolsMessage(["zip"], "win32")).toContain("pacman.exe -S --noconfirm zip");
  });

  it("explains how to get a modern bash", () => {
    expect(noBashMessage("darwin", { path: "/bin/bash", major: 3 })).toContain("brew install bash");
    expect(noBashMessage("darwin", { path: "/bin/bash", major: 3 })).toContain("bash 3");
    expect(noBashMessage("win32")).toContain("Git for Windows");
  });
});
