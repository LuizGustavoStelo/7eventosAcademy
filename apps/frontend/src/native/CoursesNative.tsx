import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest, formatCurrency } from './api';


type CourseStatus = 'ACTIVE' | 'DRAFT' | 'INACTIVE';
type CourseModality = 'PRESENTIAL' | 'HYBRID' | 'EAD';
type CoursePaymentModel = 'CASH' | 'INSTALLMENTS';
type InstallmentStartMode = 'ON_ENROLLMENT' | 'SCHEDULED';
type CoursePaymentOptionMethod = 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD';
type CoursePaymentOptionType = 'CASH' | 'INSTALLMENTS';

type CoursePaymentOption = {
  id?: string | null;
  title?: string | null;
  method?: CoursePaymentOptionMethod | null;
  type?: CoursePaymentOptionType | null;
  totalAmount?: number | null;
  installmentCount?: number | null;
  installmentAmount?: number | null;
  dueDay?: number | null;
  note?: string | null;
  isPromotional?: boolean | null;
  promotionalSlots?: number | null;
  active?: boolean | null;
};

type CoursePaymentOptionForm = {
  id: string;
  title: string;
  method: CoursePaymentOptionMethod;
  type: CoursePaymentOptionType;
  totalAmount: string;
  installmentCount: string;
  installmentAmount: string;
  dueDay: string;
  note: string;
  isPromotional: boolean;
  promotionalSlots: string;
  active: boolean;
};

type Course = {
  id: string;
  name: string;
  description?: string | null;
  workloadHours?: number | null;
  category?: string | null;
  coordinator?: string | null;
  price?: number | null;
  modality?: CourseModality | null;
  status?: CourseStatus | null;
  paymentModel?: CoursePaymentModel | null;
  enrollmentFee?: number | null;
  installmentMonths?: number | null;
  installmentValue?: number | null;
  installmentStartDate?: string | null;
  paymentOptions?: CoursePaymentOption[] | null;
  bannerUrl?: string | null;
  enrolledStudentsCount?: number;
};

type CourseFormState = {
  id: string;
  name: string;
  description: string;
  workloadHours: string;
  category: string;
  coordinator: string;
  price: string;
  modality: CourseModality;
  status: CourseStatus;
  paymentModel: CoursePaymentModel;
  hasEnrollmentFee: boolean;
  enrollmentFee: string;
  installmentMonths: string;
  installmentValue: string;
  installmentStartMode: InstallmentStartMode;
  installmentStartDate: string;
  paymentOptions: CoursePaymentOptionForm[];
};

type CourseBannerUploadResponse = {
  courseId: string;
  bannerAssetId: string;
  bannerUrl: string;
};

type CoursesNativeProps = {
  token: string;
};

const FALLBACK_BANNER =
  'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80';

const statusLabel: Record<CourseStatus, string> = {
  ACTIVE: 'Ativo',
  DRAFT: 'Rascunho',
  INACTIVE: 'Inativo',
};

const modalityLabel: Record<CourseModality, string> = {
  PRESENTIAL: 'Presencial',
  HYBRID: 'HÃ­brido',
  EAD: 'EAD',
};

const paymentLabel: Record<CoursePaymentModel, string> = {
  CASH: 'Pagamento à vista',
  INSTALLMENTS: 'Mensalidades',
};

const paymentMethodLabel: Record<CoursePaymentOptionMethod, string> = {
  PIX: 'Pix',
  BANK_SLIP: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
};

const paymentTypeLabel: Record<CoursePaymentOptionType, string> = {
  CASH: 'À vista',
  INSTALLMENTS: 'Parcelado',
};

function createPaymentOptionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `payment-option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPaymentOptionForm(
  input?: Partial<CoursePaymentOptionForm>,
): CoursePaymentOptionForm {
  return {
    id: input?.id || createPaymentOptionId(),
    title: input?.title || '',
    method: input?.method || 'PIX',
    type: input?.type || 'CASH',
    totalAmount: input?.totalAmount || '0',
    installmentCount: input?.installmentCount || '12',
    installmentAmount: input?.installmentAmount || '0',
    dueDay: input?.dueDay || '',
    note: input?.note || '',
    isPromotional: input?.isPromotional || false,
    promotionalSlots: input?.promotionalSlots || '20',
    active: input?.active !== false,
  };
}

function normalizeCoursePaymentOptions(
  options?: CoursePaymentOption[] | null,
): CoursePaymentOption[] {
  if (!Array.isArray(options)) return [];

  return options
    .filter((option) => Boolean(option))
    .map((option, index) => {
      const type = option.type === 'INSTALLMENTS' ? 'INSTALLMENTS' : 'CASH';
      const totalAmount = Number(option.totalAmount || 0);
      const installmentCount =
        type === 'INSTALLMENTS'
          ? Math.max(1, Number(option.installmentCount || 1))
          : null;
      const installmentAmount =
        type === 'INSTALLMENTS'
          ? Number(option.installmentAmount || 0) ||
            (totalAmount > 0 && installmentCount ? totalAmount / installmentCount : 0)
          : null;

      return {
        id: option.id || `payment-option-${index + 1}`,
        title: option.title || '',
        method: option.method || 'PIX',
        type,
        totalAmount,
        installmentCount,
        installmentAmount,
        dueDay: option.dueDay ?? null,
        note: option.note || '',
        isPromotional: Boolean(option.isPromotional),
        promotionalSlots: option.promotionalSlots ?? null,
        active: option.active !== false,
      };
    });
}

function formatPaymentOptionLabel(option: {
  method?: CoursePaymentOptionMethod | null;
  type?: CoursePaymentOptionType | null;
  totalAmount?: number | null;
  installmentCount?: number | null;
  installmentAmount?: number | null;
  isPromotional?: boolean | null;
  promotionalSlots?: number | null;
}) {
  const method = (option.method || 'PIX') as CoursePaymentOptionMethod;
  const type = (option.type || 'CASH') as CoursePaymentOptionType;
  const totalAmount = Number(option.totalAmount || 0);
  const installmentCount = Number(option.installmentCount || 0);
  const installmentAmount = Number(option.installmentAmount || 0);
  const promotionalSlots = Number(option.promotionalSlots || 0);
  const promoSuffix =
    option.isPromotional && promotionalSlots > 0
      ? ` • Promo (${promotionalSlots} primeiros)`
      : option.isPromotional
        ? ' • Promo'
        : '';

  if (type === 'INSTALLMENTS') {
    const safeCount = installmentCount > 0 ? installmentCount : 1;
    const safeInstallmentAmount =
      installmentAmount > 0
        ? installmentAmount
        : totalAmount > 0
          ? totalAmount / safeCount
          : 0;
    return `${paymentMethodLabel[method]} ${safeCount}x de ${formatCurrency(safeInstallmentAmount)}${promoSuffix}`;
  }

  return `${paymentMethodLabel[method]} à vista ${formatCurrency(totalAmount)}${promoSuffix}`;
}

function buildLegacyPaymentOptionFromCourse(course: Course): CoursePaymentOption {
  const price = Number(course.price || 0);
  const paymentModel = (course.paymentModel as CoursePaymentModel) || 'CASH';
  if (paymentModel === 'INSTALLMENTS') {
    const installmentCount = Math.max(1, Number(course.installmentMonths || 1));
    const installmentAmount =
      Number(course.installmentValue || 0) ||
      (price > 0 ? price / installmentCount : 0);

    return {
      id: 'legacy-installments',
      title: `${installmentCount}x (Boleto)`,
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: price > 0 ? price : installmentAmount * installmentCount,
      installmentCount,
      installmentAmount,
      isPromotional: false,
      active: true,
    };
  }

  return {
    id: 'legacy-cash',
    title: 'À vista (Pix)',
    method: 'PIX',
    type: 'CASH',
    totalAmount: price,
    isPromotional: false,
    active: true,
  };
}

function buildPdfTemplatePaymentOptions(): CoursePaymentOptionForm[] {
  return [
    createPaymentOptionForm({
      title: 'À vista (tabela padrão)',
      method: 'PIX',
      type: 'CASH',
      totalAmount: '11760',
    }),
    createPaymentOptionForm({
      title: 'Boleto 12x (venc. dia 10)',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '13824',
      installmentCount: '12',
      installmentAmount: '1152',
      dueDay: '10',
    }),
    createPaymentOptionForm({
      title: 'Boleto 12x (dia 7 com CRF ativo)',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '13404',
      installmentCount: '12',
      installmentAmount: '1117',
      dueDay: '7',
      note: 'Valor para pagamento no dia 7 com CRF ativo.',
    }),
    createPaymentOptionForm({
      title: 'Boleto 18x (venc. dia 10)',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '15208.38',
      installmentCount: '18',
      installmentAmount: '844.91',
      dueDay: '10',
    }),
    createPaymentOptionForm({
      title: 'Boleto 18x (dia 7 com CRF ativo)',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '14752.08',
      installmentCount: '18',
      installmentAmount: '819.56',
      dueDay: '7',
      note: 'Valor para pagamento no dia 7 com CRF ativo.',
    }),
    createPaymentOptionForm({
      title: 'Cartão de crédito 12x',
      method: 'CREDIT_CARD',
      type: 'INSTALLMENTS',
      totalAmount: '12504',
      installmentCount: '12',
      installmentAmount: '1042',
    }),
    createPaymentOptionForm({
      title: 'Promoção (20 primeiros) - À vista',
      method: 'PIX',
      type: 'CASH',
      totalAmount: '9996',
      isPromotional: true,
      promotionalSlots: '20',
    }),
    createPaymentOptionForm({
      title: 'Promoção (20 primeiros) - Boleto 12x dia 10',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '11760',
      installmentCount: '12',
      installmentAmount: '980',
      dueDay: '10',
      isPromotional: true,
      promotionalSlots: '20',
    }),
    createPaymentOptionForm({
      title: 'Promoção (20 primeiros) - Boleto 12x dia 7 CRF ativo',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '11400',
      installmentCount: '12',
      installmentAmount: '950',
      dueDay: '7',
      isPromotional: true,
      promotionalSlots: '20',
      note: 'Valor para pagamento no dia 7 com CRF ativo.',
    }),
    createPaymentOptionForm({
      title: 'Promoção (20 primeiros) - Boleto 18x dia 10',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '12924',
      installmentCount: '18',
      installmentAmount: '718',
      dueDay: '10',
      isPromotional: true,
      promotionalSlots: '20',
    }),
    createPaymentOptionForm({
      title: 'Promoção (20 primeiros) - Boleto 18x dia 7 CRF ativo',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '12546',
      installmentCount: '18',
      installmentAmount: '697',
      dueDay: '7',
      isPromotional: true,
      promotionalSlots: '20',
      note: 'Valor para pagamento no dia 7 com CRF ativo.',
    }),
    createPaymentOptionForm({
      title: 'Promoção (20 primeiros) - Cartão 12x',
      method: 'CREDIT_CARD',
      type: 'INSTALLMENTS',
      totalAmount: '10800',
      installmentCount: '12',
      installmentAmount: '900',
      isPromotional: true,
      promotionalSlots: '20',
    }),
  ];
}

function emptyForm(): CourseFormState {
  return {
    id: '',
    name: '',
    description: '',
    workloadHours: '1',
    category: '',
    coordinator: '',
    price: '0',
    modality: 'PRESENTIAL',
    status: 'ACTIVE',
    paymentModel: 'CASH',
    hasEnrollmentFee: false,
    enrollmentFee: '0',
    installmentMonths: '12',
    installmentValue: '0',
    installmentStartMode: 'ON_ENROLLMENT',
    installmentStartDate: '',
    paymentOptions: [
      createPaymentOptionForm({
        title: 'À vista (Pix)',
        method: 'PIX',
        type: 'CASH',
      }),
    ],
  };
}

function statusTone(status: CourseStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'is-success';
    case 'DRAFT':
      return 'is-warning';
    case 'INACTIVE':
      return 'is-muted';
    default:
      return 'is-neutral';
  }
}

function parseIntSafe(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const integer = Math.trunc(parsed);
  return integer > 0 ? integer : undefined;
}

function parseNumberSafe(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed >= 0 ? parsed : undefined;
}

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value?: string | null): string {
  if (!value) return 'Na matrÃ­cula';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Na matrÃ­cula';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

function sanitizeOnlyLetters(value: string): string {
  return value
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/g, '');
}

function mapCoursePaymentOptionToForm(
  option: CoursePaymentOption,
): CoursePaymentOptionForm {
  const type =
    option.type === 'INSTALLMENTS' ? 'INSTALLMENTS' : 'CASH';
  const totalAmount = Number(option.totalAmount || 0);
  const installmentCount =
    type === 'INSTALLMENTS' ? Math.max(1, Number(option.installmentCount || 1)) : 1;
  const installmentAmount =
    type === 'INSTALLMENTS'
      ? Number(option.installmentAmount || 0) ||
        (totalAmount > 0 ? totalAmount / installmentCount : 0)
      : 0;

  return createPaymentOptionForm({
    id: option.id || undefined,
    title: option.title || '',
    method: (option.method as CoursePaymentOptionMethod) || 'PIX',
    type,
    totalAmount: String(totalAmount),
    installmentCount: String(installmentCount),
    installmentAmount: String(installmentAmount),
    dueDay: option.dueDay ? String(option.dueDay) : '',
    note: option.note || '',
    isPromotional: Boolean(option.isPromotional),
    promotionalSlots: option.promotionalSlots
      ? String(option.promotionalSlots)
      : '20',
    active: option.active !== false,
  });
}

function mapCoursePaymentOptionsToForm(course: Course): CoursePaymentOptionForm[] {
  const normalized = normalizeCoursePaymentOptions(course.paymentOptions);
  const source = normalized.length > 0 ? normalized : [buildLegacyPaymentOptionFromCourse(course)];
  return source.map((option) => mapCoursePaymentOptionToForm(option));
}

export function CoursesNative({ token }: CoursesNativeProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [form, setForm] = useState<CourseFormState>(() => emptyForm());
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(null);
  const [previewBannerUrl, setPreviewBannerUrl] = useState(FALLBACK_BANNER);

  const loadCourses = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = await apiRequest<Course[]>(token, '/courses');
      setCourses(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar cursos.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses(true);
  }, [token]);

  useEffect(() => {
    if (!selectedBannerFile) return undefined;

    const objectUrl = URL.createObjectURL(selectedBannerFile);
    setPreviewBannerUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedBannerFile]);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;

    return courses.filter((course) => {
      const name = course.name?.toLowerCase() ?? '';
      const category = course.category?.toLowerCase() ?? '';
      const coordinator = course.coordinator?.toLowerCase() ?? '';
      const description = course.description?.toLowerCase() ?? '';

      return (
        name.includes(query) ||
        category.includes(query) ||
        coordinator.includes(query) ||
        description.includes(query)
      );
    });
  }, [courses, search]);

  const updateForm = <K extends keyof CourseFormState>(
    key: K,
    value: CourseFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreateModal = () => {
    setForm(emptyForm());
    setPreviewBannerUrl(FALLBACK_BANNER);
    setSelectedBannerFile(null);
    setFormError('');
    setDeleteConfirm(false);
    setModalOpen(true);
  };

  const openEditModal = (course: Course) => {
    const price = Number(course.price || 0);
    const months = Number(course.installmentMonths || 12);
    const installmentValue =
      Number(course.installmentValue || 0) ||
      (months > 0 ? price / months : 0);
    const enrollmentFee = Number(course.enrollmentFee || 0);
    const installmentStartDate = toDateInputValue(course.installmentStartDate);
    const paymentOptions = mapCoursePaymentOptionsToForm(course);

    setForm({
      id: course.id,
      name: course.name || '',
      description: course.description || '',
      workloadHours: String(Number(course.workloadHours || 1)),
      category: course.category || '',
      coordinator: course.coordinator || '',
      price: String(price),
      modality: (course.modality as CourseModality) || 'PRESENTIAL',
      status: (course.status as CourseStatus) || 'ACTIVE',
      paymentModel: (course.paymentModel as CoursePaymentModel) || 'CASH',
      hasEnrollmentFee: enrollmentFee > 0,
      enrollmentFee: String(enrollmentFee),
      installmentMonths: String(Math.max(1, months)),
      installmentValue: String(installmentValue),
      installmentStartMode: installmentStartDate ? 'SCHEDULED' : 'ON_ENROLLMENT',
      installmentStartDate,
      paymentOptions,
    });
    setPreviewBannerUrl(course.bannerUrl || FALLBACK_BANNER);
    setSelectedBannerFile(null);
    setFormError('');
    setDeleteConfirm(false);
    setModalOpen(true);
  };

  const onBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedBannerFile(file);
    if (!file) {
      setPreviewBannerUrl(FALLBACK_BANNER);
      return;
    }
  };

  const recalculateInstallment = (priceValue: string, monthsValue: string) => {
    if (form.paymentModel !== 'INSTALLMENTS') return;

    const price = parseNumberSafe(priceValue) ?? 0;
    const months = parseIntSafe(monthsValue) ?? 1;
    const installment = months > 0 ? price / months : 0;
    updateForm('installmentValue', installment.toFixed(2));
  };

  const updatePaymentOption = <K extends keyof CoursePaymentOptionForm>(
    optionId: string,
    key: K,
    value: CoursePaymentOptionForm[K],
  ) => {
    setForm((current) => ({
      ...current,
      paymentOptions: current.paymentOptions.map((option) =>
        option.id === optionId ? { ...option, [key]: value } : option,
      ),
    }));
  };

  const recalculatePaymentOptionInstallment = (
    optionId: string,
    totalAmountValue: string,
    installmentCountValue: string,
  ) => {
    const totalAmount = parseNumberSafe(totalAmountValue) ?? 0;
    const installmentCount = parseIntSafe(installmentCountValue) ?? 1;
    const installmentAmount =
      installmentCount > 0 ? totalAmount / installmentCount : 0;
    updatePaymentOption(optionId, 'installmentAmount', installmentAmount.toFixed(2));
  };

  const addPaymentOption = (type: CoursePaymentOptionType = 'CASH') => {
    setForm((current) => ({
      ...current,
      paymentOptions: [
        ...current.paymentOptions,
        createPaymentOptionForm({
          type,
          method: type === 'INSTALLMENTS' ? 'BANK_SLIP' : 'PIX',
          title: type === 'INSTALLMENTS' ? 'Nova opção parcelada' : 'Nova opção à vista',
        }),
      ],
    }));
  };

  const removePaymentOption = (optionId: string) => {
    setForm((current) => {
      const remaining = current.paymentOptions.filter((option) => option.id !== optionId);
      return {
        ...current,
        paymentOptions:
          remaining.length > 0
            ? remaining
            : [
                createPaymentOptionForm({
                  title: 'À vista (Pix)',
                  method: 'PIX',
                  type: 'CASH',
                }),
              ],
      };
    });
  };

  const applyPdfTemplate = () => {
    setForm((current) => ({
      ...current,
      price: '11760',
      paymentModel: 'INSTALLMENTS',
      installmentMonths: '12',
      installmentValue: '1152',
      installmentStartMode: 'ON_ENROLLMENT',
      installmentStartDate: '',
      hasEnrollmentFee: true,
      enrollmentFee: '450',
      paymentOptions: buildPdfTemplatePaymentOptions(),
    }));
  };

  const uploadBanner = async (courseId: string, file: File) => {
    const body = new FormData();
    body.append('banner', file);
    await apiRequest<CourseBannerUploadResponse>(token, `/courses/${courseId}/banner`, {
      method: 'POST',
      body,
    });
  };

  const saveCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setError('');
    setFeedback('');

    const cleanName = sanitizeOnlyLetters(form.name).trim();
    const cleanCategory = sanitizeOnlyLetters(form.category).trim();
    const cleanCoordinator = sanitizeOnlyLetters(form.coordinator).trim();

    const payloadBase = {
      name: cleanName,
      description: form.description.trim() || undefined,
      workloadHours: parseIntSafe(form.workloadHours),
      category: cleanCategory || undefined,
      coordinator: cleanCoordinator || undefined,
      price: parseNumberSafe(form.price),
      enrollmentFee: form.hasEnrollmentFee
        ? parseNumberSafe(form.enrollmentFee)
        : 0,
      modality: form.modality,
      status: form.status,
      paymentModel: form.paymentModel,
    };

    if (!payloadBase.name || !payloadBase.category || !payloadBase.coordinator) {
      setFormError('Preencha nome, categoria e coordenador/professor.');
      return;
    }

    if (!payloadBase.workloadHours) {
      setFormError('Informe uma carga horÃ¡ria vÃ¡lida.');
      return;
    }

    if (payloadBase.price === undefined) {
      setFormError('Informe um valor total vÃ¡lido.');
      return;
    }

    if (form.hasEnrollmentFee && payloadBase.enrollmentFee === undefined) {
      setFormError('Informe um valor de matrÃ­cula vÃ¡lido.');
      return;
    }

    const installments =
      form.paymentModel === 'INSTALLMENTS'
        ? {
            installmentMonths: parseIntSafe(form.installmentMonths),
            installmentValue: parseNumberSafe(form.installmentValue),
            installmentStartDate:
              form.installmentStartMode === 'SCHEDULED'
                ? form.installmentStartDate
                  ? `${form.installmentStartDate}T00:00:00.000Z`
                  : undefined
                : null,
          }
        : {
            installmentMonths: undefined,
            installmentValue: undefined,
            installmentStartDate: undefined,
          };

    if (form.paymentModel === 'INSTALLMENTS' && !installments.installmentMonths) {
      setFormError('Informe a duraÃ§Ã£o das mensalidades em meses.');
      return;
    }

    if (
      form.paymentModel === 'INSTALLMENTS' &&
      form.installmentStartMode === 'SCHEDULED' &&
      !form.installmentStartDate
    ) {
      setFormError('Informe a data de inÃ­cio das mensalidades.');
      return;
    }

    const paymentOptionsPayload: Array<{
      id: string;
      title: string;
      method: CoursePaymentOptionMethod;
      type: CoursePaymentOptionType;
      totalAmount: number;
      installmentCount?: number;
      installmentAmount?: number;
      dueDay?: number;
      note?: string;
      isPromotional: boolean;
      promotionalSlots?: number;
      active: boolean;
    }> = [];

    for (let index = 0; index < form.paymentOptions.length; index += 1) {
      const option = form.paymentOptions[index];
      const totalAmount = parseNumberSafe(option.totalAmount);
      if (totalAmount === undefined) {
        setFormError(`Informe o valor total da opção de pagamento ${index + 1}.`);
        return;
      }

      const payloadOption: {
        id: string;
        title: string;
        method: CoursePaymentOptionMethod;
        type: CoursePaymentOptionType;
        totalAmount: number;
        installmentCount?: number;
        installmentAmount?: number;
        dueDay?: number;
        note?: string;
        isPromotional: boolean;
        promotionalSlots?: number;
        active: boolean;
      } = {
        id: option.id,
        title: option.title.trim() || `Opção ${index + 1}`,
        method: option.method,
        type: option.type,
        totalAmount,
        isPromotional: option.isPromotional,
        active: option.active,
      };

      if (option.type === 'INSTALLMENTS') {
        const installmentCount = parseIntSafe(option.installmentCount);
        if (!installmentCount) {
          setFormError(`Informe o número de parcelas da opção ${index + 1}.`);
          return;
        }

        const installmentAmount =
          parseNumberSafe(option.installmentAmount) ?? totalAmount / installmentCount;
        payloadOption.installmentCount = installmentCount;
        payloadOption.installmentAmount = installmentAmount;
      }

      if (option.dueDay.trim()) {
        const dueDay = parseIntSafe(option.dueDay);
        if (!dueDay || dueDay < 1 || dueDay > 31) {
          setFormError(`Informe um dia de vencimento válido na opção ${index + 1}.`);
          return;
        }
        payloadOption.dueDay = dueDay;
      }

      if (option.isPromotional) {
        const promotionalSlots = parseIntSafe(option.promotionalSlots) ?? 20;
        if (!promotionalSlots) {
          setFormError(`Informe a quantidade promocional da opção ${index + 1}.`);
          return;
        }
        payloadOption.promotionalSlots = promotionalSlots;
      }

      if (option.note.trim()) {
        payloadOption.note = option.note.trim();
      }

      paymentOptionsPayload.push(payloadOption);
    }

    if (paymentOptionsPayload.length === 0) {
      setFormError('Configure pelo menos uma opção de pagamento.');
      return;
    }

    if (!paymentOptionsPayload.some((option) => option.active)) {
      setFormError('Mantenha ao menos uma opção de pagamento marcada como disponível.');
      return;
    }

    setSaving(true);
    try {
      let courseId = form.id;
      const payload = {
        ...payloadBase,
        ...installments,
        paymentOptions: paymentOptionsPayload,
      };

      if (form.id) {
        await apiRequest<Course>(token, `/courses/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiRequest<Course>(token, '/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        courseId = created.id;
      }

      if (selectedBannerFile && courseId) {
        await uploadBanner(courseId, selectedBannerFile);
      }

      await loadCourses(false);
      setModalOpen(false);
      setForm(emptyForm());
      setSelectedBannerFile(null);
      setPreviewBannerUrl(FALLBACK_BANNER);
      setFeedback('Curso salvo com sucesso.');
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : 'Falha ao salvar curso.',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeCourse = async () => {
    if (!form.id) return;
    setSaving(true);
    setFormError('');
    setError('');
    setFeedback('');

    try {
      await apiRequest<{ success: boolean }>(token, `/courses/${form.id}`, {
        method: 'DELETE',
      });
      await loadCourses(false);
      setModalOpen(false);
      setForm(emptyForm());
      setSelectedBannerFile(null);
      setPreviewBannerUrl(FALLBACK_BANNER);
      setDeleteConfirm(false);
      setFeedback('Curso excluÃ­do com sucesso.');
    } catch (removeError) {
      setFormError(
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao excluir curso.',
      );
    } finally {
      setSaving(false);
    }
  };

  const previewActivePaymentOptions = useMemo(
    () => form.paymentOptions.filter((option) => option.active),
    [form.paymentOptions],
  );

  const previewPayment = useMemo(() => {
    if (previewActivePaymentOptions.length > 0) {
      return `${previewActivePaymentOptions.length} opção(ões) de pagamento`;
    }
    if (form.paymentModel !== 'INSTALLMENTS') return paymentLabel.CASH;
    const months = parseIntSafe(form.installmentMonths) || 1;
    const installment = parseNumberSafe(form.installmentValue) || 0;
    return `${months}x de ${formatCurrency(installment)}`;
  }, [
    previewActivePaymentOptions,
    form.paymentModel,
    form.installmentMonths,
    form.installmentValue,
  ]);

  const previewPaymentLines = useMemo(
    () =>
      previewActivePaymentOptions
        .slice(0, 4)
        .map((option) =>
          formatPaymentOptionLabel({
            method: option.method,
            type: option.type,
            totalAmount: parseNumberSafe(option.totalAmount) || 0,
            installmentCount: parseIntSafe(option.installmentCount) || 0,
            installmentAmount: parseNumberSafe(option.installmentAmount) || 0,
            isPromotional: option.isPromotional,
            promotionalSlots: parseIntSafe(option.promotionalSlots),
          }),
        ),
    [previewActivePaymentOptions],
  );

  const previewEnrollmentFee = useMemo(() => {
    if (!form.hasEnrollmentFee) return 'Sem matrÃ­cula';
    return formatCurrency(parseNumberSafe(form.enrollmentFee) || 0);
  }, [form.hasEnrollmentFee, form.enrollmentFee]);

  const previewInstallmentStart = useMemo(() => {
    if (form.paymentModel !== 'INSTALLMENTS') return '-';
    if (form.installmentStartMode !== 'SCHEDULED') return 'Na matrÃ­cula';
    if (!form.installmentStartDate) return 'Data nÃ£o definida';
    return formatDateLabel(form.installmentStartDate);
  }, [
    form.paymentModel,
    form.installmentStartMode,
    form.installmentStartDate,
  ]);

  return (
    <section className="native-page native-courses">
      <header className="native-page-header">
        <h2>GestÃ£o de cursos</h2>
        <p>
          CatÃ¡logo acadÃªmico nativo com ediÃ§Ã£o de preÃ§os, modalidade, pagamento e
          banner.
        </p>
      </header>

      <div className="native-toolbar">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por curso, categoria ou coordenador..."
        />
      </div>

      {loading ? <p className="native-info">Carregando cursos...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading ? (
        <div className="native-courses-grid">
          {filteredCourses.length === 0 ? (
            <article className="native-panel native-course-empty">
              <p className="native-info">Nenhum curso encontrado.</p>
            </article>
          ) : (
            filteredCourses.map((course) => {
              const status = (course.status as CourseStatus) || 'ACTIVE';
              const modality = (course.modality as CourseModality) || 'PRESENTIAL';
              const paymentModel =
                (course.paymentModel as CoursePaymentModel) || 'CASH';
              const normalizedPaymentOptions = normalizeCoursePaymentOptions(
                course.paymentOptions,
              );
              const availablePaymentOptions =
                normalizedPaymentOptions.length > 0
                  ? normalizedPaymentOptions
                  : [buildLegacyPaymentOptionFromCourse(course)];
              const activePaymentOptions = availablePaymentOptions.filter(
                (option) => option.active !== false,
              );
              const paymentSummary =
                activePaymentOptions.length > 0
                  ? activePaymentOptions
                      .slice(0, 2)
                      .map((option) => formatPaymentOptionLabel(option))
                      .join(' • ')
                  : paymentModel === 'INSTALLMENTS'
                    ? `${course.installmentMonths || 1}x de ${formatCurrency(
                        Number(course.installmentValue || 0),
                      )}`
                    : 'À vista';
              const paymentSummaryExtra =
                activePaymentOptions.length > 2
                  ? ` +${activePaymentOptions.length - 2} opções`
                  : '';
              const enrollmentFeeSummary =
                Number(course.enrollmentFee || 0) > 0
                  ? formatCurrency(Number(course.enrollmentFee || 0))
                  : 'Sem matrÃ­cula';
              const installmentStartSummary =
                paymentModel === 'INSTALLMENTS'
                  ? formatDateLabel(course.installmentStartDate)
                  : '-';

              return (
                <article key={course.id} className="native-course-card">
                  <img
                    src={course.bannerUrl || FALLBACK_BANNER}
                    alt={`Banner do curso ${course.name}`}
                  />
                  <div className="native-course-card-body">
                    <div className="native-course-card-head">
                      <h3>{course.name}</h3>
                      <span className={`native-status-chip ${statusTone(status)}`}>
                        {statusLabel[status]}
                      </span>
                    </div>

                    <p>{course.description || 'Sem descriÃ§Ã£o cadastrada.'}</p>

                    <div className="native-course-meta">
                      <small>
                        Categoria: <strong>{course.category || '-'}</strong>
                      </small>
                      <small>
                        Modalidade: <strong>{modalityLabel[modality]}</strong>
                      </small>
                      <small>
                        Carga horÃ¡ria:{' '}
                        <strong>{Number(course.workloadHours || 0)}h</strong>
                      </small>
                      <small>
                        Valor total:{' '}
                        <strong>{formatCurrency(Number(course.price || 0))}</strong>
                      </small>
                      <small className="full">
                        Pagamento: <strong>{paymentSummary}{paymentSummaryExtra}</strong>
                      </small>
                      <small className="full">
                        MatrÃ­cula: <strong>{enrollmentFeeSummary}</strong>
                      </small>
                      <small className="full">
                        InÃ­cio mensalidades:{' '}
                        <strong>{installmentStartSummary}</strong>
                      </small>
                      <small className="full">
                        Alunos matriculados:{' '}
                        <strong>{Number(course.enrolledStudentsCount ?? 0)}</strong>
                      </small>
                    </div>

                    <button type="button" onClick={() => openEditModal(course)}>
                      Editar curso
                    </button>
                  </div>
                </article>
              );
            })
          )}

          <button
            type="button"
            className="native-course-card native-course-card-add"
            onClick={openCreateModal}
          >
            <span className="native-course-card-add-icon" aria-hidden="true">
              +
            </span>
            <strong>Adicionar curso</strong>
          </button>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setModalOpen(false)}>
          <section className="native-modal native-course-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{form.id ? 'Editar curso' : 'Novo curso acadÃªmico'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                Fechar
              </button>
            </header>

            <div className="native-course-modal-grid">
              <form className="native-form-grid native-course-form" onSubmit={saveCourse}>
                <label className="native-banner-picker">
                  Banner principal
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onBannerChange}
                  />
                </label>

                <label>
                  Nome do curso
                  <input
                    value={form.name}
                    onChange={(event) =>
                      updateForm('name', sanitizeOnlyLetters(event.target.value))
                    }
                    required
                  />
                </label>

                <label>
                  Categoria
                  <input
                    value={form.category}
                    onChange={(event) =>
                      updateForm('category', sanitizeOnlyLetters(event.target.value))
                    }
                    required
                  />
                </label>

                <label>
                  Coordenador / Professor
                  <input
                    value={form.coordinator}
                    onChange={(event) =>
                      updateForm('coordinator', sanitizeOnlyLetters(event.target.value))
                    }
                    required
                  />
                </label>

                <label>
                  Carga horÃ¡ria (horas)
                  <input
                    type="number"
                    min={1}
                    value={form.workloadHours}
                    onChange={(event) => updateForm('workloadHours', event.target.value)}
                    required
                  />
                </label>

                <label>
                  Valor total do curso (R$)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(event) => {
                      updateForm('price', event.target.value);
                      recalculateInstallment(event.target.value, form.installmentMonths);
                    }}
                    required
                  />
                </label>

                <label>
                  Cobrar matrÃ­cula
                  <select
                    value={form.hasEnrollmentFee ? 'YES' : 'NO'}
                    onChange={(event) =>
                      updateForm('hasEnrollmentFee', event.target.value === 'YES')
                    }
                  >
                    <option value="NO">NÃ£o</option>
                    <option value="YES">Sim</option>
                  </select>
                </label>

                {form.hasEnrollmentFee ? (
                  <label>
                    Valor da matrÃ­cula (R$)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.enrollmentFee}
                      onChange={(event) =>
                        updateForm('enrollmentFee', event.target.value)
                      }
                    />
                  </label>
                ) : null}

                <label>
                  Modelo de cobrança operacional
                  <select
                    value={form.paymentModel}
                    onChange={(event) => {
                      const next = event.target.value as CoursePaymentModel;
                      updateForm('paymentModel', next);
                      if (next === 'INSTALLMENTS') {
                        recalculateInstallment(form.price, form.installmentMonths);
                      }
                    }}
                  >
                    <option value="CASH">Pagamento à vista</option>
                    <option value="INSTALLMENTS">Mensalidades</option>
                  </select>
                  <small>
                    Esse bloco define a cobrança automática atual do sistema.
                  </small>
                </label>

                {form.paymentModel === 'INSTALLMENTS' ? (
                  <>
                    <label>
                      DuraÃ§Ã£o em meses
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={form.installmentMonths}
                        onChange={(event) => {
                          updateForm('installmentMonths', event.target.value);
                          recalculateInstallment(form.price, event.target.value);
                        }}
                      />
                    </label>

                    <label>
                      Valor da mensalidade (R$)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.installmentValue}
                        onChange={(event) =>
                          updateForm('installmentValue', event.target.value)
                        }
                      />
                    </label>

                    <label>
                      InÃ­cio das mensalidades
                      <select
                        value={form.installmentStartMode}
                        onChange={(event) =>
                          updateForm(
                            'installmentStartMode',
                            event.target.value as InstallmentStartMode,
                          )
                        }
                      >
                        <option value="ON_ENROLLMENT">Na matrÃ­cula</option>
                        <option value="SCHEDULED">Agendar inÃ­cio</option>
                      </select>
                    </label>

                    {form.installmentStartMode === 'SCHEDULED' ? (
                      <label>
                        Data de inÃ­cio das mensalidades
                        <input
                          type="date"
                          value={form.installmentStartDate}
                          onChange={(event) =>
                            updateForm('installmentStartDate', event.target.value)
                          }
                        />
                        <small>
                          Use este campo apenas quando o inÃ­cio das parcelas for
                          diferente da data da matrÃ­cula.
                        </small>
                      </label>
                    ) : null}
                  </>
                ) : null}

                <section className="native-payment-options-panel">
                  <header className="native-payment-options-head">
                    <div>
                      <strong>Condições comerciais do curso</strong>
                      <small>
                        Aqui você configura as opções que o aluno pode escolher
                        (à vista, boleto, cartão e promoções).
                      </small>
                    </div>
                    <div className="native-payment-options-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => addPaymentOption('CASH')}
                      >
                        + À vista
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => addPaymentOption('INSTALLMENTS')}
                      >
                        + Parcelado
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={applyPdfTemplate}
                      >
                        Aplicar tabela do PDF
                      </button>
                    </div>
                  </header>

                  <div className="native-payment-options-list">
                    {form.paymentOptions.map((option, index) => (
                      <article key={option.id} className="native-payment-option-card">
                        <div className="native-payment-option-card-head">
                          <strong>Opção {index + 1}</strong>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => removePaymentOption(option.id)}
                          >
                            Remover
                          </button>
                        </div>

                        <div className="native-payment-option-grid">
                          <label>
                            Nome da opção
                            <input
                              value={option.title}
                              onChange={(event) =>
                                updatePaymentOption(option.id, 'title', event.target.value)
                              }
                              placeholder="Ex.: Boleto 12x dia 10"
                            />
                          </label>

                          <label>
                            Forma de pagamento
                            <select
                              value={option.method}
                              onChange={(event) =>
                                updatePaymentOption(
                                  option.id,
                                  'method',
                                  event.target.value as CoursePaymentOptionMethod,
                                )
                              }
                            >
                              <option value="PIX">Pix</option>
                              <option value="BANK_SLIP">Boleto</option>
                              <option value="CREDIT_CARD">Cartão de crédito</option>
                            </select>
                          </label>

                          <label>
                            Tipo
                            <select
                              value={option.type}
                              onChange={(event) => {
                                const nextType = event.target.value as CoursePaymentOptionType;
                                updatePaymentOption(option.id, 'type', nextType);
                                if (nextType === 'INSTALLMENTS') {
                                  recalculatePaymentOptionInstallment(
                                    option.id,
                                    option.totalAmount,
                                    option.installmentCount,
                                  );
                                }
                              }}
                            >
                              <option value="CASH">{paymentTypeLabel.CASH}</option>
                              <option value="INSTALLMENTS">
                                {paymentTypeLabel.INSTALLMENTS}
                              </option>
                            </select>
                          </label>

                          <label>
                            Valor total (R$)
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={option.totalAmount}
                              onChange={(event) => {
                                updatePaymentOption(
                                  option.id,
                                  'totalAmount',
                                  event.target.value,
                                );
                                if (option.type === 'INSTALLMENTS') {
                                  recalculatePaymentOptionInstallment(
                                    option.id,
                                    event.target.value,
                                    option.installmentCount,
                                  );
                                }
                              }}
                            />
                          </label>

                          {option.type === 'INSTALLMENTS' ? (
                            <>
                              <label>
                                Parcelas
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={option.installmentCount}
                                  onChange={(event) => {
                                    updatePaymentOption(
                                      option.id,
                                      'installmentCount',
                                      event.target.value,
                                    );
                                    recalculatePaymentOptionInstallment(
                                      option.id,
                                      option.totalAmount,
                                      event.target.value,
                                    );
                                  }}
                                />
                              </label>

                              <label>
                                Valor da parcela (R$)
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={option.installmentAmount}
                                  onChange={(event) =>
                                    updatePaymentOption(
                                      option.id,
                                      'installmentAmount',
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>

                              <label>
                                Dia de vencimento
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  step={1}
                                  value={option.dueDay}
                                  onChange={(event) =>
                                    updatePaymentOption(option.id, 'dueDay', event.target.value)
                                  }
                                  placeholder="Ex.: 10"
                                />
                              </label>
                            </>
                          ) : null}

                          <label>
                            Disponível para matrícula
                            <select
                              value={option.active ? 'YES' : 'NO'}
                              onChange={(event) =>
                                updatePaymentOption(
                                  option.id,
                                  'active',
                                  event.target.value === 'YES',
                                )
                              }
                            >
                              <option value="YES">Sim</option>
                              <option value="NO">Não</option>
                            </select>
                          </label>

                          <label>
                            É opção promocional?
                            <select
                              value={option.isPromotional ? 'YES' : 'NO'}
                              onChange={(event) =>
                                updatePaymentOption(
                                  option.id,
                                  'isPromotional',
                                  event.target.value === 'YES',
                                )
                              }
                            >
                              <option value="NO">Não</option>
                              <option value="YES">Sim</option>
                            </select>
                          </label>

                          {option.isPromotional ? (
                            <label>
                              Limite de vagas promocionais
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={option.promotionalSlots}
                                onChange={(event) =>
                                  updatePaymentOption(
                                    option.id,
                                    'promotionalSlots',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          ) : null}

                          <label className="native-payment-option-field-full">
                            Observações / regra
                            <textarea
                              rows={2}
                              value={option.note}
                              onChange={(event) =>
                                updatePaymentOption(option.id, 'note', event.target.value)
                              }
                              placeholder="Ex.: Pagamento dia 7 com CRF ativo."
                            />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <label>
                  Modalidade
                  <select
                    value={form.modality}
                    onChange={(event) =>
                      updateForm('modality', event.target.value as CourseModality)
                    }
                  >
                    <option value="PRESENTIAL">Presencial</option>
                    <option value="HYBRID">HÃ­brido</option>
                    <option value="EAD">EAD</option>
                  </select>
                </label>

                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateForm('status', event.target.value as CourseStatus)
                    }
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="DRAFT">Rascunho</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </label>

                <label>
                  DescriÃ§Ã£o
                  <textarea
                    rows={6}
                    value={form.description}
                    onChange={(event) =>
                      updateForm('description', event.target.value)
                    }
                  />
                </label>

                {formError ? <p className="native-error">{formError}</p> : null}

                <div className="native-modal-actions">
                  {form.id ? (
                    <button
                      type="button"
                      className={deleteConfirm ? 'danger' : 'ghost'}
                      onClick={() => {
                        if (!deleteConfirm) {
                          setDeleteConfirm(true);
                          return;
                        }
                        void removeCourse();
                      }}
                      disabled={saving}
                    >
                      {deleteConfirm ? 'Confirmar exclusÃ£o' : 'Excluir curso'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar curso'}
                  </button>
                </div>
              </form>

              <aside className="native-course-preview">
                <h4>PrÃ©-visualizaÃ§Ã£o</h4>
                <article>
                  <img
                    src={previewBannerUrl || FALLBACK_BANNER}
                    alt="PrÃ©via do banner do curso"
                  />
                  <div>
                    <strong>{form.name || 'Curso'}</strong>
                    <small>{form.category || 'Categoria'}</small>
                    <p>{form.description || 'DescriÃ§Ã£o do curso.'}</p>
                    <div className="native-course-preview-meta">
                      <span>{parseIntSafe(form.workloadHours) || 0}h</span>
                      <span>{formatCurrency(parseNumberSafe(form.price) || 0)}</span>
                      <span>{modalityLabel[form.modality]}</span>
                      <span>{statusLabel[form.status]}</span>
                      <span>{previewPayment}</span>
                      {previewPaymentLines.map((line, index) => (
                        <span key={`${line}-${index}`} className="native-payment-preview-line">
                          {line}
                        </span>
                      ))}
                      {previewActivePaymentOptions.length > previewPaymentLines.length ? (
                        <span className="native-payment-preview-line">
                          +{previewActivePaymentOptions.length - previewPaymentLines.length} opção(ões)
                        </span>
                      ) : null}
                      <span>MatrÃ­cula: {previewEnrollmentFee}</span>
                      <span>InÃ­cio mensalidades: {previewInstallmentStart}</span>
                    </div>
                  </div>
                </article>
              </aside>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

