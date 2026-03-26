export type ApiErrorPayload = {
  message?: string | string[];
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function apiRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Falha na requisição (${response.status}).`;
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (Array.isArray(payload.message)) {
        message = payload.message.join(' ');
      } else if (typeof payload.message === 'string') {
        message = payload.message;
      }
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
