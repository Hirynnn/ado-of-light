import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../src/services/http.js";
import { UniversalisClient } from "../src/services/universalis.js";

describe("robustez das respostas externas", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reporta falha de conexão sem precisar de consulta real", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchJson("https://example.test", 500, 0)).rejects.toThrow(
      "offline",
    );
  });

  it("trata respostas incompletas de histórico como ausência de registros", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await new UniversalisClient(
      "https://universalis.test/api/v2",
    ).getSales([10, 20], 3600, 10);
    expect(result).toEqual([
      { itemId: 10, entries: [] },
      { itemId: 20, entries: [] },
    ]);
  });
});
