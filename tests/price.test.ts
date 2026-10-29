import { afterEach, describe, expect, it, vi } from "vitest";
import { weightedSaleAverage } from "../src/core/market.js";
import { lookupPrice, validateItemName } from "../src/services/price.js";

describe("consulta de preços", () => {
  it("valida nome e limites de entrada", () => {
    expect(validateItemName("  Excalibur  ")).toBe("Excalibur");
    expect(validateItemName(" ")).toBeNull();
    expect(validateItemName("x")).toBeNull();
    expect(validateItemName("x".repeat(101))).toBeNull();
    expect(validateItemName("Item\nFalso")).toBeNull();
    expect(validateItemName(42)).toBeNull();
  });

  it("calcula média ponderada somente com vendas válidas", () => {
    expect(
      weightedSaleAverage([
        { timestamp: 1, quantity: 2, pricePerUnit: 10 },
        { timestamp: 2, quantity: 1, pricePerUnit: 40 },
        { timestamp: 3, quantity: 0, pricePerUnit: 500 },
      ]),
    ).toBe(20);
  });

  it("trata um item não encontrado sem consultar Universalis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(
      lookupPrice("Item inexistente", {
        XIVAPI_BASE_URL: "https://xivapi.test/api",
      }),
    ).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  afterEach(() => vi.unstubAllGlobals());
});
