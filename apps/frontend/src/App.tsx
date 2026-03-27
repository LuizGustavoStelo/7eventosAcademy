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
import { LessonsNative } from './native/LessonsNative';
import { StudentsNative } from './native/StudentsNative';
import { StudentAreaNative } from './native/StudentAreaNative';
import { StudentRegistrationNative } from './native/StudentRegistrationNative';
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

type PublicPortalLicenseState = {
  status: 'loading' | 'valid' | 'blocked';
  message: string;
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
    id: 'admin_aulas',
    label: 'Aulas',
    subtitle: 'Lançamento de presença por aula (retroativo e bloqueio de futuras)',
    templatePath: '/templates/admin_professor_agenda_de_aulas_e_lives/index.html',
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
  admin_aulas: 'fact_check',
  admin_agenda: 'calendar_today',
  admin_financeiro: 'payments',
  admin_conteudo: 'menu_book',
  admin_avisos: 'notifications_active',
  admin_relatorios: 'checklist_rtl',
  admin_configuracoes: 'settings',
  superadmin_dashboard_global: 'dashboard',
  superadmin_gestao_contas: 'admin_panel_settings',
  superadmin_impersonacao: 'fingerprint',
  superadmin_wordpress_plugin: 'extension',
};

function SidebarNavIcon({ name }: { name: string }) {
  const classes = 'global-sidebar-icon';

  if (name === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
      </svg>
    );
  }

  if (name === 'school') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M2 9.5L12 4l10 5.5L12 15 2 9.5z" />
        <path d="M6 11.7V16c0 1.7 3 3 6 3s6-1.3 6-3v-4.3" />
      </svg>
    );
  }

  if (name === 'groups') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="9" cy="9" r="2.7" />
        <circle cx="16.5" cy="10.5" r="2.2" />
        <path d="M3.5 18c.8-2.6 2.8-4 5.5-4s4.7 1.4 5.5 4" />
        <path d="M14.5 17.5c.6-1.8 2-2.8 4-2.8 1.2 0 2.2.4 3 .9" />
      </svg>
    );
  }

  if (name === 'person') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c1.6-3 4-4.5 7-4.5S17.4 16 19 19" />
      </svg>
    );
  }

  if (name === 'fact_check') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 8h9M8 12h7M8 16h5" />
        <path d="M5.2 8.4l1.3 1.3 1.9-1.9M5.2 12.4l1.3 1.3 1.9-1.9" />
      </svg>
    );
  }

  if (name === 'calendar_today') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    );
  }

  if (name === 'payments') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </svg>
    );
  }

  if (name === 'menu_book') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M4 5.5A2.5 2.5 0 016.5 3H20v16.5h-13A2.5 2.5 0 014.5 17V6.5" />
        <path d="M7 6.5H18M7 10h11M7 13.5h8" />
      </svg>
    );
  }

  if (name === 'notifications_active') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M12 21a2.3 2.3 0 002.2-1.8H9.8A2.3 2.3 0 0012 21z" />
        <path d="M18 16.5H6l1.2-1.8V10a4.8 4.8 0 019.6 0v4.7l1.2 1.8z" />
      </svg>
    );
  }

  if (name === 'checklist_rtl') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M9 7h10M9 12h10M9 17h10" />
        <path d="M3.8 7.2l1.6 1.6L7.8 6.4M3.8 12.2l1.6 1.6 2.4-2.4M3.8 17.2l1.6 1.6 2.4-2.4" />
      </svg>
    );
  }

  if (name === 'settings') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M12 8.5A3.5 3.5 0 1112 15.5 3.5 3.5 0 0112 8.5z" />
        <path d="M19.4 12a7.4 7.4 0 00-.1-1.1l2-1.5-2-3.5-2.4 1a7.6 7.6 0 00-1.8-1L14.7 3h-5.4l-.4 2.9a7.6 7.6 0 00-1.8 1l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 000 2.2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 001.8 1l.4 2.9h5.4l.4-2.9a7.6 7.6 0 001.8-1l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.1z" />
      </svg>
    );
  }

  if (name === 'admin_panel_settings') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M12 3l8 4v5c0 5-3.2 8.3-8 9-4.8-.7-8-4-8-9V7l8-4z" />
        <path d="M8.5 12.2l2.2 2.2 4.8-4.8" />
      </svg>
    );
  }

  if (name === 'fingerprint') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M12 4a6.5 6.5 0 016.5 6.5v2.2M12 7a3.5 3.5 0 013.5 3.5v3.5M12 10a.5.5 0 01.5.5v5.5" />
        <path d="M8.5 11v2.5A8.5 8.5 0 0017 22M5 10.5v1.8A11.2 11.2 0 0012.7 23M3.5 8.8A8.5 8.5 0 0112 2.5" />
      </svg>
    );
  }

  if (name === 'extension') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M8 3h8v5a2 2 0 102 2h3v8a3 3 0 01-3 3h-5v-3a2 2 0 10-2 0v3H6a3 3 0 01-3-3v-5h5a2 2 0 100-2H3V6a3 3 0 013-3h2z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function TopbarIcon({
  name,
}: {
  name: 'search' | 'notifications' | 'light_mode' | 'dark_mode' | 'close';
}) {
  const classes = 'global-topbar-svg';

  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l5 5" />
      </svg>
    );
  }

  if (name === 'notifications') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M12 4a4 4 0 00-4 4v2.6c0 1.2-.4 2.4-1.2 3.3L5.5 15.4h13l-1.3-1.5A5 5 0 0116 10.6V8a4 4 0 00-4-4z" />
        <path d="M9.5 17.5a2.5 2.5 0 005 0" />
      </svg>
    );
  }

  if (name === 'light_mode') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v3M12 18.5v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2.5 12h3M18.5 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
      </svg>
    );
  }

  if (name === 'dark_mode') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M15.5 3.5a8.5 8.5 0 108 11.2 7 7 0 01-8-11.2z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PublicPortalBlocked({ message }: { message: string }) {
  return (
    <div className="auth-shell embedded">
      <section className="auth-card" style={{ maxWidth: '720px' }}>
        <div className="auth-tabs">
          <button type="button" className="active" disabled>
            Acesso restrito
          </button>
        </div>
        <h2>Portal indisponível</h2>
        <p className="auth-error" style={{ marginTop: 0 }}>
          {message}
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary, #52667a)', lineHeight: 1.6 }}>
            Se você é aluno ou responsável, confirme com a instituição se a licença está ativa.
          </p>
          <a href="/" style={{ color: 'var(--accent-primary, #139395)', fontWeight: 600 }}>
            Recarregar
          </a>
        </div>
      </section>
    </div>
  );
}

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

  const queryParams = new URLSearchParams(window.location.search);
  const isEmbedded = queryParams.get('embed') === '1';
  const appMode = queryParams.get('app');
  const isStudentPortalMode = appMode === 'student';
  const isStudentRegisterMode = appMode === 'student-register';
  const isPublicStudentPortal = isStudentPortalMode || isStudentRegisterMode;
  const portalLicenseToken =
    queryParams.get('licenseToken') ??
    queryParams.get('activationToken') ??
    queryParams.get('token') ??
    '';
  const portalLicenseDomain =
    queryParams.get('licenseDomain') ??
    queryParams.get('domain') ??
    '';
  const portalLicenseSiteUrl =
    queryParams.get('licenseSiteUrl') ??
    queryParams.get('siteUrl') ??
    '';
  const autenticado = Boolean(token && usuario);
  const secoes = usuario?.role === 'superadmin' ? SECOES_SUPERADMIN : SECOES_ADMIN;
  const [publicPortalLicense, setPublicPortalLicense] = useState<PublicPortalLicenseState>(() => ({
    status: isPublicStudentPortal ? 'loading' : 'valid',
    message: '',
  }));

  useEffect(() => {
    if (!isEmbedded) return;

    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let intervalId = 0;

    const postEmbedHeight = () => {
      const body = document.body;
      const doc = document.documentElement;
      const isStudentMobileViewport =
        appMode === 'student' && window.matchMedia('(max-width: 980px)').matches;

      const nextHeight = isStudentMobileViewport
        ? Math.max(window.innerHeight || 0, doc?.clientHeight ?? 0, 620)
        : Math.max(
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            doc?.scrollHeight ?? 0,
            doc?.offsetHeight ?? 0,
            doc?.clientHeight ?? 0,
          );

      if (nextHeight <= 0) return;

      window.parent.postMessage(
        {
          type: 'seven-academy:resize',
          height: nextHeight,
        },
        '*',
      );
    };

    const schedulePost = () => {
      window.requestAnimationFrame(postEmbedHeight);
    };

    schedulePost();
    window.setTimeout(schedulePost, 120);
    intervalId = window.setInterval(schedulePost, 1200);
    window.addEventListener('resize', schedulePost);
    window.addEventListener('load', schedulePost);

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(schedulePost);
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
    }

    mutationObserver = new MutationObserver(schedulePost);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', schedulePost);
      window.removeEventListener('load', schedulePost);
    };
  }, [isEmbedded, appMode, autenticado, secaoAtiva, usuario?.role]);

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

  useEffect(() => {
    if (!isPublicStudentPortal) {
      setPublicPortalLicense({ status: 'valid', message: '' });
      return;
    }

    if (!portalLicenseToken || !portalLicenseDomain || !portalLicenseSiteUrl) {
      setPublicPortalLicense({
        status: 'blocked',
        message: 'Licença não informada para este portal.',
      });
      return;
    }

    let cancelled = false;
    setPublicPortalLicense({ status: 'loading', message: '' });

    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/wordpress/license/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activationToken: portalLicenseToken,
            domain: portalLicenseDomain,
            siteUrl: portalLicenseSiteUrl,
          }),
        });

        const data = (await response.json().catch(() => null)) as {
          valid?: boolean;
          reason?: string;
        } | null;

        if (cancelled) return;

        if (!response.ok || !data?.valid) {
          setPublicPortalLicense({
            status: 'blocked',
            message: 'Licença expirada, inativa ou inválida para este portal.',
          });
          return;
        }

        setPublicPortalLicense({ status: 'valid', message: '' });
      } catch {
        if (!cancelled) {
          setPublicPortalLicense({
            status: 'blocked',
            message: 'Não foi possível validar a licença deste portal.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPublicStudentPortal, portalLicenseToken, portalLicenseDomain, portalLicenseSiteUrl]);

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

  if (isPublicStudentPortal && publicPortalLicense.status === 'loading') {
    return (
      <div className={`auth-shell ${isEmbedded ? 'embedded' : ''}`}>
        <section className="auth-card">
          <h2>Verificando licença</h2>
          <p>Preparando o portal com validação de acesso...</p>
        </section>
      </div>
    );
  }

  if (isPublicStudentPortal && publicPortalLicense.status === 'blocked') {
    return <PublicPortalBlocked message={publicPortalLicense.message} />;
  }

  if (!autenticado) {
    if (isStudentRegisterMode) {
      return <StudentRegistrationNative embedded={isEmbedded} />;
    }

    const modoCadastroAtivo = isStudentPortalMode ? false : modoCadastro;

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
          {isStudentPortalMode ? null : (
            <div className="auth-tabs">
              <button
                type="button"
                className={!modoCadastroAtivo ? 'active' : ''}
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
                className={modoCadastroAtivo ? 'active' : ''}
                onClick={() => {
                  setErro('');
                  setModoCadastro(true);
                }}
                disabled={carregando}
              >
                Cadastrar
              </button>
            </div>
          )}

          <h2>{modoCadastroAtivo ? 'Criar conta' : 'Entrar'}</h2>

          <form className="auth-form" onSubmit={modoCadastroAtivo ? cadastrar : entrar}>
            {modoCadastroAtivo ? (
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

            {modoCadastroAtivo ? (
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
                : modoCadastroAtivo
                  ? 'Cadastrar e continuar'
                  : 'Entrar na plataforma'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  if (usuario?.role === 'user') {
    return <StudentAreaNative token={token} user={usuario} onLogout={sair} />;
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
              <SidebarNavIcon name={ICONE_POR_SECAO[item.id] ?? 'dashboard'} />
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
              <TopbarIcon name="search" />
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
              <TopbarIcon name="notifications" />
              <span className="global-topbar-dot" />
            </button>
            <button
              type="button"
              className="global-topbar-icon"
              aria-label="Alternar tema"
              onClick={() => setTemaEscuro((current) => !current)}
            >
              <TopbarIcon name={temaEscuro ? 'light_mode' : 'dark_mode'} />
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
                  <TopbarIcon name="close" />
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
                Motivo: {impersonationMeta.reason} â€¢ Expira em{' '}
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
              <ClassesNative token={token} onNavigate={(sectionId) => setSecaoAtiva(sectionId)} />
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

            {secaoAtiva === 'admin_aulas' ? (
              <LessonsNative token={token} />
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


