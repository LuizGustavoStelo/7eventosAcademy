import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest } from './api';

type SettingsUser = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'superadmin';
  avatarUrl?: string | null;
};

type GatewayConfig = {
  provider: string;
  environment: string;
  isActive: boolean;
  isConfigured: boolean;
  updatedAt: string | null;
};

type SettingsFormState = {
  name: string;
  email: string;
};

type SettingsNativeProps = {
  token: string;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  onProfileUpdated: (user: SettingsUser) => void;
};

const ASSISTANT_PREF_KEY = 'academy-pref-ai-assistant';

function roleLabel(role: SettingsUser['role']): string {
  if (role === 'superadmin') return 'Superadmin';
  if (role === 'admin') return 'Administrador';
  return 'Usuário';
}

export function SettingsNative({
  token,
  isDarkTheme,
  onToggleTheme,
  onProfileUpdated,
}: SettingsNativeProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [gateway, setGateway] = useState<GatewayConfig | null>(null);
  const [form, setForm] = useState<SettingsFormState>({ name: '', email: '' });
  const [assistantEnabled, setAssistantEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(ASSISTANT_PREF_KEY) !== '0';
    } catch {
      return true;
    }
  });

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [me, gatewayConfig] = await Promise.all([
        apiRequest<SettingsUser>(token, '/auth/me'),
        apiRequest<GatewayConfig>(token, '/finance/gateway-config'),
      ]);

      setUser(me);
      setForm({ name: me.name || '', email: me.email || '' });
      setGateway(gatewayConfig);
      onProfileUpdated(me);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar configurações.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [token]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ASSISTANT_PREF_KEY,
        assistantEnabled ? '1' : '0',
      );
    } catch {
      // ignora erro de persistência local
    }
  }, [assistantEnabled]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');
    setError('');

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name || !email) {
      setFormError('Preencha nome e e-mail.');
      return;
    }

    setSaving(true);
    try {
      const updated = await apiRequest<SettingsUser>(token, '/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      setUser(updated);
      setForm({ name: updated.name || '', email: updated.email || '' });
      onProfileUpdated(updated);
      setFeedback('Perfil atualizado com sucesso.');
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao atualizar perfil.',
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarBusy(true);
    setError('');
    setFeedback('');
    try {
      const body = new FormData();
      body.append('avatar', file);
      const updated = await apiRequest<SettingsUser>(token, '/auth/me/avatar', {
        method: 'POST',
        body,
      });
      setUser(updated);
      onProfileUpdated(updated);
      setFeedback('Foto de perfil atualizada.');
    } catch (avatarError) {
      setError(
        avatarError instanceof Error
          ? avatarError.message
          : 'Falha ao enviar foto de perfil.',
      );
    } finally {
      setAvatarBusy(false);
      event.target.value = '';
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    setError('');
    setFeedback('');
    try {
      const updated = await apiRequest<SettingsUser>(token, '/auth/me/avatar', {
        method: 'DELETE',
      });
      setUser(updated);
      onProfileUpdated(updated);
      setFeedback('Foto de perfil removida.');
    } catch (avatarError) {
      setError(
        avatarError instanceof Error
          ? avatarError.message
          : 'Falha ao remover foto de perfil.',
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const gatewayBadge = useMemo(() => {
    if (!gateway) {
      return {
        text: 'CARREGANDO',
        className: 'is-neutral',
        description: 'Conectando ao cofre central.',
      };
    }

    if (gateway.isConfigured && gateway.isActive) {
      return {
        text: 'OPERACIONAL',
        className: 'is-success',
        description: `Credenciais ativas em ${gateway.environment}.`,
      };
    }

    return {
      text: 'INATIVO',
      className: 'is-danger',
      description: 'Aguardando configuração do Superadmin.',
    };
  }, [gateway]);

  return (
    <section className="native-page native-settings">
      <header className="native-page-header">
        <h2>Configurações da conta</h2>
        <p>
          Atualize seu perfil, preferências da plataforma e verifique o estado da
          integração financeira.
        </p>
      </header>

      {loading ? <p className="native-info">Carregando configurações...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading ? (
        <div className="native-settings-grid">
          <section className="native-panel">
            <header className="native-panel-header">
              <h3>Informações pessoais</h3>
            </header>

            <form className="native-form-grid native-settings-form" onSubmit={saveProfile}>
              <div className="native-settings-avatar-row">
                <img
                  src={
                    user?.avatarUrl ||
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuA6JjzOkcoW1jjwl4MxWtGg70kxNhuS5i4yiASNVUSmMSJTmk1hG-uXd2ebDgFkp3HqGdjOCKqpw4wQQ14tJaw4ZDTS_5tIvgB_n6xuPgy7GrSymxiuQ8yBSKsU7B5OdgOlcHOPJidOkVxHOeoqlsT02pOEEwUT2EpFTVHFJtlBdwR0cxoEe8F0FMBaK8ubZAU-ih_vg0hc7zBaa5pjTcPnsDCNWywNh142GfHO7fehWzwHJlkL03bch8Bo2KtPVleGQIVLF9zsc-w4'
                  }
                  alt="Foto de perfil"
                />
                <div>
                  <strong>{user?.name || 'Usuário'}</strong>
                  <small>{user ? roleLabel(user.role) : '-'}</small>
                </div>
                <label className="native-avatar-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={uploadAvatar}
                    disabled={avatarBusy}
                  />
                  <span>{avatarBusy ? 'Processando...' : 'Alterar foto'}</span>
                </label>
                {user?.avatarUrl ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      void removeAvatar();
                    }}
                    disabled={avatarBusy}
                  >
                    Remover foto
                  </button>
                ) : null}
              </div>

              <label>
                Nome completo
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                E-mail institucional
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                />
              </label>

              {formError ? <p className="native-error">{formError}</p> : null}

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setForm({ name: user?.name || '', email: user?.email || '' })}
                >
                  Descartar
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </section>

          <aside className="native-settings-side">
            <section className="native-panel">
              <header className="native-panel-header">
                <h3>Preferências da plataforma</h3>
              </header>

              <div className="native-settings-preferences">
                <label className="native-toggle-row">
                  <div>
                    <strong>Modo escuro</strong>
                    <small>Alternar visualização entre tema claro e escuro.</small>
                  </div>
                  <button
                    type="button"
                    className={`native-switch ${isDarkTheme ? 'active' : ''}`}
                    onClick={onToggleTheme}
                  >
                    <span />
                  </button>
                </label>

                <label className="native-toggle-row">
                  <div>
                    <strong>IA Academy Assistant</strong>
                    <small>Sugestões inteligentes para criação de conteúdos.</small>
                  </div>
                  <button
                    type="button"
                    className={`native-switch ${assistantEnabled ? 'active' : ''}`}
                    onClick={() => setAssistantEnabled((current) => !current)}
                  >
                    <span />
                  </button>
                </label>
              </div>
            </section>

            <section className="native-panel">
              <header className="native-panel-header">
                <h3>Integração financeira</h3>
              </header>

              <div className="native-gateway-box">
                <div>
                  <strong>
                    Provedor:{' '}
                    {(gateway?.provider || 'manual').toUpperCase()}
                  </strong>
                  <small>{gatewayBadge.description}</small>
                </div>
                <span className={`native-status-chip ${gatewayBadge.className}`}>
                  {gatewayBadge.text}
                </span>
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
