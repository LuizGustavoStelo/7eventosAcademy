import { useEffect, useMemo, useState } from 'react';
import { apiRequest, formatCurrency } from './api';

type ClassStatus = 'PLANNING' | 'ENROLLMENTS_OPEN' | 'IN_PROGRESS' | 'CLOSED';

type DashboardSummary = {
  generatedAt?: string;
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
  status: ClassStatus;
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
  student?: {
    id: string;
    name: string;
    email?: string;
  };
  schoolClass?: {
    id: string;
    name: string;
    course?: { id: string; name: string };
  };
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

const CLASS_STATUS_LABEL: Record<ClassStatus, string> = {
  PLANNING: 'Planejamento',
  ENROLLMENTS_OPEN: 'Matrículas abertas',
  IN_PROGRESS: 'Em andamento',
  CLOSED: 'Encerrada',
};

const ENROLLMENT_STATUS_LABEL: Record<Enrollment['status'], string> = {
  ACTIVE: 'Ativa',
  CANCELED: 'Cancelada',
  COMPLETED: 'Concluída',
};

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDate(value: string | undefined): string {
  const parsed = parseDate(value);
  if (!parsed) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function truncateLabel(value: string, maxLength = 52): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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

function getOccupiedSeats(item: SchoolClass): number {
  if (typeof item.occupiedSeats === 'number') return item.occupiedSeats;
  return Number(item._count?.enrollments ?? 0);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(';'))
    .join('\n');
  const csv = `\uFEFF${csvContent}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClassStatus>('ALL');

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

  const classFilterOptions = useMemo(() => {
    if (courseFilter === 'ALL') return classes;
    return classes.filter((item) => item.courseId === courseFilter);
  }, [classes, courseFilter]);

  useEffect(() => {
    if (classFilter === 'ALL') return;
    const exists = classFilterOptions.some((item) => item.id === classFilter);
    if (!exists) {
      setClassFilter('ALL');
    }
  }, [classFilter, classFilterOptions]);

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

  const courseOccupancy = useMemo(() => {
    const grouped = new Map<
      string,
      { courseName: string; occupied: number; total: number; percentage: number }
    >();

    filteredClasses.forEach((item) => {
      const courseName = item.course?.name || 'Curso não informado';
      const occupied = getOccupiedSeats(item);
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

  const classStatusSummary = useMemo(() => {
    const total = filteredClasses.length;
    return (Object.entries(CLASS_STATUS_LABEL) as Array<[ClassStatus, string]>).map(
      ([status, label]) => {
        const count = filteredClasses.filter((item) => item.status === status).length;
        return {
          status,
          label,
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        };
      },
    );
  }, [filteredClasses]);

  const atRiskClasses = useMemo(() => {
    return filteredClasses
      .map((item) => {
        const occupied = getOccupiedSeats(item);
        const total = Number(item.totalSeats || 0);
        const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;
        return {
          id: item.id,
          name: item.name,
          courseName: item.course?.name || 'Curso não informado',
          occupancy,
          occupied,
          total,
          status: item.status,
        };
      })
      .filter(
        (item) =>
          item.total > 0 &&
          item.occupancy < 40 &&
          item.status !== 'CLOSED',
      )
      .sort((a, b) => a.occupancy - b.occupancy)
      .slice(0, 5);
  }, [filteredClasses]);

  const recentEnrollments = useMemo(() => {
    return [...filteredEnrollments]
      .sort((a, b) => {
        const createdAtA = parseDate(a.createdAt)?.getTime() ?? 0;
        const createdAtB = parseDate(b.createdAt)?.getTime() ?? 0;
        return createdAtB - createdAtA;
      })
      .slice(0, 6);
  }, [filteredEnrollments]);

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
    const inadimplencia = total > 0 ? Math.round((overdue / total) * 100) : 0;
    return {
      paid,
      overdue,
      pending,
      adimplencia,
      inadimplencia,
    };
  }, [financeOverview]);

  const enrollmentMovement = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const currentStart = now - sevenDays;
    const previousStart = now - sevenDays * 2;

    const currentWindow = filteredEnrollments.filter((item) => {
      const createdAt = parseDate(item.createdAt)?.getTime() ?? 0;
      return createdAt >= currentStart && createdAt <= now;
    }).length;

    const previousWindow = filteredEnrollments.filter((item) => {
      const createdAt = parseDate(item.createdAt)?.getTime() ?? 0;
      return createdAt >= previousStart && createdAt < currentStart;
    }).length;

    const growthPercent =
      previousWindow > 0
        ? Math.round(((currentWindow - previousWindow) / previousWindow) * 100)
        : currentWindow > 0
          ? 100
          : 0;

    return {
      currentWindow,
      previousWindow,
      growthPercent,
    };
  }, [filteredEnrollments]);

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

  const operationalAlerts = useMemo(() => {
    const alerts: Array<{ level: 'high' | 'medium' | 'low'; text: string }> = [];

    if ((financeOverview?.overdueCharges ?? 0) > 0) {
      alerts.push({
        level: 'high',
        text: `${financeOverview?.overdueCharges ?? 0} cobrança(s) em atraso.`,
      });
    }

    if (atRiskClasses.length > 0) {
      alerts.push({
        level: 'medium',
        text: `${atRiskClasses.length} turma(s) com ocupação abaixo de 40%.`,
      });
    }

    if (liveEngagement.upcoming === 0) {
      alerts.push({
        level: 'low',
        text: 'Não há lives futuras no período selecionado.',
      });
    }

    return alerts;
  }, [financeOverview, atRiskClasses, liveEngagement.upcoming]);

  const totalEnrollments = filteredEnrollments.length;
  const activeEnrollments = filteredEnrollments.filter(
    (item) => item.status === 'ACTIVE',
  ).length;
  const totalSeats = filteredClasses.reduce(
    (acc, item) => acc + Number(item.totalSeats || 0),
    0,
  );
  const occupiedSeats = filteredClasses.reduce(
    (acc, item) => acc + getOccupiedSeats(item),
    0,
  );
  const occupancyRate = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;

  const exportEnrollmentCsv = () => {
    exportCsv(
      `relatorio-matriculas-${todayStamp()}.csv`,
      ['id', 'aluno', 'email', 'curso', 'turma', 'status', 'createdAt'],
      filteredEnrollments.map((item) => [
        item.id,
        item.student?.name || 'Aluno não informado',
        item.student?.email || '',
        item.schoolClass?.course?.name || '',
        item.schoolClass?.name || '',
        ENROLLMENT_STATUS_LABEL[item.status],
        item.createdAt || '',
      ]),
    );
  };

  const exportClassesCsv = () => {
    exportCsv(
      `relatorio-turmas-${todayStamp()}.csv`,
      [
        'id',
        'turma',
        'curso',
        'status',
        'vagasTotal',
        'vagasOcupadas',
        'ocupacaoPercentual',
        'inicio',
      ],
      filteredClasses.map((item) => {
        const occupied = getOccupiedSeats(item);
        const total = Number(item.totalSeats || 0);
        const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;
        return [
          item.id,
          item.name,
          item.course?.name || '',
          CLASS_STATUS_LABEL[item.status],
          String(total),
          String(occupied),
          String(occupancy),
          item.startDate || '',
        ];
      }),
    );
  };

  const exportFinanceCsv = () => {
    exportCsv(`relatorio-financeiro-${todayStamp()}.csv`, ['indicador', 'valor'], [
      ['adimplenciaPercentual', String(financeHealth.adimplencia)],
      ['inadimplenciaPercentual', String(financeHealth.inadimplencia)],
      ['recebido', String(financeHealth.paid)],
      ['emAberto', String(financeHealth.pending)],
      ['atrasado', String(financeHealth.overdue)],
      ['cobrancasPendentes', String(financeOverview?.pendingCharges ?? 0)],
      ['cobrancasEmAtraso', String(financeOverview?.overdueCharges ?? 0)],
      ['cobrancasTotal', String(financeOverview?.totalCharges ?? 0)],
    ]);
  };

  const exportOperationalCsv = () => {
    exportCsv(
      `relatorio-operacional-${todayStamp()}.csv`,
      ['tipo', 'nome', 'detalhe', 'valor'],
      [
        ...classStatusSummary.map((item) => [
          'status_turma',
          item.label,
          'Quantidade de turmas',
          String(item.count),
        ]),
        ...atRiskClasses.map((item) => [
          'turma_risco_ocupacao',
          item.name,
          item.courseName,
          `${item.occupancy}%`,
        ]),
      ],
    );
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
              title={courses.find((item) => item.id === courseFilter)?.name || ''}
            >
              <option value="ALL">Todos os cursos</option>
              {courses.map((item) => (
                <option key={item.id} value={item.id} title={item.name}>
                  {truncateLabel(item.name)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Turma
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              title={classFilterOptions.find((item) => item.id === classFilter)?.name || ''}
            >
              <option value="ALL">Todas as turmas</option>
              {classFilterOptions.map((item) => (
                <option key={item.id} value={item.id} title={item.name}>
                  {truncateLabel(item.name)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'ALL' | ClassStatus)
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
          <span>Inadimplência</span>
          <strong>{financeHealth.inadimplencia}%</strong>
          <small>
            {financeOverview?.overdueCharges ?? 0} cobrança(s) em atraso
          </small>
        </article>
      </div>

      {loading ? <p className="native-info">Carregando relatórios...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}

      {!loading ? (
        <div className="native-grid-2 native-reports-grid">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Ocupação por curso</h3>
            </header>
            <div className="native-report-bars">
              {courseOccupancy.length === 0 ? (
                <p className="native-info">Sem dados para o período selecionado.</p>
              ) : (
                courseOccupancy.map((item) => (
                  <div key={item.courseName}>
                    <div className="native-report-bars-head">
                      <span title={item.courseName}>{truncateLabel(item.courseName, 56)}</span>
                      <strong>{item.percentage}%</strong>
                    </div>
                    <div className="native-report-bar-track">
                      <div
                        className="native-report-bar-fill"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <small className="native-report-muted">
                      {item.occupied}/{item.total} vagas ocupadas
                    </small>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Distribuição de turmas</h3>
            </header>
            <div className="native-report-status-grid">
              {classStatusSummary.map((item) => (
                <div key={item.status} className="native-report-status-card">
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                  <small>{item.percentage}% do período</small>
                </div>
              ))}
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
            <div className="native-live-engagement">
              <strong>{liveEngagement.highlight}</strong>
              <small>
                {liveEngagement.upcoming} live(s) futura(s) • {liveEngagement.total} no período
              </small>
            </div>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Alertas operacionais</h3>
            </header>
            {operationalAlerts.length === 0 ? (
              <p className="native-info">Sem alertas críticos para os filtros atuais.</p>
            ) : (
              <ul className="native-report-alert-list">
                {operationalAlerts.map((item) => (
                  <li key={item.text} className={`is-${item.level}`}>
                    {item.text}
                  </li>
                ))}
              </ul>
            )}
            {atRiskClasses.length > 0 ? (
              <ul className="native-ops-list">
                {atRiskClasses.map((item) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>
                    <small title={item.courseName}>
                      {truncateLabel(item.courseName, 48)} • {item.occupancy}% de ocupação
                    </small>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Matrículas recentes</h3>
            </header>
            {recentEnrollments.length === 0 ? (
              <p className="native-info">Sem matrículas no período filtrado.</p>
            ) : (
              <ul className="native-report-list">
                {recentEnrollments.map((item) => (
                  <li key={item.id}>
                    <strong>{item.student?.name || `Matrícula ${item.id.slice(0, 8)}`}</strong>
                    <small>
                      {item.schoolClass?.course?.name || 'Curso não informado'} •{' '}
                      {item.schoolClass?.name || 'Turma não informada'}
                    </small>
                    <small>
                      {ENROLLMENT_STATUS_LABEL[item.status]} em {formatDate(item.createdAt)}
                    </small>
                  </li>
                ))}
              </ul>
            )}
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
              <button type="button" onClick={exportOperationalCsv}>
                Exportar operacional (CSV)
              </button>
            </div>
            <small className="native-report-muted">
              Atualizado em {formatDate(summary?.generatedAt)} • Últimos 7 dias:{' '}
              {enrollmentMovement.currentWindow} matrícula(s) (
              {enrollmentMovement.growthPercent >= 0 ? '+' : ''}
              {enrollmentMovement.growthPercent}%)
            </small>
          </article>
        </div>
      ) : null}
    </section>
  );
}
