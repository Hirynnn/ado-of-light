import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return paths.flat();
}

describe("regra de não persistir dados de mercado", () => {
  it("não usa gravação de arquivos nem banco na aplicação", async () => {
    const files = await sourceFiles("src");
    const code = (
      await Promise.all(files.map((path) => readFile(path, "utf8")))
    ).join("\n");
    expect(code).not.toMatch(
      /writeFile|appendFile|createWriteStream|sqlite|postgres|mongodb|redis/i,
    );
  });
});
