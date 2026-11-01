export async function fetchJson<T>(
  url: string,
  timeoutMs = 20_000,
  maxRetries = 2,
  retryUntilMs?: number,
): Promise<T> {
  if (retryUntilMs !== undefined)
    return fetchJsonUntil<T>(url, timeoutMs, retryUntilMs);

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Ado-of-Light/1.0 (FFXIV market lookup)",
        },
      });
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < maxRetries
      ) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5000)
            : (attempt + 1) * 800;
        await response.arrayBuffer().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      if (!response.ok)
        throw new Error(
          `HTTP ${response.status} ao consultar ${new URL(url).host}.`,
        );
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (
        attempt < maxRetries &&
        !(error instanceof Error && error.message.startsWith("HTTP 4"))
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, (attempt + 1) * 500),
        );
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Falha de rede sem resposta válida.");
}

async function fetchJsonUntil<T>(
  url: string,
  timeoutMs: number,
  deadlineMs: number,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  const host = new URL(url).host;

  while (Date.now() < deadlineMs) {
    const remainingMs = deadlineMs - Date.now();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(timeoutMs, remainingMs),
    );
    let waitMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempt, 6));

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Ado-of-Light/1.0 (FFXIV market lookup)",
        },
      });

      if (response.ok) return (await response.json()) as T;

      const error = new Error(`HTTP ${response.status} ao consultar ${host}.`);
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;

      const retryAfter = Number(response.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0)
        waitMs = retryAfter * 1000;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("HTTP 4") &&
        !error.message.startsWith("HTTP 429")
      )
        throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
    }

    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, remaining)));
    attempt += 1;
  }

  const detail =
    lastError instanceof Error ? ` Último erro: ${lastError.message}` : "";
  throw new Error(`Tempo limite de uma hora consultando ${host}.${detail}`);
}

export function normalizeBaseUrl(
  value: string | undefined,
  fallback: string,
): string {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

export function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size)
    result.push(values.slice(i, i + size));
  return result;
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= values.length) return;
        results[index] = await mapper(values[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
