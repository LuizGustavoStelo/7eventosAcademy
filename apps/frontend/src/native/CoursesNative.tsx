import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest, formatCurrency } from './api';


type CourseStatus = 'ACTIVE' | 'DRAFT' | 'INACTIVE';
type CourseModality = 'PRESENTIAL' | 'HYBRID' | 'EAD';
type CoursePaymentModel = 'CASH' | 'INSTALLMENTS';
type InstallmentStartMode = 'ON_ENROLLMENT' | 'SCHEDULED';
type CoursePaymentOptionMethod = 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD';
type CoursePaymentOptionType = 'CASH' | 'INSTALLMENTS';
type CoursePaymentDiscountType = 'FIXED' | 'PERCENT';
type CoursePaymentDiscountAppliesTo = 'INSTALLMENT' | 'TOTAL';

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
  promotionalTotalAmount?: number | null;
  promotionalInstallmentAmount?: number | null;
  active?: boolean | null;
  discountEnabled?: boolean | null;
  discountTotalAmount?: number | null;
  discountInstallmentAmount?: number | null;
  discountType?: CoursePaymentDiscountType | null;
  discountValue?: number | null;
  discountDeadlineDay?: number | null;
  discountRequiresActiveCrf?: boolean | null;
  discountAppliesTo?: CoursePaymentDiscountAppliesTo | null;
  promotionalDiscountEnabled?: boolean | null;
  promotionalDiscountTotalAmount?: number | null;
  promotionalDiscountInstallmentAmount?: number | null;
  promotionalDiscountDeadlineDay?: number | null;
  promotionalDiscountRequiresActiveCrf?: boolean | null;
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
  promotionalTotalAmount: string;
  promotionalInstallmentAmount: string;
  active: boolean;
  discountEnabled: boolean;
  discountTotalAmount: string;
  discountInstallmentAmount: string;
  discountType: CoursePaymentDiscountType;
  discountValue: string;
  discountDeadlineDay: string;
  discountRequiresActiveCrf: boolean;
  discountAppliesTo: CoursePaymentDiscountAppliesTo;
  promotionalDiscountEnabled: boolean;
  promotionalDiscountTotalAmount: string;
  promotionalDiscountInstallmentAmount: string;
  promotionalDiscountDeadlineDay: string;
  promotionalDiscountRequiresActiveCrf: boolean;
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
  HYBRID: 'Híbrido',
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
    totalAmount: formatMoneyValue(input?.totalAmount) || '0,00',
    installmentCount: input?.installmentCount || '12',
    installmentAmount: formatMoneyValue(input?.installmentAmount) || '0,00',
    dueDay: input?.dueDay || '',
    note: input?.note || '',
    isPromotional: input?.isPromotional || false,
    promotionalSlots: input?.promotionalSlots || '20',
    promotionalTotalAmount: formatMoneyValue(input?.promotionalTotalAmount),
    promotionalInstallmentAmount: formatMoneyValue(input?.promotionalInstallmentAmount),
    active: input?.active !== false,
    discountEnabled: input?.discountEnabled || false,
    discountTotalAmount: formatMoneyValue(input?.discountTotalAmount),
    discountInstallmentAmount: formatMoneyValue(input?.discountInstallmentAmount),
    discountType: input?.discountType || 'FIXED',
    discountValue: input?.discountValue || '',
    discountDeadlineDay: input?.discountDeadlineDay || '',
    discountRequiresActiveCrf: input?.discountRequiresActiveCrf || false,
    discountAppliesTo: input?.discountAppliesTo || 'INSTALLMENT',
    promotionalDiscountEnabled: input?.promotionalDiscountEnabled || false,
    promotionalDiscountTotalAmount: formatMoneyValue(input?.promotionalDiscountTotalAmount),
    promotionalDiscountInstallmentAmount:
      formatMoneyValue(input?.promotionalDiscountInstallmentAmount),
    promotionalDiscountDeadlineDay: input?.promotionalDiscountDeadlineDay || '',
    promotionalDiscountRequiresActiveCrf:
      input?.promotionalDiscountRequiresActiveCrf || false,
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
        promotionalTotalAmount:
          option.isPromotional && Number(option.promotionalTotalAmount || 0) > 0
            ? Number(option.promotionalTotalAmount || 0)
            : null,
        promotionalInstallmentAmount:
          option.type === 'INSTALLMENTS' &&
          option.isPromotional &&
          Number(option.promotionalInstallmentAmount || 0) > 0
            ? Number(option.promotionalInstallmentAmount || 0)
            : null,
        active: option.active !== false,
        discountEnabled:
          Boolean(option.discountEnabled) &&
          (Number(option.discountTotalAmount || 0) > 0 ||
            Number(option.discountInstallmentAmount || 0) > 0 ||
            Number(option.discountValue || 0) > 0),
        discountTotalAmount:
          option.discountEnabled && Number(option.discountTotalAmount || 0) > 0
            ? Number(option.discountTotalAmount || 0)
            : null,
        discountInstallmentAmount:
          option.type === 'INSTALLMENTS' &&
          option.discountEnabled &&
          Number(option.discountInstallmentAmount || 0) > 0
            ? Number(option.discountInstallmentAmount || 0)
            : null,
        discountType:
          option.discountType === 'PERCENT' ? 'PERCENT' : 'FIXED',
        discountValue:
          option.discountEnabled && Number(option.discountValue || 0) > 0
            ? Number(option.discountValue || 0)
            : null,
        discountDeadlineDay: option.discountDeadlineDay ?? null,
        discountRequiresActiveCrf: Boolean(option.discountRequiresActiveCrf),
        discountAppliesTo:
          option.discountAppliesTo === 'TOTAL' ? 'TOTAL' : 'INSTALLMENT',
        promotionalDiscountEnabled:
          option.isPromotional &&
          Boolean(option.promotionalDiscountEnabled) &&
          (Number(option.promotionalDiscountTotalAmount || 0) > 0 ||
            Number(option.promotionalDiscountInstallmentAmount || 0) > 0),
        promotionalDiscountTotalAmount:
          option.isPromotional &&
          option.promotionalDiscountEnabled &&
          Number(option.promotionalDiscountTotalAmount || 0) > 0
            ? Number(option.promotionalDiscountTotalAmount || 0)
            : null,
        promotionalDiscountInstallmentAmount:
          option.type === 'INSTALLMENTS' &&
          option.isPromotional &&
          option.promotionalDiscountEnabled &&
          Number(option.promotionalDiscountInstallmentAmount || 0) > 0
            ? Number(option.promotionalDiscountInstallmentAmount || 0)
            : null,
        promotionalDiscountDeadlineDay:
          option.promotionalDiscountEnabled &&
          option.promotionalDiscountDeadlineDay
            ? Number(option.promotionalDiscountDeadlineDay)
            : null,
        promotionalDiscountRequiresActiveCrf: Boolean(
          option.promotionalDiscountRequiresActiveCrf,
        ),
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
  promotionalTotalAmount?: number | null;
  promotionalInstallmentAmount?: number | null;
  dueDay?: number | null;
  discountEnabled?: boolean | null;
  discountTotalAmount?: number | null;
  discountInstallmentAmount?: number | null;
  discountType?: CoursePaymentDiscountType | null;
  discountValue?: number | null;
  discountDeadlineDay?: number | null;
  discountRequiresActiveCrf?: boolean | null;
  discountAppliesTo?: CoursePaymentDiscountAppliesTo | null;
  promotionalDiscountEnabled?: boolean | null;
  promotionalDiscountTotalAmount?: number | null;
  promotionalDiscountInstallmentAmount?: number | null;
  promotionalDiscountDeadlineDay?: number | null;
  promotionalDiscountRequiresActiveCrf?: boolean | null;
}) {
  const method = (option.method || 'PIX') as CoursePaymentOptionMethod;
  const type = (option.type || 'CASH') as CoursePaymentOptionType;
  const totalAmount = Number(option.totalAmount || 0);
  const installmentCount = Number(option.installmentCount || 0);
  const installmentAmount = Number(option.installmentAmount || 0);
  const promotionalSlots = Number(option.promotionalSlots || 0);
  const promotionalTotalAmount = Number(option.promotionalTotalAmount || 0);
  const promotionalInstallmentAmount = Number(option.promotionalInstallmentAmount || 0);
  const discountEnabled = Boolean(option.discountEnabled);
  const discountTotalAmount = Number(option.discountTotalAmount || 0);
  const discountInstallmentAmount = Number(option.discountInstallmentAmount || 0);
  const discountDeadlineDay = Number(option.discountDeadlineDay || 0);
  const discountRequiresActiveCrf = Boolean(option.discountRequiresActiveCrf);
  const promotionalDiscountEnabled = Boolean(option.promotionalDiscountEnabled);
  const promotionalDiscountTotalAmount = Number(option.promotionalDiscountTotalAmount || 0);
  const promotionalDiscountInstallmentAmount = Number(option.promotionalDiscountInstallmentAmount || 0);
  const promotionalDiscountDeadlineDay = Number(option.promotionalDiscountDeadlineDay || 0);
  const promotionalDiscountRequiresActiveCrf = Boolean(option.promotionalDiscountRequiresActiveCrf);

  const promoSuffix = (() => {
    if (!option.isPromotional) return '';
    const promoAmount =
      type === 'INSTALLMENTS'
        ? promotionalInstallmentAmount > 0
          ? formatCurrency(promotionalInstallmentAmount)
          : promotionalTotalAmount > 0
            ? formatCurrency(promotionalTotalAmount)
            : ''
        : promotionalTotalAmount > 0
          ? formatCurrency(promotionalTotalAmount)
          : '';
    const slotsLabel = promotionalSlots > 0 ? String(promotionalSlots) + ' vagas' : 'promo';
    return promoAmount
      ? ' ? Promo (' + slotsLabel + '): ' + promoAmount
      : ' ? Promo (' + slotsLabel + ')';
  })();

  const discountSuffix = (() => {
    if (!discountEnabled) return '';
    const discountedAmount =
      type === 'INSTALLMENTS'
        ? discountInstallmentAmount > 0
          ? discountInstallmentAmount
          : discountTotalAmount > 0 && installmentCount > 0
            ? discountTotalAmount / installmentCount
            : 0
        : discountTotalAmount;
    if (discountedAmount <= 0) return '';
    const parts = ['até dia ' + (discountDeadlineDay > 0 ? String(discountDeadlineDay) : '?')];
    if (discountRequiresActiveCrf) {
      parts.push('CRF ativo');
    }
    return ' ? ' + formatCurrency(discountedAmount) + ' (' + parts.join(' / ') + ')';
  })();

  const promotionalDiscountSuffix = (() => {
    if (!option.isPromotional || !promotionalDiscountEnabled) return '';
    const discountedAmount =
      type === 'INSTALLMENTS'
        ? promotionalDiscountInstallmentAmount > 0
          ? promotionalDiscountInstallmentAmount
          : promotionalDiscountTotalAmount > 0 && installmentCount > 0
            ? promotionalDiscountTotalAmount / installmentCount
            : 0
        : promotionalDiscountTotalAmount;
    if (discountedAmount <= 0) return '';
    const parts = [
      'promo até dia ' +
        (promotionalDiscountDeadlineDay > 0
          ? String(promotionalDiscountDeadlineDay)
          : '?'),
    ];
    if (promotionalDiscountRequiresActiveCrf) {
      parts.push('CRF ativo');
    }
    return ' ? ' + formatCurrency(discountedAmount) + ' (' + parts.join(' / ') + ')';
  })();

  if (type === 'INSTALLMENTS') {
    const safeCount = installmentCount > 0 ? installmentCount : 1;
    const safeInstallmentAmount =
      installmentAmount > 0
        ? installmentAmount
        : totalAmount > 0
          ? totalAmount / safeCount
          : 0;
    return (
      paymentMethodLabel[method] +
      ' ' +
      String(safeCount) +
      'x de ' +
      formatCurrency(safeInstallmentAmount) +
      promoSuffix +
      discountSuffix +
      promotionalDiscountSuffix
    );
  }

  return (
    paymentMethodLabel[method] +
    ' à vista ' +
    formatCurrency(totalAmount) +
    promoSuffix +
    discountSuffix +
    promotionalDiscountSuffix
  );
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
      title: 'à vista (Pix)',
      method: 'PIX',
      type: 'CASH',
      totalAmount: '10800',
      isPromotional: true,
      promotionalSlots: '20',
      promotionalTotalAmount: '9996',
    }),
    createPaymentOptionForm({
      title: 'Boleto 12x (venc. dia 10)',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '13824',
      installmentCount: '12',
      installmentAmount: '1152',
      dueDay: '10',
      isPromotional: true,
      promotionalSlots: '20',
      promotionalTotalAmount: '11760',
      promotionalInstallmentAmount: '980',
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
      isPromotional: true,
      promotionalSlots: '20',
      promotionalTotalAmount: '11400',
      promotionalInstallmentAmount: '950',
    }),
    createPaymentOptionForm({
      title: 'Boleto 18x (venc. dia 10)',
      method: 'BANK_SLIP',
      type: 'INSTALLMENTS',
      totalAmount: '15208.38',
      installmentCount: '18',
      installmentAmount: '844.91',
      dueDay: '10',
      isPromotional: true,
      promotionalSlots: '20',
      promotionalTotalAmount: '12924',
      promotionalInstallmentAmount: '718',
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
      isPromotional: true,
      promotionalSlots: '20',
      promotionalTotalAmount: '12546',
      promotionalInstallmentAmount: '697',
    }),
    createPaymentOptionForm({
      title: 'Cartão de crédito 12x',
      method: 'CREDIT_CARD',
      type: 'INSTALLMENTS',
      totalAmount: '12504',
      installmentCount: '12',
      installmentAmount: '1042',
      isPromotional: true,
      promotionalSlots: '20',
      promotionalTotalAmount: '10800',
      promotionalInstallmentAmount: '900',
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
    price: '0,00',
    modality: 'PRESENTIAL',
    status: 'ACTIVE',
    paymentModel: 'CASH',
    hasEnrollmentFee: false,
    enrollmentFee: '0,00',
    installmentMonths: '12',
    installmentValue: '0,00',
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

function parseNumberSafe(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  let str = String(value).trim();
  
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    } else if (parts.length === 2 && parts[1].length === 3) {
      str = str.replace(/\./g, '');
    }
  }

  const parsed = Number(str);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed >= 0 ? parsed : undefined;
}

