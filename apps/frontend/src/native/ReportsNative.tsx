import { useEffect, useMemo, useState } from 'react';
import { apiRequest, formatCurrency } from './api';

type DashboardSummary = {
  studentsCount: number;
  activeEnrollments: number;
  classesCount: number;
  totalSeats: number;
  occupiedSeats: number;
  occupancyRate: number;
};

type OverviewAmount = {
  status: 'pending' | 'paid' | 'overdue' | 'canceled';
  amount: number;
};

type FinanceOverview = {
  totalCharges: number;
  pendingCharges: number;
  paidCharges: number;
  overdueCharges: number;
  amountByStatus: OverviewAmount[];
};

type Course = {
  id: string;
  name: string;
};

type SchoolClass = {
  id: string;
  name: string;
  status: 'PLANNING' | 'ENROLLMENTS_OPEN' | 'IN_PROGRESS' | 'CLOSED';
  totalSeats: number;
  occupiedSeats?: number;
  startDate: string;
  courseId: string;
  course?: { id: string; name: string };
  _count?: { enrollments?: number };
};

type Enrollment = {
  id: string;
  classId: string;
  status: 'ACTIVE' | 'CANCELED' | 'COMPLETED';
  createdAt?: string;
};

type AgendaEvent = {
  id: string;
  type: string;
  title?: string;
  datetime?: string;
};

type ReportsNativeProps = {
  token: string;
};

