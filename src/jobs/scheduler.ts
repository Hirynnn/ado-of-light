import type { Environment } from "../core/types.js";
import { runScheduledPublication } from "./publish.js";

const SAO_PAULO_OFFSET_HOURS = 3;

export class DailyPublisher {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastRunDate: string | undefined;

  constructor(private readonly env: Environment) {}

  start(): void {
    this.scheduleNextNoon();
  }

  wake(): {
    status: "waiting" | "publishing" | "already_published";
    scheduledFor: string;
  } {
    const now = new Date();
    const day = getSaoPauloDateKey(now);
    const noon = getSaoPauloNoon(now);

    if (now >= noon) {
      if (this.lastRunDate === day)
        return {
          status: "already_published",
          scheduledFor: noon.toISOString(),
        };
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.publishForDay(day), 0);
      return { status: "publishing", scheduledFor: noon.toISOString() };
    }

    return { status: "waiting", scheduledFor: noon.toISOString() };
  }

  private scheduleNextNoon(): void {
    const now = new Date();
    let noon = getSaoPauloNoon(now);
    if (noon <= now) noon = new Date(noon.getTime() + 24 * 60 * 60 * 1000);
    const day = getSaoPauloDateKey(noon);
    const delay = noon.getTime() - now.getTime();

    console.info(
      `Próxima publicação agendada para ${noon.toISOString()} (12h em São Paulo).`,
    );
    this.timer = setTimeout(() => {
      void this.publishForDay(day);
    }, delay);
  }

  private async publishForDay(day: string): Promise<void> {
    if (this.lastRunDate === day) return;
    this.lastRunDate = day;

    try {
      await runScheduledPublication(this.env, new Date());
      console.info(`Publicação de ${day} concluída.`);
    } catch (error) {
      console.error(
        `Falha na publicação de ${day}:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.scheduleNextNoon();
    }
  }
}

function getSaoPauloNoon(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(
    Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      12 + SAO_PAULO_OFFSET_HOURS,
    ),
  );
}

function getSaoPauloDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const month = String(get("month")).padStart(2, "0");
  const day = String(get("day")).padStart(2, "0");
  return `${get("year")}-${month}-${day}`;
}
