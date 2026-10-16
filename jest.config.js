// Tests de la librería compartida (src/shared). Las tareas tienen su propio jest.
module.exports = {
  roots: ["<rootDir>/src/shared"],
  transform: { "^.+\\.tsx?$": "ts-jest" },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
};
