import { toPtBrApiMessage } from '../errorMessages';
export type ApiErrorPayload = {
  message?: string | string[];
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const GET_CACHE_TTL_MS = 8_000;
const inFlightRequests = new Map<string, Promise<unknown>>();
const getResponseCache = new Map<string, { expiresAt: number; data: unknown }>();

type ApiRequestOptions = {
  cacheTtlMs?: number;
  bypassCache?: boolean;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

export async function apiRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const shouldUseCache = method === 'GET' && !options?.bypassCache;
  const cacheKey = `${token}::${path}`;
  const cacheTtlMs = options?.cacheTtlMs ?? GET_CACHE_TTL_MS;

  if (shouldUseCache) {
    const cached = getResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) {
      return (await inFlight) as T;
    }
  }

  const executeRequest = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });

      if (response.status === 429 && attempt === 0) {
        const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '');
        const retryDelayMs =
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 800;
        await sleep(retryDelayMs);
        continue;
      }

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

    throw new Error('Limite de requisições atingido temporariamente.');
  };

  if (shouldUseCache) {
    const promise = executeRequest();
    inFlightRequests.set(cacheKey, promise as Promise<unknown>);
    try {
      const data = await promise;
      getResponseCache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        data,
      });
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
