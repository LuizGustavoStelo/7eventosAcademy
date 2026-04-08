import { toPtBrApiMessage } from '../errorMessages';

export type ApiErrorPayload = {
  message?: string | string[];
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const GET_CACHE_TTL_MS = 8_000;
const RATE_LIMIT_RETRY_ATTEMPTS = 3;
const RATE_LIMIT_BASE_DELAY_MS = 800;

const inFlightRequests = new Map<string, Promise<unknown>>();
const getResponseCache = new Map<string, { expiresAt: number; data: unknown }>();
const rateLimitBackoffByKey = new Map<string, number>();

type ApiRequestOptions = {
  cacheTtlMs?: number;
  bypassCache?: boolean;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) {
    const diff = asDate - Date.now();
    if (diff > 0) return diff;
  }

  return null;
}

function computeRetryDelayMs(cacheKey: string, response: Response, attempt: number): number {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
  if (retryAfterMs && retryAfterMs > 0) {
    return retryAfterMs;
  }

  const previousDelay = rateLimitBackoffByKey.get(cacheKey) ?? RATE_LIMIT_BASE_DELAY_MS;
  const multiplied = previousDelay * Math.max(1, attempt + 1);
  const nextBase = Math.min(8_000, multiplied);
  const jitter = Math.round(Math.random() * 250);
  return nextBase + jitter;
}

export async function apiRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET';
  const shouldUseCache = isGet && !options?.bypassCache;
  const cacheKey = `${method}::${token}::${path}`;
  const cacheTtlMs = options?.cacheTtlMs ?? GET_CACHE_TTL_MS;

  if (isGet) {
    const cached = getResponseCache.get(cacheKey);
    if (shouldUseCache && cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) {
      return (await inFlight) as T;
    }
  }

  const executeRequest = async () => {
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_ATTEMPTS; attempt += 1) {
      const backoffUntil = rateLimitBackoffByKey.get(cacheKey) ?? 0;
      if (backoffUntil > Date.now()) {
        await sleep(backoffUntil - Date.now());
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });

      if (response.status === 429 && attempt < RATE_LIMIT_RETRY_ATTEMPTS) {
        const retryDelayMs = computeRetryDelayMs(cacheKey, response, attempt);
        rateLimitBackoffByKey.set(cacheKey, Date.now() + retryDelayMs);
        await sleep(retryDelayMs);
        continue;
      }

      rateLimitBackoffByKey.delete(cacheKey);

      if (!response.ok) {
        let message = `Falha na requisição (${response.status}).`;
        try {
          const payload = (await response.json()) as ApiErrorPayload;
          message = toPtBrApiMessage(payload.message, message);
        } catch {
          // mantém mensagem padrão
        }
        throw new Error(message);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    }

    throw new Error('Limite de requisições atingido temporariamente. Tente novamente em instantes.');
  };

  if (isGet) {
    const promise = executeRequest();
    inFlightRequests.set(cacheKey, promise as Promise<unknown>);
    try {
      const data = await promise;
      if (shouldUseCache) {
        getResponseCache.set(cacheKey, {
          expiresAt: Date.now() + cacheTtlMs,
          data,
        });
      }
      return data;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  }

  const data = await executeRequest();
  getResponseCache.clear();
  inFlightRequests.clear();
  return data;
}

export function clearApiGetCache() {
  getResponseCache.clear();
  inFlightRequests.clear();
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

export function formatDateTime(iso: string | Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sem horário definido';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
