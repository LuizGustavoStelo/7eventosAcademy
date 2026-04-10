import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest } from './api';

type SettingsUser = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'superadmin';
  avatarUrl?: string | null;
  institution?: {
    id: string;
    name: string;
    slug: string;
    contacts?: {
      supportEmail: string | null;
      supportPhone: string | null;
      commercialEmail: string | null;
      commercialPhone: string | null;
    };
  } | null;
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

type InstitutionContactsFormState = {
  supportEmail: string;
  supportPhone: string;
  commercialEmail: string;
  commercialPhone: string;
};

type SettingsNativeProps = {
  token: string;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  onProfileUpdated: (user: SettingsUser) => void;
};

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
  const [savingContacts, setSavingContacts] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [contactsError, setContactsError] = useState('');
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [gateway, setGateway] = useState<GatewayConfig | null>(null);
  const [form, setForm] = useState<SettingsFormState>({ name: '', email: '' });
  const [contactsForm, setContactsForm] = useState<InstitutionContactsFormState>({
    supportEmail: '',
    supportPhone: '',
    commercialEmail: '',
    commercialPhone: '',
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
      setContactsForm({
        supportEmail: me.institution?.contacts?.supportEmail || '',
        supportPhone: me.institution?.contacts?.supportPhone || '',
        commercialEmail: me.institution?.contacts?.commercialEmail || '',
        commercialPhone: me.institution?.contacts?.commercialPhone || '',
      });
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

  const saveInstitutionContacts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactsError('');
    setFeedback('');
    setError('');

    setSavingContacts(true);
    try {
      const response = await apiRequest<{
        contacts: {
          supportEmail: string | null;
          supportPhone: string | null;
          commercialEmail: string | null;
          commercialPhone: string | null;
        };
      }>(token, '/auth/institution-contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supportEmail: contactsForm.supportEmail.trim(),
          supportPhone: contactsForm.supportPhone.trim(),
          commercialEmail: contactsForm.commercialEmail.trim(),
          commercialPhone: contactsForm.commercialPhone.trim(),
        }),
      });

      setContactsForm({
        supportEmail: response.contacts.supportEmail || '',
        supportPhone: response.contacts.supportPhone || '',
        commercialEmail: response.contacts.commercialEmail || '',
        commercialPhone: response.contacts.commercialPhone || '',
      });

      setUser((current) =>
        current
          ? {
              ...current,
              institution: current.institution
                ? {
                    ...current.institution,
                    contacts: response.contacts,
                  }
                : current.institution,
            }
          : current,
      );

      setFeedback('Contatos institucionais atualizados com sucesso.');
    } catch (saveError) {
      setContactsError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao atualizar contatos institucionais.',
      );
    } finally {
      setSavingContacts(false);
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

            {(user?.role === 'admin' || user?.role === 'superadmin') &&
            Boolean(user?.institution?.id) ? (
              <section className="native-panel">
                <header className="native-panel-header">
                  <h3>Contatos da instituição</h3>
                </header>

                <form
                  className="native-form-grid native-settings-contacts-form"
                  onSubmit={saveInstitutionContacts}
                >
                  <p className="native-info" style={{ margin: 0 }}>
                    Esses contatos serão usados na Área do Aluno para suporte e
                    solicitação de cobrança no crédito.
                  </p>

                  <label>
                    Suporte (WhatsApp/telefone)
                    <input
                      value={contactsForm.supportPhone}
                      onChange={(event) =>
                        setContactsForm((current) => ({
                          ...current,
                          supportPhone: event.target.value,
                        }))
                      }
                      placeholder="+55 (65) 99999-9999"
                    />
                  </label>

                  <label>
                    Suporte (e-mail)
                    <input
                      type="email"
                      value={contactsForm.supportEmail}
                      onChange={(event) =>
                        setContactsForm((current) => ({
                          ...current,
                          supportEmail: event.target.value,
                        }))
                      }
                      placeholder="suporte@instituicao.com"
                    />
                  </label>

                  <label>
                    Comercial (WhatsApp/telefone)
                    <input
                      value={contactsForm.commercialPhone}
                      onChange={(event) =>
                        setContactsForm((current) => ({
                          ...current,
                          commercialPhone: event.target.value,
                        }))
                      }
                      placeholder="+55 (65) 98888-8888"
                    />
                  </label>

                  <label>
                    Comercial (e-mail)
                    <input
                      type="email"
                      value={contactsForm.commercialEmail}
                      onChange={(event) =>
                        setContactsForm((current) => ({
                          ...current,
                          commercialEmail: event.target.value,
                        }))
                      }
                      placeholder="comercial@instituicao.com"
                    />
                  </label>

                  {contactsError ? <p className="native-error">{contactsError}</p> : null}

                  <div className="native-modal-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        setContactsForm({
                          supportEmail: user?.institution?.contacts?.supportEmail || '',
                          supportPhone: user?.institution?.contacts?.supportPhone || '',
                          commercialEmail: user?.institution?.contacts?.commercialEmail || '',
                          commercialPhone: user?.institution?.contacts?.commercialPhone || '',
                        })
                      }
                    >
                      Descartar
                    </button>
                    <button type="submit" disabled={savingContacts}>
                      {savingContacts ? 'Salvando...' : 'Salvar contatos'}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}


