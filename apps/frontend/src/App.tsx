import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

type Role = 'user' | 'admin' | 'superadmin';
type AuthUser = { id: string; name: string; email: string; role: Role };
type AuthResponse = { accessToken: string; user: AuthUser };
type NavSection = {
  id: string;
  label: string;
  subtitle: string;
  templatePath: string;
};

type NavigateMessage = {
  type: 'academy:navigate';
  section: string;
};

const SESSION_TOKEN_KEY = 'academy-auth-token';
const SESSION_USER_KEY = 'academy-auth-user';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const SECOES_SUPERADMIN: NavSection[] = [
  {
    id: 'superadmin_dashboard_global',
    label: 'Dashboard Global',
    subtitle: 'Template fiel: superadmin_dashboard_global',
    templatePath: '/templates/superadmin_dashboard_global/index.html',
  },
  {
    id: 'superadmin_gestao_contas',
    label: 'Gest\u00e3o de Contas',
    subtitle: 'Template fiel: superadmin_gestao_de_contas',
    templatePath: '/templates/superadmin_gestao_de_contas/index.html',
  },
  {
    id: 'superadmin_impersonacao',
    label: 'Impersona\u00e7\u00e3o',
    subtitle: 'Template fiel: superadmin_tela_de_impersonacao',
    templatePath: '/templates/superadmin_tela_de_impersonacao/index.html',
  },
];

const SECOES_ADMIN: NavSection[] = [
  {
    id: 'admin_dashboard_conta',
    label: 'Painel',
    subtitle: 'Template fiel: admin_professor_dashboard_da_conta',
    templatePath: '/templates/admin_professor_dashboard_da_conta/index.html',
  },
  {
    id: 'admin_gestao_turmas',
    label: 'Turmas',
    subtitle: 'Template fiel: admin_professor_gestao_de_turmas',
    templatePath: '/templates/admin_professor_gestao_de_turmas/index.html',
  },
  {
    id: 'admin_alunos_matriculas',
    label: 'Alunos e Matr\u00edculas',
    subtitle: 'Template fiel: admin_professor_alunos_e_matriculas',
    templatePath: '/templates/admin_professor_alunos_e_matriculas/index.html',
  },
  {
    id: 'admin_agenda',
    label: 'Agenda',
    subtitle: 'Template fiel: admin_professor_agenda_de_aulas_e_lives',
    templatePath: '/templates/admin_professor_agenda_de_aulas_e_lives/index.html',
  },
  {
    id: 'admin_financeiro',
    label: 'Financeiro',
    subtitle: 'Template fiel: admin_professor_financeiro',
    templatePath: '/templates/admin_professor_financeiro/index.html',
  },
  {
    id: 'admin_conteudo',
    label: 'Conte\u00fado e Materiais',
    subtitle: 'Template fiel: admin_professor_conteudo_e_materiais',
    templatePath: '/templates/admin_professor_conteudo_e_materiais/index.html',
  },
  {
    id: 'admin_avisos',
    label: 'Avisos e Comunica\u00e7\u00e3o',
    subtitle: 'Template fiel: admin_professor_avisos_e_comunicacao',
    templatePath: '/templates/admin_professor_avisos_e_comunicacao/index.html',
  },
  {
    id: 'admin_relatorios',
    label: 'Relat\u00f3rios e An\u00e1lises',
    subtitle: 'Template fiel: admin_professor_relatorios_e_analises',
    templatePath: '/templates/admin_professor_relatorios_e_analises/index.html',
  },
  {
    id: 'admin_configuracoes',
    label: 'Configura\u00e7\u00f5es',
    subtitle: 'Template fiel: admin_professor_configuracoes',
    templatePath: '/templates/admin_professor_configuracoes/index.html',
  },
];

const ICONE_POR_SECAO: Record<string, string> = {
  admin_dashboard_conta: 'dashboard',
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
};

export default function App() {
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const [token, setToken] = useState(() => window.sessionStorage.getItem(SESSION_TOKEN_KEY) ?? '');
  const [usuario, setUsuario] = useState<AuthUser | null>(() => {
    const saved = window.sessionStorage.getItem(SESSION_USER_KEY);
    if (!saved) return null;
    try {
      return JSON.parse(saved) as AuthUser;
    } catch {
      return null;
    }
  });

  const [secaoAtiva, setSecaoAtiva] = useState('');

  const autenticado = Boolean(token && usuario);
  const secoes = usuario?.role === 'superadmin' ? SECOES_SUPERADMIN : SECOES_ADMIN;
  const secaoAtual = secoes.find((item) => item.id === secaoAtiva) ?? secoes[0];

  useEffect(() => {
    if (!autenticado || secoes.length === 0) return;
    if (!secoes.some((item) => item.id === secaoAtiva)) {
      setSecaoAtiva(secoes[0].id);
    }
  }, [autenticado, secoes, secaoAtiva]);

  useEffect(() => {
    if (!autenticado) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data as Partial<NavigateMessage>;
      if (data?.type !== 'academy:navigate' || typeof data.section !== 'string') {
        return;
      }

      if (!secoes.some((item) => item.id === data.section)) return;
      setSecaoAtiva(data.section);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [autenticado, secoes]);

  const lerErroApi = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) return data.message.join(' ');
      if (typeof data.message === 'string') return data.message;
    } catch {
      return 'Falha na opera\u00e7\u00e3o.';
    }
    return 'Falha na opera\u00e7\u00e3o.';
  };

  const persistirSessao = (auth: AuthResponse) => {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, auth.accessToken);
    window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(auth.user));
    setToken(auth.accessToken);
    setUsuario(auth.user);
  };

  const sair = () => {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_USER_KEY);
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
      setErro('N\u00e3o foi poss\u00edvel conectar com o backend.');
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
      setErro('A confirma\u00e7\u00e3o de senha n\u00e3o confere.');
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
      setErro('N\u00e3o foi poss\u00edvel conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  if (!autenticado) {
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="brand auth-brand">
            <div className="brand-mark">7E</div>
            <div>
              <strong>7Eventos Academy</strong>
              <span>Acesso administrativo</span>
            </div>
          </div>

          <h1>Bem-vindo \u00e0 plataforma Academy</h1>
          <p>
            Ambiente para gest\u00e3o de contas, turmas, matr\u00edculas, financeiro e opera\u00e7\u00e3o
            acad\u00eamica.
          </p>
        </section>

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

  return (
    <div className="app-shell">
      <aside className="global-sidebar">
        <div className="global-sidebar-brand">
          <strong>7Eventos</strong>
          <small>
            ACADEMY MANAGER
          </small>
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
        <iframe
          key={secaoAtual?.id}
          className="template-frame-full"
          src={secaoAtual?.templatePath}
          title={secaoAtual?.label ?? 'Template'}
        />
      </main>
    </div>
  );
}