const AGENDA_STORAGE_KEY = 'academy-agenda-events-v1';

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function readAgendaEvents(): AgendaEvent[] {
  try {
    const raw = window.localStorage.getItem(AGENDA_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as AgendaEvent[]) : [];
  } catch {
    return [];
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(';'))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsNative({ token }: ReportsNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [financeOverview, setFinanceOverview] = useState<FinanceOverview | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [periodDays, setPeriodDays] = useState<30 | 90 | 365>(30);
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PLANNING' | 'ENROLLMENTS_OPEN' | 'IN_PROGRESS' | 'CLOSED'
  >('ALL');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [summaryData, overviewData, coursesData, classesData, enrollmentsData] =
          await Promise.all([
            apiRequest<DashboardSummary>(token, '/finance/dashboard-summary'),
            apiRequest<FinanceOverview>(token, '/finance/overview'),
            apiRequest<Course[]>(token, '/courses'),
            apiRequest<SchoolClass[]>(token, '/classes'),
            apiRequest<Enrollment[]>(token, '/enrollments'),
          ]);

        setSummary(summaryData);
        setFinanceOverview(overviewData);
        setCourses(Array.isArray(coursesData) ? coursesData : []);
        setClasses(Array.isArray(classesData) ? classesData : []);
        setEnrollments(Array.isArray(enrollmentsData) ? enrollmentsData : []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar relatórios.',
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  const periodThreshold = useMemo(
    () => Date.now() - periodDays * 24 * 60 * 60 * 1000,
    [periodDays],
  );

  const filteredClasses = useMemo(() => {
    return classes.filter((item) => {
      const startedAt = parseDate(item.startDate)?.getTime() ?? 0;
      if (startedAt > 0 && startedAt < periodThreshold) return false;
      if (courseFilter !== 'ALL' && item.courseId !== courseFilter) return false;
      if (classFilter !== 'ALL' && item.id !== classFilter) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      return true;
    });
  }, [classes, periodThreshold, courseFilter, classFilter, statusFilter]);

  const filteredClassIds = useMemo(
    () => new Set(filteredClasses.map((item) => item.id)),
    [filteredClasses],
  );

  const filteredEnrollments = useMemo(() => {
    return enrollments.filter((item) => {
      if (!filteredClassIds.has(item.classId)) return false;
      const createdAt = parseDate(item.createdAt)?.getTime();
      if (createdAt && createdAt < periodThreshold) return false;
      return true;
    });
  }, [enrollments, filteredClassIds, periodThreshold]);

  const courseFrequency = useMemo(() => {
    const grouped = new Map<
      string,
      { courseName: string; occupied: number; total: number; percentage: number }
    >();

    filteredClasses.forEach((item) => {
      const courseName = item.course?.name || 'Curso não informado';
      const occupied =
        typeof item.occupiedSeats === 'number'
          ? item.occupiedSeats
          : Number(item._count?.enrollments ?? 0);
      const total = Number(item.totalSeats || 0);

      const current = grouped.get(item.courseId) || {
        courseName,
        occupied: 0,
        total: 0,
        percentage: 0,
      };
      current.occupied += occupied;
      current.total += total;
      grouped.set(item.courseId, current);
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        percentage: item.total > 0 ? Math.round((item.occupied / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 6);
  }, [filteredClasses]);

  const financeHealth = useMemo(() => {
    const paid = Number(
      financeOverview?.amountByStatus.find((item) => item.status === 'paid')
        ?.amount ?? 0,
    );
    const overdue = Number(
      financeOverview?.amountByStatus.find((item) => item.status === 'overdue')
        ?.amount ?? 0,
    );
    const pending = Number(
      financeOverview?.amountByStatus.find((item) => item.status === 'pending')
        ?.amount ?? 0,
    );
    const total = paid + overdue + pending;
    const adimplencia = total > 0 ? Math.round((paid / total) * 100) : 0;
    return {
      paid,
      overdue,
      pending,
      adimplencia,
    };
  }, [financeOverview]);

  const liveEngagement = useMemo(() => {
    const events = readAgendaEvents();
    const lives = events.filter((item) => {
      if (item.type !== 'live') return false;
      const datetime = parseDate(item.datetime)?.getTime();
      return datetime ? datetime >= periodThreshold : false;
    });
    const upcomingLives = lives.filter((item) => {
      const datetime = parseDate(item.datetime)?.getTime() ?? 0;
      return datetime >= Date.now();
    });
    return {
      total: lives.length,
      upcoming: upcomingLives.length,
      highlight: upcomingLives[0]?.title || lives[0]?.title || 'Sem lives no período',
    };
  }, [periodThreshold]);

  const totalEnrollments = filteredEnrollments.length;
  const activeEnrollments = filteredEnrollments.filter(
    (item) => item.status === 'ACTIVE',
  ).length;
  const totalSeats = filteredClasses.reduce(
    (acc, item) => acc + Number(item.totalSeats || 0),
    0,
  );
  const occupiedSeats = filteredClasses.reduce((acc, item) => {
    if (typeof item.occupiedSeats === 'number') return acc + item.occupiedSeats;
    return acc + Number(item._count?.enrollments ?? 0);
  }, 0);
  const occupancyRate = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;

  const exportEnrollmentCsv = () => {
    exportCsv(
      'relatorio-matriculas.csv',
      ['id', 'classId', 'status', 'createdAt'],
      filteredEnrollments.map((item) => [
        item.id,
        item.classId,
        item.status,
        item.createdAt || '',
      ]),
    );
  };

  const exportClassesCsv = () => {
    exportCsv(
      'relatorio-turmas.csv',
      ['id', 'turma', 'curso', 'status', 'vagasTotal', 'vagasOcupadas', 'inicio'],
      filteredClasses.map((item) => [
        item.id,
        item.name,
        item.course?.name || '',
        item.status,
        String(item.totalSeats || 0),
        String(
          typeof item.occupiedSeats === 'number'
            ? item.occupiedSeats
            : Number(item._count?.enrollments ?? 0),
        ),
        item.startDate || '',
      ]),
    );
  };

  const exportFinanceCsv = () => {
    exportCsv('relatorio-financeiro.csv', ['indicador', 'valor'], [
      ['adimplenciaPercentual', String(financeHealth.adimplencia)],
      ['recebido', String(financeHealth.paid)],
      ['emAberto', String(financeHealth.pending)],
      ['atrasado', String(financeHealth.overdue)],
      ['cobrancasPendentes', String(financeOverview?.pendingCharges ?? 0)],
      ['cobrancasTotal', String(financeOverview?.totalCharges ?? 0)],
    ]);
  };

  return (
    <section className="native-page native-reports">
      <header className="native-page-header">
        <h2>Central de relatórios</h2>
        <p>
          Análises operacionais, acadêmicas e financeiras com filtros globais e
          exportação rápida.
        </p>
      </header>

      <section className="native-panel native-reports-filters">
        <div className="native-reports-filter-grid">
          <label>
            Período
            <select
              value={periodDays}
              onChange={(event) =>
                setPeriodDays(Number(event.target.value) as 30 | 90 | 365)
              }
            >
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={365}>Últimos 12 meses</option>
            </select>
          </label>

          <label>
            Curso
            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
            >
              <option value="ALL">Todos os cursos</option>
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Turma
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
            >
              <option value="ALL">Todas as turmas</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | 'ALL'
                    | 'PLANNING'
                    | 'ENROLLMENTS_OPEN'
                    | 'IN_PROGRESS'
                    | 'CLOSED',
                )
              }
            >
              <option value="ALL">Todos</option>
              <option value="PLANNING">Planejamento</option>
              <option value="ENROLLMENTS_OPEN">Matrículas abertas</option>
              <option value="IN_PROGRESS">Em andamento</option>
              <option value="CLOSED">Encerrada</option>
            </select>
          </label>
        </div>
      </section>

      <div className="native-kpi-grid">
        <article className="native-kpi-card">
          <span>Total de matrículas</span>
          <strong>{totalEnrollments}</strong>
          <small>
            {activeEnrollments} ativa(s) • base: {summary?.studentsCount ?? 0} aluno(s)
          </small>
        </article>
        <article className="native-kpi-card">
          <span>Ocupação média</span>
          <strong>{occupancyRate}%</strong>
          <small>
            {occupiedSeats}/{totalSeats} vagas
          </small>
        </article>
        <article className="native-kpi-card">
          <span>Adimplência</span>
          <strong>{financeHealth.adimplencia}%</strong>
          <small>{formatCurrency(financeHealth.paid)} recebido</small>
        </article>
        <article className="native-kpi-card">
          <span>Lives agendadas</span>
          <strong>{liveEngagement.total}</strong>
          <small>{liveEngagement.upcoming} futura(s)</small>
        </article>
      </div>

      {loading ? <p className="native-info">Carregando relatórios...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}

      {!loading ? (
        <div className="native-grid-2 native-reports-grid">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Frequência por módulo</h3>
            </header>
            <div className="native-report-bars">
              {courseFrequency.length === 0 ? (
                <p className="native-info">Sem dados para o período selecionado.</p>
              ) : (
                courseFrequency.map((item) => (
                  <div key={item.courseName}>
                    <div className="native-report-bars-head">
                      <span>{item.courseName}</span>
                      <strong>{item.percentage}%</strong>
                    </div>
                    <div className="native-report-bar-track">
                      <div
                        className="native-report-bar-fill"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Saúde financeira</h3>
            </header>
            <div className="native-fin-health">
              <div>
                <span>Recebido</span>
                <strong>{formatCurrency(financeHealth.paid)}</strong>
              </div>
              <div>
                <span>Em aberto</span>
                <strong>{formatCurrency(financeHealth.pending)}</strong>
              </div>
              <div>
                <span>Atrasado</span>
                <strong>{formatCurrency(financeHealth.overdue)}</strong>
              </div>
            </div>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Engajamento de lives</h3>
            </header>
            <div className="native-live-engagement">
              <strong>{liveEngagement.highlight}</strong>
              <small>{liveEngagement.upcoming} live(s) futura(s) no período</small>
            </div>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Exportação de dados</h3>
            </header>
            <div className="native-export-actions">
              <button type="button" onClick={exportEnrollmentCsv}>
                Exportar matrículas (CSV)
              </button>
              <button type="button" onClick={exportClassesCsv}>
                Exportar turmas (CSV)
              </button>
              <button type="button" onClick={exportFinanceCsv}>
                Exportar financeiro (CSV)
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
