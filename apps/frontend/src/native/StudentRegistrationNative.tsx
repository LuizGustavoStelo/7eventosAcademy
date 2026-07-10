import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE_URL } from './api';
import { toPtBrApiMessage } from '../errorMessages';

type StudentRegistrationNativeProps = {
  embedded: boolean;
};

type CourseCatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  workloadHours?: number | null;
  category?: string | null;
  coordinator?: string | null;
  paymentModel?: string | null;
  installmentMonths?: number | null;
  installmentValue?: number | null;
  paymentOptions?: Array<{
    id?: string | null;
    title?: string | null;
    method?: string | null;
    type?: string | null;
    totalAmount?: number | null;
    installmentCount?: number | null;
    installmentAmount?: number | null;
    dueDay?: number | null;
    installmentStartMode?: 'ON_ENROLLMENT' | 'SCHEDULED' | 'COURSE_START' | null;
    installmentStartDate?: string | null;
    isPromotional?: boolean | null;
    promotionalSlots?: number | null;
    promotionalTotalAmount?: number | null;
    promotionalInstallmentAmount?: number | null;
    discountEnabled?: boolean | null;
    discountTotalAmount?: number | null;
    discountInstallmentAmount?: number | null;
    discountDeadlineDay?: number | null;
    discountRequiresActiveCrf?: boolean | null;
    promotionalDiscountEnabled?: boolean | null;
    promotionalDiscountTotalAmount?: number | null;
    promotionalDiscountInstallmentAmount?: number | null;
    promotionalDiscountDeadlineDay?: number | null;
    promotionalDiscountRequiresActiveCrf?: boolean | null;
    appliedVoucher?: {
      code?: string | null;
      title?: string | null;
      discountType?: 'PERCENT' | 'FIXED' | string;
      discountValue?: number | null;
      appliesTo?: 'TOTAL' | 'INSTALLMENT' | string;
      installmentScope?: 'ALL' | 'SINGLE' | string;
      discountLabel?: string | null;
      targetLabel?: string | null;
      discountedInstallments?: number | null;
      discountedInstallmentAmount?: number | null;
      regularInstallmentAmount?: number | null;
    } | null;
    active?: boolean | null;
  }> | null;
  modality?: string | null;
  status?: string | null;
  bannerUrl?: string | null;
};

type RegistrationPayload = {
  name: string;
  email: string;
  password: string;
  documentCpf: string;
  documentRg: string;
  issuingAuthority: string;
  phone: string;
  birthDate: string;
  birthCity: string;
  maritalStatus: string;
  address: string;
  zipCode: string;
  fatherName: string;
  motherName: string;
  graduation: string;
  graduationConclusionYear: number;
  companyName?: string;
  jobTitle?: string;
  street?: string;
  streetNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  courseIds?: string[];
  selectedPaymentOptionId?: string;
  selectedVoucherCode?: string;
};

type ViaCepResponse = {
  erro?: boolean;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

type PasswordStrength = {
  label: string;
  toneClass: string;
  score: number;
};

type PaymentOptionDetailLine = {
  text: string;
  tone: 'default' | 'highlight' | 'secondary';
};

type VoucherValidationResponse = {
  id: string;
  code: string;
  title?: string | null;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  appliesTo: 'TOTAL' | 'INSTALLMENT';
  installmentScope?: 'ALL' | 'SINGLE';
  discountLabel: string;
  targetLabel?: string;
  allowedPaymentOptionIds: string[];
  affectedPaymentOptionIds: string[];
};

const steps = [
  { title: 'Matrícula', description: 'Curso no IES e forma de pagamento' },
  { title: 'Identificação', description: 'Dados pessoais, documentação e endereço' },
  { title: 'Formação', description: 'Filiação e graduação' },
  { title: 'Profissional', description: 'Empresa, cargo e acesso' },
];

const maritalStatusOptions = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const onlyDigits = (value: string) => value.replace(/\D/g, '');

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const STUDENT_PORTAL_LOGIN_URL = String(
  import.meta.env.VITE_STUDENT_PORTAL_LOGIN_URL ||
    'https://ipesk.com.br/area-do-aluno/',
).trim();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function normalizeTextInput(value: string) {
  return value.replace(/\s{2,}/g, ' ').trimStart();
}

function normalizeNameInput(value: string) {
  return normalizeTextInput(value).replace(/[^\p{L}\s]/gu, '');
}

function isValidPersonName(value: string) {
  const normalized = value.trim();
  if (normalized.length < 3) return false;
  return /^[\p{L}]+(?:\s+[\p{L}]+)+$/u.test(normalized);
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatRg(value: string) {
  const digits = onlyDigits(value).slice(0, 9);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function formatZipCode(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function formatBirthDate(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatGraduationYear(value: string) {
  return onlyDigits(value).slice(0, 4);
}
function birthDateToIso(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 8) return '';

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (year < 1900) return '';

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return '';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) return '';

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidBirthDate(value: string) {
  return Boolean(birthDateToIso(value));
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    let total = 0;
    for (let index = 0; index < base.length; index += 1) {
      total += Number(base[index]) * (factor - index);
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calcDigit(cpf.slice(0, 9), 10);
  const secondDigit = calcDigit(cpf.slice(0, 10), 11);
  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
}

function isValidRg(value: string) {
  const rg = onlyDigits(value);
  return rg.length >= 7 && rg.length <= 9;
}

function isValidPhone(value: string) {
  const phoneDigits = onlyDigits(value);
  if (phoneDigits.length < 10 || phoneDigits.length > 11) return false;
  if (/^(\d)\1+$/.test(phoneDigits)) return false;
  return true;
}

function isValidZipCode(value: string) {
  return onlyDigits(value).length === 8;
}

function isValidGraduationConclusionYear(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 4) return false;
  const year = Number(digits);
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear;
}

function passwordStrength(password: string): PasswordStrength {
  if (!password) {
    return { label: 'Fraca', toneClass: 'is-weak', score: 0 };
  }

  let score = 0;
  if (password.length >= 8) score += 2;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;

  if (score >= 5) return { label: 'Forte', toneClass: 'is-strong', score };
  if (score >= 3) return { label: 'Média', toneClass: 'is-medium', score };
  return { label: 'Fraca', toneClass: 'is-weak', score };
}

function modalityLabel(value?: string | null) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'PRESENTIAL' || normalized === 'PRESENCIAL') return 'Presencial';
  if (normalized === 'HYBRID') return 'Híbrido';
  if (normalized === 'EAD') return 'EAD';
  return 'Não informado';
}

function getActivePaymentOptions(course: CourseCatalogItem) {
  return Array.isArray(course.paymentOptions)
    ? course.paymentOptions.filter((option) => option?.active !== false)
    : [];
}

function paymentMethodLabel(value?: string | null) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'BANK_SLIP') return 'Boleto';
  if (normalized === 'CREDIT_CARD') return 'Cartão de crédito';
  return 'Pix';
}

