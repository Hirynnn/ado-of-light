import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { Environment } from "./core/types.js";
import { DailyPublisher } from "./jobs/scheduler.js";

const env = process.env as Environment;
const port = Number(process.env.PORT ?? 10000);

if (
  !env.DISCORD_BOT_TOKEN ||
  !env.DISCORD_CHANNEL_ID ||
  !env.RENDER_WAKE_TOKEN
) {
  throw new Error(
    "Configure DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID e RENDER_WAKE_TOKEN no Render.",
  );
}

const publisher = new DailyPublisher(env);
publisher.start();

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "ado-of-light" }));
    return;
  }

  if (request.method === "POST" && request.url === "/wake") {
    const authorization = request.headers.authorization ?? "";
    if (!hasValidToken(authorization, env.RENDER_WAKE_TOKEN!)) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const result = publisher.wake();
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.info(`Ado of Light ouvindo na porta ${port}.`);
});

function hasValidToken(authorization: string, expectedToken: string): boolean {
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  const received = Buffer.from(authorization.slice(prefix.length));
  const expected = Buffer.from(expectedToken);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
