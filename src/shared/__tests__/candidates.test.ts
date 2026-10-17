import { homeVariableName, parseCandidates, parseSdkmanrc } from "../candidates";

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

  it("accepts a local path as third word, quoted when it has spaces", () => {
    expect(parseCandidates('java 21-custom /opt/jdk-21\njava 17-x "/opt/my jdk"\nmaven=3.9.9')).toEqual([
      { candidate: "java", version: "21-custom", localPath: "/opt/jdk-21" },
      { candidate: "java", version: "17-x", localPath: "/opt/my jdk" },
      { candidate: "maven", version: "3.9.9" },
    ]);
  });

  it("keeps '#' and '=' inside a path", () => {
    expect(parseCandidates("java 21-c /opt/a=b/jdk#1 # trailing comment")).toEqual([{ candidate: "java", version: "21-c", localPath: "/opt/a=b/jdk#1" }]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseCandidates(undefined)).toEqual([]);
    expect(parseCandidates("  \n# only a comment")).toEqual([]);
  });

  it.each([
    ["java 21 /p extra", "Invalid candidate"],
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

describe("parseSdkmanrc", () => {
  it("parses candidate=version lines, comments and blanks", () => {
    expect(parseSdkmanrc("# header\njava=17.0.13-tem\n\nmaven = 3.9.9  # build\r\n")).toEqual([
      { candidate: "java", version: "17.0.13-tem" },
      { candidate: "maven", version: "3.9.9" },
    ]);
  });
  it("returns an empty list for an empty file", () => {
    expect(parseSdkmanrc("\n# nothing\n")).toEqual([]);
  });
  it.each([
    ["java", "Expected '<candidate>=<version>'"],
    ["java=", "Expected '<candidate>=<version>'"],
    ["=17", "Expected '<candidate>=<version>'"],
    ["java=17;rm", "Invalid version"],
    ["ja va=17", "Invalid candidate name"],
    ["java=17\njava=21", "more than once"],
  ])("rejects %j", (input, message) => {
    expect(() => parseSdkmanrc(input)).toThrow(message);
  });
});
