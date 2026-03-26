import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from './api';

type LicenseActivation = {
  domain: string;
  createdAt: string;
  lastValidatedAt: string;
};

type LicenseRecord = {
  id: string;
  label: string | null;
  isActive: boolean;
  maxActivations: number;
  activations: LicenseActivation[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
};

type ReleaseRecord = {
  id: string;
  version: string;
  packageUrl: string;
  changelogUrl: string | null;
  minWpVersion: string | null;
  minPhpVersion: string | null;
  isPublished: boolean;
  isMandatory: boolean;
  publishedAt: string | null;
  createdAt: string;
};

type LicenseFormState = {
  licenseKey: string;
  label: string;
  maxActivations: string;
  expiresAt: string;
  isActive: boolean;
};

type ReleaseFormState = {
  version: string;
  packageUrl: string;
  changelogUrl: string;
  minWpVersion: string;
  minPhpVersion: string;
  isPublished: boolean;
  isMandatory: boolean;
};

type SuperadminWordpressNativeProps = {
  token: string;
};

function defaultLicenseForm(): LicenseFormState {
  return {
    licenseKey: '',
    label: '',
    maxActivations: '1',
    expiresAt: '',
    isActive: true,
  };
}

function defaultReleaseForm(): ReleaseFormState {
  return {
    version: '',
    packageUrl: '',
    changelogUrl: '',
    minWpVersion: '',
    minPhpVersion: '',
    isPublished: true,
    isMandatory: false,
  };
}

function randomSegment(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

function generateLicenseKey(): string {
  return `7A-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function SuperadminWordpressNative({ token }: SuperadminWordpressNativeProps) {
  const [activeTab, setActiveTab] = useState<'licenses' | 'releases'>('licenses');
  const [loadingLicenses, setLoadingLicenses] = useState(true);
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [savingLicense, setSavingLicense] = useState(false);
  const [savingRelease, setSavingRelease] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [licenseForm, setLicenseForm] = useState<LicenseFormState>(() =>
    defaultLicenseForm(),
  );
  const [releaseForm, setReleaseForm] = useState<ReleaseFormState>(() =>
    defaultReleaseForm(),
  );
  const [generatedKey, setGeneratedKey] = useState('');

  const loadLicenses = async (showLoading = true) => {
    if (showLoading) setLoadingLicenses(true);
    setError('');
    try {
      const data = await apiRequest<LicenseRecord[]>(token, '/wordpress/admin/licenses');
      setLicenses(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar licenças do plugin.',
      );
    } finally {
      if (showLoading) setLoadingLicenses(false);
    }
  };

  const loadReleases = async (showLoading = true) => {
    if (showLoading) setLoadingReleases(true);
    setError('');
    try {
      const data = await apiRequest<ReleaseRecord[]>(token, '/wordpress/admin/releases');
      setReleases(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar releases do plugin.',
      );
    } finally {
      if (showLoading) setLoadingReleases(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadLicenses(true), loadReleases(true)]);
  }, [token]);

  const activeLicenses = useMemo(
    () => licenses.filter((item) => item.isActive).length,
    [licenses],
  );

  const submitLicense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback('');
    setError('');

    const key = licenseForm.licenseKey.trim();
    const maxActivations = Number(licenseForm.maxActivations);
    if (key.length < 8) {
      setError('Informe uma chave de licença válida com pelo menos 8 caracteres.');
      return;
    }
    if (!Number.isFinite(maxActivations) || maxActivations < 1 || maxActivations > 100) {
      setError('Máximo de ativações deve estar entre 1 e 100.');
      return;
    }

    setSavingLicense(true);
    try {
      const payload: Record<string, unknown> = {
        licenseKey: key,
        maxActivations,
        isActive: licenseForm.isActive,
      };

      if (licenseForm.label.trim()) payload.label = licenseForm.label.trim();
      if (licenseForm.expiresAt) {
        payload.expiresAt = new Date(licenseForm.expiresAt).toISOString();
      }

      await apiRequest(token, '/wordpress/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setLicenseForm(defaultLicenseForm());
      setGeneratedKey('');
      setFeedback('Licença salva com sucesso.');
      await loadLicenses(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao salvar licença.',
      );
    } finally {
      setSavingLicense(false);
    }
  };

  const renewLicense = async (license: LicenseRecord) => {
    const rawDate = window.prompt(
      'Nova data de expiração (AAAA-MM-DD). Deixe em branco para remover prazo.',
      '',
    );
    if (rawDate === null) return;

    setFeedback('');
    setError('');
    try {
      const payload: Record<string, unknown> = {
        licenseKey: `RENEW-${license.id.slice(0, 8)}`,
        maxActivations: license.maxActivations,
        isActive: true,
      };
      if (rawDate.trim()) {
        payload.expiresAt = new Date(rawDate.trim()).toISOString();
      }

      await apiRequest(token, `/wordpress/admin/licenses/${license.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setFeedback('Licença renovada com sucesso.');
      await loadLicenses(false);
    } catch (renewError) {
      setError(
        renewError instanceof Error
          ? renewError.message
          : 'Falha ao renovar licença.',
      );
    }
  };

  const deleteLicense = async (license: LicenseRecord) => {
    const confirmed = window.confirm(
      `Apagar permanentemente a licença "${license.label ?? license.id}"?`,
    );
    if (!confirmed) return;

    setFeedback('');
    setError('');
    try {
      await apiRequest(token, `/wordpress/admin/licenses/${license.id}`, {
        method: 'DELETE',
      });
      setFeedback('Licença apagada com sucesso.');
      await loadLicenses(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Falha ao apagar licença.',
      );
    }
  };

  const submitRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback('');
    setError('');

    const version = releaseForm.version.trim();
    const packageUrl = releaseForm.packageUrl.trim();
    if (!version) {
      setError('Informe a versão da release.');
      return;
    }
    if (!packageUrl) {
      setError('Informe a URL do pacote ZIP.');
      return;
    }

    setSavingRelease(true);
    try {
      const payload: Record<string, unknown> = {
        version,
        packageUrl,
        isPublished: releaseForm.isPublished,
        isMandatory: releaseForm.isMandatory,
      };
      if (releaseForm.changelogUrl.trim()) {
        payload.changelogUrl = releaseForm.changelogUrl.trim();
      }
      if (releaseForm.minWpVersion.trim()) {
        payload.minWpVersion = releaseForm.minWpVersion.trim();
      }
      if (releaseForm.minPhpVersion.trim()) {
        payload.minPhpVersion = releaseForm.minPhpVersion.trim();
      }

      await apiRequest(token, '/wordpress/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setReleaseForm(defaultReleaseForm());
      setFeedback('Release publicada com sucesso.');
      await loadReleases(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao publicar release.',
      );
    } finally {
      setSavingRelease(false);
    }
  };

  return (
    <section className="native-page native-super-wordpress">
      <header className="native-page-header">
        <h2>Plugin WordPress</h2>
        <p>
          Gerencie licenças de ativação e releases do plugin 7academy com fluxo
          nativo e sem iframe.
        </p>
      </header>

      <div className="native-kpi-grid native-kpi-grid-small">
        <article className="native-kpi-card">
          <span>Licenças ativas</span>
          <strong>{activeLicenses}</strong>
          <small>{licenses.length} licença(s) no total</small>
        </article>
        <article className="native-kpi-card">
          <span>Releases</span>
          <strong>{releases.length}</strong>
          <small>Histórico completo do plugin</small>
        </article>
      </div>

      <div className="native-super-tabs">
        <button
          type="button"
          className={activeTab === 'licenses' ? 'active' : ''}
          onClick={() => setActiveTab('licenses')}
        >
          Licenças
        </button>
        <button
          type="button"
          className={activeTab === 'releases' ? 'active' : ''}
          onClick={() => setActiveTab('releases')}
        >
          Releases
        </button>
      </div>

      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {activeTab === 'licenses' ? (
        <div className="native-super-wordpress-grid">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Nova licença</h3>
            </header>

            {generatedKey ? (
              <div className="native-super-generated-key">
                <code>{generatedKey}</code>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    void window.navigator.clipboard.writeText(generatedKey);
                  }}
                >
                  Copiar
                </button>
              </div>
            ) : null}

            <form className="native-form-grid native-super-license-form" onSubmit={submitLicense}>
              <label>
                Chave de licença
                <div className="native-super-inline-field">
                  <input
                    value={licenseForm.licenseKey}
                    onChange={(event) =>
                      setLicenseForm((current) => ({
                        ...current,
                        licenseKey: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="7A-XXXX-YYYY-ZZZZ"
                    required
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const key = generateLicenseKey();
                      setGeneratedKey(key);
                      setLicenseForm((current) => ({ ...current, licenseKey: key }));
                    }}
                  >
                    Gerar
                  </button>
                </div>
              </label>

              <label>
                Identificação do cliente
                <input
                  value={licenseForm.label}
                  onChange={(event) =>
                    setLicenseForm((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Máx. ativações
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={licenseForm.maxActivations}
                  onChange={(event) =>
                    setLicenseForm((current) => ({
                      ...current,
                      maxActivations: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Expira em (opcional)
                <input
                  type="date"
                  value={licenseForm.expiresAt}
                  onChange={(event) =>
                    setLicenseForm((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="native-toggle-row">
                <div>
                  <strong>Licença ativa</strong>
                  <small>Permite novas ativações no plugin.</small>
                </div>
                <button
                  type="button"
                  className={`native-switch ${licenseForm.isActive ? 'active' : ''}`}
                  onClick={() =>
                    setLicenseForm((current) => ({
                      ...current,
                      isActive: !current.isActive,
                    }))
                  }
                >
                  <span />
                </button>
              </label>

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setGeneratedKey('');
                    setLicenseForm(defaultLicenseForm());
                  }}
                >
                  Limpar
                </button>
                <button type="submit" disabled={savingLicense}>
                  {savingLicense ? 'Salvando...' : 'Salvar licença'}
                </button>
              </div>
            </form>
          </article>

          <article className="native-panel native-super-wordpress-list">
            <header className="native-panel-header">
              <h3>Licenças cadastradas</h3>
              <button type="button" onClick={() => void loadLicenses(false)}>
                Atualizar
              </button>
            </header>

            {loadingLicenses ? <p className="native-info">Carregando licenças...</p> : null}

            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Ativações</th>
                    <th>Expiração</th>
                    <th>Criada em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {!loadingLicenses && licenses.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Nenhuma licença cadastrada.</td>
                    </tr>
                  ) : (
                    licenses.map((license) => (
                      <tr key={license.id}>
                        <td>{license.label ?? '-'}</td>
                        <td>
                          <span
                            className={`native-status-chip ${
                              license.isActive ? 'is-success' : 'is-danger'
                            }`}
                          >
                            {license.isActive ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td>
                          {license.activations.length}/{license.maxActivations}
                        </td>
                        <td>{formatDate(license.expiresAt ?? null)}</td>
                        <td>{formatDate(license.createdAt)}</td>
                        <td>
                          <div className="native-super-row-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                void renewLicense(license);
                              }}
                            >
                              Renovar
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                void deleteLicense(license);
                              }}
                            >
                              Apagar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : (
        <div className="native-super-wordpress-grid">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Nova release</h3>
            </header>

            <form className="native-form-grid native-super-release-form" onSubmit={submitRelease}>
              <label>
                Versão
                <input
                  value={releaseForm.version}
                  onChange={(event) =>
                    setReleaseForm((current) => ({
                      ...current,
                      version: event.target.value,
                    }))
                  }
                  placeholder="1.0.1"
                  required
                />
              </label>

              <label>
                URL do pacote ZIP
                <input
                  type="url"
                  value={releaseForm.packageUrl}
                  onChange={(event) =>
                    setReleaseForm((current) => ({
                      ...current,
                      packageUrl: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                  required
                />
              </label>

              <label>
                URL do changelog (opcional)
                <input
                  type="url"
                  value={releaseForm.changelogUrl}
                  onChange={(event) =>
                    setReleaseForm((current) => ({
                      ...current,
                      changelogUrl: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                WordPress mínimo
                <input
                  value={releaseForm.minWpVersion}
                  onChange={(event) =>
                    setReleaseForm((current) => ({
                      ...current,
                      minWpVersion: event.target.value,
                    }))
                  }
                  placeholder="6.0"
                />
              </label>

              <label>
                PHP mínimo
                <input
                  value={releaseForm.minPhpVersion}
                  onChange={(event) =>
                    setReleaseForm((current) => ({
                      ...current,
                      minPhpVersion: event.target.value,
                    }))
                  }
                  placeholder="8.0"
                />
              </label>

              <label className="native-toggle-row">
                <div>
                  <strong>Publicar imediatamente</strong>
                  <small>Se desligado, release fica em rascunho.</small>
                </div>
                <button
                  type="button"
                  className={`native-switch ${releaseForm.isPublished ? 'active' : ''}`}
                  onClick={() =>
                    setReleaseForm((current) => ({
                      ...current,
                      isPublished: !current.isPublished,
                    }))
                  }
                >
                  <span />
                </button>
              </label>

              <label className="native-toggle-row">
                <div>
                  <strong>Atualização obrigatória</strong>
                  <small>Bloqueia execução em versões antigas.</small>
                </div>
                <button
                  type="button"
                  className={`native-switch ${releaseForm.isMandatory ? 'active' : ''}`}
                  onClick={() =>
                    setReleaseForm((current) => ({
                      ...current,
                      isMandatory: !current.isMandatory,
                    }))
                  }
                >
                  <span />
                </button>
              </label>

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setReleaseForm(defaultReleaseForm())}
                >
                  Limpar
                </button>
                <button type="submit" disabled={savingRelease}>
                  {savingRelease ? 'Publicando...' : 'Publicar release'}
                </button>
              </div>
            </form>
          </article>

          <article className="native-panel native-super-wordpress-list">
            <header className="native-panel-header">
              <h3>Histórico de releases</h3>
              <button type="button" onClick={() => void loadReleases(false)}>
                Atualizar
              </button>
            </header>

            {loadingReleases ? <p className="native-info">Carregando releases...</p> : null}

            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Versão</th>
                    <th>Status</th>
                    <th>Obrigatória</th>
                    <th>WP mínimo</th>
                    <th>PHP mínimo</th>
                    <th>Publicada em</th>
                  </tr>
                </thead>
                <tbody>
                  {!loadingReleases && releases.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Nenhuma release cadastrada.</td>
                    </tr>
                  ) : (
                    releases.map((release) => (
                      <tr key={release.id}>
                        <td>
                          <strong>v{release.version}</strong>
                        </td>
                        <td>
                          <span
                            className={`native-status-chip ${
                              release.isPublished ? 'is-info' : 'is-muted'
                            }`}
                          >
                            {release.isPublished ? 'Publicada' : 'Rascunho'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`native-status-chip ${
                              release.isMandatory ? 'is-warning' : 'is-neutral'
                            }`}
                          >
                            {release.isMandatory ? 'Sim' : 'Não'}
                          </span>
                        </td>
                        <td>{release.minWpVersion ?? '-'}</td>
                        <td>{release.minPhpVersion ?? '-'}</td>
                        <td>{formatDate(release.publishedAt ?? release.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
