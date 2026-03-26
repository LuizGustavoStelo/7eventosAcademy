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

const SECTION_META: Record<SectionId, { title: string; subtitle: string }> = {
  'st-student-panel': {
    title: 'Bem-vindo de volta, aluno!',
    subtitle: 'Seu painel acadêmico está sincronizado. Continue acompanhando suas atualizações.',
  },
  'st-student-course': {
    title: 'Frequência e desempenho',
    subtitle: 'Visão detalhada do andamento da sua jornada acadêmica.',
  },
  'st-student-classes': {
    title: 'Aulas',
    subtitle: 'Acompanhe as próximas aulas e a programação da sua turma.',
  },
  'st-student-agenda': {
    title: 'Agenda acadêmica',
    subtitle: 'Eventos organizados para você acompanhar os próximos compromissos.',
  },
  'st-student-finance': {
    title: 'Financeiro',
    subtitle: 'Resumo rápido dos próximos eventos e status de materiais liberados.',
  },
  'st-student-live': {
    title: 'Transmissões',
    subtitle: 'Conteúdos ao vivo e aulas em destaque.',
  },
  'st-student-notices': {
    title: 'Avisos e comunicados',
    subtitle: 'Mensagens recentes da coordenação e da secretaria.',
  },
  'st-student-materials': {
    title: 'Materiais de apoio',
    subtitle: 'Arquivos e conteúdos liberados para suas turmas.',
  },
  'st-student-certificate': {
    title: 'Certificado',
    subtitle: 'Acompanhe o status para emissão do seu certificado.',
  },
  'st-student-profile': {
    title: 'Meu perfil',
    subtitle: 'Dados pessoais e informações acadêmicas de cadastro.',
  },
};

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_TINY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SECTION_HASH_PREFIX = 'tab=';

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

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseSectionFromHash(hash: string): SectionId | null {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  const candidate = normalized.startsWith(SECTION_HASH_PREFIX)
    ? normalized.slice(SECTION_HASH_PREFIX.length)
    : normalized;
  if ((SECTION_IDS as readonly string[]).includes(candidate)) {
    return candidate as SectionId;
  }
  return null;
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

  useEffect(() => {
    const applyHash = () => {
      const sectionFromHash = parseSectionFromHash(window.location.hash);
      if (sectionFromHash) {
        setActiveSection(sectionFromHash);
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => {
      window.removeEventListener('hashchange', applyHash);
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

  const recentNotices = useMemo(() => avisos.slice(0, 6), [avisos]);
  const recentMaterials = useMemo(() => materiais.slice(0, 12), [materiais]);

  const liveMaterials = useMemo(
    () =>
      materiais.filter((material) => {
        const haystack = `${material.kind} ${material.title}`.toLowerCase();
        return (
          haystack.includes('live') ||
          haystack.includes('video') ||
          haystack.includes('aula') ||
          haystack.includes('transmiss')
        );
      }),
    [materiais],
  );

  const liveMaterial = liveMaterials[0] ?? null;
  const archivedLives = liveMaterials.slice(1, 6);

  const materialsByClass = useMemo(() => {
    const map = new Map<string, StudentMaterial[]>();
    for (const material of recentMaterials) {
      const key = material.className || 'Sem turma';
      const list = map.get(key) ?? [];
      list.push(material);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [recentMaterials]);

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

  const attendanceStats = useMemo(() => {
    const total = upcomingClasses.length;
    const attended = upcomingClasses.filter((item) => {
      const start = toDate(item.startDate);
      return start ? start.getTime() <= Date.now() : false;
    }).length;
    const pending = Math.max(total - attended, 0);
    const percent = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { total, attended, pending, percent };
  }, [upcomingClasses]);

  const calendarData = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const marks = new Set(
      upcomingClasses
        .map((item) => toDate(item.startDate))
        .filter((value): value is Date => Boolean(value))
        .map((date) => toDateKey(date)),
    );

    const todayKey = toDateKey(now);
    const cells: Array<{ day: number | null; key: string; isMarked: boolean; isToday: boolean }> = [];

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ day: null, key: `empty-${i}`, isMarked: false, isToday: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = toDateKey(date);
      cells.push({
        day,
        key,
        isMarked: marks.has(key),
        isToday: key === todayKey,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        day: null,
        key: `tail-${cells.length}`,
        isMarked: false,
        isToday: false,
      });
    }

    return {
      monthLabel: `${MONTH_SHORT[month]} ${year}`,
      cells,
    };
  }, [upcomingClasses]);

  const subtitle =
    periodProgress === null
      ? 'Seu painel acadêmico está sincronizado. Continue acompanhando suas atualizações.'
      : `Seu período letivo está ${periodProgress}% concluído. Continue nesse ritmo.`;

  const isPanelView = activeSection === 'st-student-panel';
  const currentMeta = SECTION_META[activeSection];
  const currentSubtitle =
    activeSection === 'st-student-panel'
      ? periodProgress === null
        ? subtitle
        : `Seu progresso acadêmico está em ${periodProgress}%. Continue acompanhando suas atualizações.`
      : currentMeta.subtitle;

  const showCourse = isPanelView || activeSection === 'st-student-course';
  const showFinance = isPanelView || activeSection === 'st-student-finance';
  const showClasses = isPanelView || activeSection === 'st-student-classes';
  const showLive = isPanelView || activeSection === 'st-student-live';
  const showNotices = isPanelView || activeSection === 'st-student-notices';
  const showAgenda = isPanelView || activeSection === 'st-student-agenda';
  const showMaterials = isPanelView || activeSection === 'st-student-materials';
  const showCertificate = isPanelView || activeSection === 'st-student-certificate';
  const showProfile = isPanelView || activeSection === 'st-student-profile';

  const openSection = (sectionId: SectionId) => {
    setActiveSection(sectionId);

    window.scrollTo({
      top: 0,
      behavior: 'auto',
    });

    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${SECTION_HASH_PREFIX}${sectionId}`);
    }
  };

  const renderDedicatedPage = () => {
    if (activeSection === 'st-student-classes') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-2">
            <article className="student-page-card is-hero">
              <div className="student-page-chip-row">
                <span>Minha matrícula</span>
                <span>{normalizeStatus(matriculaPrincipal?.status)}</span>
              </div>
              <h3>{matriculaPrincipal?.courseName || 'Sem curso ativo'}</h3>
              <p>
                {matriculaPrincipal
                  ? `Turma ${matriculaPrincipal.className} • ${normalizeModality(matriculaPrincipal.modality)}`
                  : 'Nenhuma matrícula ativa no momento.'}
              </p>
              <div className="student-page-kpis">
                <article>
                  <span>Início</span>
                  <strong>{formatDate(matriculaPrincipal?.startDate)}</strong>
                </article>
                <article>
                  <span>Término</span>
                  <strong>{formatDate(matriculaPrincipal?.endDate)}</strong>
                </article>
                <article>
                  <span>Progresso</span>
                  <strong>{periodProgress === null ? 'N/D' : `${periodProgress}%`}</strong>
                </article>
              </div>
            </article>

            <article className="student-page-card">
              <h4>Turmas matriculadas</h4>
              {matriculas.length === 0 ? (
                <p className="student-template-empty">Nenhuma turma ativa para exibir.</p>
              ) : (
                <div className="student-page-list">
                  {matriculas.map((item) => (
                    <article key={item.enrollmentId} className="student-page-list-item">
                      <div>
                        <strong>{item.className}</strong>
                        <small>{item.courseName}</small>
                      </div>
                      <span>{normalizeStatus(item.status)}</span>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </div>
        </section>
      );
    }

    if (activeSection === 'st-student-agenda') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-2">
            <article className="student-page-card">
              <div className="student-page-card-head">
                <h4>{calendarData.monthLabel}</h4>
                <small>Calendário acadêmico</small>
              </div>
              <div className="student-calendar-weekdays">
                {WEEKDAY_TINY.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="student-calendar-days">
                {calendarData.cells.map((cell) => (
                  <div
                    key={cell.key}
                    className={`student-calendar-day ${cell.day === null ? 'is-empty' : ''} ${
                      cell.isToday ? 'is-today' : ''
                    } ${cell.isMarked ? 'is-marked' : ''}`}
                  >
                    {cell.day}
                  </div>
                ))}
              </div>
            </article>

            <article className="student-page-card">
              <h4>Próximos eventos</h4>
              {upcomingClasses.length === 0 ? (
                <p className="student-template-empty">Nenhum evento agendado para este mês.</p>
              ) : (
                <div className="student-page-list">
                  {upcomingClasses.map((item) => (
                    <article key={`${item.id}-agenda`} className="student-page-list-item is-calendar">
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.period}</small>
                      </div>
                      <span>{item.modality}</span>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </div>
        </section>
      );
    }

    if (activeSection === 'st-student-live') {
      const liveHistory = archivedLives.length > 0 ? archivedLives : liveMaterials;
      return (
        <section className="student-page-layout">
          <article className="student-page-card is-live-highlight">
            <div>
              <small>Transmissão em destaque</small>
              <h3>{liveMaterial?.title || 'Nenhuma transmissão no momento'}</h3>
              <p>
                {liveMaterial?.description ||
                  'As transmissões ao vivo e gravações aparecerão aqui conforme publicação da turma.'}
              </p>
            </div>
            {liveMaterial?.externalUrl || liveMaterial?.fileUrl ? (
              <a
                href={liveMaterial.externalUrl || liveMaterial.fileUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                Assistir agora
              </a>
            ) : (
              <button type="button" disabled>
                Indisponível
              </button>
            )}
          </article>

          <article className="student-page-card">
            <h4>Transmissões publicadas</h4>
            {liveHistory.length === 0 ? (
              <p className="student-template-empty">Nenhuma transmissão disponível.</p>
            ) : (
              <div className="student-page-list">
                {liveHistory.map((material) => (
                  <article key={material.id} className="student-page-list-item">
                    <div>
                      <strong>{material.title}</strong>
                      <small>{material.className}</small>
                    </div>
                    {material.externalUrl || material.fileUrl ? (
                      <a
                        href={material.externalUrl || material.fileUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir
                      </a>
                    ) : (
                      <span>Sem link</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-course') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <div className="student-page-card-head">
              <h4>Frequência geral</h4>
              <strong>{attendanceStats.percent}%</strong>
            </div>
            <div className="student-template-progress-bar" aria-hidden="true">
              <span style={{ width: `${attendanceStats.percent}%` }} />
            </div>
            <div className="student-page-kpis">
              <article>
                <span>Aulas previstas</span>
                <strong>{attendanceStats.total}</strong>
              </article>
              <article>
                <span>Aulas registradas</span>
                <strong>{attendanceStats.attended}</strong>
              </article>
              <article>
                <span>Próximas aulas</span>
                <strong>{attendanceStats.pending}</strong>
              </article>
            </div>
          </article>

          <article className="student-page-card">
            <h4>Histórico de presença</h4>
            {upcomingClasses.length === 0 ? (
              <p className="student-template-empty">Sem eventos suficientes para cálculo de frequência.</p>
            ) : (
              <div className="student-page-list">
                {upcomingClasses.map((item) => {
                  const started = toDate(item.startDate)?.getTime();
                  const present = started ? started <= Date.now() : false;
                  return (
                    <article key={`${item.id}-freq`} className="student-page-list-item">
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.period}</small>
                      </div>
                      <span>{present ? 'Registrada' : 'Pendente'}</span>
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-finance') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-3">
            <article className="student-page-card">
              <h4>Status atual</h4>
              <strong className="student-page-big">
                {matriculaPrincipal ? normalizeStatus(matriculaPrincipal.status) : 'Sem matrícula ativa'}
              </strong>
              <p>
                {matriculaPrincipal
                  ? 'Sua matrícula está ativa e vinculada a uma turma em andamento.'
                  : 'Nenhuma matrícula ativa encontrada para gerar status financeiro detalhado.'}
              </p>
            </article>
            <article className="student-page-card">
              <h4>Próximo evento</h4>
              <strong className="student-page-big">{nextEventLabel}</strong>
              <p>{nextEventDescription}</p>
            </article>
            <article className="student-page-card">
              <h4>Materiais liberados</h4>
              <strong className="student-page-big">{materialsWithAccess}</strong>
              <p>Conteúdos com link ativo para consulta imediata.</p>
            </article>
          </div>
          <article className="student-page-card">
            <h4>Resumo operacional</h4>
            <p>
              Não há endpoint financeiro público do aluno retornando cobranças nesta conta no momento.
              Assim que a integração publicar parcelas e vencimentos, esta página exibirá o extrato.
            </p>
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-materials') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <h4>Biblioteca por turma</h4>
            {materialsByClass.length === 0 ? (
              <p className="student-template-empty">Nenhum material disponível para suas turmas.</p>
            ) : (
              <div className="student-material-groups">
                {materialsByClass.map(([className, items]) => (
                  <section key={className}>
                    <header>
                      <strong>{className}</strong>
                      <small>{items.length} item(ns)</small>
                    </header>
                    <ul>
                      {items.map((material) => (
                        <li key={material.id}>
                          <div>
                            <h5>{material.title}</h5>
                            <p>{material.description || `Tipo: ${material.kind}`}</p>
                            <small>{formatDateTime(material.publishedAt)}</small>
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
                  </section>
                ))}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-notices') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <h4>Mural de avisos</h4>
            {recentNotices.length === 0 ? (
              <p className="student-template-empty">Nenhum aviso publicado no momento.</p>
            ) : (
              <div className="student-notice-feed">
                {recentNotices.map((aviso) => (
                  <article key={aviso.id} className={aviso.priority === 'high' ? 'is-priority' : ''}>
                    <header>
                      <strong>{aviso.title}</strong>
                      <span>{formatRelative(aviso.publishedAt)}</span>
                    </header>
                    <small>{aviso.className}</small>
                    <p>{aviso.body}</p>
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-certificate') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <h4>Certificado de conclusão</h4>
            {matriculas.length === 0 ? (
              <p className="student-template-empty">Sem matrícula ativa para emissão de certificado.</p>
            ) : (
              <div className="student-page-list">
                {matriculas.map((item) => {
                  const status = normalizeStatus(item.status);
                  const isConcluded = status.toLowerCase().includes('conclu');
                  return (
                    <article key={`${item.enrollmentId}-cert`} className="student-page-list-item">
                      <div>
                        <strong>{item.courseName}</strong>
                        <small>
                          {item.className} • {status}
                        </small>
                      </div>
                      {isConcluded ? <button type="button">Baixar PDF</button> : <span>Pendente</span>}
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-profile') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-2">
            <article className="student-page-card">
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
              <dl className="student-profile-grid">
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
            <article className="student-page-card">
              <h4>Suporte acadêmico</h4>
              <p>
                Para atualização cadastral, documentos e dúvidas administrativas, utilize a Secretaria
                Virtual no menu lateral.
              </p>
            </article>
          </div>
        </section>
      );
    }

    return null;
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
                onClick={() => openSection(item.target)}
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
                <h2>
                  {activeSection === 'st-student-panel'
                    ? `Bem-vindo de volta, ${firstName(titleName)}!`
                    : currentMeta.title}
                </h2>
                <p>{currentSubtitle}</p>
              </section>

              {isPanelView ? (
                <>
              <div className={`student-template-bento-grid ${isPanelView ? '' : 'is-single-view'}`}>
                {showCourse ? (
                <article
                  id="st-student-course"
                  className={`student-template-course-card ${isPanelView ? '' : 'is-full-span'}`}
                >
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
                ) : null}

                {showFinance ? (
                <div className={`student-template-side-stack ${isPanelView ? '' : 'is-full-span'}`}>
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
                ) : null}

                {showClasses ? (
                <article
                  id="st-student-classes"
                  className={`student-template-classes-card ${isPanelView ? '' : 'is-full-span'}`}
                >
                  <div className="student-template-card-title">
                    <h4>
                      <StudentIcon name="event_note" />
                      Próximas aulas
                    </h4>
                    <button type="button" onClick={() => openSection('st-student-materials')}>
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
                ) : null}

                {(showLive || showNotices) ? (
                <div className={`student-template-right-column ${isPanelView ? '' : 'is-full-span'}`}>
                  {showLive ? (
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
                  ) : null}

                  {showNotices ? (
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

                    <button type="button" onClick={() => openSection('st-student-notices')}>
                      Ver todos os avisos
                    </button>
                  </article>
                  ) : null}
                </div>
                ) : null}
              </div>

              {isPanelView ? (
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
              ) : null}

              {(showAgenda || showMaterials || showCertificate || showProfile) ? (
              <section className={`student-template-lower-grid ${isPanelView ? '' : 'is-single-view'}`}>
                {showAgenda ? (
                <article
                  id="st-student-agenda"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
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
                ) : null}

                {showMaterials ? (
                <article
                  id="st-student-materials"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
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
                ) : null}

                {showCertificate ? (
                <article
                  id="st-student-certificate"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
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
                ) : null}

                {showProfile ? (
                <article
                  id="st-student-profile"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
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
                ) : null}
              </section>
              ) : null}
                </>
              ) : (
                renderDedicatedPage()
              )}
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
            onClick={() => openSection(item.target)}
          >
            <StudentIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
