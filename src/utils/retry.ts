/**
 * Exponential backoff with jitter for retries
 */
export function exponentialBackoffWithJitter(
  attempt: number,
  baseDelayMs: number = 200,
  maxDelayMs: number = 30000
): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  const jitter = Math.random() * delay * 0.5;
  return Math.floor(delay + jitter);
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < options.maxRetries) {
        const delay = exponentialBackoffWithJitter(attempt, options.baseDelayMs, options.maxDelayMs);
        options.onRetry?.(lastError, attempt + 1, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
