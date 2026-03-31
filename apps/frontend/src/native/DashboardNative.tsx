import { useEffect, useMemo, useState } from 'react';
import { apiRequest, formatCurrency, formatDateTime } from './api';

type DashboardSummary = {
  studentsCount: number;
  activeEnrollments: number;
  classesCount: number;
  openClasses: number;
  planningClasses: number;
  classesToday: number;
  totalSeats: number;
  occupiedSeats: number;
  occupancyRate: number;
  pendingChargesCount: number;
  pendingAmount: number;
  upcomingClasses: Array<{
    id: string;
    name: string;
    status: 'PLANNING' | 'ENROLLMENTS_OPEN' | 'IN_PROGRESS' | 'CLOSED';
    startDate: string;
    course: { name: string };
  }>;
  firstPendingCharge: null | {
    id: string;
    dueDate: string;
    amount: number;
    studentName: string | null;
    className: string | null;
    courseName: string | null;
  };
};

type ClassNotice = {
  id: string;
  classId: string;
  title: string;
  body: string;
  priority: 'normal' | 'importante' | 'urgente' | string;
  createdAt: string;
  schoolClass?: {
    name: string;
  };
};

type AgendaEvent = {
  id: string;
  type: 'class' | 'live';
  title: string;
  classId?: string | null;
  className?: string;
  datetime: string;
};

type DashboardNativeProps = {
  token: string;
  onNavigate: (sectionId: string) => void;
};

const REFRESH_MS = 120_000;

function formatMonthDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function currentGreeting(name?: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Bom dia, ${name || 'professor(a)'}`;
  if (hour < 18) return `Boa tarde, ${name || 'professor(a)'}`;
  return `Boa noite, ${name || 'professor(a)'}`;
}

export function DashboardNative({ token, onNavigate }: DashboardNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [notices, setNotices] = useState<ClassNotice[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);

  const load = async () => {
    try {
      setError('');
      const [summaryData, noticesData, eventsData] = await Promise.all([
        apiRequest<DashboardSummary>(token, '/finance/dashboard-summary'),
        apiRequest<ClassNotice[]>(token, '/classes/notices/all'),
        apiRequest<AgendaEvent[]>(token, '/agenda/events'),
      ]);

      setSummary(summaryData);
      setNotices(Array.isArray(noticesData) ? noticesData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar o painel.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [token]);

  const upcomingAgenda = useMemo(() => {
    const now = Date.now();
    return events
      .filter((item) => {
        const timestamp = new Date(item.datetime).getTime();
        return Number.isFinite(timestamp) && timestamp >= now;
      })
      .sort(
        (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
      )
      .slice(0, 2);
  }, [events]);

  const firstAgenda = upcomingAgenda[0] ?? null;
  const secondAgenda = upcomingAgenda[1] ?? null;
  const firstClass = summary?.upcomingClasses?.[0] ?? null;
  const secondClass = summary?.upcomingClasses?.[1] ?? null;
  const latestNotices = notices.slice(0, 3);
  const urgentOperations =
    (summary?.classesToday ?? 0) + (summary?.pendingChargesCount ?? 0);

  const operations = useMemo(() => {
    if (!summary) return [];

    const list: Array<{
      id: string;
      title: string;
      subtitle: string;
      actionLabel: string;
      actionTarget: string;
      urgent?: boolean;
    }> = [];

    if (summary.classesToday > 0) {
      list.push({
        id: 'op-presenca',
        title: `Lançar presença das ${summary.classesToday} aula(s) de hoje`,
        subtitle: 'Libere presença e finalize a chamada na aba Aulas.',
        actionLabel: 'Lançar presença',
        actionTarget: 'admin_aulas',
        urgent: true,
      });
    }

    if (summary.pendingChargesCount > 0) {
      list.push({
        id: 'op-financeiro',
        title: 'Revisar mensalidades pendentes',
        subtitle: `${summary.pendingChargesCount} cobrança(s) em aberto (${formatCurrency(summary.pendingAmount)}).`,
        actionLabel: 'Abrir financeiro',
        actionTarget: 'admin_financeiro',
        urgent: true,
      });
    }

    if (summary.planningClasses > 0) {
      list.push({
        id: 'op-turmas',
        title: 'Ativar turmas em planejamento',
        subtitle: `${summary.planningClasses} turma(s) aguardando publicação.`,
        actionLabel: 'Gerenciar turmas',
        actionTarget: 'admin_gestao_turmas',
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'op-stable',
        title: 'Operação estável',
        subtitle: 'Não há pendências críticas no momento.',
        actionLabel: 'Abrir painel de aulas',
        actionTarget: 'admin_aulas',
      });
    }

    return list;
  }, [summary]);

  const roleName = useMemo(() => {
    try {
      const raw = window.localStorage.getItem('academy-auth-user');
      if (!raw) return 'professor(a)';
      const parsed = JSON.parse(raw) as { name?: string };
      return parsed.name || 'professor(a)';
    } catch {
      return 'professor(a)';
    }
  }, []);

  return (
    <section className="native-page native-dashboard-pro">
      <header className="native-dashboard-pro-header">
        <div>
          <h2>{currentGreeting(roleName)}</h2>
          <p>Aqui está o que precisa da sua atenção hoje.</p>
        </div>
        <div className="native-dashboard-pro-actions">
          <button type="button" onClick={() => onNavigate('admin_agenda')}>
            Ver agenda
          </button>
        </div>
      </header>

      {loading ? <p className="native-info">Carregando indicadores...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}

      {!summary || error ? null : (
        <>
          <div className="native-dashboard-pro-kpis">
            <article className="native-dashboard-pro-kpi is-accent">
              <span>Alunos ativos</span>
              <strong>{summary.studentsCount}</strong>
              <small>{summary.activeEnrollments} matrícula(s) ativa(s)</small>
            </article>
            <article className="native-dashboard-pro-kpi">
              <span>Turmas abertas</span>
              <strong>{summary.openClasses}</strong>
              <small>{summary.classesCount} turma(s) no total</small>
            </article>
            <article className="native-dashboard-pro-kpi">
              <span>Ocupação geral</span>
              <strong>{summary.occupancyRate.toFixed(1)}%</strong>
              <small>
                {summary.occupiedSeats}/{summary.totalSeats} vagas ocupadas
              </small>
            </article>
            <article className="native-dashboard-pro-kpi is-danger">
              <span>Mensalidades pendentes</span>
              <strong>{formatCurrency(summary.pendingAmount)}</strong>
              <small>{summary.pendingChargesCount} cobrança(s) em aberto</small>
            </article>
          </div>

          <div className="native-dashboard-pro-main">
            <div className="native-dashboard-pro-left">
              <article className="native-dashboard-pro-agenda">
                <header className="native-dashboard-pro-section-head">
                  <h3>Agenda acadêmica</h3>
                  <button type="button" onClick={() => onNavigate('admin_agenda')}>
                    Ver calendário
                  </button>
                </header>

                <div className="native-dashboard-pro-agenda-grid">
                  <div className="native-dashboard-pro-live-card">
                    <span className="native-dashboard-pro-pill">Próxima aula</span>
                    <h4>{firstAgenda?.title || firstClass?.name || 'Sem aula programada'}</h4>
                    <p>
                      {firstAgenda?.className ||
                        firstClass?.course?.name ||
                        'Sem turma vinculada no momento.'}
                    </p>
                    <div className="native-dashboard-pro-live-footer">
                      <small>
                        {firstAgenda
                          ? formatDateTime(firstAgenda.datetime)
                          : firstClass
                            ? formatDateTime(firstClass.startDate)
                            : 'Sem horário definido'}
                      </small>
                      <button type="button" onClick={() => onNavigate('admin_aulas')}>
                        Lançar chamada
                      </button>
                    </div>
                  </div>

                  <div className="native-dashboard-pro-class-card">
                    <div className="native-dashboard-pro-class-top">
                      <span className="native-dashboard-pro-pill muted">
                        Agenda
                      </span>
                      <small>
                        {secondAgenda
                          ? formatDateTime(secondAgenda.datetime)
                          : secondClass
                            ? formatDateTime(secondClass.startDate)
                            : '--:--'}
                      </small>
                    </div>
                    <h4>{secondAgenda?.title || secondClass?.name || 'Sem aula programada'}</h4>
                    <p>
                      {secondAgenda?.className ||
                        secondClass?.course?.name ||
                        'Sem turma vinculada no momento.'}
                    </p>
                    <div className="native-dashboard-pro-class-actions">
                      <button type="button" onClick={() => onNavigate('admin_aulas')}>
                        Marcar presença
                      </button>
                    </div>
                  </div>
                </div>
              </article>

              <article className="native-dashboard-pro-ops">
                <header className="native-dashboard-pro-section-head">
                  <h3>Operações pendentes</h3>
                  <span className={`native-dashboard-pro-urgency ${urgentOperations > 0 ? 'is-active' : ''}`}>
                    {urgentOperations > 0
                      ? `${urgentOperations} urgente(s)`
                      : 'Sem urgências'}
                  </span>
                </header>

                <ul className="native-dashboard-pro-ops-list">
                  {operations.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </div>
                      <button
                        type="button"
                        className={item.urgent ? 'is-urgent' : ''}
                        onClick={() => onNavigate(item.actionTarget)}
                      >
                        {item.actionLabel}
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <aside className="native-dashboard-pro-notices">
              <header className="native-dashboard-pro-section-head">
                <h3>Avisos recentes</h3>
              </header>

              {latestNotices.length === 0 ? (
                <p className="native-info">Nenhum aviso recente.</p>
              ) : (
                <ul className="native-dashboard-pro-notice-list">
                  {latestNotices.map((item) => (
                    <li key={item.id}>
                      <small>{formatMonthDay(item.createdAt)}</small>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                className="native-dashboard-pro-browse-btn"
                onClick={() => onNavigate('admin_avisos')}
              >
                Ver todos os avisos
              </button>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