function formatMoneyValue(value: string | number | null | undefined): string {
  const parsed = parseNumberSafe(value);
  if (parsed === undefined) return '';
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoneyTyping(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toSafeMoneyNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < 0) return undefined;
  return Math.round(parsed * 100) / 100;
}

const courseMoneyFields = new Set<keyof CourseFormState>([
  'price',
  'enrollmentFee',
  'installmentValue',
]);

const paymentOptionMoneyFields = new Set<keyof CoursePaymentOptionForm>([
  'totalAmount',
  'installmentAmount',
  'promotionalTotalAmount',
  'promotionalInstallmentAmount',
  'discountTotalAmount',
  'discountInstallmentAmount',
  'promotionalDiscountTotalAmount',
  'promotionalDiscountInstallmentAmount',
]);

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value?: string | null): string {
  if (!value) return 'Na matrícula';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Na matrícula';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

function hasTextValue(value?: string | null): boolean {
  return Boolean(String(value || '').trim());
}

function hasPositiveNumber(value?: number | string | null): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function isPaymentOptionDisplayable(option: {
  type?: CoursePaymentOptionType | null;
  totalAmount?: number | null;
  installmentAmount?: number | null;
}): boolean {
  const type = (option.type || 'CASH') as CoursePaymentOptionType;
  if (type === 'INSTALLMENTS') {
    return hasPositiveNumber(option.installmentAmount) || hasPositiveNumber(option.totalAmount);
  }
  return hasPositiveNumber(option.totalAmount);
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
    totalAmount: formatMoneyValue(totalAmount),
    installmentCount: String(installmentCount),
    installmentAmount: formatMoneyValue(installmentAmount),
    dueDay: option.dueDay ? String(option.dueDay) : '',
    note: option.note || '',
    isPromotional: Boolean(option.isPromotional),
    promotionalSlots: option.promotionalSlots
      ? String(option.promotionalSlots)
      : '20',
    promotionalTotalAmount:
      option.isPromotional && Number(option.promotionalTotalAmount || 0) > 0
        ? formatMoneyValue(option.promotionalTotalAmount)
        : '',
    promotionalInstallmentAmount:
      option.type === 'INSTALLMENTS' &&
      option.isPromotional &&
      Number(option.promotionalInstallmentAmount || 0) > 0
        ? formatMoneyValue(option.promotionalInstallmentAmount)
        : '',
    active: option.active !== false,
    discountEnabled:
      Boolean(option.discountEnabled) &&
      (Number(option.discountTotalAmount || 0) > 0 ||
        Number(option.discountInstallmentAmount || 0) > 0 ||
        Number(option.discountValue || 0) > 0),
    discountTotalAmount:
      option.discountEnabled && Number(option.discountTotalAmount || 0) > 0
        ? formatMoneyValue(option.discountTotalAmount)
        : '',
    discountInstallmentAmount:
      option.type === 'INSTALLMENTS' &&
      option.discountEnabled &&
      Number(option.discountInstallmentAmount || 0) > 0
        ? formatMoneyValue(option.discountInstallmentAmount)
        : '',
    discountType: option.discountType === 'PERCENT' ? 'PERCENT' : 'FIXED',
    discountValue:
      option.discountEnabled && Number(option.discountValue || 0) > 0
        ? String(option.discountValue)
        : '',
    discountDeadlineDay: option.discountDeadlineDay
      ? String(option.discountDeadlineDay)
      : '',
    discountRequiresActiveCrf: Boolean(option.discountRequiresActiveCrf),
    discountAppliesTo:
      option.discountAppliesTo === 'TOTAL' ? 'TOTAL' : 'INSTALLMENT',
    promotionalDiscountEnabled:
      Boolean(option.isPromotional) &&
      Boolean(option.promotionalDiscountEnabled) &&
      (Number(option.promotionalDiscountTotalAmount || 0) > 0 ||
        Number(option.promotionalDiscountInstallmentAmount || 0) > 0),
    promotionalDiscountTotalAmount:
      option.isPromotional &&
      option.promotionalDiscountEnabled &&
      Number(option.promotionalDiscountTotalAmount || 0) > 0
        ? formatMoneyValue(option.promotionalDiscountTotalAmount)
        : '',
    promotionalDiscountInstallmentAmount:
      option.type === 'INSTALLMENTS' &&
      option.isPromotional &&
      option.promotionalDiscountEnabled &&
      Number(option.promotionalDiscountInstallmentAmount || 0) > 0
        ? formatMoneyValue(option.promotionalDiscountInstallmentAmount)
        : '',
    promotionalDiscountDeadlineDay:
      option.promotionalDiscountEnabled && option.promotionalDiscountDeadlineDay
        ? String(option.promotionalDiscountDeadlineDay)
        : '',
    promotionalDiscountRequiresActiveCrf: Boolean(
      option.promotionalDiscountRequiresActiveCrf,
    ),
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
    const nextValue =
      typeof value === 'string' && courseMoneyFields.has(key)
        ? (formatMoneyTyping(value) as CourseFormState[K])
        : value;
    setForm((current) => ({ ...current, [key]: nextValue }));
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
      price: formatMoneyValue(price),
      modality: (course.modality as CourseModality) || 'PRESENTIAL',
      status: (course.status as CourseStatus) || 'ACTIVE',
      paymentModel: (course.paymentModel as CoursePaymentModel) || 'CASH',
      hasEnrollmentFee: enrollmentFee > 0,
      enrollmentFee: formatMoneyValue(enrollmentFee),
      installmentMonths: String(Math.max(1, months)),
      installmentValue: formatMoneyValue(installmentValue),
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
    updateForm('installmentValue', formatMoneyValue(installment));
  };

  const updatePaymentOption = <K extends keyof CoursePaymentOptionForm>(
    optionId: string,
    key: K,
    value: CoursePaymentOptionForm[K],
  ) => {
    const nextValue =
      typeof value === 'string' && paymentOptionMoneyFields.has(key)
        ? (formatMoneyTyping(value) as CoursePaymentOptionForm[K])
        : value;
    setForm((current) => ({
      ...current,
      paymentOptions: current.paymentOptions.map((option) =>
        option.id === optionId ? { ...option, [key]: nextValue } : option,
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
    updatePaymentOption(optionId, 'installmentAmount', formatMoneyValue(installmentAmount));
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
      price: formatMoneyValue('11760'),
      paymentModel: 'INSTALLMENTS',
      installmentMonths: '12',
      installmentValue: formatMoneyValue('1152'),
      installmentStartMode: 'ON_ENROLLMENT',
      installmentStartDate: '',
      hasEnrollmentFee: true,
      enrollmentFee: formatMoneyValue('450'),
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

    if (form.hasEnrollmentFee && payloadBase.enrollmentFee === undefined) {
      setFormError('Informe um valor de matrícula válido.');
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



    if (
      form.paymentModel === 'INSTALLMENTS' &&
      form.installmentStartMode === 'SCHEDULED' &&
      !form.installmentStartDate
    ) {
      setFormError('Informe a data de início das mensalidades.');
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
      promotionalTotalAmount?: number;
      promotionalInstallmentAmount?: number;
      active: boolean;
      discountEnabled?: boolean;
      discountTotalAmount?: number;
      discountInstallmentAmount?: number;
      discountType?: CoursePaymentDiscountType;
      discountValue?: number;
      discountDeadlineDay?: number;
      discountRequiresActiveCrf?: boolean;
      discountAppliesTo?: CoursePaymentDiscountAppliesTo;
      promotionalDiscountEnabled?: boolean;
      promotionalDiscountTotalAmount?: number;
      promotionalDiscountInstallmentAmount?: number;
      promotionalDiscountDeadlineDay?: number;
      promotionalDiscountRequiresActiveCrf?: boolean;
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
        promotionalTotalAmount?: number;
        promotionalInstallmentAmount?: number;
        active: boolean;
        discountEnabled?: boolean;
        discountTotalAmount?: number;
        discountInstallmentAmount?: number;
        discountType?: CoursePaymentDiscountType;
        discountValue?: number;
        discountDeadlineDay?: number;
        discountRequiresActiveCrf?: boolean;
        discountAppliesTo?: CoursePaymentDiscountAppliesTo;
        promotionalDiscountEnabled?: boolean;
        promotionalDiscountTotalAmount?: number;
        promotionalDiscountInstallmentAmount?: number;
        promotionalDiscountDeadlineDay?: number;
        promotionalDiscountRequiresActiveCrf?: boolean;
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
        const promotionalTotalAmount = parseNumberSafe(option.promotionalTotalAmount);
        if (!promotionalTotalAmount || promotionalTotalAmount <= 0) {
          setFormError(`Informe o valor total promocional da opção ${index + 1}.`);
          return;
        }
        payloadOption.promotionalTotalAmount = promotionalTotalAmount;

        if (option.type === 'INSTALLMENTS') {
          const installmentCount = parseIntSafe(option.installmentCount) ?? 1;
          const promotionalInstallmentAmount =
            parseNumberSafe(option.promotionalInstallmentAmount) ??
            promotionalTotalAmount / installmentCount;
          if (!promotionalInstallmentAmount || promotionalInstallmentAmount <= 0) {
            setFormError(`Informe o valor da parcela promocional da opção ${index + 1}.`);
            return;
          }
          payloadOption.promotionalInstallmentAmount = promotionalInstallmentAmount;
        }
      }

      if (option.note.trim()) {
        payloadOption.note = option.note.trim();
      }

      if (option.discountEnabled) {
        const discountDeadlineDay = parseIntSafe(option.discountDeadlineDay);
        if (!discountDeadlineDay || discountDeadlineDay < 1 || discountDeadlineDay > 31) {
          setFormError(`Informe o dia limite do valor com desconto (1 a 31) na opção ${index + 1}.`);
          return;
        }

        payloadOption.discountEnabled = true;
        payloadOption.discountDeadlineDay = discountDeadlineDay;
        payloadOption.discountRequiresActiveCrf = option.discountRequiresActiveCrf;
        if (option.type === 'INSTALLMENTS') {
          const installmentCount = parseIntSafe(option.installmentCount) ?? 1;
          const baseInstallmentAmount =
            parseNumberSafe(option.installmentAmount) ?? totalAmount / installmentCount;
          const discountInstallmentAmount = parseNumberSafe(option.discountInstallmentAmount);
          if (!discountInstallmentAmount || discountInstallmentAmount <= 0) {
            setFormError(`Informe o valor da parcela com desconto na opção ${index + 1}.`);
            return;
          }
          if (discountInstallmentAmount >= baseInstallmentAmount) {
            setFormError(`O valor da parcela com desconto deve ser menor que a parcela padrão na opção ${index + 1}.`);
            return;
          }
          payloadOption.discountTotalAmount = discountInstallmentAmount * installmentCount;
          payloadOption.discountInstallmentAmount = discountInstallmentAmount;
        } else {
          const discountTotalAmount = parseNumberSafe(option.discountTotalAmount);
          if (!discountTotalAmount || discountTotalAmount <= 0) {
            setFormError(`Informe o valor total com desconto na opção ${index + 1}.`);
            return;
          }
          if (discountTotalAmount >= totalAmount) {
            setFormError(`O valor total com desconto deve ser menor que o valor total na opção ${index + 1}.`);
            return;
          }
          payloadOption.discountTotalAmount = discountTotalAmount;
        }
      }

      if (option.isPromotional && option.promotionalDiscountEnabled) {
        const promotionalTotalAmount =
          parseNumberSafe(option.promotionalTotalAmount) ?? totalAmount;
        const promotionalDiscountDeadlineDay = parseIntSafe(
          option.promotionalDiscountDeadlineDay,
        );
        if (
          !promotionalDiscountDeadlineDay ||
          promotionalDiscountDeadlineDay < 1 ||
          promotionalDiscountDeadlineDay > 31
        ) {
          setFormError(`Informe o dia limite do valor com desconto promocional (1 a 31) na opção ${index + 1}.`);
          return;
        }

        payloadOption.promotionalDiscountEnabled = true;
        payloadOption.promotionalDiscountDeadlineDay = promotionalDiscountDeadlineDay;
        payloadOption.promotionalDiscountRequiresActiveCrf =
          option.promotionalDiscountRequiresActiveCrf;

        if (option.type === 'INSTALLMENTS') {
          const installmentCount = parseIntSafe(option.installmentCount) ?? 1;
          const promotionalInstallmentAmount =
            parseNumberSafe(option.promotionalInstallmentAmount) ??
            promotionalTotalAmount / installmentCount;
          const promotionalDiscountInstallmentAmount = parseNumberSafe(
            option.promotionalDiscountInstallmentAmount,
          );
          if (
            !promotionalDiscountInstallmentAmount ||
            promotionalDiscountInstallmentAmount <= 0
          ) {
            setFormError(`Informe o valor da parcela com desconto promocional na opção ${index + 1}.`);
            return;
          }
          if (promotionalDiscountInstallmentAmount >= promotionalInstallmentAmount) {
            setFormError(`O valor da parcela com desconto promocional deve ser menor que a parcela promocional da opção ${index + 1}.`);
            return;
          }
          payloadOption.promotionalDiscountTotalAmount =
            promotionalDiscountInstallmentAmount * installmentCount;
          payloadOption.promotionalDiscountInstallmentAmount =
            promotionalDiscountInstallmentAmount;
        } else {
          const promotionalDiscountTotalAmount = parseNumberSafe(
            option.promotionalDiscountTotalAmount,
          );
          if (!promotionalDiscountTotalAmount || promotionalDiscountTotalAmount <= 0) {
            setFormError(`Informe o valor total com desconto promocional da opção ${index + 1}.`);
            return;
          }
          if (promotionalDiscountTotalAmount >= promotionalTotalAmount) {
            setFormError(`O valor total com desconto promocional deve ser menor que o valor promocional da opção ${index + 1}.`);
            return;
          }
          payloadOption.promotionalDiscountTotalAmount = promotionalDiscountTotalAmount;
        }
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

    for (let index = 0; index < paymentOptionsPayload.length; index += 1) {
      const option = paymentOptionsPayload[index];
      const moneyKeys: Array<keyof typeof option> = [
        'totalAmount',
        'installmentAmount',
        'promotionalTotalAmount',
        'promotionalInstallmentAmount',
        'discountTotalAmount',
        'discountInstallmentAmount',
        'promotionalDiscountTotalAmount',
        'promotionalDiscountInstallmentAmount',
      ];

      for (const key of moneyKeys) {
        const currentValue = option[key] as unknown;
        const normalized = toSafeMoneyNumber(currentValue);
        if (currentValue !== undefined && normalized === undefined) {
          setFormError(`Valor inválido em ${String(key)} da opção ${index + 1}.`);
          return;
        }
        if (normalized !== undefined) {
          (option as Record<string, unknown>)[key as string] = normalized;
        }
      }
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
      setFeedback('Curso excluído com sucesso.');
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
  const previewDisplayablePaymentOptions = useMemo(
    () =>
      previewActivePaymentOptions.filter((option) =>
        isPaymentOptionDisplayable({
          type: option.type,
          totalAmount: parseNumberSafe(option.totalAmount) || 0,
          installmentAmount: parseNumberSafe(option.installmentAmount) || 0,
        }),
      ),
    [previewActivePaymentOptions],
  );

  const previewPayment = useMemo(() => {
    if (previewDisplayablePaymentOptions.length > 0) {
      return `${previewDisplayablePaymentOptions.length} opção(ões) de pagamento`;
    }
    if (form.paymentModel !== 'INSTALLMENTS') {
      return hasPositiveNumber(parseNumberSafe(form.price)) ? paymentLabel.CASH : '';
    }
    const months = parseIntSafe(form.installmentMonths) || 1;
    const installment = parseNumberSafe(form.installmentValue) || 0;
    if (!hasPositiveNumber(installment)) return '';
    return `${months}x de ${formatCurrency(installment)}`;
  }, [
    previewDisplayablePaymentOptions,
    form.paymentModel,
    form.installmentMonths,
    form.installmentValue,
    form.price,
  ]);

  const previewPaymentLines = useMemo(
    () =>
      previewDisplayablePaymentOptions
        .slice(0, 4)
        .map((option) =>
          formatPaymentOptionLabel({
            method: option.method,
            type: option.type,
            totalAmount: parseNumberSafe(option.totalAmount) || 0,
            installmentCount: parseIntSafe(option.installmentCount) || 0,
            installmentAmount: parseNumberSafe(option.installmentAmount) || 0,
            dueDay: parseIntSafe(option.dueDay) || null,
            isPromotional: option.isPromotional,
            promotionalSlots: parseIntSafe(option.promotionalSlots),
            promotionalTotalAmount: parseNumberSafe(option.promotionalTotalAmount) || 0,
            promotionalInstallmentAmount:
              parseNumberSafe(option.promotionalInstallmentAmount) || 0,
            discountEnabled: option.discountEnabled,
            discountTotalAmount: parseNumberSafe(option.discountTotalAmount) || 0,
            discountInstallmentAmount:
              parseNumberSafe(option.discountInstallmentAmount) || 0,
            discountType: option.discountType,
            discountValue: parseNumberSafe(option.discountValue) || 0,
            discountDeadlineDay: parseIntSafe(option.discountDeadlineDay) || null,
            discountRequiresActiveCrf: option.discountRequiresActiveCrf,
            discountAppliesTo: option.discountAppliesTo,
            promotionalDiscountEnabled: option.promotionalDiscountEnabled,
            promotionalDiscountTotalAmount:
              parseNumberSafe(option.promotionalDiscountTotalAmount) || 0,
            promotionalDiscountInstallmentAmount:
              parseNumberSafe(option.promotionalDiscountInstallmentAmount) || 0,
            promotionalDiscountDeadlineDay:
              parseIntSafe(option.promotionalDiscountDeadlineDay) || null,
            promotionalDiscountRequiresActiveCrf:
              option.promotionalDiscountRequiresActiveCrf,
          }),
        ),
    [previewDisplayablePaymentOptions],
  );

  const previewEnrollmentFee = useMemo(() => {
    const enrollmentFee = parseNumberSafe(form.enrollmentFee) || 0;
    if (!form.hasEnrollmentFee || !hasPositiveNumber(enrollmentFee)) return '';
    return formatCurrency(enrollmentFee);
  }, [form.hasEnrollmentFee, form.enrollmentFee]);

  const previewInstallmentStart = useMemo(() => {
    const installmentValue = parseNumberSafe(form.installmentValue) || 0;
    if (form.paymentModel !== 'INSTALLMENTS' || !hasPositiveNumber(installmentValue))
      return '';
    if (form.installmentStartMode !== 'SCHEDULED') return 'Na matrícula';
    if (!form.installmentStartDate) return '';
    return formatDateLabel(form.installmentStartDate);
  }, [
    form.paymentModel,
    form.installmentValue,
    form.installmentStartMode,
    form.installmentStartDate,
  ]);

  return (
    <section className="native-page native-courses">
      <header className="native-page-header">
        <h2>Gestão de cursos</h2>
        <p>
          Catálogo acadêmico nativo com edição de preços, modalidade, pagamento e
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
              const displayablePaymentOptions = activePaymentOptions.filter((option) =>
                isPaymentOptionDisplayable(option),
              );
              const paymentSummary =
                displayablePaymentOptions.length > 0
                  ? displayablePaymentOptions
                      .slice(0, 2)
                      .map((option) => formatPaymentOptionLabel(option))
                      .join(' • ')
                  : paymentModel === 'INSTALLMENTS' && hasPositiveNumber(course.installmentValue)
                    ? `${course.installmentMonths || 1}x de ${formatCurrency(
                        Number(course.installmentValue || 0),
                      )}`
                    : '';
              const paymentSummaryExtra =
                displayablePaymentOptions.length > 2
                  ? ` +${displayablePaymentOptions.length - 2} opções`
                  : '';
              const enrollmentFeeSummary = hasPositiveNumber(course.enrollmentFee)
                ? formatCurrency(Number(course.enrollmentFee || 0))
                : '';
              const installmentStartSummary =
                paymentModel === 'INSTALLMENTS' && hasTextValue(course.installmentStartDate)
                  ? formatDateLabel(course.installmentStartDate)
                  : '';
              const showDescription = hasTextValue(course.description);
              const showCategory = hasTextValue(course.category);
              const showWorkload = hasPositiveNumber(course.workloadHours);
              const showPrice = hasPositiveNumber(course.price);
              const showPayment = hasTextValue(paymentSummary);
              const showEnrollmentFee = hasTextValue(enrollmentFeeSummary);
              const showInstallmentStart = hasTextValue(installmentStartSummary);

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

                    {showDescription ? <p>{course.description}</p> : null}

                    <div className="native-course-meta">
                      {showCategory ? (
                        <small>
                          Categoria: <strong>{course.category}</strong>
                        </small>
                      ) : null}
                      <small>
                        Modalidade: <strong>{modalityLabel[modality]}</strong>
                      </small>
                      {showWorkload ? (
                        <small>
                          Carga horária:{' '}
                          <strong>{Number(course.workloadHours || 0)}h</strong>
                        </small>
                      ) : null}
                      {showPrice ? (
                        <small>
                          Valor total:{' '}
                          <strong>{formatCurrency(Number(course.price || 0))}</strong>
                        </small>
                      ) : null}
                      {showPayment ? (
                        <small className="full">
                          Pagamento: <strong>{paymentSummary}{paymentSummaryExtra}</strong>
                        </small>
                      ) : null}
                      {showEnrollmentFee ? (
                        <small className="full">
                          Matrícula: <strong>{enrollmentFeeSummary}</strong>
                        </small>
                      ) : null}
                      {showInstallmentStart ? (
                        <small className="full">
                          Início mensalidades:{' '}
                          <strong>{installmentStartSummary}</strong>
                        </small>
                      ) : null}
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
        <div className="native-modal-backdrop">
          <section className="native-modal native-course-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{form.id ? 'Editar curso' : 'Novo curso acadêmico'}</h3>
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
                  Carga horária (horas)
                  <input
                    type="number"
                    min={1}
                    value={form.workloadHours}
                    onChange={(event) => updateForm('workloadHours', event.target.value)}
                  />
                </label>

                <label>
                  Valor total do curso (R$)
                  <input
                    type="text"
                    value={form.price}
                    onChange={(event) => {
                      updateForm('price', event.target.value);
                      recalculateInstallment(event.target.value, form.installmentMonths);
                    }}
                  />
                </label>

                <label>
                  Cobrar matrícula
                  <select
                    value={form.hasEnrollmentFee ? 'YES' : 'NO'}
                    onChange={(event) =>
                      updateForm('hasEnrollmentFee', event.target.value === 'YES')
                    }
                  >
                    <option value="NO">Não</option>
                    <option value="YES">Sim</option>
                  </select>
                </label>

                {form.hasEnrollmentFee ? (
                  <label>
                    Valor da matrícula (R$)
                    <input
                      type="text"
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
                      Duração em meses
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
                        type="text"
                        value={form.installmentValue}
                        onChange={(event) =>
                          updateForm('installmentValue', event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Início das mensalidades
                      <select
                        value={form.installmentStartMode}
                        onChange={(event) =>
                          updateForm(
                            'installmentStartMode',
                            event.target.value as InstallmentStartMode,
                          )
                        }
                      >
                        <option value="ON_ENROLLMENT">Na matrícula</option>
                        <option value="SCHEDULED">Agendar início</option>
                      </select>
                    </label>

                    {form.installmentStartMode === 'SCHEDULED' ? (
                      <label>
                        Data de início das mensalidades
                        <input
                          type="date"
                          value={form.installmentStartDate}
                          onChange={(event) =>
                            updateForm('installmentStartDate', event.target.value)
                          }
                        />
                        <small>
                          Use este campo apenas quando o início das parcelas for
                          diferente da data da matrícula.
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
                              type="text"
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
                                  type="text"
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
                            Tem valor promocional?
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
                            <>
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

                              <label>
                                Valor total promocional (R$)
                                <input
                                  type="text"
                                  value={option.promotionalTotalAmount}
                                  onChange={(event) =>
                                    updatePaymentOption(
                                      option.id,
                                      'promotionalTotalAmount',
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>

                              {option.type === 'INSTALLMENTS' ? (
                                <label>
                                  Valor da parcela promocional (R$)
                                  <input
                                    type="text"
                                    value={option.promotionalInstallmentAmount}
                                    onChange={(event) =>
                                      updatePaymentOption(
                                        option.id,
                                        'promotionalInstallmentAmount',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                              ) : null}
                            </>
                          ) : null}



                          <label>
                            Valor normal tem desconto por pagamento antecipado?
                            <select
                              value={option.discountEnabled ? 'YES' : 'NO'}
                              onChange={(event) =>
                                updatePaymentOption(
                                  option.id,
                                  'discountEnabled',
                                  event.target.value === 'YES',
                                )
                              }
                            >
                              <option value="NO">Não</option>
                              <option value="YES">Sim</option>
                            </select>
                          </label>

                          {option.discountEnabled ? (
                            <>
                              {option.type !== 'INSTALLMENTS' ? (
                                <label>
                                  Valor total normal com desconto (R$)
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={option.discountTotalAmount}
                                    onChange={(event) =>
                                      updatePaymentOption(
                                        option.id,
                                        'discountTotalAmount',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                              ) : null}

                              {option.type === 'INSTALLMENTS' ? (
                                <label>
                                  Valor da parcela normal com desconto (R$)
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={option.discountInstallmentAmount}
                                    onChange={(event) =>
                                      updatePaymentOption(
                                        option.id,
                                        'discountInstallmentAmount',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                              ) : null}

                              <label>
                                Pagando até dia (valor normal)
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  step={1}
                                  value={option.discountDeadlineDay}
                                  onChange={(event) =>
                                    updatePaymentOption(
                                      option.id,
                                      'discountDeadlineDay',
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Ex.: 7"
                                />
                              </label>

                              <label>
                                Exige CRF ativo no valor normal?
                                <select
                                  value={option.discountRequiresActiveCrf ? 'YES' : 'NO'}
                                  onChange={(event) =>
                                    updatePaymentOption(
                                      option.id,
                                      'discountRequiresActiveCrf',
                                      event.target.value === 'YES',
                                    )
                                  }
                                >
                                  <option value="NO">Não</option>
                                  <option value="YES">Sim</option>
                                </select>
                              </label>
                            </>
                          ) : null}

                          {option.isPromotional ? (
                            <>
                              <label>
                                Valor promocional tem desconto por pagamento antecipado?
                                <select
                                  value={option.promotionalDiscountEnabled ? 'YES' : 'NO'}
                                  onChange={(event) =>
                                    updatePaymentOption(
                                      option.id,
                                      'promotionalDiscountEnabled',
                                      event.target.value === 'YES',
                                    )
                                  }
                                >
                                  <option value="NO">Não</option>
                                  <option value="YES">Sim</option>
                                </select>
                              </label>

                              {option.promotionalDiscountEnabled ? (
                                <>
                                  {option.type !== 'INSTALLMENTS' ? (
                                    <label>
                                      Valor total promocional com desconto (R$)
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={option.promotionalDiscountTotalAmount}
                                        onChange={(event) =>
                                          updatePaymentOption(
                                            option.id,
                                            'promotionalDiscountTotalAmount',
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                  ) : null}

                                  {option.type === 'INSTALLMENTS' ? (
                                    <label>
                                      Valor da parcela promocional com desconto (R$)
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={option.promotionalDiscountInstallmentAmount}
                                        onChange={(event) =>
                                          updatePaymentOption(
                                            option.id,
                                            'promotionalDiscountInstallmentAmount',
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                  ) : null}

                                  <label>
                                    Pagando até dia (valor promocional)
                                    <input
                                      type="number"
                                      min={1}
                                      max={31}
                                      step={1}
                                      value={option.promotionalDiscountDeadlineDay}
                                      onChange={(event) =>
                                        updatePaymentOption(
                                          option.id,
                                          'promotionalDiscountDeadlineDay',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Ex.: 7"
                                    />
                                  </label>

                                  <label>
                                    Exige CRF ativo no valor promocional?
                                    <select
                                      value={option.promotionalDiscountRequiresActiveCrf ? 'YES' : 'NO'}
                                      onChange={(event) =>
                                        updatePaymentOption(
                                          option.id,
                                          'promotionalDiscountRequiresActiveCrf',
                                          event.target.value === 'YES',
                                        )
                                      }
                                    >
                                      <option value="NO">Não</option>
                                      <option value="YES">Sim</option>
                                    </select>
                                  </label>
                                </>
                              ) : null}
                            </>
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
                    <option value="HYBRID">Híbrido</option>
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
                  Descrição
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
                      {deleteConfirm ? 'Confirmar exclusão' : 'Excluir curso'}
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
                <h4>Pré-visualização</h4>
                <article>
                  <img
                    src={previewBannerUrl || FALLBACK_BANNER}
                    alt="Prévia do banner do curso"
                  />
                  <div>
                    {hasTextValue(form.name) ? <strong>{form.name}</strong> : null}
                    {hasTextValue(form.category) ? <small>{form.category}</small> : null}
                    {hasTextValue(form.description) ? <p>{form.description}</p> : null}
                    <div className="native-course-preview-meta">
                      {hasPositiveNumber(parseIntSafe(form.workloadHours)) ? (
                        <span>{parseIntSafe(form.workloadHours)}h</span>
                      ) : null}
                      {hasPositiveNumber(parseNumberSafe(form.price)) ? (
                        <span>{formatCurrency(parseNumberSafe(form.price) || 0)}</span>
                      ) : null}
                      <span>{modalityLabel[form.modality]}</span>
                      <span>{statusLabel[form.status]}</span>
                      {hasTextValue(previewPayment) ? <span>{previewPayment}</span> : null}
                      {previewPaymentLines.map((line, index) => (
                        <span key={`${line}-${index}`} className="native-payment-preview-line">
                          {line}
                        </span>
                      ))}
                      {previewDisplayablePaymentOptions.length > previewPaymentLines.length ? (
                        <span className="native-payment-preview-line">
                          +{previewDisplayablePaymentOptions.length - previewPaymentLines.length} opção(ões)
                        </span>
                      ) : null}
                      {hasTextValue(previewEnrollmentFee) ? (
                        <span>Matrícula: {previewEnrollmentFee}</span>
                      ) : null}
                      {hasTextValue(previewInstallmentStart) ? (
                        <span>Início mensalidades: {previewInstallmentStart}</span>
                      ) : null}
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
