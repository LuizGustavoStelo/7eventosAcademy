import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest, formatDateTime } from './api';

type DashboardAccount = {
  id: string;
  name: string;
  email: string;
  finance: {
    isActive: boolean;
    isConfigured: boolean;
  };
};

type AccountsDashboardResponse = {
  accounts: DashboardAccount[];
};

type LocalImpersonationRequest = {
  id: string;
  accountId: string;
  accountName: string;
  reason: string;
  durationMinutes: number;
  createdAt: string;
};

type ImpersonationSession = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'admin' | 'superadmin';
    avatarUrl?: string | null;
  };
  impersonation: {
    active: true;
    actorId: string;
    actorName: string;
    actorEmail: string;
    reason: string;
    durationMinutes: number;
    startedAt: string;
    expiresAt: string;
  };
};

type SuperadminImpersonationNativeProps = {
  token: string;
  onNavigate: (sectionId: string) => void;
  onImpersonated: (session: ImpersonationSession) => void;
};

const REQUESTS_STORAGE_KEY = 'academy-superadmin-impersonation-requests';

export function SuperadminImpersonationNative({
  token,
  onNavigate,
  onImpersonated,
}: SuperadminImpersonationNativeProps) {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('20');
  const [reason, setReason] = useState('');
  const [requests, setRequests] = useState<LocalImpersonationRequest[]>([]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<AccountsDashboardResponse>(
        token,
        '/superadmin/accounts',
      );
      const rows = Array.isArray(data.accounts) ? data.accounts : [];
      setAccounts(rows);
      setSelectedAccountId((current) => {
        if (current && rows.some((item) => item.id === current)) return current;
        return rows[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar contas para impersonação.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REQUESTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as LocalImpersonationRequest[];
      if (!Array.isArray(parsed)) return;
      setRequests(parsed);
    } catch {
      // ignora histórico corrompido
    }
  }, []);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((item) => {
      const target = `${item.name} ${item.email}`.toLowerCase();
      return target.includes(query);
    });
  }, [accounts, search]);

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback('');
    setError('');

    const selected = selectedAccount;
    const duration = Number(durationMinutes);
    const cleanReason = reason.trim();

    if (!selected) {
      setError('Selecione uma conta para continuar.');
      return;
    }
    if (!Number.isFinite(duration) || duration < 5 || duration > 120) {
      setError('Duração inválida. Use entre 5 e 120 minutos.');
      return;
    }
    if (cleanReason.length < 8) {
      setError('Descreva a justificativa com pelo menos 8 caracteres.');
      return;
    }

    const entry: LocalImpersonationRequest = {
      id: `${selected.id}-${Date.now()}`,
      accountId: selected.id,
      accountName: selected.name,
      reason: cleanReason,
      durationMinutes: duration,
      createdAt: new Date().toISOString(),
    };

    const next = [entry, ...requests].slice(0, 10);
    setRequests(next);
    try {
      window.localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignora erro de persistência local
    }

    setStarting(true);
    try {
      const session = await apiRequest<ImpersonationSession>(
        token,
        `/superadmin/accounts/${selected.id}/impersonation-token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: cleanReason,
            durationMinutes: duration,
          }),
        },
      );

      setFeedback('Sessão de impersonação iniciada.');
      onImpersonated(session);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : 'Falha ao iniciar impersonação.',
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="native-page native-super-impersonation">
      <header className="native-page-header">
        <h2>Impersonação de usuário</h2>
        <p>
          Fluxo assistido para acesso temporário a contas clientes com
          justificativa obrigatória e sessão segura.
        </p>
      </header>

      <div className="native-super-stepper">
        <div className="native-super-step active">
          <span>1</span>
          <small>Conta</small>
        </div>
        <div className="native-super-step active">
          <span>2</span>
          <small>Administrador</small>
        </div>
        <div className="native-super-step active">
          <span>3</span>
          <small>Justificativa</small>
        </div>
        <div className="native-super-step active">
          <span>4</span>
          <small>Execução</small>
        </div>
      </div>

      {loading ? <p className="native-info">Carregando contas...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading ? (
        <div className="native-super-impersonation-grid">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Selecionar conta (tenant)</h3>
              <button type="button" onClick={() => void loadData()}>
                Recarregar
              </button>
            </header>

            <div className="native-toolbar">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar conta por nome ou e-mail..."
              />
            </div>

            <div className="native-super-tenant-list">
              {filteredAccounts.length === 0 ? (
                <p className="native-info">Nenhuma conta encontrada.</p>
              ) : (
                filteredAccounts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`native-super-tenant-card ${
                      selectedAccountId === item.id ? 'active' : ''
                    }`}
                    onClick={() => setSelectedAccountId(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <small>{item.email}</small>
                    <span
                      className={`native-status-chip ${
                        item.finance.isActive && item.finance.isConfigured
                          ? 'is-success'
                          : 'is-warning'
                      }`}
                    >
                      {item.finance.isActive && item.finance.isConfigured
                        ? 'Financeiro ativo'
                        : 'Configuração pendente'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </article>

          <aside className="native-panel">
            <header className="native-panel-header">
              <h3>Resumo da operação</h3>
            </header>

            <form
              className="native-form-grid native-super-impersonation-form"
              onSubmit={(event) => {
                void submitRequest(event);
              }}
            >
              <div className="native-super-summary-box">
                <strong>Conta alvo</strong>
                <small>{selectedAccount?.name ?? 'Selecione uma conta'}</small>
              </div>

              <label>
                Duração prevista (minutos)
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                />
              </label>

              <label>
                Justificativa obrigatória
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex: suporte ao cliente para ajuste de cobrança da turma..."
                />
              </label>

              <div className="native-super-security-note">
                <span className="material-symbols-outlined">shield</span>
                <p>
                  Toda impersonação é temporária e deve ser rastreável. Ao iniciar,
                  a plataforma trocará para o painel admin da conta selecionada.
                </p>
              </div>

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onNavigate('superadmin_gestao_contas')}
                >
                  Abrir gestão de contas
                </button>
                <button type="submit" disabled={starting}>
                  {starting ? 'Iniciando...' : 'Iniciar impersonação'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      <article className="native-panel">
        <header className="native-panel-header">
          <h3>Solicitações recentes</h3>
        </header>
        <div className="native-super-request-list">
          {requests.length === 0 ? (
            <p className="native-info">Nenhuma solicitação registrada nesta sessão.</p>
          ) : (
            requests.map((request) => (
              <article key={request.id} className="native-super-request-item">
                <strong>{request.accountName}</strong>
                <small>
                  {request.durationMinutes} min • {formatDateTime(request.createdAt)}
                </small>
                <p>{request.reason}</p>
              </article>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
