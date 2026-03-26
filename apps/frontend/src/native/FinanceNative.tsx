import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest, formatCurrency } from './api';

type OverviewStatusAmount = {
  status: 'pending' | 'paid' | 'overdue' | 'canceled';
  amount: number;
};

type FinanceOverview = {
  totalCharges: number;
  pendingCharges: number;
  paidCharges: number;
  overdueCharges: number;
  amountByStatus: OverviewStatusAmount[];
};

type GatewayConfig = {
  provider: string;
  environment: string;
  isActive: boolean;
  isConfigured: boolean;
  updatedAt: string | null;
};

type Charge = {
  id: string;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
  enrollment?: {
    id: string;
    student?: {
      id: string;
      name: string;
      email: string;
    };
    schoolClass?: {
      id: string;
      name: string;
      course?: { id: string; name: string };
    };
  };
  paymentTransactions?: Array<{
    id: string;
    amount: number;
    status: string;
    provider: string;
    createdAt: string;
  }>;
};

type Enrollment = {
  id: string;
  status: 'ACTIVE' | 'CANCELED' | 'COMPLETED';
  student?: {
    id: string;
    name: string;
    email: string;
  };
  schoolClass?: {
    id: string;
    name: string;
    course?: { id: string; name: string };
  };
};

type ChargeFormState = {
  enrollmentId: string;
  amount: string;
  dueDate: string;
  externalChargeId: string;
};

type TransactionFormState = {
  monthlyChargeId: string;
  amount: string;
  provider: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  paidAt: string;
  externalTransactionId: string;
};

type FinanceNativeProps = {
  token: string;
};

function defaultChargeForm(): ChargeFormState {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return {
    enrollmentId: '',
    amount: '',
    dueDate: nextMonth.toISOString().slice(0, 10),
    externalChargeId: '',
  };
}

