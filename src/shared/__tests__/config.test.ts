import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyConfigOverrides, buildConfigOverrides, parsePositiveInt, withConfigOverrides } from "../config";

describe("buildConfigOverrides", () => {
  it("is empty when nothing is requested, so the user's config is never touched", () => {
    expect(buildConfigOverrides({ insecureSsl: false, debug: false })).toEqual({});
  });
  it("maps the inputs to SDKMAN keys", () => {
    expect(buildConfigOverrides({ connectTimeout: 20, maxTime: 120, insecureSsl: true, debug: true })).toEqual({
      sdkman_curl_connect_timeout: "20",
      sdkman_curl_max_time: "120",
      sdkman_insecure_ssl: "true",
      sdkman_debug_mode: "true",
    });
  });
});

describe("applyConfigOverrides", () => {
  it("replaces existing keys and appends missing ones", () => {
    const out = applyConfigOverrides("a=1\nsdkman_curl_max_time=10\nb=2", { sdkman_curl_max_time: "99", sdkman_debug_mode: "true" });
    expect(out).toBe("a=1\nsdkman_curl_max_time=99\nb=2\nsdkman_debug_mode=true\n");
  });
});

describe("parsePositiveInt", () => {
  it("accepts empty and positive integers only", () => {
    expect(parsePositiveInt("x", " ")).toBeUndefined();
    expect(parsePositiveInt("x", " 15 ")).toBe(15);
    for (const bad of ["0", "-1", "1.5", "abc"]) expect(() => parsePositiveInt("x", bad)).toThrow("positive whole number");
  });
});

describe("withConfigOverrides", () => {
  function sdkDir(content: string): { dir: string; file: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdkcfg-"));
    fs.mkdirSync(path.join(dir, "etc"));
    const file = path.join(dir, "etc", "config");
    fs.writeFileSync(file, content);
    return { dir, file };
  }

  it("applies the overrides during fn and restores the original afterwards", async () => {
    const { dir, file } = sdkDir("sdkman_insecure_ssl=false\n");
    const seen = await withConfigOverrides(dir, { sdkman_insecure_ssl: "true" }, async () => fs.readFileSync(file, "utf8"));
    expect(seen).toBe("sdkman_insecure_ssl=true\n");
    expect(fs.readFileSync(file, "utf8")).toBe("sdkman_insecure_ssl=false\n");
  });

  it("restores the original even when fn throws", async () => {
    const { dir, file } = sdkDir("a=1\n");
    await expect(withConfigOverrides(dir, { a: "2" }, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(fs.readFileSync(file, "utf8")).toBe("a=1\n");
  });

  it("does not touch the file without overrides", async () => {
    const { dir, file } = sdkDir("a=1\n");
    const before = fs.statSync(file).mtimeMs;
    await withConfigOverrides(dir, {}, async () => undefined);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });
});