type PaymentOptionItem = NonNullable<CourseCatalogItem['paymentOptions']>[number];

function resolveOptionInstallmentAmount(option: PaymentOptionItem) {
  const count = Number(option.installmentCount || 0) || 1;
  if (option.isPromotional && Number(option.promotionalInstallmentAmount || 0) > 0) {
    return Number(option.promotionalInstallmentAmount || 0);
  }
  const installmentAmount = Number(option.installmentAmount || 0);
  if (installmentAmount > 0) return installmentAmount;
  const totalAmount = option.isPromotional
    ? Number(option.promotionalTotalAmount || 0) || Number(option.totalAmount || 0)
    : Number(option.totalAmount || 0);
  return totalAmount > 0 ? totalAmount / count : 0;
}

function resolveOptionTotalAmount(option: PaymentOptionItem) {
  if (option.isPromotional && Number(option.promotionalTotalAmount || 0) > 0) {
    return Number(option.promotionalTotalAmount || 0);
  }
  return Number(option.totalAmount || 0);
}

function paymentOptionSummary(option: PaymentOptionItem) {
  const type = String(option.type || '').toUpperCase();
  const method = paymentMethodLabel(option.method);
  if (type === 'INSTALLMENTS') {
    const countRaw = Number(option.installmentCount || 0);
    const hasCount = Number.isFinite(countRaw) && countRaw > 0;
    const count = hasCount ? Math.trunc(countRaw) : 1;
    const installmentAmount = resolveOptionInstallmentAmount(option);
    return hasCount
      ? `${method} ${count}x de ${currencyFormatter.format(installmentAmount)}`
      : `${method} mensalidade de ${currencyFormatter.format(installmentAmount)}`;
  }
  return `${method} à vista ${currencyFormatter.format(resolveOptionTotalAmount(option))}`;
}

function paymentOptionDiscountSummary(option: PaymentOptionItem) {
  const type = String(option.type || '').toUpperCase();
  if (type === 'INSTALLMENTS') {
    const count = Number(option.installmentCount || 0) || 1;
    const installmentAmount =
      Number(option.discountInstallmentAmount || 0) ||
      (Number(option.discountTotalAmount || 0) > 0 ? Number(option.discountTotalAmount || 0) / count : 0);
    return installmentAmount > 0 ? currencyFormatter.format(installmentAmount) : '';
  }
  const totalAmount = Number(option.discountTotalAmount || 0);
  return totalAmount > 0 ? currencyFormatter.format(totalAmount) : '';
}

function paymentOptionPromotionalDiscountSummary(option: PaymentOptionItem) {
  const type = String(option.type || '').toUpperCase();
  if (type === 'INSTALLMENTS') {
    const count = Number(option.installmentCount || 0) || 1;
    const installmentAmount =
      Number(option.promotionalDiscountInstallmentAmount || 0) ||
      (Number(option.promotionalDiscountTotalAmount || 0) > 0
        ? Number(option.promotionalDiscountTotalAmount || 0) / count
        : 0);
    return installmentAmount > 0 ? currencyFormatter.format(installmentAmount) : '';
  }
  const totalAmount = Number(option.promotionalDiscountTotalAmount || 0);
  return totalAmount > 0 ? currencyFormatter.format(totalAmount) : '';
}

function paymentOptionDetailLines(option: PaymentOptionItem): PaymentOptionDetailLine[] {
  const lines: PaymentOptionDetailLine[] = [];
  const type = String(option.type || '').toUpperCase();
  const dueDay = Number(option.dueDay || 0);
  const promotionalSlots = Number(option.promotionalSlots || 0);
  const hasPromotionalDiscount =
    Boolean(option.isPromotional) &&
    Boolean(option.promotionalDiscountEnabled) &&
    Number(option.promotionalDiscountDeadlineDay || 0) > 0 &&
    Boolean(paymentOptionPromotionalDiscountSummary(option));
  const hasStandardDiscount =
    !option.isPromotional &&
    Boolean(option.discountEnabled) &&
    Number(option.discountDeadlineDay || 0) > 0 &&
    Boolean(paymentOptionDiscountSummary(option));

  if (dueDay > 0) {
    lines.push({ text: `Vencimento padrão: dia ${dueDay}.`, tone: 'default' });
  }
  if (option.installmentStartMode === 'COURSE_START') {
    lines.push({
      text: 'Pagamento no início do curso (data a definir).',
      tone: 'default',
    });
  }
  if (option.isPromotional) {
    lines.push({
      text: `Valores exclusivos para os ${promotionalSlots || 0} primeiros inscritos.`,
      tone: 'highlight',
    });
  }

  if (type === 'INSTALLMENTS') {
    const count = Number(option.installmentCount || 0) || 1;
    const baseInstallment = resolveOptionInstallmentAmount(option);
    const voucherInstallmentScope = String(
      option.appliedVoucher?.installmentScope || '',
    ).toUpperCase();
    const voucherFirstInstallment = Number(
      option.appliedVoucher?.discountedInstallmentAmount || 0,
    );
    const voucherRegularInstallment =
      Number(option.appliedVoucher?.regularInstallmentAmount || 0) || baseInstallment;
    if (voucherInstallmentScope === 'SINGLE' && voucherFirstInstallment > 0) {
      lines.push({
        text: `1ª mensalidade com desconto: ${currencyFormatter.format(voucherFirstInstallment)}.`,
        tone: 'highlight',
      });
      lines.push({
        text: `Demais ${Math.max(0, count - 1)} mensalidades: ${currencyFormatter.format(
          voucherRegularInstallment,
        )}.`,
        tone: 'secondary',
      });
      lines.push({
        text: `Total com voucher: ${currencyFormatter.format(resolveOptionTotalAmount(option))}.`,
        tone: 'default',
      });
    }

    if (hasPromotionalDiscount) {
      const deadline = Number(option.promotionalDiscountDeadlineDay || 0);
      const discounted = paymentOptionPromotionalDiscountSummary(option);
      const crf = option.promotionalDiscountRequiresActiveCrf ? ' (CRF ativo)' : '';
      lines.push({
        text: `${count}x de ${discounted} pagando até o dia ${deadline}${crf}.`,
        tone: 'highlight',
      });
      lines.push({
        text: `Após o dia ${deadline}, a parcela fica em ${currencyFormatter.format(baseInstallment)}.`,
        tone: 'secondary',
      });
      return lines;
    }

    if (hasStandardDiscount) {
      const deadline = Number(option.discountDeadlineDay || 0);
      const discounted = paymentOptionDiscountSummary(option);
      const crf = option.discountRequiresActiveCrf ? ' (CRF ativo)' : '';
      lines.push({
        text: `${count}x de ${discounted} pagando até o dia ${deadline}${crf}.`,
        tone: 'highlight',
      });
      lines.push({
        text: `Após o dia ${deadline}, a parcela fica em ${currencyFormatter.format(baseInstallment)}.`,
        tone: 'secondary',
      });
    }

    return lines;
  }

  const baseTotal = resolveOptionTotalAmount(option);
  if (hasPromotionalDiscount) {
    const deadline = Number(option.promotionalDiscountDeadlineDay || 0);
    const discounted = paymentOptionPromotionalDiscountSummary(option);
    const crf = option.promotionalDiscountRequiresActiveCrf ? ' (CRF ativo)' : '';
    lines.push({
      text: `${discounted} pagando até o dia ${deadline}${crf}.`,
      tone: 'highlight',
    });
    lines.push({
      text: `Após o dia ${deadline}, o valor fica em ${currencyFormatter.format(baseTotal)}.`,
      tone: 'secondary',
    });
    return lines;
  }

  if (hasStandardDiscount) {
    const deadline = Number(option.discountDeadlineDay || 0);
    const discounted = paymentOptionDiscountSummary(option);
    const crf = option.discountRequiresActiveCrf ? ' (CRF ativo)' : '';
    lines.push({
      text: `${discounted} pagando até o dia ${deadline}${crf}.`,
      tone: 'highlight',
    });
    lines.push({
      text: `Após o dia ${deadline}, o valor fica em ${currencyFormatter.format(baseTotal)}.`,
      tone: 'secondary',
    });
  }

  return lines;
}

