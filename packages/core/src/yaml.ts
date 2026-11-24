/**
 * Tiny YAML emitter for roua.yaml (objects, string lists, scalars).
 * Strings are emitted JSON-quoted, which is valid YAML and never ambiguous.
 */

function scalar(v: unknown): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null || v === undefined) return "null";
  return JSON.stringify(String(v));
}

function emit(value: unknown, indent: string, out: string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("emit expects an object");
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const key = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(k) ? k : JSON.stringify(k);
    if (Array.isArray(v)) {
      out.push(`${indent}${key}: [${v.map(scalar).join(", ")}]`);
    } else if (v && typeof v === "object") {
      if (Object.keys(v).length === 0) out.push(`${indent}${key}: {}`);
      else {
        out.push(`${indent}${key}:`);
        emit(v, indent + "  ", out);
      }
    } else {
      out.push(`${indent}${key}: ${scalar(v)}`);
    }
  }
}

export function configToYaml(config: object, header?: string): string {
  const out: string[] = header ? header.split("\n").map((l) => `# ${l}`) : [];
  emit(config, "", out);
  return out.join("\n") + "\n";
}
