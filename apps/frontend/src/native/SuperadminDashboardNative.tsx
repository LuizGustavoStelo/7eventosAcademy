import { useEffect, useMemo, useState } from 'react';
import { apiRequest, formatCurrency } from './api';

type SuperadminAccount = {
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
  accounts: SuperadminAccount[];
};

type StorageLimitResponse = {
  limitGb: number;
  usedBytes: number;
  usedGb: number;
};

type PaymentGatewayResponse = {
  provider: string;
  isConfigured: boolean;
};

type WordpressLicense = {
  id: string;
  isActive: boolean;
  maxActivations: number;
  activations: Array<{ domain: string }>;
};

type WordpressRelease = {
  id: string;
  version: string;
  isPublished: boolean;
  isMandatory: boolean;
  publishedAt: string | null;
  createdAt: string;
};

type SuperadminDashboardNativeProps = {
  token: string;
  onNavigate: (sectionId: string) => void;
};

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

export function SuperadminDashboardNative({
  token,
  onNavigate,
}: SuperadminDashboardNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<AccountsDashboardResponse | null>(
    null,
  );
  const [storage, setStorage] = useState<StorageLimitResponse | null>(null);
  const [gateway, setGateway] = useState<PaymentGatewayResponse | null>(null);
  const [licenses, setLicenses] = useState<WordpressLicense[]>([]);
  const [releases, setReleases] = useState<WordpressRelease[]>([]);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [dashboardData, storageData, gatewayData, licenseData, releaseData] =
        await Promise.all([
          apiRequest<AccountsDashboardResponse>(token, '/superadmin/accounts'),
          apiRequest<StorageLimitResponse>(token, '/settings/storage-limit'),
          apiRequest<PaymentGatewayResponse>(token, '/settings/payment-gateway'),
          apiRequest<WordpressLicense[]>(token, '/wordpress/admin/licenses'),
          apiRequest<WordpressRelease[]>(token, '/wordpress/admin/releases'),
        ]);

      setDashboard(dashboardData);
      setStorage(storageData);
      setGateway(gatewayData);
      setLicenses(Array.isArray(licenseData) ? licenseData : []);
      setReleases(Array.isArray(releaseData) ? releaseData : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar o dashboard global.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void loadData(false);
    }, 120_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token]);

  const storagePercent = useMemo(() => {
    if (!storage || storage.limitGb <= 0) return 0;
    return Math.max(0, Math.min(100, (storage.usedGb / storage.limitGb) * 100));
  }, [storage]);

  const latestRelease = useMemo(() => {
    if (releases.length === 0) return null;
    const published = releases.find((item) => item.isPublished);
    return published ?? releases[0];
  }, [releases]);

  const activeLicenses = useMemo(
    () => licenses.filter((item) => item.isActive).length,
    [licenses],
  );

  const recentAccounts = useMemo(
    () => (dashboard?.accounts ?? []).slice(0, 5),
    [dashboard],
  );

  return (
    <section className="native-page native-super-dashboard">
      <header className="native-page-header">
        <h2>Painel executivo da plataforma</h2>
        <p>
          Visão global de contas, financeiro e plugin WordPress com atualização
          leve e renderização nativa.
        </p>
      </header>

      <div className="native-kpi-grid native-super-kpi-grid">
        <article className="native-kpi-card">
          <span>Contas admin</span>
          <strong>{dashboard?.overview.totalAccounts ?? 0}</strong>
          <small>Instituições com painel próprio</small>
        </article>
        <article className="native-kpi-card">
          <span>Alunos ativos</span>
          <strong>{dashboard?.overview.activeLearners ?? 0}</strong>
          <small>Usuários finais da rede</small>
        </article>
        <article className="native-kpi-card">
          <span>MRR aprovado</span>
          <strong>{formatCurrency(dashboard?.overview.revenueMrr ?? 0)}</strong>
          <small>Mês corrente</small>
        </article>
        <article className="native-kpi-card">
          <span>Licenças WP ativas</span>
          <strong>{activeLicenses}</strong>
          <small>{licenses.length} licença(s) no total</small>
        </article>
        <article className="native-kpi-card">
          <span>Financeiro configurado</span>
          <strong>{dashboard?.overview.configuredFinanceAccounts ?? 0}</strong>
          <small>Contas com gateway ativo</small>
        </article>
      </div>

      {loading ? <p className="native-info">Carregando visão global...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}

      {!loading && !error ? (
        <div className="native-super-grid">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Saúde da infraestrutura</h3>
              <button type="button" onClick={() => void loadData(false)}>
                Atualizar
              </button>
            </header>

            <div className="native-super-health">
              <div className="native-super-health-card">
                <span>Armazenamento global</span>
                <strong>
                  {(storage?.usedGb ?? 0).toFixed(2)} GB / {storage?.limitGb ?? 0} GB
                </strong>
                <div className="native-storage-track">
                  <div
                    className={`native-storage-fill ${
                      storagePercent > 90 ? 'is-danger' : ''
                    }`}
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
                <small>{storagePercent.toFixed(1)}% utilizado</small>
              </div>

              <div className="native-super-health-card">
                <span>Gateway global</span>
                <strong>{(gateway?.provider ?? 'Nenhum').toUpperCase()}</strong>
                <small>
                  {gateway?.isConfigured
                    ? 'Credencial cadastrada no cofre seguro'
                    : 'Sem credencial global cadastrada'}
                </small>
              </div>

              <div className="native-super-health-card">
                <span>Última release do plugin</span>
                <strong>
                  {latestRelease ? `v${latestRelease.version}` : 'Sem release'}
                </strong>
                <small>
                  {latestRelease
                    ? `Publicada em ${formatDate(
                        latestRelease.publishedAt ?? latestRelease.createdAt,
                      )}`
                    : 'Cadastre uma release para habilitar atualização'}
                </small>
              </div>
            </div>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Contas recentes</h3>
              <button
                type="button"
                onClick={() => onNavigate('superadmin_gestao_contas')}
              >
                Abrir gestão
              </button>
            </header>

            <div className="native-super-accounts-list">
              {recentAccounts.length === 0 ? (
                <p className="native-info">Nenhuma conta admin cadastrada.</p>
              ) : (
                recentAccounts.map((account) => (
                  <article key={account.id} className="native-super-account-row">
                    <div>
                      <strong>{account.name}</strong>
                      <small>{account.email}</small>
                    </div>
                    <div className="native-super-account-meta">
                      <span
                        className={`native-status-chip ${
                          account.finance.isActive && account.finance.isConfigured
                            ? 'is-success'
                            : 'is-warning'
                        }`}
                      >
                        {account.finance.isActive && account.finance.isConfigured
                          ? 'Financeiro ativo'
                          : 'Pendente'}
                      </span>
                      <small>
                        Atualizado em{' '}
                        {formatDate(account.finance.updatedAt ?? account.updatedAt)}
                      </small>
                    </div>
                  </article>
                ))
              )}
            </div>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Ações rápidas</h3>
            </header>
            <div className="native-super-actions">
              <button
                type="button"
                onClick={() => onNavigate('superadmin_gestao_contas')}
              >
                Configurar financeiro das contas
              </button>
              <button
                type="button"
                onClick={() => onNavigate('superadmin_wordpress_plugin')}
              >
                Gerenciar plugin WordPress
              </button>
              <button
                type="button"
                onClick={() => onNavigate('superadmin_impersonacao')}
              >
                Fluxo de impersonação
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
