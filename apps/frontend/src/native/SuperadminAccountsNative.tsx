import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest, formatCurrency } from './api';

type FinanceProvider = 'manual' | 'sicoob' | 'asaas' | 'stripe';
type FinanceEnvironment = 'sandbox' | 'production';

type DashboardAccount = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  finance: {
    provider: string;
    environment: string;
    isActive: boolean;
    isConfigured: boolean;
    updatedAt: string | null;
  };
};

type AccountsDashboardResponse = {
  overview: {
    totalAccounts: number;
    activeLearners: number;
    activeCourses: number;
    revenueMrr: number;
    configuredFinanceAccounts: number;
  };
  accounts: DashboardAccount[];
};

type AccountFinancialResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  finance: {
    provider: string;
    environment: string;
    isActive: boolean;
    isConfigured: boolean;
    updatedAt: string | null;
    sicoob: {
      clientId: string;
      tokenUrl: string;
      baseUrl: string;
      sandboxBaseUrl: string;
      webhookUrl: string;
      numeroCliente: string;
      scopes: string[];
      clientSecretConfigured: boolean;
      certificateConfigured: boolean;
      privateKeyConfigured: boolean;
    };
  };
};

type FinancialFormState = {
  provider: FinanceProvider;
  environment: FinanceEnvironment;
  isActive: boolean;
  genericApiKey: string;
  sicoobClientId: string;
  sicoobClientSecret: string;
  sicoobNumeroCliente: string;
  sicoobTokenUrl: string;
  sicoobBaseUrl: string;
  sicoobSandboxBaseUrl: string;
  sicoobWebhookUrl: string;
  sicoobScopes: string;
  sicoobCertificatePem: string;
  sicoobPrivateKeyPem: string;
};

type ConfigFlags = {
  clientSecretConfigured: boolean;
  certificateConfigured: boolean;
  privateKeyConfigured: boolean;
};

type SuperadminAccountsNativeProps = {
  token: string;
};

function defaultForm(): FinancialFormState {
  return {
    provider: 'manual',
    environment: 'sandbox',
    isActive: false,
    genericApiKey: '',
    sicoobClientId: '',
    sicoobClientSecret: '',
    sicoobNumeroCliente: '',
    sicoobTokenUrl: '',
    sicoobBaseUrl: '',
    sicoobSandboxBaseUrl: '',
    sicoobWebhookUrl: '',
    sicoobScopes: '',
    sicoobCertificatePem: '',
    sicoobPrivateKeyPem: '',
  };
}

function toProvider(value: string): FinanceProvider {
  if (value === 'manual' || value === 'sicoob' || value === 'asaas' || value === 'stripe') {
    return value;
  }
  return 'manual';
}

function toEnvironment(value: string): FinanceEnvironment {
  return value === 'production' ? 'production' : 'sandbox';
}

function financeStateLabel(account: DashboardAccount): string {
  if (!account.finance.isConfigured) return 'Não configurado';
  if (!account.finance.isActive) return 'Configurado (inativo)';
  return 'Ativo';
}

