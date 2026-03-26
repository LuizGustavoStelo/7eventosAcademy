import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';

type StudentProfile = {
  documentCpf: string | null;
  phone: string | null;
  birthDate: string | null;
  city: string | null;
  state: string | null;
};

type StudentMe = {
  id: string;
  name: string;
  email: string;
  studentProfile: StudentProfile | null;
};

type StudentEnrollment = {
  enrollmentId: string;
  status: string;
  className: string;
  courseName: string;
  modality: string | null;
  startDate: string | null;
  endDate: string | null;
};

type StudentMaterial = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  fileUrl: string | null;
  externalUrl: string | null;
  className: string;
  publishedAt: string | null;
};

type StudentNotice = {
  id: string;
  title: string;
  body: string;
  priority: 'high' | 'normal' | string;
  className: string;
  publishedAt: string | null;
};

type StudentDashboardPayload = {
  me: StudentMe;
  matriculas: StudentEnrollment[];
  materiais: StudentMaterial[];
  avisos: StudentNotice[];
};

type StudentAreaNativeProps = {
  token: string;
  user: {
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  onLogout: () => void;
};

const STUDENT_CACHE_TTL_MS = 25_000;
const REFRESH_MS = 120_000;

const SECTION_IDS = [
  'st-student-panel',
  'st-student-course',
  'st-student-classes',
  'st-student-agenda',
  'st-student-finance',
  'st-student-live',
  'st-student-notices',
  'st-student-materials',
  'st-student-certificate',
  'st-student-profile',
] as const;

type SectionId = (typeof SECTION_IDS)[number];

type IconName =
  | 'dashboard'
  | 'school'
  | 'calendar_month'
  | 'live_tv'
  | 'checklist_rtl'
  | 'payments'
  | 'folder_open'
  | 'notifications_active'
  | 'verified'
  | 'person'
  | 'search'
  | 'help'
  | 'event_note'
  | 'headset_mic';

type NavItem = {
  label: string;
  icon: IconName;
  target: SectionId;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Painel', icon: 'dashboard', target: 'st-student-panel' },
  { label: 'Aulas', icon: 'school', target: 'st-student-classes' },
  { label: 'Agenda', icon: 'calendar_month', target: 'st-student-agenda' },
  { label: 'Transmissões', icon: 'live_tv', target: 'st-student-live' },
  { label: 'Frequência', icon: 'checklist_rtl', target: 'st-student-course' },
  { label: 'Financeiro', icon: 'payments', target: 'st-student-finance' },
  { label: 'Materiais', icon: 'folder_open', target: 'st-student-materials' },
  { label: 'Avisos', icon: 'notifications_active', target: 'st-student-notices' },
  { label: 'Certificado', icon: 'verified', target: 'st-student-certificate' },
  { label: 'Perfil', icon: 'person', target: 'st-student-profile' },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: 'Painel', icon: 'dashboard', target: 'st-student-panel' },
  { label: 'Aulas', icon: 'school', target: 'st-student-classes' },
  { label: 'Avisos', icon: 'notifications_active', target: 'st-student-notices' },
  { label: 'Materiais', icon: 'folder_open', target: 'st-student-materials' },
  { label: 'Perfil', icon: 'person', target: 'st-student-profile' },
];

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function firstName(name: string | undefined) {
  if (!name) return 'Aluno(a)';
  return name.trim().split(/\s+/)[0] || 'Aluno(a)';
}

function initials(name: string | undefined) {
  if (!name) return 'AL';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'AL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDayMonth(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return 'Sem data';
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTH_SHORT[date.getMonth()] || '---';
  return `${day} ${month}`;
}

function formatRelative(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return 'Agora';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return 'Agora';

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min atrás`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h atrás`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 30) return `${diffDays} dias atrás`;

  return formatDate(dateLike);
}

