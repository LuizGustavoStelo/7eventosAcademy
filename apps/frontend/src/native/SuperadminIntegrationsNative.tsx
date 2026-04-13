import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from './api';

type IntegrationOverview = {
  provider: 'kobayashi';
  isConfigured: boolean;
  isActive: boolean;
  environment: 'production' | 'sandbox' | string;
  updatedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

type InstitutionOverview = {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerAdmin: {
    id: string;
    name: string;
    email: string;
  } | null;
  integration: IntegrationOverview;
};

type InstitutionsListResponse = {
  institutions: InstitutionOverview[];
};

type InstitutionProviderConfigResponse = {
  institution: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  integration: {
    id: string | null;
    provider: 'kobayashi';
    environment: 'production' | 'sandbox' | string;
    isActive: boolean;
    isConfigured: boolean;
    updatedAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    kobayashi: {
      baseUrl: string;
      clientId: string;
      clientSecretConfigured: boolean;
      clientSecretMasked: string | null;
      tokenConfigured: boolean;
      tokenMasked: string | null;
      authorizationBearerConfigured: boolean;
      authorizationBearerMasked: string | null;
      grantType: string;
      scopes: string[];
      defaultGcssid: string;
      defaultIdentificacaoVendedor: string;
      defaultOfertaCursoId: string;
    };
  };
};

type TestRequestResponse = {
  success: boolean;
  endpoint: string;
  integrationActive: boolean;
  environment: string;
  request: {
    hasAuthorizationBearer: boolean;
    payload: Record<string, unknown>;
  };
  response: {
    statusCode: number;
    ok: boolean;
    body: unknown;
  };
};

type IntegrationDispatchLog = {
  id: string;
  provider: string;
  status: string;
  studentId: string | null;
  studentName: string;
  enrollmentId: string | null;
  contractInstanceId: string | null;
  responseStatusCode: number | null;
  errorMessage: string | null;
  createdAt: string;
};

type IntegrationDispatchLogsResponse = {
  institution: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  provider: string;
  limit: number;
  logs: IntegrationDispatchLog[];
};

type FormState = {
  environment: 'production' | 'sandbox';
  isActive: boolean;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  token: string;
  authorizationBearer: string;
  grantType: string;
  scopes: string;
  defaultGcssid: string;
  defaultIdentificacaoVendedor: string;
  defaultOfertaCursoId: string;
};

type SecretFlags = {
  clientSecretConfigured: boolean;
  tokenConfigured: boolean;
  authorizationBearerConfigured: boolean;
  clientSecretMasked: string | null;
  tokenMasked: string | null;
  authorizationBearerMasked: string | null;
};

type SuperadminIntegrationsNativeProps = {
  token: string;
};

const DEFAULT_FORM: FormState = {
  environment: 'production',
  isActive: false,
  baseUrl: 'https://apiappdo.facinpro.flie.com.br',
  clientId: '',
  clientSecret: '',
  token: '',
  authorizationBearer: '',
  grantType: 'client_credentials',
  scopes: 'cobranca.parceiro, b2b.parceiro',
  defaultGcssid: '',
  defaultIdentificacaoVendedor: '',
  defaultOfertaCursoId: '',
};

const DEFAULT_SECRET_FLAGS: SecretFlags = {
  clientSecretConfigured: false,
  tokenConfigured: false,
  authorizationBearerConfigured: false,
  clientSecretMasked: null,
  tokenMasked: null,
  authorizationBearerMasked: null,
};

function normalizeSearch(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatDate(value: string | null | undefined): string {
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

function buildTestPayloadTemplate(form: FormState) {
  const scopeEntries = form.scopes
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

  return JSON.stringify(
    {
      gcssid: form.defaultGcssid || '9999999999999999999999999',
      matricula: {
        orderId: `${Date.now()}`,
        telefoneCelular: '62999999999',
        nomeCompleto: 'ALUNO DE TESTE',
        nomeSocial: 'Aluno',
        sexo: 'M',
        dataNascimento: '1990-01-01',
        eMail: 'aluno.teste@exemplo.com',
        CPF: '99999999999',
        enderecoCidade: 'Rio de Janeiro',
        enderecoUF: 'RJ',
        enderecoPais: 'Brasil',
        identificacaoVendedor:
          form.defaultIdentificacaoVendedor || 'vendedor-padrao',
        ofertaCursoID: form.defaultOfertaCursoId || '999999',
        valorTotal: '0.00',
        valorPago: '0',
        tipoPagamento: '7',
      },
      grant_type: form.grantType || 'client_credentials',
      scopes: scopeEntries.length > 0 ? scopeEntries : [{ name: 'b2b.parceiro' }],
    },
    null,
    2,
  );
}

function toForm(data: InstitutionProviderConfigResponse): FormState {
  return {
    environment:
      data.integration.environment === 'sandbox' ? 'sandbox' : 'production',
    isActive: Boolean(data.integration.isActive),
    baseUrl: data.integration.kobayashi.baseUrl || DEFAULT_FORM.baseUrl,
    clientId: data.integration.kobayashi.clientId || '',
    clientSecret: '',
    token: '',
    authorizationBearer: '',
    grantType: data.integration.kobayashi.grantType || 'client_credentials',
    scopes: Array.isArray(data.integration.kobayashi.scopes)
      ? data.integration.kobayashi.scopes.join(', ')
      : DEFAULT_FORM.scopes,
    defaultGcssid: data.integration.kobayashi.defaultGcssid || '',
    defaultIdentificacaoVendedor:
      data.integration.kobayashi.defaultIdentificacaoVendedor || '',
    defaultOfertaCursoId: data.integration.kobayashi.defaultOfertaCursoId || '',
  };
}

function toSecretFlags(data: InstitutionProviderConfigResponse): SecretFlags {
  return {
    clientSecretConfigured: Boolean(
      data.integration.kobayashi.clientSecretConfigured,
    ),
    tokenConfigured: Boolean(data.integration.kobayashi.tokenConfigured),
    authorizationBearerConfigured: Boolean(
      data.integration.kobayashi.authorizationBearerConfigured,
    ),
    clientSecretMasked: data.integration.kobayashi.clientSecretMasked ?? null,
    tokenMasked: data.integration.kobayashi.tokenMasked ?? null,
    authorizationBearerMasked:
      data.integration.kobayashi.authorizationBearerMasked ?? null,
  };
}

export function SuperadminIntegrationsNative({
  token,
}: SuperadminIntegrationsNativeProps) {
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [search, setSearch] = useState('');
  const [institutions, setInstitutions] = useState<InstitutionOverview[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [secretFlags, setSecretFlags] = useState<SecretFlags>(
    DEFAULT_SECRET_FLAGS,
  );
  const [lastResult, setLastResult] = useState<TestRequestResponse | null>(null);
  const [dispatchLogs, setDispatchLogs] = useState<IntegrationDispatchLog[]>([]);
  const [testPayload, setTestPayload] = useState(
    buildTestPayloadTemplate(DEFAULT_FORM),
  );

  const loadInstitutions = async (showLoading = true) => {
    if (showLoading) setLoadingInstitutions(true);
    setError('');
    try {
      const data = await apiRequest<InstitutionsListResponse>(
        token,
        '/superadmin/integrations/institutions',
      );
      const rows = Array.isArray(data.institutions) ? data.institutions : [];
      setInstitutions(rows);
      setSelectedInstitutionId((current) => {
        if (current && rows.some((item) => item.id === current)) return current;
        return rows[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar instituições.',
      );
    } finally {
      if (showLoading) setLoadingInstitutions(false);
    }
  };

  const loadConfig = async (institutionId: string) => {
    if (!institutionId) return;
    setLoadingConfig(true);
    setError('');
    try {
      const data = await apiRequest<InstitutionProviderConfigResponse>(
        token,
        `/superadmin/integrations/institutions/${institutionId}/providers/kobayashi`,
      );
      const nextForm = toForm(data);
      setForm(nextForm);
      setSecretFlags(toSecretFlags(data));
      setTestPayload(buildTestPayloadTemplate(nextForm));
      setLastResult(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar configuração da integração.',
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadDispatchLogs = async (institutionId: string, limit = 50) => {
    if (!institutionId) return;
    setLoadingLogs(true);
    try {
      const data = await apiRequest<IntegrationDispatchLogsResponse>(
        token,
        `/superadmin/integrations/institutions/${institutionId}/providers/kobayashi/logs?limit=${limit}`,
      );
      setDispatchLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar auditoria de envios.',
      );
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadInstitutions(true);
  }, [token]);

  useEffect(() => {
    if (!selectedInstitutionId) return;
    void Promise.all([
      loadConfig(selectedInstitutionId),
      loadDispatchLogs(selectedInstitutionId),
    ]);
  }, [selectedInstitutionId, token]);

  const filteredInstitutions = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return institutions;
    return institutions.filter((institution) => {
      const target = normalizeSearch(
        `${institution.name} ${institution.slug} ${institution.ownerAdmin?.name ?? ''} ${institution.ownerAdmin?.email ?? ''}`,
      );
      return target.includes(query);
    });
  }, [institutions, search]);

  const selectedInstitution = useMemo(
    () => institutions.find((item) => item.id === selectedInstitutionId) ?? null,
    [institutions, selectedInstitutionId],
  );

  const configuredCount = useMemo(
    () => institutions.filter((item) => item.integration.isConfigured).length,
    [institutions],
  );

  const activeCount = useMemo(
    () =>
      institutions.filter(
        (item) => item.integration.isConfigured && item.integration.isActive,
      ).length,
    [institutions],
  );

  const submitIntegration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInstitutionId) {
      setError('Selecione uma instituição para salvar.');
      return;
    }

    setError('');
    setFeedback('');
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        environment: form.environment,
        isActive: form.isActive,
        kobayashiBaseUrl: form.baseUrl.trim(),
        kobayashiClientId: form.clientId.trim(),
        kobayashiGrantType: form.grantType.trim() || 'client_credentials',
        kobayashiDefaultGcssid: form.defaultGcssid.trim(),
        kobayashiDefaultIdentificacaoVendedor:
          form.defaultIdentificacaoVendedor.trim(),
        kobayashiDefaultOfertaCursoId: form.defaultOfertaCursoId.trim(),
      };

      const parsedScopes = form.scopes
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean);

      if (parsedScopes.length > 0) {
        payload.kobayashiScopes = parsedScopes;
      }

      if (form.clientSecret.trim()) {
        payload.kobayashiClientSecret = form.clientSecret.trim();
      }
      if (form.token.trim()) {
        payload.kobayashiToken = form.token.trim();
      }
      if (form.authorizationBearer.trim()) {
        payload.kobayashiAuthorizationBearer = form.authorizationBearer.trim();
      }

      await apiRequest(
        token,
        `/superadmin/integrations/institutions/${selectedInstitutionId}/providers/kobayashi`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      setFeedback('Configuração da integração salva com sucesso.');
      setForm((current) => ({
        ...current,
        clientSecret: '',
        token: '',
        authorizationBearer: '',
      }));
      await Promise.all([
        loadConfig(selectedInstitutionId),
        loadInstitutions(false),
        loadDispatchLogs(selectedInstitutionId),
      ]);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao salvar integração.',
      );
    } finally {
      setSaving(false);
    }
  };

  const submitTestRequest = async () => {
    if (!selectedInstitutionId) {
      setError('Selecione uma instituição para executar o teste.');
      return;
    }

    setError('');
    setFeedback('');
    setTesting(true);

    let parsedPayload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(testPayload) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Payload inválido');
      }
      parsedPayload = parsed as Record<string, unknown>;
    } catch {
      setTesting(false);
      setError('O payload de teste precisa ser um JSON válido.');
      return;
    }

    try {
      const result = await apiRequest<TestRequestResponse>(
        token,
        `/superadmin/integrations/institutions/${selectedInstitutionId}/providers/kobayashi/test-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: parsedPayload }),
        },
      );
      setLastResult(result);
      setFeedback(
        result.response.ok
          ? 'Teste executado com sucesso.'
          : 'Teste executado, mas a API retornou falha.',
      );
      await Promise.all([
        loadInstitutions(false),
        loadDispatchLogs(selectedInstitutionId),
      ]);
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : 'Falha ao executar teste da integração.',
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="native-page native-super-integrations">
      <header className="native-page-header">
        <h2>Integrações</h2>
        <p>
          Configure integrações por instituição. Nesta versão já está disponível o
          provedor KOBAYASHI com teste de envio em tempo real.
        </p>
      </header>

      <div className="native-kpi-grid native-kpi-grid-small">
        <article className="native-kpi-card">
          <span>Instituições</span>
          <strong>{institutions.length}</strong>
          <small>Total no tenant global</small>
        </article>
        <article className="native-kpi-card">
          <span>Configuradas</span>
          <strong>{configuredCount}</strong>
          <small>Com credenciais cadastradas</small>
        </article>
        <article className="native-kpi-card">
          <span>Ativas</span>
          <strong>{activeCount}</strong>
          <small>Integrações habilitadas</small>
        </article>
      </div>

      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      <div className="native-super-integrations-grid">
        <article className="native-panel native-super-integrations-list">
          <header className="native-panel-header">
            <h3>Instituições</h3>
            <button type="button" onClick={() => void loadInstitutions(true)}>
              Atualizar
            </button>
          </header>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por instituição, slug, admin ou e-mail..."
          />

          {loadingInstitutions ? (
            <p className="native-info">Carregando instituições...</p>
          ) : (
            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Instituição</th>
                    <th>Status</th>
                    <th>Integração</th>
                    <th>Atualizado em</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstitutions.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Nenhuma instituição encontrada.</td>
                    </tr>
                  ) : (
                    filteredInstitutions.map((institution) => {
                      const selected = institution.id === selectedInstitutionId;
                      return (
                        <tr
                          key={institution.id}
                          className={selected ? 'is-selected' : ''}
                          onClick={() => setSelectedInstitutionId(institution.id)}
                        >
                          <td>
                            <strong>{institution.name}</strong>
                            <small>{institution.slug}</small>
                          </td>
                          <td>
                            <span
                              className={`native-status-chip ${
                                institution.status === 'active'
                                  ? 'is-success'
                                  : 'is-warning'
                              }`}
                            >
                              {institution.status === 'active' ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`native-status-chip ${
                                institution.integration.isConfigured
                                  ? institution.integration.isActive
                                    ? 'is-info'
                                    : 'is-muted'
                                  : 'is-warning'
                              }`}
                            >
                              {!institution.integration.isConfigured
                                ? 'Não configurada'
                                : institution.integration.isActive
                                  ? 'Configurada e ativa'
                                  : 'Configurada (inativa)'}
                            </span>
                          </td>
                          <td>{formatDate(institution.integration.updatedAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="native-panel">
          <header className="native-panel-header">
            <h3>Configuração KOBAYASHI</h3>
            {selectedInstitution ? (
              <small>
                {selectedInstitution.name} ({selectedInstitution.slug})
              </small>
            ) : null}
          </header>

          {!selectedInstitution ? (
            <p className="native-info">
              Selecione uma instituição para editar a integração.
            </p>
          ) : (
            <form className="native-form-grid native-super-integration-form" onSubmit={submitIntegration}>
              <label>
                Ambiente
                <select
                  value={form.environment}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      environment:
                        event.target.value === 'sandbox' ? 'sandbox' : 'production',
                    }))
                  }
                >
                  <option value="production">Produção</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </label>

              <label className="native-toggle-row">
                <div>
                  <strong>Integração ativa</strong>
                  <small>Quando ativa, pode ser usada pelos fluxos oficiais.</small>
                </div>
                <button
                  type="button"
                  className={`native-switch ${form.isActive ? 'active' : ''}`}
                  onClick={() =>
                    setForm((current) => ({ ...current, isActive: !current.isActive }))
                  }
                >
                  <span />
                </button>
              </label>

              <label>
                URL base da API
                <input
                  type="url"
                  value={form.baseUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  placeholder="https://apiappdo.facinpro.flie.com.br"
                  required
                />
              </label>

              <label>
                Client ID
                <input
                  value={form.clientId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, clientId: event.target.value }))
                  }
                  placeholder="UUID do client_id"
                  required
                />
              </label>

              <label>
                Client Secret
                <input
                  type="password"
                  value={form.clientSecret}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      clientSecret: event.target.value,
                    }))
                  }
                  placeholder="Deixe em branco para manter o atual"
                />
                <small>
                  {secretFlags.clientSecretConfigured
                    ? `Segredo atual: ${secretFlags.clientSecretMasked ?? 'configurado'}`
                    : 'Nenhum segredo salvo ainda'}
                </small>
              </label>

              <label>
                Authorization Bearer (opcional)
                <input
                  type="password"
                  value={form.authorizationBearer}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      authorizationBearer: event.target.value,
                    }))
                  }
                  placeholder="Pode começar com Bearer ou sem prefixo"
                />
                <small>
                  {secretFlags.authorizationBearerConfigured
                    ? `Bearer atual: ${secretFlags.authorizationBearerMasked ?? 'configurado'}`
                    : 'Se vazio, o sistema gera Bearer com client_id;client_secret'}
                </small>
              </label>

              <label>
                Token alternativo (opcional)
                <input
                  type="password"
                  value={form.token}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, token: event.target.value }))
                  }
                  placeholder="Fallback de token caso não use Authorization Bearer"
                />
                <small>
                  {secretFlags.tokenConfigured
                    ? `Token atual: ${secretFlags.tokenMasked ?? 'configurado'}`
                    : 'Token alternativo não configurado'}
                </small>
              </label>

              <label>
                Grant type
                <input
                  value={form.grantType}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, grantType: event.target.value }))
                  }
                  placeholder="client_credentials"
                />
              </label>

              <label>
                Scopes (separados por vírgula)
                <input
                  value={form.scopes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scopes: event.target.value }))
                  }
                  placeholder="cobranca.parceiro, b2b.parceiro"
                />
              </label>

              <label>
                GCSSID padrão (opcional)
                <input
                  value={form.defaultGcssid}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultGcssid: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Identificação do vendedor padrão (opcional)
                <input
                  value={form.defaultIdentificacaoVendedor}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultIdentificacaoVendedor: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                OfertaCursoID padrão (opcional)
                <input
                  value={form.defaultOfertaCursoId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultOfertaCursoId: event.target.value,
                    }))
                  }
                />
              </label>

              {loadingConfig ? (
                <p className="native-info">Carregando configuração...</p>
              ) : null}

              {selectedInstitution.integration.lastErrorMessage ? (
                <p className="native-super-integration-note">
                  Último erro: {selectedInstitution.integration.lastErrorMessage}
                </p>
              ) : null}

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (!selectedInstitutionId) return;
                    void Promise.all([
                      loadConfig(selectedInstitutionId),
                      loadDispatchLogs(selectedInstitutionId),
                    ]);
                  }}
                >
                  Recarregar campos
                </button>
                <button type="submit" disabled={saving || loadingConfig}>
                  {saving ? 'Salvando...' : 'Salvar integração'}
                </button>
              </div>
            </form>
          )}
        </article>
      </div>

      {selectedInstitution ? (
        <article className="native-panel native-super-test-request">
          <header className="native-panel-header">
            <h3>Teste de request KOBAYASHI</h3>
            <small>
              Último sucesso: {formatDate(selectedInstitution.integration.lastSuccessAt)}
            </small>
          </header>

          <p className="native-super-integration-note">
            O teste envia um `POST /b2b/VendaRubeus` com `client_id` e
            `Authorization: Bearer ...`, aplicando os defaults da configuração da
            instituição quando o payload não informar esses campos.
          </p>

          <label>
            Payload JSON
            <textarea
              rows={14}
              value={testPayload}
              onChange={(event) => setTestPayload(event.target.value)}
            />
          </label>

          <div className="native-modal-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setTestPayload(buildTestPayloadTemplate(form))}
              disabled={testing}
            >
              Regerar exemplo
            </button>
            <button type="button" onClick={() => void submitTestRequest()} disabled={testing}>
              {testing ? 'Enviando teste...' : 'Enviar payload de teste'}
            </button>
          </div>

          {lastResult ? (
            <pre>
              {JSON.stringify(
                {
                  endpoint: lastResult.endpoint,
                  statusCode: lastResult.response.statusCode,
                  ok: lastResult.response.ok,
                  body: lastResult.response.body,
                },
                null,
                2,
              )}
            </pre>
          ) : null}

          <div className="native-super-integration-audit">
            <header className="native-panel-header">
              <h3>Auditoria de envios</h3>
              <button
                type="button"
                onClick={() => {
                  if (!selectedInstitutionId) return;
                  void loadDispatchLogs(selectedInstitutionId);
                }}
              >
                Atualizar auditoria
              </button>
            </header>

            {loadingLogs ? (
              <p className="native-info">Carregando auditoria...</p>
            ) : null}

            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Data/hora</th>
                    <th>Aluno</th>
                    <th>Status</th>
                    <th>HTTP</th>
                    <th>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {!loadingLogs && dispatchLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Nenhum envio auditado para esta instituição.</td>
                    </tr>
                  ) : (
                    dispatchLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDate(log.createdAt)}</td>
                        <td>
                          <strong>{log.studentName || 'Aluno não identificado'}</strong>
                          <small>{log.studentId ? `#${log.studentId.slice(0, 8)}` : '-'}</small>
                        </td>
                        <td>
                          <span
                            className={`native-status-chip ${
                              log.status === 'success' ? 'is-success' : 'is-danger'
                            }`}
                          >
                            {log.status === 'success' ? 'Sucesso' : 'Falha'}
                          </span>
                        </td>
                        <td>{log.responseStatusCode ?? '-'}</td>
                        <td>{log.errorMessage || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
