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
  description?: string;
  paymentMethod?: 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD' | string | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
  awaitingCourseStart?: boolean;
  isCreditCardRequestHistory?: boolean;
  historyApprovedAt?: string | null;
  creditCardPaymentRequest?: {
    status: string;
  } | null;
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

type CreditCardPaymentRequest = {
  id: string;
  monthlyChargeId: string | null;
  enrollmentId: string | null;
  studentCourseId: string | null;
  kind: 'COURSE_PAYMENT' | 'ENROLLMENT_FEE' | string;
  amount: number;
  installmentCount: number | null;
  installmentAmount: number | null;
  status: 'WAITING_COURSE_START' | 'REQUESTED' | 'LINK_SENT' | 'VIEWED' | 'COPIED' | 'APPROVED' | 'CANCELED' | string;
  paymentLinkUrl: string | null;
  adminNote: string | null;
  requestedAt: string;
  linkSentAt: string | null;
  viewedAt: string | null;
  copiedAt: string | null;
  approvedAt: string | null;
  monthlyCharge?: {
    id: string;
    amount: number;
    dueDate: string;
    status: string;
  } | null;
  enrollment?: {
    id: string;
    schoolClass?: {
      id: string;
      name: string;
      course?: { id: string; name: string } | null;
    } | null;
  } | null;
  studentCourse?: {
    id: string;
    selectedPaymentOption?: {
      appliedVoucher?: {
        code?: string;
        discountLabel?: string;
      } | null;
    } | null;
    course?: { id: string; name: string } | null;
  } | null;
  student?: {
    id: string;
    name: string;
    email: string;
  } | null;
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

type VoucherCourse = {
  id: string;
  name: string;
  paymentOptions: Array<{
    id: string;
    title: string;
    method: 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD' | string;
    type: 'CASH' | 'INSTALLMENTS' | string;
  }>;
};

type Voucher = {
  id: string;
  courseId: string | null;
  courseName: string;
  code: string;
  title: string | null;
  discountType: 'PERCENT' | 'FIXED' | string;
  discountValue: number;
  appliesTo: 'TOTAL' | 'INSTALLMENT' | string;
  appliesToEnrollmentFee?: boolean;
  installmentScope?: 'ALL' | 'SINGLE' | string;
  maxUses?: number | null;
  usageCount?: number;
  remainingUses?: number | null;
  discountLabel: string;
  allowedPaymentOptionIds: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type VoucherFormState = {
  courseId: string;
  code: string;
  title: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: string;
  appliesTo: 'TOTAL' | 'INSTALLMENT';
  appliesToEnrollmentFee: boolean;
  installmentScope: 'ALL' | 'SINGLE';
  maxUses: string;
  allowedPaymentOptionIds: string[];
};

type FinanceNativeProps = {
  token: string;
};

const VOUCHER_ALL_COURSES_ID = '__ALL__';

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

function defaultVoucherForm(): VoucherFormState {
  return {
    courseId: '',
    code: '',
    title: '',
    discountType: 'PERCENT',
    discountValue: '',
    appliesTo: 'INSTALLMENT',
    appliesToEnrollmentFee: false,
    installmentScope: 'ALL',
    maxUses: '',
    allowedPaymentOptionIds: [],
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

function paymentMethodLabel(value: string | null | undefined) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'BANK_SLIP') return 'Boleto';
  if (normalized === 'CREDIT_CARD') return 'Cartão de crédito';
  if (normalized === 'PIX') return 'Pix';
  return '-';
}

function voucherStatusClass(active: boolean) {
  return active ? 'is-success' : 'is-muted';
}

function voucherApplicationLabel(voucher: Voucher) {
  const appliesToInstallment =
    String(voucher.appliesTo || '').toUpperCase() === 'INSTALLMENT';
  if (!appliesToInstallment) return 'Curso inteiro';
  return String(voucher.installmentScope || '').toUpperCase() === 'SINGLE'
    ? 'Uma mensalidade'
    : 'Todas as mensalidades';
}

function voucherUsageLabel(voucher: Voucher) {
  const used = Math.max(0, Number(voucher.usageCount ?? 0));
  const max = Number(voucher.maxUses ?? 0);
  if (!Number.isFinite(max) || max <= 0) {
    return `${used}/∞`;
  }
  return `${used}/${max}`;
}

function creditCardRequestStatusLabel(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'WAITING_COURSE_START':
      return 'Aguardando início do curso';
    case 'REQUESTED':
      return 'Solicitado';
    case 'LINK_SENT':
      return 'Link enviado';
    case 'VIEWED':
      return 'Visualizado';
    case 'COPIED':
      return 'Copiado';
    case 'APPROVED':
      return 'Aprovado';
    case 'CANCELED':
      return 'Cancelado';
    default:
      return status || '-';
  }
}

function creditCardRequestKindLabel(kind: string): string {
  return String(kind || '').toUpperCase() === 'ENROLLMENT_FEE'
    ? 'Matrícula'
    : 'Curso';
}

function creditCardRequestToHistoryCharge(
  request: CreditCardPaymentRequest,
): Charge {
  const course =
    request.enrollment?.schoolClass?.course ||
    request.studentCourse?.course ||
    undefined;
  const schoolClass = request.enrollment?.schoolClass;

  return {
    id: `credit-card-request:${request.id}`,
    amount: request.amount,
    dueDate: request.approvedAt || request.requestedAt,
    description: creditCardRequestKindLabel(request.kind),
    paymentMethod: 'CREDIT_CARD',
    status: 'PAID',
    isCreditCardRequestHistory: true,
    historyApprovedAt: request.approvedAt,
    creditCardPaymentRequest: {
      status: request.status,
    },
    enrollment: {
      id: request.enrollmentId || `pre-enrollment:${request.id}`,
      student: request.student
        ? {
            id: request.student.id,
            name: request.student.name,
            email: request.student.email,
          }
        : undefined,
      schoolClass: course
        ? {
            id: schoolClass?.id || `course:${course.id}`,
            name: schoolClass?.name || 'Turma a definir',
            course,
          }
        : undefined,
    },
  };
}

export function FinanceNative({ token }: FinanceNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [gateway, setGateway] = useState<GatewayConfig | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [creditCardRequests, setCreditCardRequests] = useState<CreditCardPaymentRequest[]>([]);
  const [creditCardLinkDraft, setCreditCardLinkDraft] = useState<Record<string, string>>({});
  const [creditCardActionId, setCreditCardActionId] = useState<string | null>(null);
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
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherCourses, setVoucherCourses] = useState<VoucherCourse[]>([]);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState<VoucherFormState>(() => defaultVoucherForm());
  const [voucherFormError, setVoucherFormError] = useState('');
  const [voucherSubmitting, setVoucherSubmitting] = useState(false);
  const [updatingVoucherId, setUpdatingVoucherId] = useState<string | null>(null);
  const [deletingVoucherId, setDeletingVoucherId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showFinanceValues, setShowFinanceValues] = useState(false);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [
        overviewData,
        chargesData,
        enrollmentsData,
        gatewayData,
        vouchersData,
        voucherCoursesData,
        creditCardRequestsData,
        creditCardHistoryData,
      ] = await Promise.all([
        apiRequest<FinanceOverview>(token, '/finance/overview'),
        apiRequest<Charge[]>(token, '/finance/charges'),
        apiRequest<Enrollment[]>(token, '/enrollments'),
        apiRequest<GatewayConfig>(token, '/finance/gateway-config'),
        apiRequest<Voucher[]>(token, '/finance/vouchers'),
        apiRequest<VoucherCourse[]>(token, '/finance/voucher-courses'),
        apiRequest<CreditCardPaymentRequest[]>(token, '/finance/credit-card-requests'),
        apiRequest<CreditCardPaymentRequest[]>(
          token,
          '/finance/credit-card-requests/history',
        ),
      ]);

      const normalizedCharges = Array.isArray(chargesData) ? chargesData : [];
      const historicalCharges = (
        Array.isArray(creditCardHistoryData) ? creditCardHistoryData : []
      ).map(creditCardRequestToHistoryCharge);
      const combinedCharges = [...normalizedCharges, ...historicalCharges];

      setOverview(overviewData);
      setCharges(combinedCharges);
      setEnrollments(Array.isArray(enrollmentsData) ? enrollmentsData : []);
      setGateway(gatewayData);
      setVouchers(Array.isArray(vouchersData) ? vouchersData : []);
      setVoucherCourses(Array.isArray(voucherCoursesData) ? voucherCoursesData : []);
      const normalizedCreditRequests = Array.isArray(creditCardRequestsData)
        ? creditCardRequestsData
        : [];
      setCreditCardRequests(normalizedCreditRequests);
      setCreditCardLinkDraft(
        Object.fromEntries(
          normalizedCreditRequests.map((item) => [
            item.id,
            item.paymentLinkUrl || '',
          ]),
        ),
      );
      setStatusDraft(
        Object.fromEntries(
          combinedCharges.map((item) => [
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
      const description = String(item.description || '')
        .trim()
        .toLowerCase();

      return (
        studentName.includes(query) ||
        studentEmail.includes(query) ||
        className.includes(query) ||
        courseName.includes(query) ||
        description.includes(query)
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

  const allVoucherPaymentOptions = useMemo(() => {
    const optionMap = new Map<string, VoucherCourse['paymentOptions'][number]>();
    for (const course of voucherCourses) {
      for (const option of course.paymentOptions) {
        if (!optionMap.has(option.id)) {
          optionMap.set(option.id, option);
        }
      }
    }
    return Array.from(optionMap.values()).sort((left, right) =>
      left.title.localeCompare(right.title, 'pt-BR'),
    );
  }, [voucherCourses]);

  const selectedVoucherCourse = useMemo(
    () => {
      if (voucherForm.courseId === VOUCHER_ALL_COURSES_ID) {
        return {
          id: VOUCHER_ALL_COURSES_ID,
          name: 'Todos os cursos',
          paymentOptions: allVoucherPaymentOptions,
        } satisfies VoucherCourse;
      }
      return voucherCourses.find((item) => item.id === voucherForm.courseId) ?? null;
    },
    [allVoucherPaymentOptions, voucherCourses, voucherForm.courseId],
  );
  const isAllCoursesVoucher = voucherForm.courseId === VOUCHER_ALL_COURSES_ID;

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

  const openVoucherModal = () => {
    setVoucherForm(defaultVoucherForm());
    setVoucherFormError('');
    setVoucherModalOpen(true);
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

  const submitVoucher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVoucherFormError('');
    setFeedback('');

    const discountValue = Number(voucherForm.discountValue);
    const maxUses =
      voucherForm.maxUses.trim() === '' ? undefined : Number(voucherForm.maxUses);
    if (!voucherForm.courseId) {
      setVoucherFormError('Selecione o curso do voucher.');
      return;
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setVoucherFormError('Informe um valor de desconto válido.');
      return;
    }
    if (voucherForm.discountType === 'PERCENT' && discountValue > 100) {
      setVoucherFormError('Percentual deve estar entre 0,01% e 100%.');
      return;
    }
    if (voucherForm.allowedPaymentOptionIds.length === 0) {
      setVoucherFormError('Selecione ao menos uma opção de pagamento.');
      return;
    }
    if (voucherForm.appliesTo === 'INSTALLMENT') {
      const hasInstallment = (selectedVoucherCourse?.paymentOptions ?? []).some(
        (option) =>
          voucherForm.allowedPaymentOptionIds.includes(option.id) &&
          String(option.type || '').toUpperCase() === 'INSTALLMENTS',
      );
      if (!hasInstallment) {
        setVoucherFormError(
          'Para mensalidades, selecione ao menos uma opção parcelada.',
        );
        return;
      }
    }
    if (
      maxUses !== undefined &&
      (!Number.isFinite(maxUses) || maxUses <= 0 || !Number.isInteger(maxUses))
    ) {
      setVoucherFormError('Informe um limite de uso inteiro maior que zero.');
      return;
    }

    setVoucherSubmitting(true);
    try {
      await apiRequest(token, '/finance/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: isAllCoursesVoucher ? undefined : voucherForm.courseId,
          allCourses: isAllCoursesVoucher,
          code: voucherForm.code.trim() || undefined,
          title: voucherForm.title.trim() || undefined,
          discountType: voucherForm.discountType,
          discountValue,
          appliesTo: voucherForm.appliesTo,
          installmentScope:
            voucherForm.appliesTo === 'INSTALLMENT'
              ? voucherForm.installmentScope
              : 'ALL',
          appliesToEnrollmentFee: voucherForm.appliesToEnrollmentFee,
          maxUses,
          allowedPaymentOptionIds: voucherForm.allowedPaymentOptionIds,
          active: true,
        }),
      });
      await loadData(false);
      setVoucherModalOpen(false);
      setVoucherForm(defaultVoucherForm());
      setFeedback('Voucher criado com sucesso.');
    } catch (voucherError) {
      setVoucherFormError(
        voucherError instanceof Error
          ? voucherError.message
          : 'Falha ao criar voucher.',
      );
    } finally {
      setVoucherSubmitting(false);
    }
  };

  const toggleVoucherStatus = async (voucher: Voucher) => {
    setUpdatingVoucherId(voucher.id);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/finance/vouchers/${voucher.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !voucher.active }),
      });
      await loadData(false);
      setFeedback(
        !voucher.active
          ? 'Voucher ativado com sucesso.'
          : 'Voucher desativado com sucesso.',
      );
    } catch (voucherError) {
      setError(
        voucherError instanceof Error
          ? voucherError.message
          : 'Falha ao atualizar voucher.',
      );
    } finally {
      setUpdatingVoucherId(null);
    }
  };

  const deleteVoucher = async (voucher: Voucher) => {
    if (voucher.active) return;
    setDeletingVoucherId(voucher.id);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/finance/vouchers/${voucher.id}`, {
        method: 'DELETE',
      });
      await loadData(false);
      setFeedback('Voucher excluído com sucesso.');
    } catch (voucherError) {
      setError(
        voucherError instanceof Error
          ? voucherError.message
          : 'Falha ao excluir voucher.',
      );
    } finally {
      setDeletingVoucherId(null);
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

  const sendCreditCardLink = async (request: CreditCardPaymentRequest) => {
    const paymentLinkUrl = String(creditCardLinkDraft[request.id] || '').trim();
    if (!paymentLinkUrl) {
      setError('Cole o link de pagamento antes de enviar ao aluno.');
      return;
    }

    setCreditCardActionId(request.id);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/finance/credit-card-requests/${request.id}/link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinkUrl }),
      });
      await loadData(false);
      setFeedback('Link de pagamento enviado ao aluno.');
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : 'Falha ao enviar link de pagamento.',
      );
    } finally {
      setCreditCardActionId(null);
    }
  };

  const approveCreditCardRequest = async (request: CreditCardPaymentRequest) => {
    setCreditCardActionId(request.id);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/finance/credit-card-requests/${request.id}/approve`, {
        method: 'PATCH',
      });
      await loadData(false);
      setFeedback('Pagamento por cartão aprovado.');
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : 'Falha ao aprovar pagamento por cartão.',
      );
    } finally {
      setCreditCardActionId(null);
    }
  };

  const cancelCreditCardRequest = async (request: CreditCardPaymentRequest) => {
    setCreditCardActionId(request.id);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/finance/credit-card-requests/${request.id}/cancel`, {
        method: 'PATCH',
      });
      await loadData(false);
      setFeedback('Solicitação de cartão cancelada.');
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Falha ao cancelar solicitação de cartão.',
      );
    } finally {
      setCreditCardActionId(null);
    }
  };

  const financeSensitiveClass = showFinanceValues
    ? 'native-finance-sensitive'
    : 'native-finance-sensitive is-hidden';

  return (
    <section className="native-page native-finance">
      <header className="native-page-header">
        <div className="native-finance-header-row">
          <h2>Financeiro</h2>
          <button
            type="button"
            className="native-finance-visibility-toggle"
            onClick={() => setShowFinanceValues((current) => !current)}
            aria-label={showFinanceValues ? 'Ocultar dados financeiros' : 'Exibir dados financeiros'}
          >
            {showFinanceValues ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3l18 18" />
                <path d="M5.3 7.7C3.4 9.4 2.5 11 2.5 12c0 0 3.5 6 9.5 6 2.3 0 4.2-.8 5.7-1.9" />
                <path d="M9.9 9.9a3.2 3.2 0 004.2 4.2" />
                <path d="M12 6c6 0 9.5 6 9.5 6-.4.7-1.2 2-2.6 3.2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            )}
            <span>{showFinanceValues ? 'Ocultar valores' : 'Exibir valores'}</span>
          </button>
        </div>
        <p>
          Gestão nativa de cobranças e pagamentos, com menos custo de renderização
          e resposta mais fluida.
        </p>
      </header>

      <div className="native-kpi-grid native-kpi-grid-small native-finance-kpis">
        <article className="native-kpi-card">
          <span>Total recebido</span>
          <strong className={financeSensitiveClass}>{formatCurrency(totalReceived)}</strong>
          <small>Mês atual</small>
        </article>
        <article className="native-kpi-card">
          <span>Inadimplência</span>
          <strong className={financeSensitiveClass}>{formatCurrency(overdueAmount)}</strong>
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

      <section className="native-panel native-finance-vouchers">
        <div className="native-finance-vouchers-header">
          <div>
            <h3>Vouchers de desconto</h3>
            <p>Crie e gerencie vouchers por curso e forma de pagamento.</p>
          </div>
          <button type="button" onClick={openVoucherModal}>
            Novo voucher
          </button>
        </div>
        {vouchers.length === 0 ? (
          <p className="native-info">Nenhum voucher cadastrado até o momento.</p>
        ) : (
          <div className="native-table-wrap">
            <table className="native-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Curso</th>
                  <th>Desconto</th>
                  <th>Aplicação</th>
                  <th>Uso</th>
                  <th>Pagamentos</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((voucher) => (
                  <tr key={voucher.id}>
                    <td>
                      <strong>{voucher.code}</strong>
                      <small>{voucher.title || 'Sem título'}</small>
                    </td>
                    <td>{voucher.courseName}</td>
                    <td>{voucher.discountLabel}</td>
                    <td>{voucherApplicationLabel(voucher)}</td>
                    <td>
                      <strong>{voucherUsageLabel(voucher)}</strong>
                      <small>
                        {Number(voucher.maxUses ?? 0) > 0
                          ? `${Math.max(0, Number(voucher.remainingUses ?? 0))} restante(s)`
                          : 'Sem limite'}
                      </small>
                    </td>
                    <td>
                      {voucher.allowedPaymentOptionIds.length > 0
                        ? voucher.allowedPaymentOptionIds.length
                        : 0}{' '}
                      opção(ões)
                    </td>
                    <td>
                      <span
                        className={`native-status-chip ${voucherStatusClass(voucher.active)}`}
                      >
                        {voucher.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="native-finance-row-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            void toggleVoucherStatus(voucher);
                          }}
                          disabled={
                            updatingVoucherId === voucher.id ||
                            deletingVoucherId === voucher.id
                          }
                        >
                          {updatingVoucherId === voucher.id
                            ? 'Salvando...'
                            : voucher.active
                              ? 'Desativar'
                              : 'Ativar'}
                        </button>
                        {!voucher.active ? (
                          <button
                            type="button"
                            className="native-voucher-delete-btn"
                            title="Excluir voucher"
                            aria-label="Excluir voucher"
                            onClick={() => {
                              void deleteVoucher(voucher);
                            }}
                            disabled={deletingVoucherId === voucher.id}
                          >
                            {deletingVoucherId === voucher.id ? (
                              '...'
                            ) : (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M4 7h16M9 7V5h6v2m-8 0 1 12h8l1-12"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="native-panel native-finance-vouchers">
        <div className="native-finance-vouchers-header">
          <div>
            <h3>Solicitações de cartão</h3>
            <p>Receba pedidos, cole o link gerado no Sicoob e aprove manualmente após a confirmação.</p>
          </div>
          <small>{creditCardRequests.length} solicitação(ões)</small>
        </div>
        {creditCardRequests.length === 0 ? (
          <p className="native-info">Nenhuma solicitação de cartão pendente.</p>
        ) : (
          <div className="native-table-wrap">
            <table className="native-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Curso/Turma</th>
                  <th>Valor</th>
                  <th>Parcelas</th>
                  <th>Status</th>
                  <th>Link do Sicoob</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {creditCardRequests.map((request) => {
                  const normalizedStatus = String(request.status || '').toUpperCase();
                  const canEdit =
                    normalizedStatus !== 'APPROVED' &&
                    normalizedStatus !== 'CANCELED';
                  const canProcess =
                    canEdit && normalizedStatus !== 'WAITING_COURSE_START';
                  const isBusy = creditCardActionId === request.id;
                  const studentName = request.student?.name || 'Aluno não identificado';
                  const studentEmail = request.student?.email || '-';
                  const courseName =
                    request.enrollment?.schoolClass?.course?.name ||
                    request.studentCourse?.course?.name ||
                    'Curso não informado';
                  const className =
                    request.enrollment?.schoolClass?.name || 'Turma a definir';
                  const requestKindLabel = creditCardRequestKindLabel(request.kind);
                  const voucher =
                    request.studentCourse?.selectedPaymentOption?.appliedVoucher;
                  return (
                    <tr key={request.id}>
                      <td>
                        <div className="native-student-cell">
                          <div className="native-user-initials">{getInitials(studentName)}</div>
                          <div>
                            <strong>{studentName}</strong>
                            <small>{studentEmail}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{courseName}</strong>
                        <small>{requestKindLabel} • {className}</small>
                        {voucher?.code ? (
                          <small>
                            Voucher {voucher.code}
                            {voucher.discountLabel ? ` • ${voucher.discountLabel}` : ''}
                          </small>
                        ) : null}
                      </td>
                      <td className={financeSensitiveClass}>{formatCurrency(request.amount)}</td>
                      <td>
                        {request.installmentCount && request.installmentAmount
                          ? `${request.installmentCount}x de ${formatCurrency(request.installmentAmount)}`
                          : 'À vista'}
                      </td>
                      <td>
                        <span className={`native-status-chip ${chipClass(
                          normalizedStatus === 'APPROVED'
                            ? 'PAID'
                            : normalizedStatus === 'CANCELED'
                              ? 'CANCELED'
                              : 'PENDING',
                        )}`}>
                          {creditCardRequestStatusLabel(request.status)}
                        </span>
                      </td>
                      <td>
                        <input
                          className="native-finance-select"
                          value={creditCardLinkDraft[request.id] || ''}
                          onChange={(event) =>
                            setCreditCardLinkDraft((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          placeholder="Cole o link de pagamento"
                          disabled={!canProcess || isBusy}
                        />
                        {normalizedStatus === 'WAITING_COURSE_START' ? (
                          <small>Envie o link quando o curso iniciar.</small>
                        ) : null}
                      </td>
                      <td>
                        <div className="native-finance-row-actions">
                          <button
                            type="button"
                            onClick={() => void sendCreditCardLink(request)}
                            disabled={!canProcess || isBusy}
                          >
                            {isBusy ? 'Salvando...' : 'Enviar link'}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void approveCreditCardRequest(request)}
                            disabled={!canProcess || isBusy}
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void cancelCreditCardRequest(request)}
                            disabled={!canEdit || isBusy}
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
                <th>Descrição</th>
                <th>Forma de pagamento</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCharges.length === 0 ? (
                <tr>
                  <td colSpan={8}>Nenhuma cobrança encontrada.</td>
                </tr>
              ) : (
                filteredCharges.map((charge) => {
                  const studentName = charge.enrollment?.student?.name || 'Aluno não identificado';
                  const studentEmail = charge.enrollment?.student?.email || '-';
                  const className =
                    charge.enrollment?.schoolClass?.name ||
                    charge.enrollment?.schoolClass?.course?.name ||
                    'Turma não definida';
                  const isWaitingCourseStart =
                    Boolean(charge.awaitingCourseStart) ||
                    String(charge.creditCardPaymentRequest?.status || '').toUpperCase() ===
                      'WAITING_COURSE_START';

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
                      <td>{charge.description || 'Cobrança'}</td>
                      <td>{paymentMethodLabel(charge.paymentMethod)}</td>
                      <td className={financeSensitiveClass}>{formatCurrency(Number(charge.amount || 0))}</td>
                      <td>
                        {charge.isCreditCardRequestHistory
                          ? `Aprovado em ${formatDate(
                              charge.historyApprovedAt || charge.dueDate,
                            )}`
                          : isWaitingCourseStart
                            ? 'No início do curso'
                            : formatDate(charge.dueDate)}
                      </td>
                      <td>
                        <span className={`native-status-chip ${chipClass(charge.status)}`}>
                          {isWaitingCourseStart
                            ? 'Aguardando início do curso'
                            : statusLabel(charge.status)}
                        </span>
                      </td>
                      <td>
                        {charge.isCreditCardRequestHistory ? (
                          <small>Pagamento aprovado manualmente.</small>
                        ) : isWaitingCourseStart ? (
                          <small>Será liberada quando a turma entrar em andamento.</small>
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {voucherModalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setVoucherModalOpen(false)}>
          <section className="native-modal native-modal-sm" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Novo voucher</h3>
              <button type="button" onClick={() => setVoucherModalOpen(false)}>
                Fechar
              </button>
            </header>

            <form className="native-form-grid native-finance-form" onSubmit={submitVoucher}>
              <label>
                Curso
                <select
                  value={voucherForm.courseId}
                  onChange={(event) => {
                    const nextCourseId = event.target.value;
                    const course =
                      nextCourseId === VOUCHER_ALL_COURSES_ID
                        ? {
                            paymentOptions: allVoucherPaymentOptions,
                          }
                        : voucherCourses.find((item) => item.id === nextCourseId);
                    setVoucherForm((current) => ({
                      ...current,
                      courseId: nextCourseId,
                      allowedPaymentOptionIds: course
                        ? course.paymentOptions.map((item) => item.id)
                        : [],
                    }));
                  }}
                  required
                >
                  <option value="">Selecione</option>
                  <option value={VOUCHER_ALL_COURSES_ID}>Todos os cursos</option>
                  {voucherCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="native-finance-voucher-option-item">
                <input
                  type="checkbox"
                  checked={voucherForm.appliesToEnrollmentFee}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      appliesToEnrollmentFee: event.target.checked,
                    }))
                  }
                />
                <span>Aplicar desconto também na matrícula</span>
              </label>

              <label>
                Código (opcional)
                <input
                  value={voucherForm.code}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      code: event.target.value
                        .toUpperCase()
                        .replace(/\s+/g, '')
                        .replace(/[^A-Z0-9_-]/g, ''),
                    }))
                  }
                  maxLength={40}
                  placeholder="Deixe vazio para gerar automático"
                />
              </label>

              <label>
                Título (opcional)
                <input
                  value={voucherForm.title}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  maxLength={120}
                  placeholder="Ex.: Campanha abril"
                />
              </label>

              <label>
                Tipo de desconto
                <select
                  value={voucherForm.discountType}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      discountType: event.target.value as VoucherFormState['discountType'],
                    }))
                  }
                >
                  <option value="PERCENT">Percentual (%)</option>
                  <option value="FIXED">Valor (R$)</option>
                </select>
              </label>

              <label>
                Valor do desconto
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={voucherForm.discountValue}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      discountValue: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Aplicar em
                <select
                  value={voucherForm.appliesTo}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      appliesTo: event.target.value as VoucherFormState['appliesTo'],
                      installmentScope:
                        event.target.value === 'INSTALLMENT'
                          ? current.installmentScope
                          : 'ALL',
                    }))
                  }
                >
                  <option value="INSTALLMENT">Mensalidade</option>
                  <option value="TOTAL">Curso inteiro</option>
                </select>
              </label>

              {voucherForm.appliesTo === 'INSTALLMENT' ? (
                <label>
                  Escopo da mensalidade
                  <select
                    value={voucherForm.installmentScope}
                    onChange={(event) =>
                      setVoucherForm((current) => ({
                        ...current,
                        installmentScope:
                          event.target.value as VoucherFormState['installmentScope'],
                      }))
                    }
                  >
                    <option value="ALL">Todas as mensalidades</option>
                    <option value="SINGLE">Uma mensalidade</option>
                  </select>
                </label>
              ) : null}

              <label>
                Limite de uso (opcional)
                <input
                  type="number"
                  step={1}
                  min={1}
                  value={voucherForm.maxUses}
                  onChange={(event) =>
                    setVoucherForm((current) => ({
                      ...current,
                      maxUses: event.target.value.replace(/[^\d]/g, ''),
                    }))
                  }
                  placeholder="Ex.: 5"
                />
              </label>

              {selectedVoucherCourse ? (
                <fieldset className="native-finance-voucher-options">
                  <legend>Opções de pagamento permitidas</legend>
                  {selectedVoucherCourse.paymentOptions.map((option) => {
                    const checked = voucherForm.allowedPaymentOptionIds.includes(option.id);
                    return (
                      <label key={option.id} className="native-finance-voucher-option-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const shouldInclude = event.target.checked;
                            setVoucherForm((current) => {
                              const currentIds = new Set(current.allowedPaymentOptionIds);
                              if (shouldInclude) {
                                currentIds.add(option.id);
                              } else {
                                currentIds.delete(option.id);
                              }
                              return {
                                ...current,
                                allowedPaymentOptionIds: Array.from(currentIds),
                              };
                            });
                          }}
                        />
                        <span>
                          {option.title} ({paymentMethodLabel(option.method)})
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}

              {isAllCoursesVoucher ? (
                <p className="native-info">
                  O voucher valerá para qualquer curso.
                </p>
              ) : null}

              <p className="native-info">
                Voucher não acumula com desconto promocional. Quando aplicado, o desconto é
                calculado sobre o valor original do curso.
              </p>

              {voucherFormError ? <p className="native-error">{voucherFormError}</p> : null}

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setVoucherModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={voucherSubmitting}>
                  {voucherSubmitting ? 'Salvando...' : 'Criar voucher'}
                </button>
              </div>
            </form>
          </section>
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
