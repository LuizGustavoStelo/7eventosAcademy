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

type DashboardNativeProps = {
  token: string;
  onNavigate: (sectionId: string) => void;
};

const REFRESH_MS = 120_000;

const statusLabel: Record<string, string> = {
  PLANNING: 'Planejamento',
  ENROLLMENTS_OPEN: 'Matrículas abertas',
  IN_PROGRESS: 'Em andamento',
  CLOSED: 'Encerrada',
};

export function DashboardNative({ token, onNavigate }: DashboardNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const load = async () => {
    try {
      setError('');
      const next = await apiRequest<DashboardSummary>(
        token,
        '/finance/dashboard-summary',
      );
      setSummary(next);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar o dashboard.',
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

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token]);

  const operations = useMemo(() => {
    if (!summary) return [];

    const items: Array<{ title: string; subtitle: string; urgent: boolean }> = [];
    if (summary.classesToday > 0) {
      items.push({
        title: `Preparar ${summary.classesToday} aula(s) de hoje`,
        subtitle: 'Confirme presença, materiais e comunicação da turma.',
        urgent: true,
      });
    }
    if (summary.pendingChargesCount > 0) {
      items.push({
        title: 'Revisar inadimplência',
        subtitle: `${summary.pendingChargesCount} cobrança(s) pendente(s), total ${formatCurrency(summary.pendingAmount)}.`,
        urgent: true,
      });
    }
    if (summary.planningClasses > 0) {
      items.push({
        title: 'Publicar turmas em planejamento',
        subtitle: `${summary.planningClasses} turma(s) aguardando abertura de matrículas.`,
        urgent: false,
      });
    }
    if (items.length === 0) {
      items.push({
        title: 'Operação estável',
        subtitle: 'Nenhuma pendência crítica identificada no momento.',
        urgent: false,
      });
    }

    return items;
  }, [summary]);

  const firstClass = summary?.upcomingClasses?.[0] ?? null;
  const secondClass = summary?.upcomingClasses?.[1] ?? null;

  return (
    <section className="native-page native-dashboard">
      <header className="native-page-header">
        <h2>Visão geral da operação acadêmica</h2>
        <p>
          Painel nativo em React com atualização leve e sem recarregar template
          completo.
        </p>
      </header>

      {loading ? <p className="native-info">Carregando indicadores...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}

      {!summary || error ? null : (
        <>
          <div className="native-kpi-grid">
            <article className="native-kpi-card">
              <span>Alunos ativos</span>
              <strong>{summary.studentsCount}</strong>
              <small>{summary.activeEnrollments} matrícula(s) ativa(s)</small>
            </article>
            <article className="native-kpi-card">
              <span>Turmas abertas</span>
              <strong>{summary.openClasses}</strong>
              <small>{summary.classesCount} turma(s) no total</small>
            </article>
            <article className="native-kpi-card">
              <span>Ocupação de vagas</span>
              <strong>{summary.occupancyRate.toFixed(1)}%</strong>
              <small>
                {summary.occupiedSeats}/{summary.totalSeats} vagas ocupadas
              </small>
            </article>
            <article className="native-kpi-card">
              <span>Mensalidades pendentes</span>
              <strong>{formatCurrency(summary.pendingAmount)}</strong>
              <small>{summary.pendingChargesCount} pendência(s)</small>
            </article>
          </div>

          <div className="native-grid-2">
            <article className="native-panel">
              <header className="native-panel-header">
                <h3>Próximas ações</h3>
                <button type="button" onClick={() => onNavigate('admin_agenda')}>
                  Abrir agenda
                </button>
              </header>

              {firstClass ? (
                <div className="native-item">
                  <strong>{firstClass.name}</strong>
                  <small>
                    {firstClass.course?.name ?? 'Curso'} •{' '}
                    {statusLabel[firstClass.status] ?? firstClass.status}
                  </small>
                  <small>{formatDateTime(firstClass.startDate)}</small>
                  <button
                    type="button"
                    onClick={() => onNavigate('admin_gestao_turmas')}
                  >
                    Abrir turma
                  </button>
                </div>
              ) : (
                <p className="native-info">Nenhuma turma futura no momento.</p>
              )}

              {secondClass ? (
                <div className="native-item">
                  <strong>{secondClass.name}</strong>
                  <small>
                    {secondClass.course?.name ?? 'Curso'} •{' '}
                    {statusLabel[secondClass.status] ?? secondClass.status}
                  </small>
                  <small>{formatDateTime(secondClass.startDate)}</small>
                </div>
              ) : summary.firstPendingCharge ? (
                <div className="native-item">
                  <strong>
                    Cobrança de {summary.firstPendingCharge.studentName ?? 'aluno'}
                  </strong>
                  <small>
                    {summary.firstPendingCharge.className ?? 'Turma'} • vence em{' '}
                    {formatDateTime(summary.firstPendingCharge.dueDate)}
                  </small>
                  <small>{formatCurrency(summary.firstPendingCharge.amount)}</small>
                  <button
                    type="button"
                    onClick={() => onNavigate('admin_financeiro')}
                  >
                    Abrir financeiro
                  </button>
                </div>
              ) : null}
            </article>

            <article className="native-panel">
              <header className="native-panel-header">
                <h3>Operações pendentes</h3>
              </header>
              <ul className="native-ops-list">
                {operations.map((item) => (
                  <li key={item.title}>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                    {item.urgent ? <span className="native-badge">Urgente</span> : null}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