function defaultTransactionForm(): TransactionFormState {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return {
    monthlyChargeId: '',
    amount: '',
    provider: '',
    status: 'success',
    paidAt: `${date}T10:00`,
    externalTransactionId: '',
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'AL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function statusLabel(status: Charge['status']): string {
  switch (status) {
    case 'PAID':
      return 'Pago';
    case 'OVERDUE':
      return 'Atrasado';
    case 'PENDING':
      return 'Pendente';
    case 'CANCELED':
      return 'Cancelado';
    default:
      return status;
  }
}

function statusToApi(status: Charge['status']): 'pending' | 'paid' | 'overdue' | 'canceled' {
  switch (status) {
    case 'PAID':
      return 'paid';
    case 'OVERDUE':
      return 'overdue';
    case 'CANCELED':
      return 'canceled';
    case 'PENDING':
    default:
      return 'pending';
  }
}

function chipClass(status: Charge['status']): string {
  switch (status) {
    case 'PAID':
      return 'is-success';
    case 'OVERDUE':
      return 'is-danger';
    case 'PENDING':
      return 'is-neutral';
    case 'CANCELED':
      return 'is-muted';
    default:
      return 'is-neutral';
  }
}

export function FinanceNative({ token }: FinanceNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [gateway, setGateway] = useState<GatewayConfig | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Charge['status']>('ALL');
  const [statusDraft, setStatusDraft] = useState<Record<string, Charge['status']>>({});
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [chargeForm, setChargeForm] = useState<ChargeFormState>(() => defaultChargeForm());
  const [transactionForm, setTransactionForm] = useState<TransactionFormState>(() =>
    defaultTransactionForm(),
  );
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [overviewData, chargesData, enrollmentsData, gatewayData] = await Promise.all([
        apiRequest<FinanceOverview>(token, '/finance/overview'),
        apiRequest<Charge[]>(token, '/finance/charges'),
        apiRequest<Enrollment[]>(token, '/enrollments'),
        apiRequest<GatewayConfig>(token, '/finance/gateway-config'),
      ]);

      setOverview(overviewData);
      setCharges(Array.isArray(chargesData) ? chargesData : []);
      setEnrollments(Array.isArray(enrollmentsData) ? enrollmentsData : []);
      setGateway(gatewayData);
      setStatusDraft(
        Object.fromEntries(
          (Array.isArray(chargesData) ? chargesData : []).map((item) => [
            item.id,
            item.status,
          ]),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar financeiro.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [token]);

  const totalReceived = useMemo(() => {
    if (!overview) return 0;
    const item = overview.amountByStatus.find((value) => value.status === 'paid');
    return Number(item?.amount ?? 0);
  }, [overview]);

  const overdueAmount = useMemo(() => {
    if (!overview) return 0;
    const item = overview.amountByStatus.find((value) => value.status === 'overdue');
    return Number(item?.amount ?? 0);
  }, [overview]);

  const filteredCharges = useMemo(() => {
    const query = search.trim().toLowerCase();
    return charges.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!query) return true;

      const studentName = item.enrollment?.student?.name?.toLowerCase() ?? '';
      const studentEmail = item.enrollment?.student?.email?.toLowerCase() ?? '';
      const className = item.enrollment?.schoolClass?.name?.toLowerCase() ?? '';
      const courseName = item.enrollment?.schoolClass?.course?.name?.toLowerCase() ?? '';

      return (
        studentName.includes(query) ||
        studentEmail.includes(query) ||
        className.includes(query) ||
        courseName.includes(query)
      );
    });
  }, [charges, search, statusFilter]);

  const enrollmentOptions = useMemo(
    () =>
      enrollments.filter(
        (item) =>
          item.status === 'ACTIVE' &&
          Boolean(item.student?.id) &&
          Boolean(item.schoolClass?.id),
      ),
    [enrollments],
  );

  const chargeOptionsForPayment = useMemo(
    () => charges.filter((item) => item.status === 'PENDING' || item.status === 'OVERDUE'),
    [charges],
  );

  const openChargeModal = () => {
    setChargeForm(defaultChargeForm());
    setFormError('');
    setChargeModalOpen(true);
  };

  const openTransactionModal = () => {
    const form = defaultTransactionForm();
    const firstCharge = chargeOptionsForPayment[0];
    if (firstCharge) {
      form.monthlyChargeId = firstCharge.id;
      form.amount = String(Number(firstCharge.amount ?? 0));
    }
    if (gateway?.isActive && gateway?.provider) {
      form.provider = gateway.provider;
    }
    setTransactionForm(form);
    setFormError('');
    setTransactionModalOpen(true);
  };

  const submitCharge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');

    const amount = Number(chargeForm.amount);
    if (!chargeForm.enrollmentId || !Number.isFinite(amount) || amount <= 0 || !chargeForm.dueDate) {
      setFormError('Preencha matrícula, valor e vencimento com dados válidos.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(token, '/finance/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentId: chargeForm.enrollmentId,
          amount,
          dueDate: `${chargeForm.dueDate}T12:00:00.000Z`,
          externalChargeId: chargeForm.externalChargeId.trim() || undefined,
        }),
      });
      await loadData(false);
      setChargeModalOpen(false);
      setChargeForm(defaultChargeForm());
      setFeedback('Cobrança criada com sucesso.');
    } catch (submitError) {
      setFormError(
        submitError instanceof Error ? submitError.message : 'Falha ao criar cobrança.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');

    const amount = Number(transactionForm.amount);
    if (!transactionForm.monthlyChargeId || !Number.isFinite(amount) || amount <= 0) {
      setFormError('Selecione a cobrança e informe um valor válido.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(token, '/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyChargeId: transactionForm.monthlyChargeId,
          amount,
          provider: transactionForm.provider.trim() || undefined,
          status: transactionForm.status,
          paidAt: transactionForm.paidAt
            ? new Date(transactionForm.paidAt).toISOString()
            : undefined,
          externalTransactionId:
            transactionForm.externalTransactionId.trim() || undefined,
        }),
      });
      await loadData(false);
      setTransactionModalOpen(false);
      setTransactionForm(defaultTransactionForm());
      setFeedback('Pagamento registrado com sucesso.');
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao registrar pagamento.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const applyStatus = async (chargeId: string) => {
    const nextStatus = statusDraft[chargeId];
    const current = charges.find((item) => item.id === chargeId);
    if (!nextStatus || !current || nextStatus === current.status) return;

    setSavingStatus(chargeId);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/finance/charges/${chargeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusToApi(nextStatus) }),
      });
      await loadData(false);
      setFeedback('Status da cobrança atualizado.');
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : 'Falha ao atualizar status da cobrança.',
      );
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <section className="native-page native-finance">
      <header className="native-page-header">
        <h2>Financeiro</h2>
        <p>
          Gestão nativa de cobranças e pagamentos, com menos custo de renderização
          e resposta mais fluida.
        </p>
      </header>

      <div className="native-kpi-grid native-kpi-grid-small native-finance-kpis">
        <article className="native-kpi-card">
          <span>Total recebido</span>
          <strong>{formatCurrency(totalReceived)}</strong>
          <small>Mês atual</small>
        </article>
        <article className="native-kpi-card">
          <span>Inadimplência</span>
          <strong>{formatCurrency(overdueAmount)}</strong>
          <small>{overview?.overdueCharges ?? 0} cobrança(s) em atraso</small>
        </article>
        <article className="native-kpi-card">
          <span>Pendências</span>
          <strong>{overview?.pendingCharges ?? 0}</strong>
          <small>{overview?.totalCharges ?? 0} cobrança(s) no total</small>
        </article>
        <article className="native-kpi-card">
          <span>Gateway</span>
          <strong>{gateway?.provider?.toUpperCase() || 'MANUAL'}</strong>
          <small>
            {gateway?.isActive
              ? `Ativo (${gateway.environment})`
              : 'Inativo / manual'}
          </small>
        </article>
      </div>

      <div className="native-toolbar">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por aluno, e-mail, turma ou curso..."
        />
        <div className="native-toolbar-actions">
          <select
            className="native-finance-select"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'ALL' | Charge['status'])
            }
          >
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendente</option>
            <option value="PAID">Pago</option>
            <option value="OVERDUE">Atrasado</option>
            <option value="CANCELED">Cancelado</option>
          </select>
          <button type="button" className="ghost" onClick={openChargeModal}>
            Nova cobrança
          </button>
          <button type="button" onClick={openTransactionModal}>
            Registrar pagamento
          </button>
        </div>
      </div>

      {loading ? <p className="native-info">Carregando financeiro...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading ? (
        <div className="native-panel native-table-wrap">
          <table className="native-table">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Turma</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCharges.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhuma cobrança encontrada.</td>
                </tr>
              ) : (
                filteredCharges.map((charge) => {
                  const studentName = charge.enrollment?.student?.name || 'Aluno não identificado';
                  const studentEmail = charge.enrollment?.student?.email || '-';
                  const className =
                    charge.enrollment?.schoolClass?.name ||
                    charge.enrollment?.schoolClass?.course?.name ||
                    'Turma não definida';

                  return (
                    <tr key={charge.id}>
                      <td>
                        <div className="native-student-cell">
                          <div className="native-user-initials">{getInitials(studentName)}</div>
                          <div>
                            <strong>{studentName}</strong>
                            <small>{studentEmail}</small>
                          </div>
                        </div>
                      </td>
                      <td>{className}</td>
                      <td>{formatCurrency(Number(charge.amount || 0))}</td>
                      <td>{formatDate(charge.dueDate)}</td>
                      <td>
                        <span className={`native-status-chip ${chipClass(charge.status)}`}>
                          {statusLabel(charge.status)}
                        </span>
                      </td>
                      <td>
                        <div className="native-finance-row-actions">
                          <select
                            className="native-finance-select"
                            value={statusDraft[charge.id] || charge.status}
                            onChange={(event) =>
                              setStatusDraft((current) => ({
                                ...current,
                                [charge.id]: event.target.value as Charge['status'],
                              }))
                            }
                          >
                            <option value="PENDING">Pendente</option>
                            <option value="PAID">Pago</option>
                            <option value="OVERDUE">Atrasado</option>
                            <option value="CANCELED">Cancelado</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              void applyStatus(charge.id);
                            }}
                            disabled={savingStatus === charge.id}
                          >
                            {savingStatus === charge.id ? 'Salvando...' : 'Aplicar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {chargeModalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setChargeModalOpen(false)}>
          <section className="native-modal native-modal-sm" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Nova cobrança</h3>
              <button type="button" onClick={() => setChargeModalOpen(false)}>
                Fechar
              </button>
            </header>

            <form className="native-form-grid native-finance-form" onSubmit={submitCharge}>
              <label>
                Matrícula
                <select
                  value={chargeForm.enrollmentId}
                  onChange={(event) =>
                    setChargeForm((current) => ({
                      ...current,
                      enrollmentId: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Selecione</option>
                  {enrollmentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.student?.name || 'Aluno'} - {item.schoolClass?.name || 'Turma'}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Valor (R$)
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={chargeForm.amount}
                  onChange={(event) =>
                    setChargeForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Vencimento
                <input
                  type="date"
                  value={chargeForm.dueDate}
                  onChange={(event) =>
                    setChargeForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Referência externa (opcional)
                <input
                  value={chargeForm.externalChargeId}
                  onChange={(event) =>
                    setChargeForm((current) => ({
                      ...current,
                      externalChargeId: event.target.value,
                    }))
                  }
                />
              </label>

              {formError ? <p className="native-error">{formError}</p> : null}

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setChargeModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Salvando...' : 'Criar cobrança'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {transactionModalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setTransactionModalOpen(false)}>
          <section className="native-modal native-modal-sm" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Registrar pagamento</h3>
              <button type="button" onClick={() => setTransactionModalOpen(false)}>
                Fechar
              </button>
            </header>

            <form className="native-form-grid native-finance-form" onSubmit={submitTransaction}>
              <label>
                Cobrança
                <select
                  value={transactionForm.monthlyChargeId}
                  onChange={(event) => {
                    const charge = charges.find((item) => item.id === event.target.value);
                    setTransactionForm((current) => ({
                      ...current,
                      monthlyChargeId: event.target.value,
                      amount: charge ? String(Number(charge.amount || 0)) : current.amount,
                    }));
                  }}
                  required
                >
                  <option value="">Selecione</option>
                  {chargeOptionsForPayment.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.enrollment?.student?.name || 'Aluno'} - {formatCurrency(Number(item.amount || 0))}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Valor (R$)
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={transactionForm.amount}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Provedor
                <input
                  value={transactionForm.provider}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      provider: event.target.value,
                    }))
                  }
                  placeholder="manual, asaas, pagarme..."
                />
              </label>

              <label>
                Status
                <select
                  value={transactionForm.status}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      status: event.target.value as TransactionFormState['status'],
                    }))
                  }
                >
                  <option value="success">Sucesso</option>
                  <option value="pending">Pendente</option>
                  <option value="failed">Falhou</option>
                  <option value="refunded">Estornado</option>
                </select>
              </label>

              <label>
                Data/hora do pagamento
                <input
                  type="datetime-local"
                  value={transactionForm.paidAt}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      paidAt: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Referência externa (opcional)
                <input
                  value={transactionForm.externalTransactionId}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      externalTransactionId: event.target.value,
                    }))
                  }
                />
              </label>

              {formError ? <p className="native-error">{formError}</p> : null}

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setTransactionModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Salvando...' : 'Registrar pagamento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
