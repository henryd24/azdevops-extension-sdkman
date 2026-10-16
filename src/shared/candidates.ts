/**
 * Lista de candidates de SDKMAN ("java 21.0.5-tem", "maven") y nombres de variables derivados.
 */

export interface CandidateRequest {
  candidate: string;
  /** Identifier tal cual lo entiende `sdk install` (21.0.5-tem). Vacío = default de SDKMAN. */
  version?: string;
}

const CANDIDATE_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * Una entrada por línea: `candidate [version]`. Se ignoran líneas vacías y comentarios (`#`).
 * También se acepta `candidate=version` (formato de .sdkmanrc). Duplicados exactos se rechazan;
 * varias versiones del mismo candidate están permitidas (la primera es la activa).
 */
export function parseCandidates(text: string | undefined): CandidateRequest[] {
  const result: CandidateRequest[] = [];
  const seen = new Set<string>();
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const parts = line.replace("=", " ").split(/\s+/);
    if (parts.length > 2) throw new Error(`Invalid candidate '${line}'. Expected '<candidate> [<version>]', for example 'java 21.0.5-tem'.`);
    const [candidate, version] = parts;
    if (!CANDIDATE_RE.test(candidate)) throw new Error(`Invalid candidate name '${candidate}' in '${line}'.`);
    if (version !== undefined && !VERSION_RE.test(version)) throw new Error(`Invalid version '${version}' for '${candidate}'.`);
    const key = `${candidate}@${version ?? ""}`.toLowerCase();
    if (seen.has(key)) throw new Error(`'${line}' is listed more than once.`);
    seen.add(key);
    result.push({ candidate: candidate.toLowerCase(), version });
  }
  return result;
}

/** java -> JAVA_HOME, spring-boot -> SPRING_BOOT_HOME (convención de SDKMAN para `sdk home`). */
export function homeVariableName(candidate: string): string {
  return `${candidate.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_HOME`;
}
