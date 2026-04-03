import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AgendaNative } from './native/AgendaNative';
import { ClassesNative } from './native/ClassesNative';
import { ContractsNative } from './native/ContractsNative';
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
import { toPtBrApiMessage } from './errorMessages';

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
type RegisterResponse = {
  requiresEmailVerification: true;
  email: string;
  expiresAt: string;
  message: string;
};
type VerifyEmailCodeResponse = {
  verified: boolean;
  message: string;
};
type ResendVerificationCodeResponse = {
  sent: boolean;
  message: string;
  expiresAt?: string;
};
type ApiErrorResponse = {
  message?: string | string[];
  code?: string;
  email?: string;
  statusCode?: number;
};
type EmailVerificationPendingState = {
  email: string;
  message: string;
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

type TopbarNotice = {
  id: string;
  status?: string;
  publishedAt?: string;
  expiresAt?: string | null;
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
    label: 'Cursos',
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
    label: 'Alunos',
    subtitle: 'Template fiel: admin_professor_alunos_e_matriculas',
    templatePath: '/templates/admin_professor_alunos_e_matriculas/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_contratos',
    label: 'Contratos',
    subtitle: 'Modelos, envio e assinatura eletrônica',
    templatePath: '/templates/admin_professor_contratos/index.html',
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
    label: 'Materiais',
    subtitle: 'Template fiel: admin_professor_conteudo_e_materiais',
    templatePath: '/templates/admin_professor_conteudo_e_materiais/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_avisos',
    label: 'Avisos',
    subtitle: 'Template fiel: admin_professor_avisos_e_comunicacao',
    templatePath: '/templates/admin_professor_avisos_e_comunicacao/index.html',
    renderMode: 'native',
  },
  {
    id: 'admin_relatorios',
    label: 'Relatórios',
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
  admin_contratos: 'fact_check',
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
  name: 'search' | 'notifications' | 'light_mode' | 'dark_mode' | 'help';
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

  if (name === 'help') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9.5a2.4 2.4 0 114.6 1c-.5 1-1.8 1.4-2.1 2.4v.6" />
        <circle cx="12" cy="16.8" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const SEARCH_SECTION_ALIAS: Array<{ sectionId: string; terms: string[] }> = [
  { sectionId: 'admin_dashboard_conta', terms: ['painel', 'inicio', 'inicial', 'dashboard', 'visao geral'] },
  { sectionId: 'admin_cursos', terms: ['curso', 'cursos'] },
  { sectionId: 'admin_gestao_turmas', terms: ['turma', 'turmas', 'classe', 'classes'] },
  { sectionId: 'admin_alunos_matriculas', terms: ['aluno', 'alunos', 'matricula', 'matriculas'] },
  { sectionId: 'admin_contratos', terms: ['contrato', 'contratos', 'assinatura', 'assinaturas'] },
  { sectionId: 'admin_aulas', terms: ['aula', 'aulas', 'presenca', 'presencas'] },
  { sectionId: 'admin_agenda', terms: ['agenda', 'evento', 'eventos', 'calendario'] },
  { sectionId: 'admin_financeiro', terms: ['financeiro', 'mensalidade', 'cobranca', 'cobrancas', 'pagamento'] },
  { sectionId: 'admin_conteudo', terms: ['material', 'materiais', 'conteudo', 'arquivo', 'arquivos'] },
  { sectionId: 'admin_avisos', terms: ['aviso', 'avisos', 'comunicado', 'comunicados'] },
  { sectionId: 'admin_relatorios', terms: ['relatorio', 'relatorios', 'analise', 'analises'] },
  { sectionId: 'admin_configuracoes', terms: ['configuracao', 'configuracoes', 'ajustes'] },
];

const SEARCH_SECTION_ALIAS_SUPERADMIN: Array<{ sectionId: string; terms: string[] }> = [
  { sectionId: 'superadmin_dashboard_global', terms: ['dashboard', 'global', 'painel'] },
  { sectionId: 'superadmin_gestao_contas', terms: ['conta', 'contas', 'gestao'] },
  { sectionId: 'superadmin_impersonacao', terms: ['impersonacao', 'impersonar'] },
  { sectionId: 'superadmin_wordpress_plugin', terms: ['plugin', 'wordpress', 'licenca', 'licencas'] },
];

function normalizeSearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function hasActiveNotice(notice: TopbarNotice, nowMs: number): boolean {
  if (notice.status === 'finalizado') return false;

  const publishedMs = notice.publishedAt ? new Date(notice.publishedAt).getTime() : 0;
  if (publishedMs > nowMs) return false;

  if (notice.expiresAt) {
    const expiresMs = new Date(notice.expiresAt).getTime();
    if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return false;
  }

  return true;
}

function maskEmail(value: string | null | undefined) {
  const email = String(value || '').trim();
  if (!email.includes('@')) return email || '-';

  const [localPart, domainPart] = email.split('@');
  if (!localPart || !domainPart) return email;

  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.length > 4 ? localPart.slice(-1) : '';
  const hiddenCount = Math.max(2, localPart.length - (visibleStart.length + visibleEnd.length));
  const hidden = '*'.repeat(hiddenCount);

  return `${visibleStart}${hidden}${visibleEnd}@${domainPart}`;
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
  const [aviso, setAviso] = useState('');
  const [codigoConfirmacao, setCodigoConfirmacao] = useState('');
  const [confirmacaoEmailPendente, setConfirmacaoEmailPendente] =
    useState<EmailVerificationPendingState | null>(null);
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [hasTopbarNotification, setHasTopbarNotification] = useState(false);

  const queryParams = new URLSearchParams(window.location.search);
  const normalizedPathname =
    (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const isContractEditorPath = normalizedPathname === '/editar-contrato';
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
      return toPtBrApiMessage(data.message, 'Falha na operação.');
    } catch {
      return 'Falha na operação.';
    }
  };

  const obterMensagemApi = (
    payload: ApiErrorResponse | { message?: string | string[] } | null,
    fallback: string,
  ) => {
    if (!payload || typeof payload !== 'object') {
      return fallback;
    }

    return toPtBrApiMessage(
      (payload as { message?: string | string[] }).message,
      fallback,
    );
  };

  const abrirFluxoConfirmacaoEmail = (emailAlvo: string, mensagem: string) => {
    setConfirmacaoEmailPendente({
      email: emailAlvo.trim().toLowerCase(),
      message: mensagem,
    });
    setModoCadastro(false);
    setCodigoConfirmacao('');
    setSenha('');
    setConfirmacaoSenha('');
    setErro('');
    setAviso(mensagem);
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

  useEffect(() => {
    if (!autenticado || !token || usuario?.role !== 'admin') {
      setHasTopbarNotification(false);
      return;
    }

    let isMounted = true;

    const loadTopbarNotifications = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/classes/notices/all`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (isMounted) setHasTopbarNotification(false);
          return;
        }

        const payload = (await response.json()) as TopbarNotice[] | unknown;
        const notices = Array.isArray(payload) ? payload : [];
        const nowMs = Date.now();
        const hasAnyActiveNotice = notices.some((notice) =>
          hasActiveNotice(notice, nowMs),
        );
        if (isMounted) setHasTopbarNotification(hasAnyActiveNotice);
      } catch {
        if (isMounted) setHasTopbarNotification(false);
      }
    };

    void loadTopbarNotifications();
    const intervalId = window.setInterval(() => {
      void loadTopbarNotifications();
    }, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [autenticado, token, usuario?.role]);

  const executeGlobalSearch = () => {
    const nextSectionId = globalSearchSuggestions[0]?.sectionId;
    if (!nextSectionId) return;

    setSecaoAtiva(nextSectionId);
    setMobileMenuOpen(false);
  };

  const abrirNotificacoes = () => {
    const noticesSection = secoes.find((section) => section.id === 'admin_avisos');
    if (!noticesSection) return;
    setSecaoAtiva(noticesSection.id);
    setMobileMenuOpen(false);
  };

  const globalSearchSuggestions = useMemo(() => {
    const normalizedQuery = normalizeSearchTerm(globalSearchQuery);
    if (!normalizedQuery) return [] as Array<{ sectionId: string; label: string; score: number }>;

    const scopeSections = usuario?.role === 'superadmin' ? SECOES_SUPERADMIN : SECOES_ADMIN;
    const scopeAliases =
      usuario?.role === 'superadmin' ? SEARCH_SECTION_ALIAS_SUPERADMIN : SEARCH_SECTION_ALIAS;

    const suggestions = scopeSections
      .map((section) => {
        const normalizedLabel = normalizeSearchTerm(section.label);
        const aliasTerms = scopeAliases.find((alias) => alias.sectionId === section.id)?.terms ?? [];

        let score = 0;
        if (normalizedLabel.startsWith(normalizedQuery)) score = 120;
        else if (normalizedLabel.includes(normalizedQuery)) score = 100;

        for (const term of aliasTerms) {
          const normalizedTerm = normalizeSearchTerm(term);
          if (normalizedTerm.startsWith(normalizedQuery)) score = Math.max(score, 90);
          else if (
            normalizedQuery.includes(normalizedTerm) ||
            normalizedTerm.includes(normalizedQuery)
          ) {
            score = Math.max(score, 80);
          }
        }

        return {
          sectionId: section.id,
          label: section.label,
          score,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'pt-BR'))
      .slice(0, 6);

    return suggestions;
  }, [globalSearchQuery, usuario?.role]);

  const sair = () => {
    limparImpersonacao();
    try {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      window.localStorage.removeItem(SESSION_USER_KEY);
    } catch {}
    setToken('');
    setUsuario(null);
    setSecaoAtiva('');
    setErro('');
    setAviso('');
    setCodigoConfirmacao('');
    setConfirmacaoEmailPendente(null);
  };

  const limparFluxoConfirmacaoEmail = () => {
    setConfirmacaoEmailPendente(null);
    setCodigoConfirmacao('');
  };

  const entrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');
    setAviso('');

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

      const payload = (await response
        .json()
        .catch(() => null)) as AuthResponse | ApiErrorResponse | null;

      if (!response.ok) {
        const apiError = payload as ApiErrorResponse | null;

        if (response.status === 403 && apiError?.code === 'EMAIL_NAO_CONFIRMADO') {
          const mensagem = obterMensagemApi(
            apiError,
            'Seu e-mail ainda não foi confirmado. Digite o código enviado para continuar.',
          );

          abrirFluxoConfirmacaoEmail(
            String(apiError.email ?? email).trim().toLowerCase(),
            mensagem,
          );
          return;
        }

        setErro(obterMensagemApi(apiError, 'Falha na operação.'));
        return;
      }

      if (!payload || !('accessToken' in payload)) {
        setErro('Resposta inválida do servidor.');
        return;
      }

      persistirSessao(payload as AuthResponse);
      limparFluxoConfirmacaoEmail();
    } catch {
      setErro('Não foi possível conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  const cadastrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');
    setAviso('');

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

      const payload = (await response
        .json()
        .catch(() => null)) as RegisterResponse | ApiErrorResponse | null;

      if (!response.ok) {
        setErro(obterMensagemApi(payload as ApiErrorResponse | null, 'Falha na operação.'));
        return;
      }

      if (!payload || !('requiresEmailVerification' in payload)) {
        setErro('Resposta inválida do servidor.');
        return;
      }

      const registerData = payload as RegisterResponse;
      setModoCadastro(false);
      setEmail(registerData.email);
      abrirFluxoConfirmacaoEmail(
        registerData.email,
        registerData.message || 'Enviamos um código de confirmação para o seu e-mail.',
      );
    } catch {
      setErro('Não foi possível conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  const confirmarCodigoEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');
    setAviso('');

    if (!confirmacaoEmailPendente) {
      setErro('Nenhum e-mail pendente de confirmação no momento.');
      return;
    }

    if (codigoConfirmacao.trim().length !== 6) {
      setErro('Digite o código de 6 dígitos enviado para seu e-mail.');
      return;
    }

    setCarregando(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-email-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: confirmacaoEmailPendente.email,
          code: codigoConfirmacao.trim(),
        }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as VerifyEmailCodeResponse | ApiErrorResponse | null;

      if (!response.ok) {
        setErro(
          obterMensagemApi(
            payload as ApiErrorResponse | null,
            'Não foi possível confirmar o e-mail.',
          ),
        );
        return;
      }

      const mensagem =
        payload && 'message' in payload
          ? String(payload.message)
          : 'E-mail confirmado com sucesso. Faça login para continuar.';

      setAviso(mensagem);
      setEmail(confirmacaoEmailPendente.email);
      limparFluxoConfirmacaoEmail();
      setModoCadastro(false);
    } catch {
      setErro('Não foi possível conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  const reenviarCodigoConfirmacao = async () => {
    if (!confirmacaoEmailPendente) {
      return;
    }

    setErro('');
    setAviso('');
    setCarregando(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/resend-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: confirmacaoEmailPendente.email }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as ResendVerificationCodeResponse | ApiErrorResponse | null;

      if (!response.ok) {
        setErro(
          obterMensagemApi(
            payload as ApiErrorResponse | null,
            'Não foi possível reenviar o código.',
          ),
        );
        return;
      }

      const mensagem =
        payload && 'message' in payload
          ? String(payload.message)
          : 'Enviamos um novo código de confirmação para seu e-mail.';

      if (payload && 'sent' in payload && payload.sent === false) {
        setErro(mensagem);
        return;
      }

      setAviso(mensagem);
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [secaoAtiva]);

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
    const modoConfirmacaoEmailAtivo = Boolean(confirmacaoEmailPendente);
    const tituloAutenticacao = modoConfirmacaoEmailAtivo
      ? 'Confirmar e-mail'
      : modoCadastroAtivo
        ? 'Criar conta'
        : 'Entrar';
    const subtituloAutenticacao = modoConfirmacaoEmailAtivo
      ? 'Digite o código de 6 dígitos enviado para o seu e-mail.'
      : modoCadastroAtivo
        ? 'Cadastre-se para acessar o painel da instituição.'
        : 'Acesse com suas credenciais para continuar.';

    return (
      <div
        className={`auth-shell ${isEmbedded ? 'embedded' : ''} ${
          isStudentPortalMode ? 'auth-shell-plugin' : ''
        } ${!isEmbedded && !isStudentPortalMode ? 'auth-shell-admin' : ''}`}
      >
        {!isEmbedded && !isStudentPortalMode && (
          <section className="auth-panel">
            <div className="auth-brand">
              <div className="auth-brand-logo-wrap">
                <img
                  className="auth-brand-logo"
                  src="/7eventos_academy_logo.png"
                  alt="7Eventos Academy"
                />
              </div>
              <span className="auth-brand-eyebrow">Área administrativa</span>
            </div>

          </section>
        )}

        <section className={`auth-card ${isStudentPortalMode ? 'auth-card-plugin' : ''}`}>
          {isStudentPortalMode ? (
            <div className="auth-plugin-brand">
              <img src="/Logo-IPESK.png" alt="IPESK" />
            </div>
          ) : null}

          {isStudentPortalMode ? null : (
            <div className="auth-tabs">
              <button
                type="button"
                className={!modoCadastroAtivo && !modoConfirmacaoEmailAtivo ? 'active' : ''}
                onClick={() => {
                  setErro('');
                  setAviso('');
                  setModoCadastro(false);
                  limparFluxoConfirmacaoEmail();
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
                  setAviso('');
                  setModoCadastro(true);
                  limparFluxoConfirmacaoEmail();
                }}
                disabled={carregando}
              >
                Cadastrar
              </button>
            </div>
          )}

          <h2>{tituloAutenticacao}</h2>
          {!isStudentPortalMode ? (
            <p className="auth-card-subtitle">{subtituloAutenticacao}</p>
          ) : null}

          <form
            className="auth-form"
            onSubmit={
              modoConfirmacaoEmailAtivo
                ? confirmarCodigoEmail
                : modoCadastroAtivo
                  ? cadastrar
                  : entrar
            }
          >
            {modoConfirmacaoEmailAtivo ? (
              <>
                <label htmlFor="emailConfirmacao">E-mail</label>
                <input
                  id="emailConfirmacao"
                  type="email"
                  value={confirmacaoEmailPendente?.email ?? email}
                  readOnly
                  disabled={carregando}
                />

                <label htmlFor="codigoConfirmacao">Código de confirmação</label>
                <input
                  id="codigoConfirmacao"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={codigoConfirmacao}
                  onChange={(event) =>
                    setCodigoConfirmacao(event.target.value.replace(/\D+/g, '').slice(0, 6))
                  }
                  disabled={carregando}
                />
              </>
            ) : modoCadastroAtivo ? (
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

            {modoConfirmacaoEmailAtivo ? null : (
              <>
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
              </>
            )}

            {modoConfirmacaoEmailAtivo || !modoCadastroAtivo ? null : (
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
            )}

            {erro ? <div className="auth-error">{erro}</div> : null}
            {aviso ? <div className="auth-info">{aviso}</div> : null}

            <button type="submit" disabled={carregando}>
              {carregando
                ? 'Processando...'
                : modoConfirmacaoEmailAtivo
                  ? 'Confirmar e-mail'
                  : modoCadastroAtivo
                    ? 'Cadastrar e continuar'
                    : 'Entrar na plataforma'}
            </button>

            {modoConfirmacaoEmailAtivo ? (
              <div className="auth-verify-actions">
                <button
                  type="button"
                  className="auth-secondary-btn"
                  onClick={reenviarCodigoConfirmacao}
                  disabled={carregando}
                >
                  Reenviar código
                </button>
                <button
                  type="button"
                  className="auth-secondary-btn"
                  onClick={() => {
                    setErro('');
                    setAviso('');
                    limparFluxoConfirmacaoEmail();
                  }}
                  disabled={carregando}
                >
                  Voltar ao login
                </button>
              </div>
            ) : null}
          </form>
        </section>

        {!isEmbedded && !isStudentPortalMode && (
          <section className="auth-panel auth-panel-aftercard">
            <p>
              Ambiente completo para gestão de contas, turmas, matrículas, financeiro e
              operação acadêmica.
            </p>
            <div className="auth-panel-highlights">
              <span>Visão centralizada da operação</span>
              <span>Fluxos acadêmicos e financeiros no mesmo lugar</span>
            </div>
          </section>
        )}
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
      <aside className={`global-sidebar ${mobileMenuOpen ? 'is-mobile-open' : ''}`}>
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
              onClick={() => {
                setSecaoAtiva(item.id);
                setMobileMenuOpen(false);
              }}
            >
              <SidebarNavIcon name={ICONE_POR_SECAO[item.id] ?? 'dashboard'} />
              <span className="global-sidebar-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="global-sidebar-footer">
          <button type="button" className="global-sidebar-logout" onClick={sair}>
            <span className="material-symbols-outlined">logout</span>
            Sair
          </button>
        </div>
      </aside>
      {mobileMenuOpen ? (
        <button
          type="button"
          className="global-sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <main className="app-content">
        <header className="global-topbar-shell">
          <div className="global-topbar-left">
            <button
              type="button"
              className="global-mobile-menu-btn"
              aria-label="Alternar menu"
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <span className="material-symbols-outlined">
                {mobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>

            <label className="global-topbar-search" htmlFor="global-search">
              <TopbarIcon name="search" />
              <input
                id="global-search"
                type="text"
                placeholder="Buscar alunos, turmas ou materiais..."
                value={globalSearchQuery}
                onChange={(event) => setGlobalSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    executeGlobalSearch();
                  }
                }}
              />
              {globalSearchSuggestions.length > 0 ? (
                <div className="global-topbar-search-menu" role="listbox" aria-label="Sugestões de busca">
                  {globalSearchSuggestions.map((suggestion) => (
                    <button
                      key={`search-${suggestion.sectionId}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setSecaoAtiva(suggestion.sectionId);
                        setGlobalSearchQuery(suggestion.label);
                        setMobileMenuOpen(false);
                      }}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          </div>
          <div className="global-topbar-right">
            <button
              type="button"
              className="global-topbar-icon"
              aria-label="Notificações"
              onClick={abrirNotificacoes}
            >
              <TopbarIcon name="notifications" />
              {hasTopbarNotification ? <span className="global-topbar-dot" /> : null}
            </button>
            <button
              type="button"
              className="global-topbar-icon"
              aria-label="Ajuda"
            >
              <TopbarIcon name="help" />
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
              <div className="global-topbar-user-meta">
                <span className="global-topbar-user-name">{usuario?.name ?? 'Professor'}</span>
                <span className="global-topbar-user-role">
                  {roleLabel} • {maskEmail(usuario?.email)}
                </span>
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
            {isContractEditorPath ? (
              <ContractsNative token={token} mode="editor" />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'superadmin_dashboard_global' ? (
              <SuperadminDashboardNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
              />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'superadmin_gestao_contas' ? (
              <SuperadminAccountsNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'superadmin_impersonacao' ? (
              <SuperadminImpersonationNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
                onImpersonated={(session) => iniciarImpersonacao(session)}
              />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'superadmin_wordpress_plugin' ? (
              <SuperadminWordpressNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_dashboard_conta' ? (
              <DashboardNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
              />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_gestao_turmas' ? (
              <ClassesNative token={token} onNavigate={(sectionId) => setSecaoAtiva(sectionId)} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_cursos' ? (
              <CoursesNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_alunos_matriculas' ? (
              <StudentsNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_contratos' ? (
              <ContractsNative token={token} mode="hub" />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_agenda' ? (
              <AgendaNative
                token={token}
                onNavigate={(sectionId) => setSecaoAtiva(sectionId)}
              />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_aulas' ? (
              <LessonsNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_financeiro' ? (
              <FinanceNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_conteudo' ? (
              <ContentNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_avisos' ? (
              <NoticesNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_relatorios' ? (
              <ReportsNative token={token} />
            ) : null}

            {!isContractEditorPath && secaoAtiva === 'admin_configuracoes' ? (
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