function isVoucherApplicableToOption(
  option: PaymentOptionItem,
  voucher: VoucherValidationResponse,
) {
  const optionId = String(option.id || '').trim();
  if (!optionId) return false;
  if (
    Array.isArray(voucher.affectedPaymentOptionIds) &&
    voucher.affectedPaymentOptionIds.length > 0
  ) {
    return voucher.affectedPaymentOptionIds.includes(optionId);
  }

  const allowed = Array.isArray(voucher.allowedPaymentOptionIds)
    ? voucher.allowedPaymentOptionIds
    : [];
  if (allowed.length > 0 && !allowed.includes(optionId)) return false;
  if (
    String(voucher.appliesTo || '').toUpperCase() === 'INSTALLMENT' &&
    String(option.type || '').toUpperCase() !== 'INSTALLMENTS'
  ) {
    return false;
  }
  return true;
}

function applyVoucherToPaymentOption(
  option: PaymentOptionItem,
  voucher: VoucherValidationResponse,
): PaymentOptionItem {
  if (!isVoucherApplicableToOption(option, voucher)) {
    return option;
  }

  const appliesToInstallment =
    String(voucher.appliesTo || '').toUpperCase() === 'INSTALLMENT';
  const installmentScope =
    String(voucher.installmentScope || '').toUpperCase() === 'SINGLE'
      ? 'SINGLE'
      : 'ALL';
  const isPercent = String(voucher.discountType || '').toUpperCase() === 'PERCENT';
  const discountValue = Math.max(0, Number(voucher.discountValue || 0));
  const installmentCount = Math.max(1, Number(option.installmentCount || 1));

  const applyDiscount = (value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
    const discount = isPercent ? safeValue * (discountValue / 100) : discountValue;
    const adjusted = Math.max(0, safeValue - discount);
    return Number(adjusted.toFixed(2));
  };

  const nextOption: PaymentOptionItem = {
    ...option,
    appliedVoucher: {
      code: voucher.code,
      title: voucher.title || null,
      discountType: voucher.discountType,
      discountValue: discountValue,
      appliesTo: voucher.appliesTo,
      discountLabel: voucher.discountLabel,
      installmentScope,
      targetLabel:
        voucher.targetLabel ||
        (appliesToInstallment
          ? installmentScope === 'SINGLE'
            ? 'uma mensalidade'
            : 'todas as mensalidades'
          : 'curso inteiro'),
    },
  };

  if (appliesToInstallment && String(option.type || '').toUpperCase() === 'INSTALLMENTS') {
    const baseInstallment = resolveOptionInstallmentAmount(option);
    if (installmentScope === 'SINGLE') {
      const adjustedFirstInstallment = applyDiscount(baseInstallment);
      nextOption.installmentAmount = baseInstallment;
      nextOption.totalAmount = Number(
        (
          adjustedFirstInstallment + baseInstallment * Math.max(0, installmentCount - 1)
        ).toFixed(2),
      );
      nextOption.appliedVoucher = {
        ...nextOption.appliedVoucher,
        discountedInstallments: 1,
        discountedInstallmentAmount: adjustedFirstInstallment,
        regularInstallmentAmount: baseInstallment,
      };
      return nextOption;
    }

    const adjustedInstallment = applyDiscount(baseInstallment);
    nextOption.installmentAmount = adjustedInstallment;
    nextOption.totalAmount = Number((adjustedInstallment * installmentCount).toFixed(2));
    nextOption.appliedVoucher = {
      ...nextOption.appliedVoucher,
      discountedInstallments: installmentCount,
      discountedInstallmentAmount: adjustedInstallment,
      regularInstallmentAmount: baseInstallment,
    };

    if (Number(option.discountInstallmentAmount || 0) > 0) {
      const discountedInstallment = applyDiscount(Number(option.discountInstallmentAmount || 0));
      nextOption.discountInstallmentAmount = discountedInstallment;
      nextOption.discountTotalAmount = Number((discountedInstallment * installmentCount).toFixed(2));
    } else if (Number(option.discountTotalAmount || 0) > 0) {
      const discountedTotal = applyDiscount(Number(option.discountTotalAmount || 0));
      nextOption.discountTotalAmount = discountedTotal;
      nextOption.discountInstallmentAmount = Number((discountedTotal / installmentCount).toFixed(2));
    }

    if (Number(option.promotionalInstallmentAmount || 0) > 0) {
      const promotionalInstallment = applyDiscount(
        Number(option.promotionalInstallmentAmount || 0),
      );
      nextOption.promotionalInstallmentAmount = promotionalInstallment;
      nextOption.promotionalTotalAmount = Number((promotionalInstallment * installmentCount).toFixed(2));
    } else if (Number(option.promotionalTotalAmount || 0) > 0) {
      const promotionalTotal = applyDiscount(Number(option.promotionalTotalAmount || 0));
      nextOption.promotionalTotalAmount = promotionalTotal;
      nextOption.promotionalInstallmentAmount = Number((promotionalTotal / installmentCount).toFixed(2));
    }

    if (Number(option.promotionalDiscountInstallmentAmount || 0) > 0) {
      const promotionalDiscountInstallment = applyDiscount(
        Number(option.promotionalDiscountInstallmentAmount || 0),
      );
      nextOption.promotionalDiscountInstallmentAmount = promotionalDiscountInstallment;
      nextOption.promotionalDiscountTotalAmount = Number(
        (promotionalDiscountInstallment * installmentCount).toFixed(2),
      );
    } else if (Number(option.promotionalDiscountTotalAmount || 0) > 0) {
      const promotionalDiscountTotal = applyDiscount(
        Number(option.promotionalDiscountTotalAmount || 0),
      );
      nextOption.promotionalDiscountTotalAmount = promotionalDiscountTotal;
      nextOption.promotionalDiscountInstallmentAmount = Number(
        (promotionalDiscountTotal / installmentCount).toFixed(2),
      );
    }

    return nextOption;
  }

  const currentTotal = resolveOptionTotalAmount(option);
  const adjustedTotal = applyDiscount(currentTotal);
  nextOption.totalAmount = adjustedTotal;
  if (String(option.type || '').toUpperCase() === 'INSTALLMENTS') {
    nextOption.installmentAmount = Number((adjustedTotal / installmentCount).toFixed(2));
  }

  if (Number(option.discountTotalAmount || 0) > 0) {
    nextOption.discountTotalAmount = applyDiscount(Number(option.discountTotalAmount || 0));
  }
  if (String(option.type || '').toUpperCase() === 'INSTALLMENTS') {
    nextOption.discountInstallmentAmount =
      Number(nextOption.discountTotalAmount || 0) > 0
        ? Number((Number(nextOption.discountTotalAmount || 0) / installmentCount).toFixed(2))
        : null;
  }

  if (Number(option.promotionalTotalAmount || 0) > 0) {
    nextOption.promotionalTotalAmount = applyDiscount(Number(option.promotionalTotalAmount || 0));
  }
  if (String(option.type || '').toUpperCase() === 'INSTALLMENTS') {
    nextOption.promotionalInstallmentAmount =
      Number(nextOption.promotionalTotalAmount || 0) > 0
        ? Number((Number(nextOption.promotionalTotalAmount || 0) / installmentCount).toFixed(2))
        : null;
  }

  if (Number(option.promotionalDiscountTotalAmount || 0) > 0) {
    nextOption.promotionalDiscountTotalAmount = applyDiscount(
      Number(option.promotionalDiscountTotalAmount || 0),
    );
  }
  if (String(option.type || '').toUpperCase() === 'INSTALLMENTS') {
    nextOption.promotionalDiscountInstallmentAmount =
      Number(nextOption.promotionalDiscountTotalAmount || 0) > 0
        ? Number(
            (
              Number(nextOption.promotionalDiscountTotalAmount || 0) /
              installmentCount
            ).toFixed(2),
          )
        : null;
  }

  return nextOption;
}

