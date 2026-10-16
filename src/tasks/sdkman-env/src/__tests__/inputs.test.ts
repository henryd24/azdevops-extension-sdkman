import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readRequests } from "../utils/inputs";

function tmpFile(content?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdkmanrc-"));
  const file = path.join(dir, ".sdkmanrc");
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

describe("readRequests", () => {
  it("reads the candidates of a .sdkmanrc", () => {
    const { requests } = readRequests({ file: tmpFile("java=17.0.13-tem\nmaven=3.9.9\n"), strict: true });
    expect(requests).toEqual([
      { candidate: "java", version: "17.0.13-tem" },
      { candidate: "maven", version: "3.9.9" },
    ]);
  });

  it("fails on a missing file in strict mode and skips otherwise", () => {
    const file = tmpFile();
    expect(() => readRequests({ file, strict: true })).toThrow("does not exist");
    expect(readRequests({ file, strict: false })).toEqual({ reason: `${file} does not exist` });
  });

  it("fails on an empty file in strict mode and skips otherwise", () => {
    const file = tmpFile("# nothing\n");
    expect(() => readRequests({ file, strict: true })).toThrow("does not list any candidate");
    expect(readRequests({ file, strict: false }).requests).toBeUndefined();
  });

  it("reports malformed content as an error even when not strict", () => {
    expect(() => readRequests({ file: tmpFile("java\n"), strict: false })).toThrow("Expected '<candidate>=<version>'");
  });
});
