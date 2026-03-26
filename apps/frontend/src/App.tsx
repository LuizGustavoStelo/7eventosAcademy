import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AgendaNative } from './native/AgendaNative';
import { ClassesNative } from './native/ClassesNative';
import { ContentNative } from './native/ContentNative';
import { CoursesNative } from './native/CoursesNative';
import { DashboardNative } from './native/DashboardNative';
import { FinanceNative } from './native/FinanceNative';
import { NoticesNative } from './native/NoticesNative';
import { ReportsNative } from './native/ReportsNative';
import { SettingsNative } from './native/SettingsNative';
import { StudentsNative } from './native/StudentsNative';
import { SuperadminAccountsNative } from './native/SuperadminAccountsNative';
import { SuperadminDashboardNative } from './native/SuperadminDashboardNative';
import { SuperadminImpersonationNative } from './native/SuperadminImpersonationNative';
import { SuperadminWordpressNative } from './native/SuperadminWordpressNative';

type Role = 'user' | 'admin' | 'superadmin';
type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string | null;
};
type AuthResponse = {
  accessToken: string;
  user: AuthUser;
  impersonation?: {
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
type NavSection = {
  id: string;
  label: string;
  subtitle: string;
  templatePath: string;
  renderMode?: 'iframe' | 'native';
};

const SESSION_TOKEN_KEY = 'academy-auth-token';
const SESSION_USER_KEY = 'academy-auth-user';
const IMPERSONATION_SOURCE_TOKEN_KEY = 'academy-impersonation-source-token';
const IMPERSONATION_SOURCE_USER_KEY = 'academy-impersonation-source-user';
const IMPERSONATION_META_KEY = 'academy-impersonation-meta';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const SECOES_SUPERADMIN: NavSection[] = [
  {
    id: 'superadmin_dashboard_global',
    label: 'Dashboard Global',
    subtitle: 'Template fiel: superadmin_dashboard_global',
    templatePath: '/templates/superadmin_dashboard_global/index.html',
    renderMode: 'native',
  },
  {
    id: 'superadmin_gestao_contas',
    label: 'Gestão de Contas',
    subtitle: 'Template fiel: superadmin_gestao_de_contas',
    templatePath: '/templates/superadmin_gestao_de_contas/index.html',
    renderMode: 'native',
  },
  {
    id: 'superadmin_impersonacao',
    label: 'Impersonação',
    subtitle: 'Template fiel: superadmin_tela_de_impersonacao',
    templatePath: '/templates/superadmin_tela_de_impersonacao/index.html',
    renderMode: 'native',
  },
  {
    id: 'superadmin_wordpress_plugin',
    label: 'Plugin WordPress',
    subtitle: 'Gerenciar licenças e releases do plugin 7academy',
    templatePath: '/templates/superadmin_wordpress_plugin/index.html',
    renderMode: 'native',
  },
];

const SECOES_ADMIN: NavSection[] = [
  {
    id: 'admin_dashboard_conta',
    label: 'Painel',
    subtitle: 'Template fiel: admin_professor_dashboard_da_conta',
    templatePath: '/templates/admin_professor_dashboard_da_conta/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_cursos',
    label: 'CURSOS',
    subtitle: 'Template fiel: admin_professor_cursos',
    templatePath: '/templates/admin_professor_cursos/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_gestao_turmas',
    label: 'Turmas',
    subtitle: 'Template fiel: admin_professor_gestao_de_turmas',
    templatePath: '/templates/admin_professor_gestao_de_turmas/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_alunos_matriculas',
    label: 'ALUNOS',
    subtitle: 'Template fiel: admin_professor_alunos_e_matriculas',
    templatePath: '/templates/admin_professor_alunos_e_matriculas/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_agenda',
    label: 'Agenda',
    subtitle: 'Template fiel: admin_professor_agenda_de_aulas_e_lives',
    templatePath: '/templates/admin_professor_agenda_de_aulas_e_lives/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_financeiro',
    label: 'Financeiro',
    subtitle: 'Template fiel: admin_professor_financeiro',
    templatePath: '/templates/admin_professor_financeiro/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_conteudo',
    label: 'MATERIAIS',
    subtitle: 'Template fiel: admin_professor_conteudo_e_materiais',
    templatePath: '/templates/admin_professor_conteudo_e_materiais/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_avisos',
    label: 'AVISOS',
    subtitle: 'Template fiel: admin_professor_avisos_e_comunicacao',
    templatePath: '/templates/admin_professor_avisos_e_comunicacao/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_relatorios',
    label: 'RELATÓRIOS',
    subtitle: 'Template fiel: admin_professor_relatorios_e_analises',
    templatePath: '/templates/admin_professor_relatorios_e_analises/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_configuracoes',
    label: 'Configurações',
    subtitle: 'Template fiel: admin_professor_configuracoes',
    templatePath: '/templates/admin_professor_configuracoes/index.html',
    renderMode: 'native',
  },
];

const ICONE_POR_SECAO: Record<string, string> = {
  admin_dashboard_conta: 'dashboard',
  admin_cursos: 'school',
  admin_gestao_turmas: 'groups',
  admin_alunos_matriculas: 'person',
  admin_agenda: 'calendar_today',
  admin_financeiro: 'payments',
  admin_conteudo: 'menu_book',
  admin_avisos: 'campaign',
  admin_relatorios: 'bar_chart',
  admin_configuracoes: 'settings',
  superadmin_dashboard_global: 'dashboard',
  superadmin_gestao_contas: 'admin_panel_settings',
  superadmin_impersonacao: 'fingerprint',
  superadmin_wordpress_plugin: 'extension',
};

export default function App() {
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const [token, setToken] = useState(() => {
    try { return window.localStorage.getItem(SESSION_TOKEN_KEY) ?? ''; } catch { return ''; }
  });
  const [usuario, setUsuario] = useState<AuthUser | null>(() => {
    try {
      const saved = window.localStorage.getItem(SESSION_USER_KEY);
      if (!saved) return null;
      return JSON.parse(saved) as AuthUser;
    } catch {
      return null;
    }
  });

  const [secaoAtiva, setSecaoAtiva] = useState('');
  const [temaEscuro, setTemaEscuro] = useState(false);
  const [impersonationMeta, setImpersonationMeta] = useState<AuthResponse['impersonation'] | null>(() => {
    try {
      const raw = window.localStorage.getItem(IMPERSONATION_META_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthResponse['impersonation'];
    } catch {
      return null;
    }
  });
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const isEmbedded = new URLSearchParams(window.location.search).get('embed') === '1';
  const autenticado = Boolean(token && usuario);
  const secoes = usuario?.role === 'superadmin' ? SECOES_SUPERADMIN : SECOES_ADMIN;

  useEffect(() => {
    if (!autenticado || secoes.length === 0) return;
    if (!secoes.some((item) => item.id === secaoAtiva)) {
      setSecaoAtiva(secoes[0].id);
    }
  }, [autenticado, secoes, secaoAtiva]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', temaEscuro);
    document.body.classList.toggle('dark', temaEscuro);
  }, [temaEscuro]);

  const lerErroApi = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) return data.message.join(' ');
      if (typeof data.message === 'string') return data.message;
    } catch {
      return 'Falha na operação.';
    }
    return 'Falha na operação.';
  };

  const limparImpersonacao = () => {
    try {
      window.localStorage.removeItem(IMPERSONATION_SOURCE_TOKEN_KEY);
      window.localStorage.removeItem(IMPERSONATION_SOURCE_USER_KEY);
      window.localStorage.removeItem(IMPERSONATION_META_KEY);
    } catch {}
    setImpersonationMeta(null);
  };

  const persistirSessao = (auth: AuthResponse) => {
    limparImpersonacao();
    try {
      window.localStorage.setItem(SESSION_TOKEN_KEY, auth.accessToken);
      window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(auth.user));
    } catch {}
    setToken(auth.accessToken);
    setUsuario(auth.user);
  };

  const iniciarImpersonacao = (auth: AuthResponse) => {
    if (!usuario || usuario.role !== 'superadmin') return;

    try {
      window.localStorage.setItem(IMPERSONATION_SOURCE_TOKEN_KEY, token);
      window.localStorage.setItem(
        IMPERSONATION_SOURCE_USER_KEY,
        JSON.stringify(usuario),
      );
      window.localStorage.setItem(SESSION_TOKEN_KEY, auth.accessToken);
      window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(auth.user));
      if (auth.impersonation) {
        window.localStorage.setItem(
          IMPERSONATION_META_KEY,
          JSON.stringify(auth.impersonation),
        );
      }
    } catch {}

    setToken(auth.accessToken);
    setUsuario(auth.user);
    setImpersonationMeta(auth.impersonation ?? null);
    setSecaoAtiva('admin_dashboard_conta');
  };

  const encerrarImpersonacao = () => {
    let sourceToken = '';
    let sourceUser: AuthUser | null = null;
    try {
      sourceToken = window.localStorage.getItem(IMPERSONATION_SOURCE_TOKEN_KEY) ?? '';
      const rawSourceUser = window.localStorage.getItem(IMPERSONATION_SOURCE_USER_KEY);
      if (rawSourceUser) {
        sourceUser = JSON.parse(rawSourceUser) as AuthUser;
      }
    } catch {}

    if (!sourceToken || !sourceUser) {
      limparImpersonacao();
      return;
    }

    try {
      window.localStorage.setItem(SESSION_TOKEN_KEY, sourceToken);
      window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(sourceUser));
    } catch {}

    limparImpersonacao();
    setToken(sourceToken);
    setUsuario(sourceUser);
    setSecaoAtiva('superadmin_dashboard_global');
  };

  const atualizarUsuarioSessao = (nextUser: AuthUser) => {
    try { window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(nextUser)); } catch {}
    setUsuario(nextUser);
  };

  const carregarPerfilAtual = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) return;

      const me = (await response.json()) as AuthUser;
      atualizarUsuarioSessao(me);
    } catch {
      // ignora erro de atualização de perfil
    }
  };

  useEffect(() => {
    if (!autenticado) return;
    void carregarPerfilAtual();
  }, [autenticado, token]);

  useEffect(() => {
    if (!autenticado || !impersonationMeta) return;
    if (usuario?.role === 'superadmin') {
      limparImpersonacao();
      return;
    }

    try {
      const sourceToken = window.localStorage.getItem(IMPERSONATION_SOURCE_TOKEN_KEY);
      const sourceUser = window.localStorage.getItem(IMPERSONATION_SOURCE_USER_KEY);
      if (!sourceToken || !sourceUser) {
        limparImpersonacao();
      }
    } catch {
      limparImpersonacao();
    }
  }, [autenticado, impersonationMeta, usuario?.role]);

  const sair = () => {
    limparImpersonacao();
    try {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      window.localStorage.removeItem(SESSION_USER_KEY);
    } catch {}
    setToken('');
    setUsuario(null);
    setSecaoAtiva('');
  };

  const entrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    if (!email || !senha) {
      setErro('Informe e-mail e senha para acessar.');
      return;
    }

    setCarregando(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha }),
      });

      if (!response.ok) {
        setErro(await lerErroApi(response));
        return;
      }

      persistirSessao((await response.json()) as AuthResponse);
    } catch {
      setErro('Não foi possível conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  const cadastrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    if (!nome || !email || !senha || !confirmacaoSenha) {
      setErro('Preencha todos os campos para cadastrar.');
      return;
    }

    if (senha !== confirmacaoSenha) {
      setErro('A confirmação de senha não confere.');
      return;
    }

    setCarregando(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, email, password: senha }),
      });

      if (!response.ok) {
        setErro(await lerErroApi(response));
        return;
      }

      persistirSessao((await response.json()) as AuthResponse);
      setModoCadastro(false);
      setConfirmacaoSenha('');
      setSenha('');
    } catch {
      setErro('Não foi possível conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!token) return;

    const body = new FormData();
    body.append('avatar', file);

    const response = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(await lerErroApi(response));
    }

    const nextUser = (await response.json()) as AuthUser;
    atualizarUsuarioSessao(nextUser);
  };

  const removerAvatar = async () => {
    if (!token) return;

    const response = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(await lerErroApi(response));
    }

    const nextUser = (await response.json()) as AuthUser;
    atualizarUsuarioSessao(nextUser);
  };

  if (!autenticado) {
    return (
      <div className={`auth-shell ${isEmbedded ? 'embedded' : ''}`}>
        {!isEmbedded && (
          <section className="auth-panel">
            <div className="brand auth-brand">
              <div className="brand-mark">7E</div>
              <div>
                <strong>7Eventos Academy</strong>
                <span>Acesso administrativo</span>
              </div>
            </div>

            <h1>Bem-vindo à plataforma Academy</h1>
            <p>
              Ambiente para gestão de contas, turmas, matrículas, financeiro e operação
              acadêmica.
            </p>
          </section>
        )}

        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={!modoCadastro ? 'active' : ''}
              onClick={() => {
                setErro('');
                setModoCadastro(false);
              }}
              disabled={carregando}
            >
              Entrar
            </button>
            <button
              type="button"
              className={modoCadastro ? 'active' : ''}
              onClick={() => {
                setErro('');
                setModoCadastro(true);
              }}
              disabled={carregando}
            >
              Cadastrar
            </button>
          </div>

          <h2>{modoCadastro ? 'Criar conta' : 'Entrar'}</h2>

          <form className="auth-form" onSubmit={modoCadastro ? cadastrar : entrar}>
            {modoCadastro ? (
              <>
                <label htmlFor="nome">Nome completo</label>
                <input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  disabled={carregando}
                />
              </>
            ) : null}

            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={carregando}
            />

            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              disabled={carregando}
            />

            {modoCadastro ? (
              <>
                <label htmlFor="confirmacaoSenha">Confirmar senha</label>
                <input
                  id="confirmacaoSenha"
                  type="password"
                  value={confirmacaoSenha}
                  onChange={(event) => setConfirmacaoSenha(event.target.value)}
                  disabled={carregando}
                />
              </>
            ) : null}

            {erro ? <div className="auth-error">{erro}</div> : null}

            <button type="submit" disabled={carregando}>
              {carregando
                ? 'Processando...'
                : modoCadastro
                  ? 'Cadastrar e continuar'
                  : 'Entrar na plataforma'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  const impersonando = Boolean(impersonationMeta && usuario?.role !== 'superadmin');
  const roleLabel = impersonando ? 'Administrador (Impersonado)' : usuario?.role === 'superadmin' ? 'Superadmin' : 'Professor';

  return (
    <div className="app-shell">
      <aside className="global-sidebar">
        <div className="global-sidebar-brand">
          <img
            className="global-sidebar-brand-logo"
            src="/7eventos_academy_logo.png"
            alt="7Eventos Academy Manager"
          />
        </div>

        <nav className="global-sidebar-nav">
          {secoes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={secaoAtiva === item.id ? 'active' : ''}
              onClick={() => setSecaoAtiva(item.id)}
            >
              <span className="material-symbols-outlined global-sidebar-icon">
                {ICONE_POR_SECAO[item.id] ?? 'dashboard'}
              </span>
              <span className="global-sidebar-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="global-sidebar-footer">
          <button type="button" className="global-sidebar-cta">
            <span className="material-symbols-outlined">add</span>
            Novo Evento
          </button>
          <button type="button" className="global-sidebar-logout" onClick={sair}>
            <span className="material-symbols-outlined">logout</span>
            Sair
          </button>
        </div>
      </aside>

      <main className="app-content">
        <header className="global-topbar-shell">
          <div className="global-topbar-left">
            <label className="global-topbar-search" htmlFor="global-search">
              <span className="material-symbols-outlined">search</span>
              <input
                id="global-search"
                type="text"
                placeholder="Buscar alunos, turmas ou materiais..."
              />
            </label>
            <nav className="global-topbar-tabs" aria-label="Navegação superior">
              <button type="button" className="active">
                Visão geral
              </button>
              <button type="button">Análises</button>
              <button type="button">Relatórios</button>
            </nav>
          </div>
          <div className="global-topbar-right">
            <button type="button" className="global-topbar-icon" aria-label="Notificações">
              <span className="material-symbols-outlined">notifications</span>
              <span className="global-topbar-dot" />
            </button>
            <button
              type="button"
              className="global-topbar-icon"
              aria-label="Alternar tema"
              onClick={() => setTemaEscuro((current) => !current)}
            >
              <span className="material-symbols-outlined">
                {temaEscuro ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <div className="global-topbar-user">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    await uploadAvatar(file);
                  } catch (error) {
                    const message =
                      error instanceof Error
                        ? error.message
                        : 'Não foi possível atualizar a foto de perfil.';
                    window.alert(message);
                  } finally {
                    event.target.value = '';
                  }
                }}
              />
              <img
                className="global-topbar-avatar"
                alt="Avatar do usuário"
                src={
                  usuario?.avatarUrl ||
                  'https://lh3.googleusercontent.com/aida-public/AB6AXuDDw0TJspg79mG5fWY5VjXS8gA3CE9GPLyYCbl0ZwS48kInu_yAIMZeKLC-OO1TctEVlEQysf1QpBPTp8Ml57g9o3zSmOUvPKnOaJm_IE9_7ZO_Tx_aDraQVsQLeQvThBrV9idAYpQDADLvjejTx6ovynKPs6bTZNhy1nmT1Ns-q5zbuMwFPjqqLe6Xs_P8CYwLK3gFTRvheh09Ut1P3UIbNyqcLVWrchzSNWi-sAIj_dgvKhNaNS7dwFGFCfE7NgF_XgphKdfvTwbQ'
                }
                onClick={() => avatarInputRef.current?.click()}
              />
              {usuario?.avatarUrl ? (
                <button
                  type="button"
                  className="global-avatar-remove"
                  aria-label="Remover foto"
                  onClick={async () => {
                    try {
                      await removerAvatar();
                    } catch (error) {
                      const message =
                        error instanceof Error
                          ? error.message
                          : 'Não foi possível remover a foto de perfil.';
                      window.alert(message);
                    }
                  }}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              ) : null}
              <div className="global-topbar-user-meta">
                <span className="global-topbar-user-name">{usuario?.name ?? 'Professor'}</span>
                <span className="global-topbar-user-role">{roleLabel}</span>
              </div>
            </div>
          </div>
        </header>

        {impersonando && impersonationMeta ? (
          <section className="native-impersonation-banner">
            <div>
              <strong>
                Sessão de impersonação ativa: {impersonationMeta.actorName}
              </strong>
              <small>
                Motivo: {impersonationMeta.reason} • Expira em{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(impersonationMeta.expiresAt))}
              </small>
            </div>
            <button type="button" onClick={encerrarImpersonacao}>
              Encerrar impersonação
            </button>
          </section>
        ) : null}

        <div className="template-frame-wrap">
          <div className="native-content-wrap">
            {secaoAtiva === 'superadmin_dashboard_global' ? (
              <SuperadminDashboardNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
              />
            ) : null}

            {secaoAtiva === 'superadmin_gestao_contas' ? (
              <SuperadminAccountsNative token={token} />
            ) : null}

            {secaoAtiva === 'superadmin_impersonacao' ? (
              <SuperadminImpersonationNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
                onImpersonated={(session) => iniciarImpersonacao(session)}
              />
            ) : null}

            {secaoAtiva === 'superadmin_wordpress_plugin' ? (
              <SuperadminWordpressNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_dashboard_conta' ? (
              <DashboardNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
              />
            ) : null}

            {secaoAtiva === 'admin_gestao_turmas' ? (
              <ClassesNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_cursos' ? (
              <CoursesNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_alunos_matriculas' ? (
              <StudentsNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_agenda' ? (
              <AgendaNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
              />
            ) : null}

            {secaoAtiva === 'admin_financeiro' ? (
              <FinanceNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_conteudo' ? (
              <ContentNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_avisos' ? (
              <NoticesNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_relatorios' ? (
              <ReportsNative token={token} />
            ) : null}

            {secaoAtiva === 'admin_configuracoes' ? (
              <SettingsNative
                token={token}
                isDarkTheme={temaEscuro}
                onToggleTheme={() => setTemaEscuro((current) => !current)}
                onProfileUpdated={(nextUser) => atualizarUsuarioSessao(nextUser)}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
