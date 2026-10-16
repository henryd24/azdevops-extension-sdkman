import { homeVariableName, parseCandidates } from "../candidates";

describe("parseCandidates", () => {
  it("parses one candidate per line, with comments and blanks", () => {
    expect(parseCandidates("java 21.0.5-tem\n\n# build tools\ngradle 8.11  # latest\nmaven\r\n")).toEqual([
      { candidate: "java", version: "21.0.5-tem" },
      { candidate: "gradle", version: "8.11" },
      { candidate: "maven", version: undefined },
    ]);
  });

  it("accepts the .sdkmanrc form candidate=version", () => {
    expect(parseCandidates("java=17.0.13-tem")).toEqual([{ candidate: "java", version: "17.0.13-tem" }]);
  });

  it("allows several versions of one candidate", () => {
    expect(parseCandidates("java 21.0.5-tem\njava 17.0.13-tem")).toHaveLength(2);
  });

  it("returns an empty list for empty input", () => {
    expect(parseCandidates(undefined)).toEqual([]);
    expect(parseCandidates("  \n# only a comment")).toEqual([]);
  });

  it.each([
    ["java 21 extra", "Invalid candidate"],
    ["1java 21", "Invalid candidate name"],
    ["java 21;rm", "Invalid version"],
    ["java $(whoami)", "Invalid version"],
    ["java 21\njava 21", "more than once"],
  ])("rejects %j", (input, message) => {
    expect(() => parseCandidates(input)).toThrow(message);
  });
});

describe("homeVariableName", () => {
  it.each([
    ["java", "JAVA_HOME"],
    ["gradle", "GRADLE_HOME"],
    ["spring-boot", "SPRING_BOOT_HOME"],
  ])("%s -> %s", (candidate, expected) => {
    expect(homeVariableName(candidate)).toBe(expected);
  });
});
