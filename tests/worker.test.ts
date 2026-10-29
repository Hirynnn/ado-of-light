import { describe, expect, it } from "vitest";
import worker, {
  allowPriceLookup,
  verifyDiscordSignature,
} from "../src/worker/index.js";

describe("proteções da API", () => {
  it("aplica limite em memória por IP e janela de um minuto", () => {
    const ip = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 8; i += 1)
      expect(allowPriceLookup(ip, 1000 + i)).toBe(true);
    expect(allowPriceLookup(ip, 1009)).toBe(false);
    expect(allowPriceLookup(ip, 62_000)).toBe(true);
  });

  it("rejeita assinatura ausente ou malformada sem consultar APIs", async () => {
    expect(
      await verifyDiscordSignature(
        new Request("https://example.test"),
        "{}",
        undefined,
      ),
    ).toBe(false);
    expect(
      await verifyDiscordSignature(
        new Request("https://example.test", {
          headers: {
            "x-signature-ed25519": "bad",
            "x-signature-timestamp": "123",
          },
        }),
        "{}",
        "a".repeat(64),
      ),
    ).toBe(false);
  });

  it("valida requisições HTTP e entrega health sem acesso upstream", async () => {
    const invalid = await worker.fetch(
      new Request("https://example.test/api/preco?nome=x"),
      {},
      { waitUntil() {} },
    );
    expect(invalid.status).toBe(400);
    const health = await worker.fetch(
      new Request("https://example.test/health"),
      {},
      { waitUntil() {} },
    );
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      service: "ado-of-light",
    });
  });
});
