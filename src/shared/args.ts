/**
 * Divide una línea de comando en argumentos (sin shell).
 *  - espacios separan argumentos
 *  - "dobles" y 'simples' agrupan; dentro de "dobles" `\"` es una comilla literal
 *  - `\` fuera de eso es literal (rutas de Windows: C:\proyecto\.venv)
 */
export function splitArgs(line: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let hasToken = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = undefined;
      else if (quote === '"' && c === "\\" && line[i + 1] === '"') current += line[++i];
      else current += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      hasToken = true;
    } else if (/\s/.test(c)) {
      if (hasToken) args.push(current);
      current = "";
      hasToken = false;
    } else {
      current += c;
      hasToken = true;
    }
  }
  if (quote) throw new Error(`Unclosed ${quote} quote in: ${line}`);
  if (hasToken) args.push(current);
  return args;
}

/** Líneas `KEY=VALUE` (ignora vacías y comentarios `#`) -> objeto de variables de entorno. */
export function parseEnv(value: string | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of (value ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) throw new Error(`Invalid env line '${trimmed}'. Expected KEY=VALUE`);
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}