function formatCalendarBadge(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) {
    return {
      label: 'SEM',
      day: '--',
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return { label: 'HOJE', day: String(date.getDate()).padStart(2, '0') };
  }

  if (diffDays === 1) {
    return { label: 'AMANHÃ', day: String(date.getDate()).padStart(2, '0') };
  }

  const weekLabel = WEEKDAY_SHORT[date.getDay()] || 'DIA';
  return {
    label: weekLabel.toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
  };
}

function extractStatusFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\((\d{3})\)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeModality(modality: string | null | undefined) {
  if (!modality) return 'Ativa';
  const normalized = modality.trim().toLowerCase();
  if (normalized.includes('presenc')) return 'Presencial';
  if (normalized.includes('ead')) return 'EAD';
  if (normalized.includes('live') || normalized.includes('ao vivo')) return 'Ao vivo';
  return modality;
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) return 'Ativa';
  const normalized = status.trim().toUpperCase();
  if (normalized === 'ACTIVE') return 'Ativa';
  if (normalized === 'CANCELLED') return 'Cancelada';
  if (normalized === 'COMPLETED') return 'Concluída';
  return status;
}

function modalityTone(modality: string) {
  const normalized = modality.toLowerCase();
  if (normalized.includes('presencial')) return 'is-presencial';
  if (normalized.includes('ao vivo')) return 'is-live';
  if (normalized.includes('ead')) return 'is-ead';
  return 'is-default';
}

function progressFromDateRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end) return null;

  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;

  const elapsed = Date.now() - start.getTime();
  if (elapsed <= 0) return 0;
  if (elapsed >= total) return 100;

  return Math.round((elapsed / total) * 100);
}

function StudentIcon({ name, className }: { name: IconName; className?: string }) {
  const classes = ['student-template-icon', className].filter(Boolean).join(' ');

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

  if (name === 'calendar_month') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    );
  }

  if (name === 'live_tv') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 18v3M10 9l5 2.5-5 2.5V9z" />
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

  if (name === 'payments') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </svg>
    );
  }

  if (name === 'folder_open') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v1H3V7z" />
        <path d="M3 10h18l-2 8a2 2 0 01-2 1H5a2 2 0 01-2-2v-7z" />
      </svg>
    );
  }

  if (name === 'notifications_active') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M6 10a6 6 0 1112 0v4l2 2H4l2-2v-4z" />
        <path d="M10 18a2 2 0 004 0" />
      </svg>
    );
  }

  if (name === 'verified') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M12 3l3 1.5 3.3-.3 1 3.1 2.7 2-1.6 2.9.2 3.3-3 1.3-2 2.7-3-1.2-3 1.2-2-2.7-3-1.3.2-3.3-1.6-2.9 2.7-2 1-3.1L9 4.5 12 3z" />
        <path d="M8.5 12.3l2.2 2.2 4.8-4.8" />
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

  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
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

  if (name === 'event_note') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 2v4M16 2v4M8 11h8M8 15h5M4 8h16" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
      <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" />
      <path d="M7 12h10M12 7v10" />
    </svg>
  );
}