async function requestWithRetry(input: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(input, init);
    if (response.status === 429 && attempt === 0) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '');
      const retryDelayMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 900;
      await sleep(retryDelayMs);
      continue;
    }

    return response;
  }

  throw new Error('Limite de requisições atingido temporariamente.');
}

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    return toPtBrApiMessage(payload.message, 'Não foi possível concluir o cadastro.');
  } catch {
    // ignore
  }
  return 'Não foi possível concluir o cadastro.';
}
export function StudentRegistrationNative({ embedded }: StudentRegistrationNativeProps) {
  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [codeError, setCodeError] = useState('');
  const [coursesError, setCoursesError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const hasMountedRef = useRef(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [documentCpf, setDocumentCpf] = useState('');
  const [documentRg, setDocumentRg] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthCity, setBirthCity] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');

  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [graduation, setGraduation] = useState('');
  const [graduationConclusionYear, setGraduationConclusionYear] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [zipCode, setZipCode] = useState('');
  const [address, setAddress] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipLookupLoading, setZipLookupLoading] = useState(false);
  const [zipLookupError, setZipLookupError] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedPaymentOptionId, setSelectedPaymentOptionId] = useState('');
  const [expandedPaymentOptions, setExpandedPaymentOptions] = useState<Record<string, boolean>>({});
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherValidating, setVoucherValidating] = useState(false);
  const [voucherError, setVoucherError] = useState('');
  const [voucherFeedback, setVoucherFeedback] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherValidationResponse | null>(null);

  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const isFinalStep = currentStep === steps.length - 1;
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );
  const selectedCourseBasePaymentOptions = useMemo(
    () => (selectedCourse ? getActivePaymentOptions(selectedCourse) : []),
    [selectedCourse],
  );
  const selectedCoursePaymentOptions = useMemo(
    () =>
      selectedCourseBasePaymentOptions.map((option) =>
        appliedVoucher ? applyVoucherToPaymentOption(option, appliedVoucher) : option,
      ),
    [selectedCourseBasePaymentOptions, appliedVoucher],
  );
  const selectedPaymentOption = useMemo(
    () =>
      selectedCoursePaymentOptions.find(
        (option) => String(option.id || '') === selectedPaymentOptionId,
      ) ?? null,
    [selectedCoursePaymentOptions, selectedPaymentOptionId],
  );

  useEffect(() => {
    if (!selectedCourseId) {
      setSelectedPaymentOptionId('');
      return;
    }
    if (selectedCoursePaymentOptions.length === 0) {
      setSelectedPaymentOptionId('');
      return;
    }
    const hasCurrent = selectedCoursePaymentOptions.some(
      (option) => String(option.id || '') === selectedPaymentOptionId,
    );
    if (!hasCurrent) {
      setSelectedPaymentOptionId(String(selectedCoursePaymentOptions[0]?.id || ''));
    }
  }, [selectedCourseId, selectedCoursePaymentOptions, selectedPaymentOptionId]);

  useEffect(() => {
    setVoucherCode('');
    setVoucherError('');
    setVoucherFeedback('');
    setAppliedVoucher(null);
  }, [selectedCourseId]);

  useEffect(() => {
    if (!embedded) return undefined;

    document.body.classList.add('is-student-register-embedded');
    document.documentElement.classList.add('is-student-register-embedded');

    return () => {
      document.body.classList.remove('is-student-register-embedded');
      document.documentElement.classList.remove('is-student-register-embedded');
    };
  }, [embedded]);

  useEffect(() => {
    if (!embedded) return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const requestScrollTop = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.parent.postMessage({ type: 'seven-academy:scroll-top' }, '*');
    };

    window.requestAnimationFrame(requestScrollTop);
    window.setTimeout(requestScrollTop, 80);
  }, [embedded, currentStep]);

  useEffect(() => {
    const zipDigits = onlyDigits(zipCode);
    if (zipDigits.length !== 8) {
      setZipLookupLoading(false);
      setZipLookupError('');
      return;
    }

    const controller = new AbortController();
    const loadAddressByZip = async () => {
      setZipLookupLoading(true);
      setZipLookupError('');
      try {
        const response = await fetch(`https://viacep.com.br/ws/${zipDigits}/json/`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Falha ao consultar CEP.');
        }
        const data = (await response.json()) as ViaCepResponse;
        if (data.erro) {
          setZipLookupError('CEP não encontrado. Preencha o endereço manualmente.');
          return;
        }
        const viaCepStreet = String(data.logradouro || '').trim();
        const viaCepComplement = String(data.complemento || '').trim();
        const viaCepNeighborhood = String(data.bairro || '').trim();
        const viaCepCity = String(data.localidade || '').trim();
        const viaCepState = String(data.uf || '')
          .trim()
          .toUpperCase();

        if (viaCepStreet) setAddress(viaCepStreet);
        if (viaCepComplement) setComplement(viaCepComplement);
        if (viaCepNeighborhood) setNeighborhood(viaCepNeighborhood);
        if (viaCepCity) setCity(viaCepCity);
        if (viaCepState) setState(viaCepState);
      } catch (lookupError) {
        if (controller.signal.aborted) return;
        setZipLookupError(
          lookupError instanceof Error
            ? lookupError.message
            : 'Não foi possível consultar o CEP.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setZipLookupLoading(false);
        }
      }
    };

    void loadAddressByZip();
    return () => controller.abort();
  }, [zipCode]);

  useEffect(() => {
    if (
      currentStep === 0 &&
      !selectedCourseId &&
      error === 'Selecione um curso para concluir o cadastro.'
    ) {
      setError('');
    }
  }, [currentStep, selectedCourseId, error]);

  const loadCourses = async () => {
    setCoursesLoading(true);
    setCoursesError('');
    try {
      const response = await requestWithRetry(`${API_BASE_URL}/mis/v1/public/cursos`);
      if (!response.ok) throw new Error(await readError(response));

      const payload = (await response.json()) as CourseCatalogItem[];
      const onlyActive = Array.isArray(payload)
        ? payload.filter((item) => String(item.status || '').toUpperCase() === 'ACTIVE')
        : [];
      setCourses(onlyActive);
    } catch (coursesLoadError) {
      setCoursesError(
        coursesLoadError instanceof Error
          ? coursesLoadError.message
          : 'Não foi possível carregar os cursos.',
      );
    } finally {
      setCoursesLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  const clearAppliedVoucher = () => {
    setAppliedVoucher(null);
    setVoucherError('');
    setVoucherFeedback('');
  };

  const validateVoucher = async () => {
    const normalizedCourseId = String(selectedCourseId || '').trim();
    const normalizedCode = String(voucherCode || '').trim().toUpperCase();
    setVoucherError('');
    setVoucherFeedback('');

    if (!normalizedCourseId) {
      setVoucherError('Selecione um curso antes de validar o voucher.');
      return;
    }

    if (!normalizedCode) {
      setVoucherError('Informe o código do voucher para validar.');
      return;
    }

    setVoucherValidating(true);
    try {
      const response = await requestWithRetry(
        `${API_BASE_URL}/mis/v1/public/cursos/${normalizedCourseId}/voucher/validate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: normalizedCode }),
        },
      );
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as VoucherValidationResponse;
      setAppliedVoucher(payload);
      setVoucherCode(payload.code || normalizedCode);
      if (error === 'Valide o voucher de desconto antes de concluir a matrícula.') {
        setError('');
      }
      setVoucherFeedback(
        `Voucher ativo: ${payload.discountLabel || 'desconto aplicado'}.`,
      );
    } catch (validationError) {
      clearAppliedVoucher();
      setVoucherError(
        validationError instanceof Error
          ? validationError.message
          : 'Não foi possível validar o voucher informado.',
      );
    } finally {
      setVoucherValidating(false);
    }
  };

  const buildPortalLink = () => {
    return STUDENT_PORTAL_LOGIN_URL;
  };

  const redirectToPortal = () => {
    const portalLink = buildPortalLink();
    try {
      if (embedded && window.top) {
        window.top.location.href = portalLink;
        return;
      }
    } catch {
      // fallback para navegação local quando não houver acesso ao top
    }
    window.location.href = portalLink;
  };

  const validateStepOne = () => {
    if (!name.trim() || name.trim().length < 3) return 'Informe seu nome completo.';
    if (!isValidPersonName(name)) return 'O nome deve conter nome e sobrenome, usando apenas letras.';
    if (!isValidPhone(phone)) return 'Informe um telefone válido com DDD.';
    if (!emailRegex.test(email.trim())) return 'Informe um e-mail válido.';
    if (!isValidCpf(documentCpf)) return 'Informe um CPF válido.';
    if (!isValidRg(documentRg)) return 'Informe um RG válido.';
    if (!issuingAuthority.trim()) return 'Informe o órgão expedidor do RG.';
    if (!isValidBirthDate(birthDate)) return 'Informe uma data de nascimento válida no formato DD/MM/AAAA.';
    if (!birthCity.trim()) return 'Informe a cidade em que nasceu.';
    if (!maritalStatus) return 'Selecione o estado civil.';
    if (!isValidZipCode(zipCode)) return 'Informe um CEP válido com 8 dígitos.';
    if (!address.trim()) return 'Informe a rua/endereço.';
    if (!streetNumber.trim()) return 'Informe o número da residência.';
    if (!neighborhood.trim()) return 'Informe o bairro.';
    if (!city.trim()) return 'Informe a cidade.';
    if (!/^[A-Za-z]{2}$/.test(state.trim())) return 'Informe a UF com 2 letras.';
    return '';
  };

  const validateStepTwo = () => {
    if (!fatherName.trim() || !isValidPersonName(fatherName)) return 'Informe o nome completo do pai.';
    if (!motherName.trim() || !isValidPersonName(motherName)) return 'Informe o nome completo da mãe.';
    if (!graduation.trim()) return 'Informe sua graduação.';
    if (!isValidGraduationConclusionYear(graduationConclusionYear)) return 'Informe um ano de conclusão da graduação válido.';
    return '';
  };

  const validateStepThree = () => {
    if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return 'A senha deve conter pelo menos letras e números.';
    }
    if (!confirmPassword) return 'Confirme sua senha para continuar.';
    if (password !== confirmPassword) return 'A confirmação de senha não confere.';
    return '';
  };

  const validateStepFour = () => {
    if (coursesLoading) return 'Aguarde o carregamento dos cursos.';
    if (!selectedCourseId) return 'Selecione um curso para concluir o cadastro.';
    if (voucherCode.trim() && !appliedVoucher) {
      return 'Valide o voucher de desconto antes de concluir a matrícula.';
    }
    if (
      appliedVoucher &&
      selectedPaymentOption &&
      !isVoucherApplicableToOption(selectedPaymentOption, appliedVoucher)
    ) {
      return 'Selecione uma forma de pagamento compatível com o voucher aplicado.';
    }
    if (selectedCoursePaymentOptions.length > 0 && !selectedPaymentOptionId) {
      return 'Selecione a forma de pagamento para concluir a matrícula.';
    }
    return '';
  };

  const goToNextStep = async () => {
    await Promise.resolve();
    setError('');
    const validation =
      currentStep === 0
        ? validateStepFour()
        : currentStep === 1
          ? validateStepOne()
          : currentStep === 2
            ? validateStepTwo()
            : '';

    if (validation) {
      setError(validation);
      return;
    }

    setCurrentStep((previous) => Math.min(previous + 1, steps.length - 1));
  };

  const goToPreviousStep = () => {
    setError('');
    setCurrentStep((previous) => Math.max(previous - 1, 0));
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setDocumentCpf('');
    setDocumentRg('');
    setIssuingAuthority('');
    setBirthDate('');
    setBirthCity('');
    setMaritalStatus('');
    setFatherName('');
    setMotherName('');
    setGraduation('');
    setGraduationConclusionYear('');
    setCompanyName('');
    setJobTitle('');
    setPassword('');
    setConfirmPassword('');
    setZipCode('');
    setAddress('');
    setStreetNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setState('');
    setZipLookupLoading(false);
    setZipLookupError('');
    setSelectedCourseId('');
    setSelectedPaymentOptionId('');
    setVoucherCode('');
    setVoucherError('');
    setVoucherFeedback('');
    setAppliedVoucher(null);
    setCurrentStep(0);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setCodeError('');

    const allValidations = [validateStepFour(), validateStepOne(), validateStepTwo(), validateStepThree()].filter(Boolean);
    if (allValidations.length > 0) {
      setError(allValidations[0] || 'Revise os campos obrigatórios.');
      return;
    }

    const payload: RegistrationPayload = {
      name: name.trim().replace(/\s{2,}/g, ' '),
      phone: onlyDigits(phone),
      email: email.trim().toLowerCase(),
      documentCpf: onlyDigits(documentCpf),
      documentRg: onlyDigits(documentRg),
      issuingAuthority: issuingAuthority.trim(),
      birthDate: birthDateToIso(birthDate),
      birthCity: birthCity.trim(),
      maritalStatus,
      address: `${address.trim()}, ${streetNumber.trim()} - ${neighborhood.trim()} - ${city.trim()} - ${state
        .trim()
        .toUpperCase()}`,
      zipCode: onlyDigits(zipCode),
      fatherName: fatherName.trim().replace(/\s{2,}/g, ' '),
      motherName: motherName.trim().replace(/\s{2,}/g, ' '),
      graduation: graduation.trim(),
      graduationConclusionYear: Number(onlyDigits(graduationConclusionYear)),
      companyName: companyName.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      password,
      street: address.trim(),
      streetNumber: streetNumber.trim(),
      complement: complement.trim() || undefined,
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      courseIds: selectedCourseId ? [selectedCourseId] : undefined,
      selectedPaymentOptionId: selectedPaymentOptionId || undefined,
      selectedVoucherCode:
        appliedVoucher &&
        selectedPaymentOption &&
        isVoucherApplicableToOption(selectedPaymentOption, appliedVoucher)
          ? appliedVoucher.code
          : undefined,
    };

    setLoading(true);
    try {
      const response = await requestWithRetry(`${API_BASE_URL}/mis/v1/public/cadastros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await readError(response));
      setPendingVerificationEmail(payload.email);
      setVerificationCode('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const confirmVerificationCode = async () => {
    setCodeError('');
    if (!pendingVerificationEmail) return;

    const code = verificationCode.trim();
    if (code.length !== 6) {
      setCodeError('Digite o código de 6 dígitos enviado para o seu e-mail.');
      return;
    }

    setCodeLoading(true);
    try {
      const response = await requestWithRetry(`${API_BASE_URL}/auth/verify-email-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerificationEmail, code }),
      });

      if (!response.ok) throw new Error(await readError(response));

      setPendingVerificationEmail('');
      setVerificationCode('');
      setSuccess('Cadastro realizado com sucesso. Seu e-mail foi confirmado.');
      resetForm();
    } catch (confirmError) {
      setCodeError(confirmError instanceof Error ? confirmError.message : 'Não foi possível confirmar o código.');
    } finally {
      setCodeLoading(false);
    }
  };

  useEffect(() => {
    if (!success) return undefined;
    const redirectTimer = window.setTimeout(() => {
      redirectToPortal();
    }, 1400);
    return () => window.clearTimeout(redirectTimer);
  }, [success, embedded]);

  return (
    <section className={`native-student-register ${embedded ? 'is-embedded' : ''}`}>
      <article className="native-student-register-card">
        <header>
          <h1>Formulário de matrícula</h1>
          <p>Preencha cada etapa com atenção para concluir seu cadastro de aluno.</p>
        </header>

        {error ? <p className="native-error">{error}</p> : null}

        <ol className="native-student-register-stepper" aria-label="Etapas do cadastro">
          {steps.map((step, index) => {
            const stateClass =
              index === currentStep
                ? 'is-active'
                : index < currentStep
                  ? 'is-done'
                  : 'is-pending';
            const allowStepSelection = index <= currentStep;

            return (
              <li key={step.title} className={`native-student-register-step ${stateClass}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (!allowStepSelection) return;
                    setCurrentStep(index);
                    setError('');
                  }}
                  disabled={!allowStepSelection || loading}
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.description}</small>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>

        <form className="native-form-grid native-student-register-form" onSubmit={submit} noValidate>
          {currentStep === 1 ? (
            <>
              <label>
                Nome completo *
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(normalizeNameInput(event.target.value))}
                  onBlur={() => setName((current) => current.trim().replace(/\s{2,}/g, ' '))}
                  disabled={loading}
                  autoComplete="name"
                />
              </label>

              <label>
                Telefone *
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(formatPhone(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="(00) 00000-0000"
                />
              </label>

              <label>
                E-mail *
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
              </label>

              <label>
                CPF *
                <input
                  type="text"
                  value={documentCpf}
                  onChange={(event) => setDocumentCpf(formatCpf(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                />
              </label>

              <label>
                RG *
                <input
                  type="text"
                  value={documentRg}
                  onChange={(event) => setDocumentRg(formatRg(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="00.000.000-0"
                />
              </label>

              <label>
                Órgão expedidor *
                <input
                  type="text"
                  value={issuingAuthority}
                  onChange={(event) => setIssuingAuthority(normalizeTextInput(event.target.value).toUpperCase())}
                  disabled={loading}
                  placeholder="Ex.: SSP"
                />
              </label>

              <label>
                Data de nascimento *
                <input
                  type="text"
                  value={birthDate}
                  onChange={(event) => setBirthDate(formatBirthDate(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  autoComplete="bday"
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                />
              </label>

              <label>
                Cidade que nasceu *
                <input
                  type="text"
                  value={birthCity}
                  onChange={(event) => setBirthCity(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                Estado civil *
                <select
                  value={maritalStatus}
                  onChange={(event) => setMaritalStatus(event.target.value)}
                  disabled={loading}
                >
                  <option value="">Selecione</option>
                  {maritalStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                CEP *
                <input
                  type="text"
                  value={zipCode}
                  onChange={(event) => setZipCode(formatZipCode(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="00000-000"
                />
                {zipLookupLoading ? <small>Consultando CEP...</small> : null}
                {zipLookupError ? <small className="native-error">{zipLookupError}</small> : null}
              </label>

              <label className="full">
                Endereço *
                <input
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(normalizeTextInput(event.target.value))}
                  disabled={loading}
                  placeholder="Rua/avenida"
                />
              </label>

              <label>
                Número *
                <input
                  type="text"
                  value={streetNumber}
                  onChange={(event) =>
                    setStreetNumber(event.target.value.replace(/[^\dA-Za-z/-]/g, ''))
                  }
                  disabled={loading}
                  placeholder="Ex.: 123"
                />
              </label>

              <label>
                Complemento
                <input
                  type="text"
                  value={complement}
                  onChange={(event) => setComplement(normalizeTextInput(event.target.value))}
                  disabled={loading}
                  placeholder="Ex.: Apto 101"
                />
              </label>

              <label>
                Bairro *
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(event) => setNeighborhood(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                Cidade *
                <input
                  type="text"
                  value={city}
                  onChange={(event) => setCity(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                UF *
                <input
                  type="text"
                  value={state}
                  onChange={(event) =>
                    setState(event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())
                  }
                  disabled={loading}
                  placeholder="Ex.: MT"
                />
              </label>
            </>
          ) : null}

          {currentStep === 2 ? (
            <>
              <label>
                Nome do pai *
                <input
                  type="text"
                  value={fatherName}
                  onChange={(event) => setFatherName(normalizeNameInput(event.target.value))}
                  onBlur={() => setFatherName((current) => current.trim().replace(/\s{2,}/g, ' '))}
                  disabled={loading}
                />
              </label>

              <label>
                Nome da mãe *
                <input
                  type="text"
                  value={motherName}
                  onChange={(event) => setMotherName(normalizeNameInput(event.target.value))}
                  onBlur={() => setMotherName((current) => current.trim().replace(/\s{2,}/g, ' '))}
                  disabled={loading}
                />
              </label>

              <label>
                Graduação *
                <input
                  type="text"
                  value={graduation}
                  onChange={(event) => setGraduation(normalizeTextInput(event.target.value))}
                  disabled={loading}
                  placeholder="Ex.: Administração"
                />
              </label>

              <label>
                Ano de conclusão da graduação *
                <input
                  type="text"
                  value={graduationConclusionYear}
                  onChange={(event) => setGraduationConclusionYear(formatGraduationYear(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="AAAA"
                  maxLength={4}
                />
              </label>
            </>
          ) : null}
          {currentStep === 3 ? (
            <>
              <label>
                Empresa onde trabalha
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                Cargo
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                Senha de acesso *
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
                {password ? (
                  <div className={`native-student-password-strength ${strength.toneClass}`}>
                    <small>Força da senha: {strength.label}</small>
                    <small className="native-student-password-requirements">
                      Mínimo 8 caracteres, com letras e números.
                    </small>
                  </div>
                ) : null}
              </label>

              <label>
                Confirmar senha *
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </label>
            </>
          ) : null}

          {currentStep === 0 ? (
            <>
              <section className="native-student-register-courses full" aria-label="Escolha do curso">
                <header className="native-student-register-courses-header">
                  <h3>Curso no IES</h3>
                  <p>Selecione o curso e a forma de pagamento para continuar.</p>
                </header>

                {coursesLoading ? <p className="native-info">Carregando cursos...</p> : null}

                {!coursesLoading && coursesError ? (
                  <div className="native-public-course-empty">
                    <p>{coursesError}</p>
                    <button type="button" onClick={() => void loadCourses()} disabled={loading}>
                      Tentar novamente
                    </button>
                  </div>
                ) : null}

                {!coursesLoading && !coursesError && courses.length === 0 ? (
                  <div className="native-public-course-empty">
                    <p>Nenhum curso disponível no momento.</p>
                  </div>
                ) : null}

                {!coursesLoading && !coursesError && courses.length > 0 ? (
                  <div className="native-public-course-grid">
                    {courses.map((course) => {
                      const selected = selectedCourseId === course.id;
                      const coursePaymentOptions = getActivePaymentOptions(course);
                      return (
                        <button
                          key={course.id}
                          type="button"
                          className={`native-public-course-card ${selected ? 'is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedCourseId(course.id);
                            if (
                              error === 'Selecione um curso para concluir o cadastro.' ||
                              error === 'Selecione a forma de pagamento para concluir a matrícula.'
                            ) {
                              setError('');
                            }
                          }}
                          disabled={loading}
                        >
                          {course.bannerUrl ? (
                            <img src={course.bannerUrl} alt={`Banner do curso ${course.name}`} />
                          ) : (
                            <div className="native-public-course-banner-fallback">
                              <span>{course.name}</span>
                            </div>
                          )}
                          <div className="native-public-course-content">
                            <header>
                              <h4>{course.name}</h4>
                              <span>{modalityLabel(course.modality)}</span>
                            </header>
                            <p>{course.description || 'Curso acadêmico profissional.'}</p>
                            <dl>
                              {Number(course.workloadHours || 0) > 0 ? (
                                <div>
                                  <dt>Carga horária</dt>
                                  <dd>{`${course.workloadHours}h`}</dd>
                                </div>
                              ) : null}
                              <div>
                                <dt>Categoria</dt>
                                <dd>{course.category || 'Não informada'}</dd>
                              </div>
                              <div>
                                <dt>Professor</dt>
                                <dd>{course.coordinator || 'Não informado'}</dd>
                              </div>
                            </dl>
                            <section className="native-public-course-payments" aria-label={`Opções de pagamento de ${course.name}`}>
                              <strong>Opções de pagamento</strong>
                              {coursePaymentOptions.length > 0 ? (
                                <div>
                                  {coursePaymentOptions.map((option) => {
                                    const detailLines = paymentOptionDetailLines(option);
                                    return (
                                      <article key={String(option.id || paymentOptionSummary(option))}>
                                        <span>{option.title || paymentOptionSummary(option)}</span>
                                        <b>{paymentOptionSummary(option)}</b>
                                        {detailLines.map((line, index) => (
                                          <small
                                            key={`${String(option.id || '')}-${line.text}-${index}`}
                                            className={
                                              line.tone === 'highlight'
                                                ? 'is-highlight'
                                                : line.tone === 'secondary'
                                                  ? 'is-secondary'
                                                  : undefined
                                            }
                                          >
                                            {line.text}
                                          </small>
                                        ))}
                                      </article>
                                    );
                                  })}
                                </div>
                              ) : (
                                <small>Consulte as condições de pagamento.</small>
                              )}
                            </section>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {selectedCourse ? (
                  <section className="native-course-voucher-validator">
                    <header>
                      <h4>Voucher de desconto</h4>
                      <p>Se você recebeu um voucher, valide o código antes de escolher o pagamento.</p>
                    </header>
                    <div className="native-course-voucher-validator-row">
                      <input
                        type="text"
                        value={voucherCode}
                        onChange={(event) => {
                          setVoucherCode(
                            event.target.value
                              .toUpperCase()
                              .replace(/\s+/g, '')
                              .replace(/[^A-Z0-9_-]/g, ''),
                          );
                          setVoucherError('');
                          setVoucherFeedback('');
                          if (appliedVoucher) {
                            setAppliedVoucher(null);
                          }
                        }}
                        maxLength={40}
                        placeholder="Ex.: BEMVINDO15"
                        disabled={loading || voucherValidating}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void validateVoucher();
                        }}
                        disabled={loading || voucherValidating || !voucherCode.trim()}
                      >
                        {voucherValidating ? 'Validando...' : 'Validar voucher'}
                      </button>
                      {appliedVoucher ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={clearAppliedVoucher}
                          disabled={loading || voucherValidating}
                        >
                          Remover voucher
                        </button>
                      ) : null}
                    </div>
                    {voucherError ? <p className="native-error">{voucherError}</p> : null}
                    {!voucherError && voucherFeedback ? (
                      <p className="native-success">{voucherFeedback}</p>
                    ) : null}
                  </section>
                ) : null}

                {selectedCourse && selectedCoursePaymentOptions.length > 0 ? (
                  <section className="native-course-payment-selector">
                    <header>
                      <h4>Forma de pagamento</h4>
                      <p>
                        Escolha uma opção para esta matrícula e expanda para ver os
                        detalhes.
                      </p>
                    </header>
                    <div className="native-course-payment-list">
                      {selectedCoursePaymentOptions.map((option) => {
                        const optionId = String(option.id || '');
                        const selected = selectedPaymentOptionId === optionId;
                        const expanded = Boolean(expandedPaymentOptions[optionId]);
                        const detailLines = paymentOptionDetailLines(option);
                        return (
                          <details
                            key={optionId || paymentOptionSummary(option)}
                            className={`native-course-payment-item ${selected ? 'is-selected' : ''}`}
                            onToggle={(event) => {
                              if (!optionId) return;
                              const detailsElement = event.currentTarget;
                              setExpandedPaymentOptions((current) => ({
                                ...current,
                                [optionId]: detailsElement.open,
                              }));
                            }}
                          >
                            <summary>
                              <div>
                                <strong>{option.title || paymentOptionSummary(option)}</strong>
                                <span>{paymentOptionSummary(option)}</span>
                              </div>
                              <div className="native-course-payment-summary-actions">
                                <span className="native-course-payment-expand-icon" aria-hidden="true">
                                  {expanded ? (
                                    <svg viewBox="0 0 16 16" fill="none" focusable="false">
                                      <path
                                        d="M4 6.5L8 10L12 6.5"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 16 16" fill="none" focusable="false">
                                      <path
                                        d="M6.5 4L10 8L6.5 12"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </span>
                                {String(option.appliedVoucher?.discountLabel || '').trim() ? (
                                  <span className="native-course-payment-voucher-chip">
                                    Voucher aplicado:{' '}
                                    {String(option.appliedVoucher?.discountLabel || '').trim()}
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setSelectedPaymentOptionId(optionId);
                                    if (
                                      error === 'Selecione a forma de pagamento para concluir a matrícula.'
                                    ) {
                                      setError('');
                                    }
                                  }}
                                >
                                  {selected ? 'Selecionada' : 'Selecionar'}
                                </button>
                              </div>
                            </summary>
                            <div className="native-course-payment-item-body">
                              {detailLines.map((line, index) => (
                                <p
                                  key={`${optionId}-${line.text}-${index}`}
                                  className={
                                    line.tone === 'highlight'
                                      ? 'is-highlight'
                                      : line.tone === 'secondary'
                                        ? 'is-secondary'
                                        : undefined
                                  }
                                >
                                  {line.text}
                                </p>
                              ))}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </section>
            </>
          ) : null}

          <div className="native-student-register-actions full">
            {currentStep > 0 ? (
              <button type="button" className="ghost" onClick={goToPreviousStep} disabled={loading}>
                Voltar etapa
              </button>
            ) : (
              <span />
            )}

            {isFinalStep ? (
              <button
                type="submit"
                disabled={loading || coursesLoading || codeLoading || Boolean(pendingVerificationEmail) || Boolean(success)}
              >
                {loading ? 'Concluindo cadastro...' : 'Finalizar matrícula e criar acesso'}
              </button>
            ) : (
              <button type="button" onClick={() => void goToNextStep()} disabled={loading}>
                Continuar
              </button>
            )}
          </div>
        </form>
      </article>

      {pendingVerificationEmail ? (
        <div className="native-student-register-modal-backdrop" role="presentation">
          <div className="native-student-register-modal" role="dialog" aria-modal="true" aria-labelledby="student-register-confirm-title">
            <h3 id="student-register-confirm-title">Confirme seu e-mail</h3>
            <p>
              Digite o código de 6 dígitos enviado para <strong>{pendingVerificationEmail}</strong>.
            </p>
            <label>
              Código de confirmação
              <input
                type="text"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D+/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                autoFocus
              />
            </label>
            {codeError ? <p className="native-error">{codeError}</p> : null}
            <button type="button" onClick={() => void confirmVerificationCode()} disabled={codeLoading}>
              {codeLoading ? 'Confirmando código...' : 'Confirmar código'}
            </button>
          </div>
        </div>
      ) : null}

      {success ? (
        <div className="native-student-register-modal-backdrop" role="presentation">
          <div className="native-student-register-modal" role="dialog" aria-modal="true" aria-labelledby="student-register-success-title">
            <h3 id="student-register-success-title">Cadastro concluído</h3>
            <p>{success}</p>
            <a className="native-student-register-login-link" href={buildPortalLink()} target="_top" rel="noreferrer">
              Ir para login
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
