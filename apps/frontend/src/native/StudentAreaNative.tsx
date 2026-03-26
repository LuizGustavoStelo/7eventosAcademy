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
  'aluno-painel',
  'aluno-matriculas',
  'aluno-materiais',
  'aluno-avisos',
  'aluno-perfil',
] as const;

type SectionId = (typeof SECTION_IDS)[number];

const NAV_ITEMS: Array<{ id: SectionId; label: string }> = [
  { id: 'aluno-painel', label: 'Painel' },
  { id: 'aluno-matriculas', label: 'Matrículas' },
  { id: 'aluno-materiais', label: 'Materiais' },
  { id: 'aluno-avisos', label: 'Avisos' },
  { id: 'aluno-perfil', label: 'Perfil' },
];

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

function formatDate(dateLike: string | null | undefined) {
  if (!dateLike) return '-';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(dateLike: string | null | undefined) {
  if (!dateLike) return '-';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function extractStatusFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\((\d{3})\)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function StudentAreaNative({ token, user, onLogout }: StudentAreaNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<StudentDashboardPayload | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('aluno-painel');
  const [lastSync, setLastSync] = useState<string>('');

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
      setLastSync(
        new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date()),
      );
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

  const me = dashboard?.me;
  const matriculas = dashboard?.matriculas ?? [];
  const materiais = dashboard?.materiais ?? [];
  const avisos = dashboard?.avisos ?? [];
  const matriculaPrincipal = matriculas[0] ?? null;

  const profileCityState = useMemo(() => {
    const city = me?.studentProfile?.city;
    const state = me?.studentProfile?.state;
    if (!city) return '-';
    return state ? `${city} - ${state}` : city;
  }, [me?.studentProfile?.city, me?.studentProfile?.state]);

  const scrollToSection = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const titleName = me?.name || user.name;
  const description = matriculaPrincipal
    ? 'Acompanhe sua evolução acadêmica, materiais e comunicados com navegação fluida.'
    : 'Você ainda não possui matrícula ativa. Assim que houver, os dados serão exibidos aqui.';

  return (
    <section className="native-student-shell">
      <header className="native-student-topbar">
        <div className="native-student-brand">
          <span className="native-student-brand-mark">7E</span>
          <div>
            <strong>Área do Aluno</strong>
            <small>Experiência nativa e otimizada</small>
          </div>
        </div>

        <div className="native-student-topbar-actions">
          <span>{titleName}</span>
          <button type="button" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      <div className="native-student-layout">
        <aside className="native-student-sidebar">
          <nav>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeSection === item.id ? 'active' : ''}
                onClick={() => scrollToSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <article className="native-student-support">
            <h2>Secretaria virtual</h2>
            <p>Atendimento acadêmico com foco em agilidade e clareza.</p>
          </article>
        </aside>

        <main className="native-student-main">
          {loading ? <p className="native-info">Carregando Área do Aluno...</p> : null}
          {error ? (
            <p className="native-error">
              {error}{' '}
              <button type="button" onClick={() => void loadDashboard({ bypassCache: true })}>
                Tentar novamente
              </button>
            </p>
          ) : null}

          {!dashboard || error ? null : (
            <>
              <section id="aluno-painel" className="native-student-hero-grid">
                <article className="native-student-hero-card">
                  <span className="native-student-chip">Painel acadêmico</span>
                  <h1>Bem-vindo(a), {firstName(titleName)}!</h1>
                  <p>{description}</p>
                  <div className="native-student-hero-meta">
                    <div>
                      <small>Curso atual</small>
                      <strong>{matriculaPrincipal?.courseName ?? 'Sem curso ativo'}</strong>
                    </div>
                    <div>
                      <small>Turma</small>
                      <strong>{matriculaPrincipal?.className ?? '-'}</strong>
                    </div>
                  </div>
                </article>

                <article className="native-student-highlight-card">
                  <span>Última sincronização</span>
                  <strong>{lastSync || '--:--'}</strong>
                  <p>Cache inteligente e chamadas enxutas para não sobrecarregar o servidor.</p>
                </article>
              </section>

              <section className="native-student-kpi-grid">
                <article className="native-student-kpi-card">
                  <span>Matrículas ativas</span>
                  <strong>{matriculas.length}</strong>
                  <small>Turmas em andamento</small>
                </article>
                <article className="native-student-kpi-card">
                  <span>Materiais disponíveis</span>
                  <strong>{materiais.length}</strong>
                  <small>Arquivos e conteúdos liberados</small>
                </article>
                <article className="native-student-kpi-card">
                  <span>Avisos recentes</span>
                  <strong>{avisos.length}</strong>
                  <small>Comunicados da coordenação</small>
                </article>
              </section>

              <section className="native-student-grid">
                <article id="aluno-matriculas" className="native-student-card">
                  <h2>Minhas matrículas</h2>
                  {matriculas.length === 0 ? (
                    <p className="native-info">Nenhuma matrícula ativa no momento.</p>
                  ) : (
                    <div className="native-student-stack">
                      {matriculas.map((matricula) => (
                        <article key={matricula.enrollmentId} className="native-student-item">
                          <header>
                            <div>
                              <h3>{matricula.courseName}</h3>
                              <p>{matricula.className}</p>
                            </div>
                            <span className="native-status-chip is-success">{matricula.status}</span>
                          </header>
                          <footer>
                            <span>Modalidade: {matricula.modality || '-'}</span>
                            <span>
                              Período: {formatDate(matricula.startDate)} até {formatDate(matricula.endDate)}
                            </span>
                          </footer>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <article id="aluno-avisos" className="native-student-card">
                  <h2>Avisos e comunicados</h2>
                  {avisos.length === 0 ? (
                    <p className="native-info">Nenhum aviso no momento.</p>
                  ) : (
                    <div className="native-student-stack">
                      {avisos.map((aviso) => (
                        <article key={aviso.id} className="native-student-item">
                          <header>
                            <div>
                              <h3>{aviso.title}</h3>
                              <p>{aviso.className}</p>
                            </div>
                            <span
                              className={`native-status-chip ${
                                aviso.priority === 'high' ? 'is-warning' : 'is-info'
                              }`}
                            >
                              {aviso.priority || 'normal'}
                            </span>
                          </header>
                          <p>{aviso.body}</p>
                          <footer>
                            <span>Publicado em: {formatDateTime(aviso.publishedAt)}</span>
                          </footer>
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              </section>

              <section className="native-student-grid">
                <article id="aluno-materiais" className="native-student-card">
                  <h2>Materiais de apoio</h2>
                  {materiais.length === 0 ? (
                    <p className="native-info">Nenhum material disponível no momento.</p>
                  ) : (
                    <div className="native-student-stack">
                      {materiais.map((material) => {
                        const materialLink = material.fileUrl || material.externalUrl;
                        return (
                          <article key={material.id} className="native-student-item">
                            <header>
                              <div>
                                <h3>{material.title}</h3>
                                <p>{material.className}</p>
                              </div>
                              <span className="native-status-chip is-neutral">{material.kind}</span>
                            </header>
                            <footer>
                              <span>Publicado em: {formatDateTime(material.publishedAt)}</span>
                              {materialLink ? (
                                <a href={materialLink} target="_blank" rel="noopener noreferrer">
                                  Abrir material
                                </a>
                              ) : (
                                <span className="native-student-link-disabled">Sem link</span>
                              )}
                            </footer>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article id="aluno-perfil" className="native-student-card">
                  <h2>Meu perfil</h2>
                  <div className="native-student-profile">
                    <div className="native-student-profile-head">
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

                    <div className="native-student-profile-grid">
                      <article>
                        <span>CPF</span>
                        <strong>{me?.studentProfile?.documentCpf || '-'}</strong>
                      </article>
                      <article>
                        <span>Telefone</span>
                        <strong>{me?.studentProfile?.phone || '-'}</strong>
                      </article>
                      <article>
                        <span>Nascimento</span>
                        <strong>{formatDate(me?.studentProfile?.birthDate)}</strong>
                      </article>
                      <article>
                        <span>Cidade/UF</span>
                        <strong>{profileCityState}</strong>
                      </article>
                    </div>
                  </div>
                </article>
              </section>
            </>
          )}
        </main>
      </div>

      <nav className="native-student-bottom-nav" aria-label="Navegação móvel do aluno">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeSection === item.id ? 'active' : ''}
            onClick={() => scrollToSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </section>
  );
}