export function StudentAreaNative({ token, user, onLogout }: StudentAreaNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<StudentDashboardPayload | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('st-student-panel');
  const [fontsReady, setFontsReady] = useState(false);

  const loadFallback = async (bypassCache = false): Promise<StudentDashboardPayload> => {
    const [me, matriculas, materiais, avisos] = await Promise.all([
      apiRequest<StudentMe>(token, '/mis/v1/aluno/me', undefined, {
        cacheTtlMs: STUDENT_CACHE_TTL_MS,
        bypassCache,
      }),
      apiRequest<StudentEnrollment[]>(token, '/mis/v1/aluno/matriculas', undefined, {
        cacheTtlMs: STUDENT_CACHE_TTL_MS,
        bypassCache,
      }),
      apiRequest<StudentMaterial[]>(token, '/mis/v1/aluno/materiais', undefined, {
        cacheTtlMs: STUDENT_CACHE_TTL_MS,
        bypassCache,
      }),
      apiRequest<StudentNotice[]>(token, '/mis/v1/aluno/avisos', undefined, {
        cacheTtlMs: STUDENT_CACHE_TTL_MS,
        bypassCache,
      }),
    ]);

    return { me, matriculas, materiais, avisos };
  };

  const loadDashboard = async (options?: { bypassCache?: boolean }) => {
    const bypassCache = Boolean(options?.bypassCache);

    try {
      setError('');

      let payload: StudentDashboardPayload;
      try {
        payload = await apiRequest<StudentDashboardPayload>(
          token,
          '/mis/v1/aluno/dashboard',
          undefined,
          {
            cacheTtlMs: STUDENT_CACHE_TTL_MS,
            bypassCache,
          },
        );
      } catch (dashboardError) {
        const status = extractStatusFromError(dashboardError);
        if (status === 404) {
          payload = await loadFallback(bypassCache);
        } else {
          throw dashboardError;
        }
      }

      setDashboard(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Não foi possível carregar a Área do Aluno.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void loadDashboard({ bypassCache: true });
    }, REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    let mounted = true;

    const waitFonts = async () => {
      try {
        const fontReady = typeof document !== 'undefined' && 'fonts' in document
          ? (document as Document & { fonts: FontFaceSet }).fonts.ready
          : Promise.resolve();
        const timeout = new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 1200);
        });
        await Promise.race([fontReady, timeout]);
      } finally {
        if (mounted) setFontsReady(true);
      }
    };

    void waitFonts();

    return () => {
      mounted = false;
    };
  }, []);

  const me = dashboard?.me;
  const matriculas = dashboard?.matriculas ?? [];
  const materiais = dashboard?.materiais ?? [];
  const avisos = dashboard?.avisos ?? [];

  const matriculaPrincipal = matriculas[0] ?? null;

  const periodProgress = useMemo(
    () => progressFromDateRange(matriculaPrincipal?.startDate, matriculaPrincipal?.endDate),
    [matriculaPrincipal?.startDate, matriculaPrincipal?.endDate],
  );

  const upcomingClasses = useMemo(() => {
    const sorted = [...matriculas].sort((a, b) => {
      const aDate = toDate(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDate = toDate(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });

    return sorted.slice(0, 3).map((item) => {
      const badge = formatCalendarBadge(item.startDate);
      const modality = normalizeModality(item.modality);

      return {
        id: item.enrollmentId,
        title: item.className,
        subtitle: item.courseName,
        startDate: item.startDate,
        period: item.startDate
          ? `Início ${formatDate(item.startDate)}${item.endDate ? ` • Término ${formatDate(item.endDate)}` : ''}`
          : 'Data da turma não informada',
        modality,
        modalityTone: modalityTone(modality),
        dayLabel: badge.label,
        day: badge.day,
      };
    });
  }, [matriculas]);

  const recentNotices = useMemo(() => avisos.slice(0, 2), [avisos]);
  const recentMaterials = useMemo(() => materiais.slice(0, 4), [materiais]);

  const liveMaterial = useMemo(
    () =>
      materiais.find((material) => {
        const haystack = `${material.kind} ${material.title}`.toLowerCase();
        return (
          haystack.includes('live') ||
          haystack.includes('video') ||
          haystack.includes('aula') ||
          haystack.includes('transmiss')
        );
      }) ?? null,
    [materiais],
  );

  const nextEventLabel = upcomingClasses[0]?.day
    ? formatDayMonth(upcomingClasses[0]?.startDate)
    : 'Sem data';

  const nextEventDescription = upcomingClasses[0]
    ? `Próxima aula: ${upcomingClasses[0].title}`
    : 'Nenhuma aula agendada no momento';

  const materialsWithAccess = materiais.filter((item) => item.fileUrl || item.externalUrl).length;
  const materialsProgress =
    materiais.length > 0 ? Math.round((materialsWithAccess / materiais.length) * 100) : 0;

  const titleName = me?.name || user.name;
  const profileCityState = useMemo(() => {
    const city = me?.studentProfile?.city;
    const state = me?.studentProfile?.state;
    if (!city) return '-';
    return state ? `${city} - ${state}` : city;
  }, [me?.studentProfile?.city, me?.studentProfile?.state]);

  const subtitle =
    periodProgress === null
      ? 'Seu painel acadêmico está sincronizado. Continue acompanhando suas atualizações.'
      : `Seu período letivo está ${periodProgress}% concluído. Continue nesse ritmo.`;

  const scrollToSection = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    const target = document.getElementById(sectionId);
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    target?.classList.add('is-focus-highlight');
    window.setTimeout(() => target?.classList.remove('is-focus-highlight'), 900);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${sectionId}`);
    }
  };

  const studentId = me?.id ? me.id.slice(0, 8).toUpperCase() : '---';
  const showBootOverlay = loading || !fontsReady;

  return (
    <section className={`student-template-shell ${showBootOverlay ? 'is-booting' : ''}`}>
      {showBootOverlay ? (
        <div className="student-template-boot" role="status" aria-live="polite">
          <div className="student-template-boot-card">
            <img src="/7eventos_academy_logo.png" alt="7Eventos Academy" />
            <strong>Carregando Portal do Aluno</strong>
            <p>Preparando layout e dados com estabilidade visual...</p>
            <span className="student-template-boot-spinner" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      <aside className="student-template-sidebar" aria-label="Navegação principal do aluno">
        <div className="student-template-brand">
          <img src="/7eventos_academy_logo.png" alt="7Eventos Academy" />
          <div>
            <h1>Portal do Aluno</h1>
            <p>Pós-graduação Premium</p>
          </div>
        </div>

        <nav className="student-template-menu">
          {NAV_ITEMS.map((item) => (
            <button
              key={`${item.label}-${item.target}`}
              type="button"
              className={activeSection === item.target ? 'active' : ''}
              onClick={() => scrollToSection(item.target)}
            >
              <StudentIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button type="button" className="student-template-secretary">
          Secretaria Virtual
        </button>
      </aside>

      <main className="student-template-main">
        <header className="student-template-topbar">
          <label className="student-template-search" htmlFor="student-search">
            <StudentIcon name="search" />
            <input
              id="student-search"
              type="text"
              placeholder="Buscar materiais, aulas ou avisos..."
              readOnly
              aria-label="Busca rápida"
            />
          </label>

          <div className="student-template-topbar-right">
            <button type="button" className="student-template-icon-btn" aria-label="Notificações">
              <StudentIcon name="notifications_active" />
              {avisos.length > 0 ? <span className="student-template-icon-dot" /> : null}
            </button>
            <button type="button" className="student-template-icon-btn" aria-label="Ajuda">
              <StudentIcon name="help" />
            </button>

            <div className="student-template-user">
              <div>
                <strong>{titleName}</strong>
                <small>ID: {studentId}</small>
              </div>

              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={`Avatar de ${titleName}`} />
              ) : (
                <span className="student-template-user-fallback">{initials(titleName)}</span>
              )}
            </div>

            <button type="button" className="student-template-logout" onClick={onLogout}>
              Sair
            </button>
          </div>
        </header>

        <div className="student-template-content">
          {loading ? <p className="student-template-loading">Carregando painel do aluno...</p> : null}

          {error ? (
            <p className="student-template-error">
              {error}
              <button type="button" onClick={() => void loadDashboard({ bypassCache: true })}>
                Atualizar
              </button>
            </p>
          ) : null}

          {!dashboard || error ? null : (
            <>
              <section id="st-student-panel" className="student-template-welcome">
                <h2>Bem-vindo de volta, {firstName(titleName)}!</h2>
                <p>{subtitle}</p>
              </section>

              <div className="student-template-bento-grid">
                <article id="st-student-course" className="student-template-course-card">
                  <div className="student-template-course-header">
                    <div className="student-template-course-badges">
                      <span>Curso atual</span>
                      <span>{normalizeModality(matriculaPrincipal?.modality)}</span>
                    </div>
                  </div>
                  <StudentIcon name="school" className="student-template-course-watermark" />

                  <h3>{matriculaPrincipal?.courseName || 'Nenhum curso ativo'}</h3>
                  <p>
                    {matriculaPrincipal
                      ? `${matriculaPrincipal.className} • ${formatDate(matriculaPrincipal.startDate)} a ${formatDate(matriculaPrincipal.endDate)}`
                      : 'Você ainda não possui matrícula ativa. Assim que houver, os dados serão exibidos aqui.'}
                  </p>

                  <div className="student-template-progress">
                    <div>
                      <strong>Progresso do período</strong>
                      <small>
                        {periodProgress === null
                          ? 'Sem intervalo de datas para cálculo.'
                          : 'Estimado pela janela de início e término da turma.'}
                      </small>
                    </div>
                    <b>{periodProgress === null ? 'N/D' : `${periodProgress}%`}</b>
                  </div>

                  <div className="student-template-progress-bar" aria-hidden="true">
                    <span style={{ width: `${periodProgress ?? 0}%` }} />
                  </div>
                </article>

                <div className="student-template-side-stack">
                  <article id="st-student-finance" className="student-template-next-due-card">
                    <div>
                      <StudentIcon name="payments" />
                      <small>Próximo evento</small>
                    </div>
                    <strong>{nextEventLabel}</strong>
                    <p>{nextEventDescription}</p>
                  </article>

                  <article className="student-template-credit-card">
                    <div>
                      <StudentIcon name="checklist_rtl" />
                      <small>Materiais liberados</small>
                    </div>
                    <strong>
                      {materiais.length} <em>/ {materialsWithAccess} com acesso</em>
                    </strong>
                    <div className="student-template-progress-mini" aria-hidden="true">
                      <span style={{ width: `${materialsProgress}%` }} />
                    </div>
                  </article>
                </div>

                <article id="st-student-classes" className="student-template-classes-card">
                  <div className="student-template-card-title">
                    <h4>
                      <StudentIcon name="event_note" />
                      Próximas aulas
                    </h4>
                    <button type="button" onClick={() => scrollToSection('st-student-materials')}>
                      Ver materiais
                    </button>
                  </div>

                  {upcomingClasses.length === 0 ? (
                    <p className="student-template-empty">Nenhuma aula programada no momento.</p>
                  ) : (
                    <div className="student-template-class-list">
                      {upcomingClasses.map((item) => (
                        <article key={item.id} className="student-template-class-item">
                          <div className="student-template-class-date">
                            <span>{item.dayLabel}</span>
                            <strong>{item.day}</strong>
                          </div>

                          <div className="student-template-class-content">
                            <h5>{item.title}</h5>
                            <p>{item.subtitle}</p>
                            <small>{item.period}</small>
                          </div>

                          <span className={`student-template-class-tag ${item.modalityTone}`}>{item.modality}</span>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <div className="student-template-right-column">
                  <article id="st-student-live" className="student-template-live-card">
                    <div>
                      <StudentIcon name="live_tv" />
                      <div>
                        <h4>{liveMaterial ? 'Transmissão em destaque' : 'Sem transmissão no momento'}</h4>
                        <p>
                          {liveMaterial
                            ? liveMaterial.title
                            : 'Assim que uma live for publicada, ela aparecerá aqui.'}
                        </p>
                      </div>
                    </div>

                    {liveMaterial?.externalUrl || liveMaterial?.fileUrl ? (
                      <a
                        href={liveMaterial.externalUrl || liveMaterial.fileUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Assistir
                      </a>
                    ) : (
                      <button type="button" disabled>
                        Indisponível
                      </button>
                    )}
                  </article>

                  <article id="st-student-notices" className="student-template-notices-card">
                    <div className="student-template-card-title">
                      <h4>
                        <StudentIcon name="notifications_active" />
                        Avisos recentes
                      </h4>
                    </div>

                    {recentNotices.length === 0 ? (
                      <p className="student-template-empty">Nenhum aviso recente.</p>
                    ) : (
                      <div className="student-template-notice-list">
                        {recentNotices.map((aviso) => (
                          <article
                            key={aviso.id}
                            className={aviso.priority === 'high' ? 'is-priority' : 'is-neutral'}
                          >
                            <small>
                              {aviso.className} • {formatRelative(aviso.publishedAt)}
                            </small>
                            <h5>{aviso.title}</h5>
                            <p>{aviso.body}</p>
                          </article>
                        ))}
                      </div>
                    )}

                    <button type="button" onClick={() => scrollToSection('st-student-notices')}>
                      Ver todos os avisos
                    </button>
                  </article>
                </div>
              </div>

              <footer className="student-template-support">
                <div className="student-template-support-main">
                  <StudentIcon name="headset_mic" />
                  <div>
                    <h4>Precisa de auxílio acadêmico?</h4>
                    <p>Nosso time está disponível de segunda a sexta, das 09h às 21h.</p>
                  </div>
                </div>
                <div className="student-template-support-actions">
                  <button type="button">Central de ajuda</button>
                  <button type="button">Falar com suporte</button>
                </div>
              </footer>

              <section className="student-template-lower-grid">
                <article id="st-student-agenda" className="student-template-lower-card">
                  <h4>Agenda acadêmica</h4>
                  {upcomingClasses.length === 0 ? (
                    <p className="student-template-empty">Nenhum evento acadêmico próximo.</p>
                  ) : (
                    <ul>
                      {upcomingClasses.map((item) => (
                        <li key={`${item.id}-agenda`}>
                          <div>
                            <strong>{item.title}</strong>
                            <small>{item.period}</small>
                          </div>
                          <span>{item.modality}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>

                <article id="st-student-materials" className="student-template-lower-card">
                  <h4>Materiais de apoio</h4>
                  {recentMaterials.length === 0 ? (
                    <p className="student-template-empty">Nenhum material publicado para suas turmas.</p>
                  ) : (
                    <ul>
                      {recentMaterials.map((material) => (
                        <li key={material.id}>
                          <div>
                            <strong>{material.title}</strong>
                            <small>
                              {material.className} • {formatDateTime(material.publishedAt)}
                            </small>
                          </div>
                          {material.fileUrl || material.externalUrl ? (
                            <a
                              href={material.fileUrl || material.externalUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Abrir
                            </a>
                          ) : (
                            <span>Sem link</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>

                <article id="st-student-certificate" className="student-template-lower-card">
                  <h4>Certificado</h4>
                  <p>
                    {matriculaPrincipal
                      ? `Status da matrícula: ${normalizeStatus(matriculaPrincipal.status)}.`
                      : 'Sem matrícula ativa para emissão de certificado.'}
                  </p>
                  <p>
                    Assim que a turma for concluída e homologada, o certificado ficará disponível para
                    download neste painel.
                  </p>
                </article>

                <article id="st-student-profile" className="student-template-lower-card">
                  <h4>Meu perfil</h4>
                  <div className="student-template-profile-row">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={`Avatar de ${titleName}`} />
                    ) : (
                      <span>{initials(titleName)}</span>
                    )}
                    <div>
                      <strong>{titleName}</strong>
                      <small>{me?.email || user.email}</small>
                    </div>
                  </div>

                  <dl>
                    <div>
                      <dt>CPF</dt>
                      <dd>{me?.studentProfile?.documentCpf || '-'}</dd>
                    </div>
                    <div>
                      <dt>Telefone</dt>
                      <dd>{me?.studentProfile?.phone || '-'}</dd>
                    </div>
                    <div>
                      <dt>Nascimento</dt>
                      <dd>{formatDate(me?.studentProfile?.birthDate)}</dd>
                    </div>
                    <div>
                      <dt>Cidade/UF</dt>
                      <dd>{profileCityState}</dd>
                    </div>
                  </dl>
                </article>
              </section>
            </>
          )}
        </div>
      </main>

      <nav className="student-template-bottom-nav" aria-label="Navegação móvel">
        {MOBILE_NAV_ITEMS.map((item) => (
          <button
            key={`${item.label}-${item.target}`}
            type="button"
            className={activeSection === item.target ? 'active' : ''}
            onClick={() => scrollToSection(item.target)}
          >
            <StudentIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