function financeStateTone(account: DashboardAccount): string {
  if (!account.finance.isConfigured) return 'is-warning';
  if (!account.finance.isActive) return 'is-muted';
  return 'is-success';
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function SuperadminAccountsNative({ token }: SuperadminAccountsNativeProps) {
  const [loading, setLoading] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [dashboard, setDashboard] = useState<AccountsDashboardResponse | null>(
    null,
  );
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [form, setForm] = useState<FinancialFormState>(() => defaultForm());
  const [configFlags, setConfigFlags] = useState<ConfigFlags>({
    clientSecretConfigured: false,
    certificateConfigured: false,
    privateKeyConfigured: false,
  });

  const loadDashboard = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = await apiRequest<AccountsDashboardResponse>(
        token,
        '/superadmin/accounts',
      );
      setDashboard(data);
      setSelectedAccountId((current) => {
        if (current && data.accounts.some((item) => item.id === current)) {
          return current;
        }
        return data.accounts[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar contas.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadFinancialConfig = async (accountId: string) => {
    if (!accountId) return;
    setLoadingConfig(true);
    setFormError('');

    try {
      const data = await apiRequest<AccountFinancialResponse>(
        token,
        `/superadmin/accounts/${accountId}/financial`,
      );
      const provider = toProvider(data.finance.provider);
      const environment = toEnvironment(data.finance.environment);

      setForm({
        provider,
        environment,
        isActive: Boolean(data.finance.isActive),
        genericApiKey: '',
        sicoobClientId: data.finance.sicoob.clientId ?? '',
        sicoobClientSecret: '',
        sicoobNumeroCliente: data.finance.sicoob.numeroCliente ?? '',
        sicoobTokenUrl: data.finance.sicoob.tokenUrl ?? '',
        sicoobBaseUrl: data.finance.sicoob.baseUrl ?? '',
        sicoobSandboxBaseUrl: data.finance.sicoob.sandboxBaseUrl ?? '',
        sicoobWebhookUrl: data.finance.sicoob.webhookUrl ?? '',
        sicoobScopes: Array.isArray(data.finance.sicoob.scopes)
          ? data.finance.sicoob.scopes.join(', ')
          : '',
        sicoobCertificatePem: '',
        sicoobPrivateKeyPem: '',
      });

      setConfigFlags({
        clientSecretConfigured: Boolean(data.finance.sicoob.clientSecretConfigured),
        certificateConfigured: Boolean(data.finance.sicoob.certificateConfigured),
        privateKeyConfigured: Boolean(data.finance.sicoob.privateKeyConfigured),
      });
    } catch (loadError) {
      setFormError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar configuração financeira.',
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    void loadDashboard(true);
  }, [token]);

  useEffect(() => {
    if (!selectedAccountId) return;
    void loadFinancialConfig(selectedAccountId);
  }, [selectedAccountId, token]);

  const accounts = dashboard?.accounts ?? [];

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccountId) {
      setFormError('Selecione uma conta para salvar o financeiro.');
      return;
    }

    setSaving(true);
    setFeedback('');
    setFormError('');
    setError('');

    try {
      const payload: Record<string, unknown> = {
        provider: form.provider,
        environment: form.environment,
        isActive: form.isActive,
      };

      if (form.provider === 'sicoob') {
        payload.sicoobClientId = form.sicoobClientId.trim();
        payload.sicoobClientSecret = form.sicoobClientSecret.trim() || undefined;
        payload.sicoobNumeroCliente = form.sicoobNumeroCliente.trim();
        payload.sicoobTokenUrl = form.sicoobTokenUrl.trim();
        payload.sicoobBaseUrl = form.sicoobBaseUrl.trim();
        payload.sicoobSandboxBaseUrl = form.sicoobSandboxBaseUrl.trim();
        payload.sicoobWebhookUrl = form.sicoobWebhookUrl.trim() || undefined;
        payload.sicoobScopes = form.sicoobScopes
          .split(/[\n,;]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        payload.sicoobCertificatePem = form.sicoobCertificatePem.trim() || undefined;
        payload.sicoobPrivateKeyPem = form.sicoobPrivateKeyPem.trim() || undefined;
      }

      if (form.provider !== 'manual' && form.provider !== 'sicoob') {
        payload.genericApiKey = form.genericApiKey.trim() || undefined;
      }

      await apiRequest(token, `/superadmin/accounts/${selectedAccountId}/financial`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setFeedback('Configuração financeira salva com sucesso.');
      await loadDashboard(false);
      await loadFinancialConfig(selectedAccountId);
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao salvar configuração financeira.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="native-page native-super-accounts">
      <header className="native-page-header">
        <h2>Gestão de contas</h2>
        <p>
          Configure provedor financeiro por conta admin/professor com criptografia
          no backend e sem recarregar página.
        </p>
      </header>

      <div className="native-kpi-grid native-super-kpi-grid">
        <article className="native-kpi-card">
          <span>Contas admin</span>
          <strong>{dashboard?.overview.totalAccounts ?? 0}</strong>
          <small>Total de clientes com painel</small>
        </article>
        <article className="native-kpi-card">
          <span>Financeiro ativo</span>
          <strong>{dashboard?.overview.configuredFinanceAccounts ?? 0}</strong>
          <small>Com gateway configurado e ativo</small>
        </article>
        <article className="native-kpi-card">
          <span>Alunos ativos</span>
          <strong>{dashboard?.overview.activeLearners ?? 0}</strong>
          <small>Usuários finais em operação</small>
        </article>
        <article className="native-kpi-card">
          <span>Cursos ativos</span>
          <strong>{dashboard?.overview.activeCourses ?? 0}</strong>
          <small>Catálogo atual da rede</small>
        </article>
        <article className="native-kpi-card">
          <span>MRR pago</span>
          <strong>{formatCurrency(dashboard?.overview.revenueMrr ?? 0)}</strong>
          <small>Mês corrente</small>
        </article>
      </div>

      {loading ? <p className="native-info">Carregando contas...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading && !error ? (
        <div className="native-super-accounts-grid">
          <article className="native-panel native-super-accounts-list-panel">
            <header className="native-panel-header">
              <h3>Contas cadastradas</h3>
              <button type="button" onClick={() => void loadDashboard(false)}>
                Recarregar
              </button>
            </header>

            <div className="native-toolbar">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou e-mail..."
              />
            </div>

            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Financeiro</th>
                    <th>API</th>
                    <th>Atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Nenhuma conta encontrada.</td>
                    </tr>
                  ) : (
                    filteredAccounts.map((account) => (
                      <tr
                        key={account.id}
                        className={
                          account.id === selectedAccountId
                            ? 'native-super-row-active'
                            : undefined
                        }
                        onClick={() => setSelectedAccountId(account.id)}
                      >
                        <td>
                          <strong>{account.name}</strong>
                          <br />
                          <small>{account.email}</small>
                        </td>
                        <td>
                          <span className={`native-status-chip ${financeStateTone(account)}`}>
                            {financeStateLabel(account)}
                          </span>
                        </td>
                        <td>{(account.finance.provider || 'manual').toUpperCase()}</td>
                        <td>
                          {formatDate(account.finance.updatedAt ?? account.updatedAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="native-panel native-super-finance-panel">
            <header className="native-panel-header">
              <h3>Financeiro da conta</h3>
            </header>

            {selectedAccount ? (
              <>
                <div className="native-super-selected-account">
                  <strong>{selectedAccount.name}</strong>
                  <small>{selectedAccount.email}</small>
                </div>

                <form className="native-form-grid native-super-finance-form" onSubmit={submit}>
                  <label>
                    Provedor
                    <select
                      value={form.provider}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          provider: toProvider(event.target.value),
                        }))
                      }
                    >
                      <option value="manual">Manual (sem gateway)</option>
                      <option value="sicoob">Sicoob</option>
                      <option value="asaas">Asaas</option>
                      <option value="stripe">Stripe</option>
                    </select>
                  </label>

                  <label>
                    Ambiente
                    <select
                      value={form.environment}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          environment: toEnvironment(event.target.value),
                        }))
                      }
                    >
                      <option value="sandbox">Sandbox</option>
                      <option value="production">Produção</option>
                    </select>
                  </label>

                  <label className="native-toggle-row native-super-toggle-row">
                    <div>
                      <strong>Gateway ativo para a conta</strong>
                      <small>Ativa cobrança automatizada para este cliente.</small>
                    </div>
                    <button
                      type="button"
                      className={`native-switch ${form.isActive ? 'active' : ''}`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          isActive: !current.isActive,
                        }))
                      }
                    >
                      <span />
                    </button>
                  </label>

                  {form.provider !== 'manual' && form.provider !== 'sicoob' ? (
                    <label>
                      API Key
                      <input
                        type="password"
                        value={form.genericApiKey}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            genericApiKey: event.target.value,
                          }))
                        }
                        placeholder="Cole a API key do provedor"
                      />
                    </label>
                  ) : null}

                  {form.provider === 'sicoob' ? (
                    <div className="native-super-sicoob-grid">
                      <p className="native-super-note">
                        Sicoob usa OAuth 2.0 Client Credentials com mTLS e
                        certificado A1 ICP-Brasil.
                      </p>

                      <label>
                        Client ID
                        <input
                          value={form.sicoobClientId}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobClientId: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Client Secret
                        <input
                          type="password"
                          value={form.sicoobClientSecret}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobClientSecret: event.target.value,
                            }))
                          }
                          placeholder="Preencha para cadastrar/atualizar"
                        />
                        <small>
                          {configFlags.clientSecretConfigured
                            ? 'Client Secret já configurado'
                            : 'Client Secret ainda não cadastrado'}
                        </small>
                      </label>

                      <label>
                        Número do cliente/cedente
                        <input
                          value={form.sicoobNumeroCliente}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobNumeroCliente: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL de token OAuth
                        <input
                          value={form.sicoobTokenUrl}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobTokenUrl: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base de produção
                        <input
                          value={form.sicoobBaseUrl}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobBaseUrl: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base de sandbox
                        <input
                          value={form.sicoobSandboxBaseUrl}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobSandboxBaseUrl: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Escopos (separados por vírgula)
                        <input
                          value={form.sicoobScopes}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobScopes: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Webhook URL (opcional)
                        <input
                          value={form.sicoobWebhookUrl}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobWebhookUrl: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Certificado público (PEM/CRT)
                        <textarea
                          rows={4}
                          value={form.sicoobCertificatePem}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobCertificatePem: event.target.value,
                            }))
                          }
                          placeholder="-----BEGIN CERTIFICATE-----"
                        />
                        <small>
                          {configFlags.certificateConfigured
                            ? 'Certificado já configurado'
                            : 'Certificado ainda não cadastrado'}
                        </small>
                      </label>

                      <label>
                        Chave privada (PEM/KEY)
                        <textarea
                          rows={4}
                          value={form.sicoobPrivateKeyPem}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobPrivateKeyPem: event.target.value,
                            }))
                          }
                          placeholder="-----BEGIN PRIVATE KEY-----"
                        />
                        <small>
                          {configFlags.privateKeyConfigured
                            ? 'Chave privada já configurada'
                            : 'Chave privada ainda não cadastrada'}
                        </small>
                      </label>
                    </div>
                  ) : null}

                  {loadingConfig ? (
                    <p className="native-info">Carregando configuração da conta...</p>
                  ) : null}
                  {formError ? <p className="native-error">{formError}</p> : null}

                  <div className="native-modal-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (!selectedAccountId) return;
                        void loadFinancialConfig(selectedAccountId);
                      }}
                    >
                      Recarregar campos
                    </button>
                    <button type="submit" disabled={saving || loadingConfig}>
                      {saving ? 'Salvando...' : 'Salvar financeiro'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <p className="native-info">
                Selecione uma conta na lista para editar o financeiro.
              </p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
