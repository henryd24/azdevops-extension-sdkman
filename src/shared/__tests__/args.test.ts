import { parseEnv, splitArgs } from "../args";

describe("splitArgs", () => {
  it.each([
    ["sync --frozen", ["sync", "--frozen"]],
    ['  pip   install "ruff>=0.5"  ', ["pip", "install", "ruff>=0.5"]],
    ["run python -c 'print(1)'", ["run", "python", "-c", "print(1)"]],
    ['run python -c "print(\\"hi\\")"', ["run", "python", "-c", 'print("hi")']],
    ["venv C:\\proyecto\\.venv", ["venv", "C:\\proyecto\\.venv"]],
    ['add ""', ["add", ""]],
    ["", []],
  ])("%j", (line, expected) => {
    expect(splitArgs(line)).toEqual(expected);
  });

  it("rejects unclosed quotes", () => {
    expect(() => splitArgs('run "oops')).toThrow("Unclosed");
  });
});

describe("parseEnv", () => {
  it("parses KEY=VALUE lines, ignoring blanks and comments", () => {
    expect(parseEnv("A=1\n# c\n\nB=https://x/y?a=b")).toEqual({ A: "1", B: "https://x/y?a=b" });
  });
  it("rejects malformed lines", () => {
    expect(() => parseEnv("oops")).toThrow("KEY=VALUE");
  });
});
