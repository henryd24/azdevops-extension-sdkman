import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as tl from "azure-pipelines-task-lib";

/**
 * Helpers de salida compartidos: log legible en el agente (grupos plegables, tablas de texto)
 * y un resumen en markdown que Azure Pipelines muestra en la pestaña "Extensions" de la ejecución.
 */

/** Cabecera destacada en el log (`##[section]`). */
export function section(title: string): void {
  console.log(`##[section]${title}`);
}

/** Ejecuta `fn` dentro de un grupo plegable del log (`##[group]` / `##[endgroup]`). */
export async function group<T>(title: string, fn: () => Promise<T> | T): Promise<T> {
  console.log(`##[group]${title}`);
  try {
    return await fn();
  } finally {
    console.log("##[endgroup]");
  }
}

/** 850 -> "850ms", 12_300 -> "12.3s", 83_000 -> "1m 23s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** Tabla de texto con columnas alineadas, para el log. */
export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

/** Escapa una celda de tabla markdown. */
export function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Tabla markdown. */
export function mdTable(headers: string[], rows: string[][]): string {
  const row = (cells: string[]) => `| ${cells.map(mdCell).join(" | ")} |`;
  return [row(headers), row(headers.map(() => "---")), ...rows.map(row)].join("\n");
}

/**
 * Publica `markdown` como resumen de la ejecución (`##vso[task.uploadsummary]`).
 * Nunca hace fallar la tarea: el resumen es opcional.
 */
export function publishSummary(name: string, markdown: string): void {
  try {
    const dir = process.env.AGENT_TEMPDIRECTORY || os.tmpdir();
    const file = path.join(dir, `${name}-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(file, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
    tl.uploadSummary(file);
  } catch (err) {
    tl.debug(`Could not publish the summary: ${err instanceof Error ? err.message : String(err)}`);
  }
}
