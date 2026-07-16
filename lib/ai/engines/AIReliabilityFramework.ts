/**
 * lib/ai/engines/AIReliabilityFramework.ts
 *
 * AI Reliability Framework (ARF) for Phase 3.
 * Centralizes request tracing, timeout limits, retries with backoff, diagnostics logging,
 * and system health checks.
 */

export interface DiagnosticLog {
  requestId: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: any;
}

export class AIReliabilityFramework {
  private static logHistory: DiagnosticLog[] = [];

  /**
   * Generates a pipeline Request ID for tracing.
   */
  static generateRequestId(): string {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const seq = String(now.getTime()).slice(-6);
    return `MOMIN-${datePart}-${seq}`;
  }

  /**
   * Retries an async function with exponential backoff.
   */
  static async executeWithRetry<T>(
    apiFn: () => Promise<T>,
    retries = 3,
    delayMs = 300,
    requestId = "SYSTEM"
  ): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return await apiFn();
      } catch (err) {
        attempt++;
        const backoff = delayMs * Math.pow(2, attempt - 1);
        this.logDiagnostic(
          requestId,
          `warn`,
          `Attempt ${attempt} failed: ${(err as Error).message}. Retrying in ${backoff}ms...`
        );
        if (attempt >= retries) {
          this.logDiagnostic(
            requestId,
            `error`,
            `All retry attempts (${retries}) failed for request.`
          );
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw new Error("ARF: Max retries executed without returning.");
  }

  /**
   * Promisified timeout wrapper.
   */
  static wrapWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs = 5000,
    requestId = "SYSTEM"
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.logDiagnostic(
          requestId,
          `error`,
          `Timeout triggered: Operation exceeded limit of ${timeoutMs}ms.`
        );
        reject(new Error(`Timeout: Operation took longer than ${timeoutMs}ms.`));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Register structured log entries in memory.
   */
  static logDiagnostic(
    requestId: string,
    level: "info" | "warn" | "error",
    message: string,
    meta?: any
  ): void {
    const logEntry: DiagnosticLog = {
      requestId,
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
    };
    this.logHistory.push(logEntry);

    // Standard structured stdout output
    const metaSuffix = meta ? ` | Meta: ${JSON.stringify(meta)}` : "";
    console.log(
      `[${logEntry.timestamp}] [${level.toUpperCase()}] [${requestId}] ${message}${metaSuffix}`
    );
  }

  /**
   * Returns copy of stored diagnostics logs.
   */
  static getDiagnostics(requestId?: string): DiagnosticLog[] {
    if (requestId) {
      return this.logHistory.filter((l) => l.requestId === requestId);
    }
    return [...this.logHistory];
  }
}
