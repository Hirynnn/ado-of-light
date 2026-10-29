import type { Environment } from "../core/types.js";
import { runScheduledPublication } from "./publish.js";

try {
  const publish = process.env.PUBLISH_TO_DISCORD !== "false";
  await runScheduledPublication(
    process.env as Environment,
    new Date(),
    publish,
  );
  console.info(
    publish
      ? "Publicação concluída."
      : "Prévia concluída sem publicar no Discord.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Falha ao publicar rankings.",
  );
  process.exitCode = 1;
}
