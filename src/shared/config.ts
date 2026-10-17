import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Ajustes de SDKMAN que solo se pueden fijar en `etc/config`: `sdk()` lo recarga en cada llamada y pisa el entorno.
 * Como ese archivo puede ser del usuario (`~/.sdkman`), solo se toca cuando el usuario pide un ajuste y se restaura
 * el contenido original al terminar cada comando.
 */

export interface ConfigInputs {
  /** `sdkman_curl_connect_timeout` en segundos. */
  connectTimeout?: number;
  /** `sdkman_curl_max_time` en segundos. */
  maxTime?: number;
  /** `sdkman_insecure_ssl=true`: curl sin verificar certificados (proxies con inspección TLS). */
  insecureSsl?: boolean;
  /** `sdkman_debug_mode=true` (system.debug). */
  debug?: boolean;
}

export function buildConfigOverrides(inputs: ConfigInputs): Record<string, string> {
  const overrides: Record<string, string> = {};
  if (inputs.connectTimeout !== undefined) overrides.sdkman_curl_connect_timeout = String(inputs.connectTimeout);
  if (inputs.maxTime !== undefined) overrides.sdkman_curl_max_time = String(inputs.maxTime);
  if (inputs.insecureSsl) overrides.sdkman_insecure_ssl = "true";
  if (inputs.debug) overrides.sdkman_debug_mode = "true";
  return overrides;
}

/** Sustituye `key=...` o añade la línea si no existe. */
export function applyConfigOverrides(content: string, overrides: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(overrides)) {
    const line = new RegExp(`^${key}=.*$`, "m");
    result = line.test(result) ? result.replace(line, `${key}=${value}`) : `${result}${result === "" || result.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
  }
  return result;
}

/** Valor entero positivo de un input (vacío = sin ajuste). */
export function parsePositiveInt(name: string, value: string | undefined): number | undefined {
  const text = (value ?? "").trim();
  if (!text) return undefined;
  if (!/^\d+$/.test(text) || Number(text) < 1) throw new Error(`'${name}' must be a positive whole number of seconds, got '${text}'.`);
  return Number(text);
}

/** Ejecuta `fn` con los ajustes aplicados a `<sdkmanDir>/etc/config` y restaura el contenido original siempre. */
export async function withConfigOverrides<T>(sdkmanDir: string, overrides: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const file = path.join(sdkmanDir, "etc", "config");
  if (Object.keys(overrides).length === 0 || !fs.existsSync(file)) return fn();
  const original = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, applyConfigOverrides(original, overrides));
  try {
    return await fn();
  } finally {
    fs.writeFileSync(file, original);
  }
}
