import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { apiRequest } from './api';
import { StudentContractsNative } from './StudentContractsNative';

type StudentProfile = {
  documentCpf: string | null;
  phone: string | null;
  birthDate: string | null;
  city: string | null;
  state: string | null;
};

type StudentInstitution = {
  id: string;
  name: string;
  slug: string;
  contacts?: {
    supportEmail: string | null;
    supportPhone: string | null;
    commercialEmail: string | null;
    commercialPhone: string | null;
  };
};

type StudentBrandingPalette = {
  primaryColor: string;
  primaryStrongColor: string;
  secondaryColor: string;
  secondaryStrongColor: string;
  backgroundColor: string;
  surfaceColor: string;
  surfaceSoftColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

type StudentBranding = {
  logoUrl: string;
  palette: StudentBrandingPalette;
  isCustom: boolean;
};

type StudentMe = {
  id: string;
  name: string;
  email: string;
  studentProfile: StudentProfile | null;
  institution?: StudentInstitution | null;
  branding?: StudentBranding | null;
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

type StudentContractNoticeItem = {
  id: string;
  status: string;
  signedAt?: string | null;
  institutionSignedAt?: string | null;
  institutionSignaturePending?: boolean;
};

type StudentNoticeFeedItem = {
  id: string;
  title: string;
  body: string;
  priority: 'high' | 'normal' | string;
  className: string;
  publishedAt: string | null;
  isContractReminder?: boolean;
};

type StudentAgendaEvent = {
  id: string;
  type: 'class' | 'live' | string;
  title: string;
  classId: string | null;
  className: string;
  teacher: string;
  datetime: string;
  provider: string | null;
};

type StudentAttendanceHistoryItem = {
  id: string;
  classId: string;
  className: string;
  courseName: string;
  title: string;
  datetime: string;
  status: 'present' | 'absent' | 'pending';
  note: string | null;
};

type StudentAttendanceSummary = {
  totalOccurred: number;
  present: number;
  absent: number;
  pending: number;
  evaluated: number;
  frequencyPercent: number;
  history: StudentAttendanceHistoryItem[];
};

type StudentDashboardPayload = {
  me: StudentMe;
  matriculas: StudentEnrollment[];
  materiais: StudentMaterial[];
  avisos: StudentNotice[];
  cobrancas: StudentCharge[];
  agenda: StudentAgendaEvent[];
};

type StudentCharge = {
  id: string;
  enrollmentId: string;
  dueDate: string | null;
  amount: number;
  status: string;
  description?: string | null;
  paymentMethod?: 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD' | string;
  gatewayProvider?: 'manual' | 'sicoob' | 'asaas' | 'stripe' | string | null;
  gatewayIsActive?: boolean;
  creditCardUnsupported?: boolean;
  paymentOptionTitle?: string | null;
  appliedVoucher?: {
    code: string;
    title?: string | null;
    discountType?: 'PERCENT' | 'FIXED' | string;
    discountValue?: number | null;
    appliesTo?: 'TOTAL' | 'INSTALLMENT' | string;
    installmentScope?: 'ALL' | 'SINGLE' | string;
    discountLabel?: string | null;
    targetLabel?: string | null;
  } | null;
  canPay?: boolean;
  externalChargeId: string | null;
  className: string;
  courseName: string;
  lastTransaction: {
    id: string;
    provider: string;
    status: string;
    amount: number;
    paidAt: string | null;
    createdAt: string | null;
  } | null;
};

type StudentChargePaymentResponse = {
  chargeId: string;
  provider: string;
  method: 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD' | string;
  checkoutUrl: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  bankSlipViewUrl?: string | null;
  bankSlipDownloadUrl?: string | null;
  bankSlipDigitableLine?: string | null;
  pixCopyPaste: string | null;
  pixQrCodeImage: string | null;
  message: string;
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
  studentCourse?: {
    id: string;
    selectedPaymentOption?: {
      appliedVoucher?: {
        code?: string;
        discountLabel?: string;
        discountType?: 'PERCENT' | 'FIXED' | string;
        discountValue?: number | null;
        appliesTo?: 'TOTAL' | 'INSTALLMENT' | string;
        installmentScope?: 'ALL' | 'SINGLE' | string;
        targetLabel?: string | null;
      } | null;
    } | null;
    course?: { id: string; name: string } | null;
  } | null;
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
const REFRESH_MS = 30_000;
const REQUIRED_SIGNED_CONTRACTS_TO_UNLOCK = 2;
const STUDENT_CHARGE_PAYMENT_CACHE_KEY = 'student-charge-payment-cache-v1';
const DEFAULT_STUDENT_BRANDING_LOGO_URL = '/Logo-IPESK.png';
const DEFAULT_STUDENT_BRANDING_PALETTE: StudentBrandingPalette = {
  primaryColor: '#139395',
  primaryStrongColor: '#0f7f81',
  secondaryColor: '#283e6e',
  secondaryStrongColor: '#1f3158',
  backgroundColor: '#eff3f4',
  surfaceColor: '#ffffff',
  surfaceSoftColor: '#f6f8f9',
  borderColor: '#d9e2e7',
  textColor: '#243650',
  mutedColor: '#5f7087',
};

const SECTION_IDS = [
  'st-student-panel',
  'st-student-course',
  'st-student-classes',
  'st-student-agenda',
  'st-student-finance',
  'st-student-live',
  'st-student-notices',
  'st-student-contracts',
  'st-student-materials',
  'st-student-certificate',
  'st-student-profile',
] as const;

type SectionId = (typeof SECTION_IDS)[number];

type IconName =
  | 'dashboard'
  | 'school'
  | 'calendar_month'
  | 'live_tv'
  | 'checklist_rtl'
  | 'payments'
  | 'folder_open'
  | 'notifications_active'
  | 'description'
  | 'verified'
  | 'person'
  | 'search'
  | 'help'
  | 'event_note'
  | 'headset_mic'
  | 'visibility'
  | 'visibility_off';

type NavItem = {
  label: string;
  icon: IconName;
  target: SectionId;
};

type MobileNavItem = NavItem & {
  sections: SectionId[];
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Painel', icon: 'dashboard', target: 'st-student-panel' },
  { label: 'Aulas', icon: 'school', target: 'st-student-classes' },
  { label: 'Agenda', icon: 'calendar_month', target: 'st-student-agenda' },
  { label: 'Transmissões', icon: 'live_tv', target: 'st-student-live' },
  { label: 'Frequência', icon: 'checklist_rtl', target: 'st-student-course' },
  { label: 'Financeiro', icon: 'payments', target: 'st-student-finance' },
  { label: 'Contratos', icon: 'description', target: 'st-student-contracts' },
  { label: 'Materiais', icon: 'folder_open', target: 'st-student-materials' },
  { label: 'Notificações', icon: 'notifications_active', target: 'st-student-notices' },
  { label: 'Certificado', icon: 'verified', target: 'st-student-certificate' },
  { label: 'Perfil', icon: 'person', target: 'st-student-profile' },
];

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  {
    label: 'Painel',
    icon: 'dashboard',
    target: 'st-student-panel',
    sections: ['st-student-panel'],
  },
  {
    label: 'Aulas',
    icon: 'school',
    target: 'st-student-classes',
    sections: ['st-student-classes', 'st-student-agenda', 'st-student-live', 'st-student-course'],
  },
  {
    label: 'Financeiro',
    icon: 'payments',
    target: 'st-student-finance',
    sections: ['st-student-materials', 'st-student-finance', 'st-student-contracts'],
  },
  {
    label: 'Notificações',
    icon: 'notifications_active',
    target: 'st-student-notices',
    sections: ['st-student-notices', 'st-student-certificate'],
  },
  {
    label: 'Perfil',
    icon: 'person',
    target: 'st-student-profile',
    sections: ['st-student-profile'],
  },
];

const SECTION_META: Record<SectionId, { title: string; subtitle: string }> = {
  'st-student-panel': {
    title: 'Bem-vindo de volta, aluno!',
    subtitle: 'Seu painel acadêmico está sincronizado. Continue acompanhando suas atualizações.',
  },
  'st-student-course': {
    title: 'Frequência e desempenho',
    subtitle: 'Visão detalhada do andamento da sua jornada acadêmica.',
  },
  'st-student-classes': {
    title: 'Aulas',
    subtitle: 'Acompanhe as próximas aulas e a programação da sua turma.',
  },
  'st-student-agenda': {
    title: 'Agenda acadêmica',
    subtitle: 'Eventos organizados para você acompanhar os próximos compromissos.',
  },
  'st-student-finance': {
    title: 'Financeiro',
    subtitle: 'Acompanhe mensalidades, vencimentos e status das suas cobranças.',
  },
  'st-student-contracts': {
    title: 'Contratos',
    subtitle: 'Revise, valide com PIN e assine seus contratos eletrônicos.',
  },
  'st-student-live': {
    title: 'Transmissões',
    subtitle: 'Conteúdos ao vivo e aulas em destaque.',
  },
  'st-student-notices': {
    title: 'Notificações e comunicados',
    subtitle: 'Mensagens recentes da coordenação e da secretaria.',
  },
  'st-student-materials': {
    title: 'Materiais de apoio',
    subtitle: 'Arquivos e conteúdos liberados para sua turma.',
  },
  'st-student-certificate': {
    title: 'Certificado',
    subtitle: 'Acompanhe o status para emissão do seu certificado.',
  },
  'st-student-profile': {
    title: 'Meu perfil',
    subtitle: 'Dados pessoais e informações acadêmicas de cadastro.',
  },
};

const SECTION_MOBILE_LABEL: Record<SectionId, string> = {
  'st-student-panel': 'Painel',
  'st-student-course': 'Frequência',
  'st-student-classes': 'Aulas',
  'st-student-agenda': 'Agenda',
  'st-student-finance': 'Financeiro',
  'st-student-contracts': 'Contratos',
  'st-student-live': 'Transmissões',
  'st-student-notices': 'Notificações',
  'st-student-materials': 'Materiais',
  'st-student-certificate': 'Certificado',
  'st-student-profile': 'Perfil',
};

const STUDENT_SECTIONS_ENABLED_WITHOUT_CLASS = new Set<SectionId>([
  'st-student-panel',
  'st-student-finance',
  'st-student-contracts',
  'st-student-profile',
]);

const STUDENT_SECTIONS_ENABLED_BEFORE_CONTRACT = new Set<SectionId>([
  'st-student-finance',
]);

const STUDENT_SECTIONS_ENABLED_WITH_PENDING_CONTRACT = new Set<SectionId>([
  'st-student-contracts',
]);

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_TINY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SECTION_HASH_PREFIX = 'tab=';
const STUDENT_SEARCH_ALIAS: Array<{ target: SectionId; terms: string[] }> = [
  { target: 'st-student-panel', terms: ['painel', 'inicio', 'inicial'] },
  { target: 'st-student-classes', terms: ['aula', 'aulas', 'turma', 'turmas'] },
  { target: 'st-student-agenda', terms: ['agenda', 'evento', 'eventos', 'calendario'] },
  { target: 'st-student-live', terms: ['transmissao', 'transmissoes', 'live'] },
  { target: 'st-student-course', terms: ['frequencia', 'presenca', 'desempenho'] },
  { target: 'st-student-finance', terms: ['financeiro', 'mensalidade', 'cobranca', 'pagamento'] },
  { target: 'st-student-contracts', terms: ['contrato', 'contratos', 'assinatura', 'assinar'] },
  { target: 'st-student-materials', terms: ['material', 'materiais', 'arquivo', 'arquivos'] },
  { target: 'st-student-notices', terms: ['aviso', 'avisos', 'notificacao', 'notificacoes', 'comunicado'] },
  { target: 'st-student-certificate', terms: ['certificado'] },
  { target: 'st-student-profile', terms: ['perfil', 'dados'] },
];

function firstName(name: string | undefined) {
  if (!name) return 'Aluno(a)';
  return name.trim().split(/\s+/)[0] || 'Aluno(a)';
}

function firstAndLastName(name: string | undefined) {
  if (!name) return 'Aluno(a)';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Aluno(a)';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
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

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseSectionFromHash(hash: string): SectionId | null {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  const candidate = normalized.startsWith(SECTION_HASH_PREFIX)
    ? normalized.slice(SECTION_HASH_PREFIX.length)
    : normalized;
  if ((SECTION_IDS as readonly string[]).includes(candidate)) {
    return candidate as SectionId;
  }
  return null;
}

function normalizeSearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeHexColor(value: string, fallback: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^#([0-9a-f]{6})$/i.test(normalized)) return fallback;
  return normalized;
}

function resolveStudentBranding(me?: StudentMe | null): StudentBranding {
  const palette = me?.branding?.palette;
  return {
    logoUrl: me?.branding?.logoUrl || DEFAULT_STUDENT_BRANDING_LOGO_URL,
    palette: {
      primaryColor: normalizeHexColor(
        palette?.primaryColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.primaryColor,
      ),
      primaryStrongColor: normalizeHexColor(
        palette?.primaryStrongColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.primaryStrongColor,
      ),
      secondaryColor: normalizeHexColor(
        palette?.secondaryColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.secondaryColor,
      ),
      secondaryStrongColor: normalizeHexColor(
        palette?.secondaryStrongColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.secondaryStrongColor,
      ),
      backgroundColor: normalizeHexColor(
        palette?.backgroundColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.backgroundColor,
      ),
      surfaceColor: normalizeHexColor(
        palette?.surfaceColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.surfaceColor,
      ),
      surfaceSoftColor: normalizeHexColor(
        palette?.surfaceSoftColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.surfaceSoftColor,
      ),
      borderColor: normalizeHexColor(
        palette?.borderColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.borderColor,
      ),
      textColor: normalizeHexColor(
        palette?.textColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.textColor,
      ),
      mutedColor: normalizeHexColor(
        palette?.mutedColor || '',
        DEFAULT_STUDENT_BRANDING_PALETTE.mutedColor,
      ),
    },
    isCustom: Boolean(me?.branding?.isCustom),
  };
}

function buildStudentBrandingStyle(branding: StudentBranding): CSSProperties {
  return {
    '--st-primary': branding.palette.primaryColor,
    '--st-primary-strong': branding.palette.primaryStrongColor,
    '--st-secondary': branding.palette.secondaryColor,
    '--st-bg': branding.palette.backgroundColor,
    '--st-surface': branding.palette.surfaceColor,
    '--st-surface-soft': branding.palette.surfaceSoftColor,
    '--st-surface-muted': branding.palette.borderColor,
    '--st-text': branding.palette.textColor,
    '--st-text-strong': branding.palette.secondaryStrongColor,
    '--st-border': branding.palette.borderColor,
    '--st-muted': branding.palette.mutedColor,
  } as CSSProperties;
}

function formatDate(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDayMonth(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return 'Sem data';
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTH_SHORT[date.getMonth()] || '---';
  return `${day} ${month}`;
}

function formatRelative(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return 'Agora';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return 'Agora';

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min atrás`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h atrás`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 30) return `${diffDays} dias atrás`;

  return formatDate(dateLike);
}

function formatCalendarBadge(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) {
    return {
      label: 'SEM',
      day: '--',
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return { label: 'HOJE', day: String(date.getDate()).padStart(2, '0') };
  }

  if (diffDays === 1) {
    return { label: 'AMANHÃ', day: String(date.getDate()).padStart(2, '0') };
  }

  const weekLabel = WEEKDAY_SHORT[date.getDay()] || 'DIA';
  return {
    label: weekLabel.toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
  };
}

function extractStatusFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\((\d{3})\)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeModality(modality: string | null | undefined) {
  if (!modality) return 'Ativa';
  const normalized = modality.trim().toLowerCase();
  if (normalized.includes('presential') || normalized.includes('presenc')) return 'Presencial';
  if (normalized.includes('ead')) return 'EAD';
  if (normalized.includes('live') || normalized.includes('ao vivo')) return 'Ao vivo';
  return modality;
}

function normalizeStatus(status: string | null | undefined) {
  if (!status) return 'Ativa';
  const normalized = status.trim().toUpperCase();
  if (normalized === 'ACTIVE') return 'Ativa';
  if (normalized === 'CANCELLED') return 'Cancelada';
  if (normalized === 'COMPLETED') return 'Concluída';
  return status;
}

function formatHour(dateLike: string | null | undefined) {
  const date = toDate(dateLike);
  if (!date) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeChargeStatus(status: string | null | undefined) {
  if (!status) return 'Pendente';
  const normalized = status.trim().toUpperCase();
  if (normalized === 'PENDING') return 'Pendente';
  if (normalized === 'PAID') return 'Pago';
  if (normalized === 'OVERDUE') return 'Atrasado';
  if (normalized === 'CANCELED' || normalized === 'CANCELLED') return 'Cancelado';
  return status;
}

function paymentMethodLabel(value: string | null | undefined) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'BANK_SLIP') return 'Boleto';
  if (normalized === 'CREDIT_CARD') return 'Cartão de crédito';
  if (normalized === 'PIX') return 'Pix';
  return 'Pagamento';
}

function creditCardRequestKindLabel(kind: string) {
  return String(kind || '').toUpperCase() === 'ENROLLMENT_FEE'
    ? 'Matrícula'
    : 'Pagamento do curso';
}

function creditCardRequestStudentStatus(request: CreditCardPaymentRequest) {
  const status = String(request.status || '').toUpperCase();
  if (status === 'WAITING_COURSE_START') {
    return 'Registrado para cobrança no início do curso. O financeiro enviará o link quando a turma começar.';
  }
  if (status === 'REQUESTED') {
    return 'Solicitação enviada ao financeiro. Aguarde a geração do link de pagamento.';
  }
  if (status === 'LINK_SENT' || status === 'VIEWED' || status === 'COPIED') {
    return 'O link de pagamento está disponível.';
  }
  if (status === 'APPROVED') {
    return 'Pagamento aprovado pelo financeiro.';
  }
  if (status === 'CANCELED') {
    return 'Solicitação cancelada.';
  }
  return 'Solicitação em análise pelo financeiro.';
}

function normalizePhoneForWhatsApp(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function createWhatsAppContactUrl(phone: string | null | undefined, message: string) {
  const normalizedPhone = normalizePhoneForWhatsApp(phone);
  if (!normalizedPhone) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function createEmailContactUrl(email: string | null | undefined, subject: string, body: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  return `mailto:${encodeURIComponent(normalizedEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function hasPendingContractSignature(item: StudentContractNoticeItem): boolean {
  const normalizedStatus = String(item.status || '').trim().toUpperCase();
  if (normalizedStatus === 'SENT' || normalizedStatus === 'VIEWED' || normalizedStatus === 'PIN_VERIFIED') {
    return true;
  }

  if (normalizedStatus === 'SIGNED') {
    if (item.institutionSignaturePending) return true;
    if (!item.institutionSignedAt) return true;
  }

  return false;
}

function isChargeOverdue(charge: Pick<StudentCharge, 'status' | 'dueDate'> | null | undefined) {
  if (!charge) return false;
  const normalizedStatus = String(charge.status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (
    normalizedStatus.includes('OVERDUE') ||
    normalizedStatus.includes('ATRAS') ||
    normalizedStatus.includes('VENCID')
  ) {
    return true;
  }
  if (
    normalizedStatus.includes('PAID') ||
    normalizedStatus.includes('PAGO') ||
    normalizedStatus.includes('CANCEL')
  ) {
    return false;
  }
  if (!normalizedStatus.includes('PENDING') && !normalizedStatus.includes('PENDEN')) return false;
  const due = toDate(charge.dueDate);
  if (!due) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < startOfToday.getTime();
}

function isChargeDueSoon(
  charge: Pick<StudentCharge, 'status' | 'dueDate'> | null | undefined,
  daysAhead = 3,
) {
  if (!charge || isChargeOverdue(charge)) return false;
  const normalizedStatus = String(charge.status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (
    normalizedStatus.includes('PAID') ||
    normalizedStatus.includes('PAGO') ||
    normalizedStatus.includes('CANCEL')
  ) {
    return false;
  }
  if (!normalizedStatus.includes('PENDING') && !normalizedStatus.includes('PENDEN')) return false;

  const due = toDate(charge.dueDate);
  if (!due) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const endWindow = new Date(startOfToday);
  endWindow.setDate(endWindow.getDate() + daysAhead);
  return dueDay.getTime() >= startOfToday.getTime() && dueDay.getTime() <= endWindow.getTime();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value);
}

function maskCpf(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || '-';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function maskPhone(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `(**) *****-${digits.slice(7, 11)}`;
  }
  if (digits.length === 10) {
    return `(**) ****-${digits.slice(6, 10)}`;
  }
  return value || '-';
}

function maskEmail(value: string | null | undefined) {
  const email = String(value || '').trim();
  if (!email.includes('@')) return email || '-';

  const [localPart, domainPart] = email.split('@');
  if (!localPart || !domainPart) return email;

  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.length > 4 ? localPart.slice(-1) : '';
  const hiddenCount = Math.max(2, localPart.length - (visibleStart.length + visibleEnd.length));
  const hidden = '*'.repeat(hiddenCount);

  return `${visibleStart}${hidden}${visibleEnd}@${domainPart}`;
}

function modalityTone(modality: string) {
  const normalized = modality.toLowerCase();
  if (normalized.includes('presencial')) return 'is-presencial';
  if (normalized.includes('ao vivo')) return 'is-live';
  if (normalized.includes('ead')) return 'is-ead';
  return 'is-default';
}

function progressFromDateRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end) return null;

  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;

  const elapsed = Date.now() - start.getTime();
  if (elapsed <= 0) return 0;
  if (elapsed >= total) return 100;

  return Math.round((elapsed / total) * 100);
}

function StudentIcon({ name, className }: { name: IconName; className?: string }) {
  const classes = ['student-template-icon', className].filter(Boolean).join(' ');

  if (name === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
      </svg>
    );
  }

  if (name === 'school') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M2 9.5L12 4l10 5.5L12 15 2 9.5z" />
        <path d="M6 11.7V16c0 1.7 3 3 6 3s6-1.3 6-3v-4.3" />
      </svg>
    );
  }

  if (name === 'calendar_month') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    );
  }

  if (name === 'live_tv') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 18v3M10 9l5 2.5-5 2.5V9z" />
      </svg>
    );
  }

  if (name === 'checklist_rtl') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M9 7h10M9 12h10M9 17h10" />
        <path d="M3.8 7.2l1.6 1.6L7.8 6.4M3.8 12.2l1.6 1.6 2.4-2.4M3.8 17.2l1.6 1.6 2.4-2.4" />
      </svg>
    );
  }

  if (name === 'payments') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </svg>
    );
  }

  if (name === 'folder_open') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v1H3V7z" />
        <path d="M3 10h18l-2 8a2 2 0 01-2 1H5a2 2 0 01-2-2v-7z" />
      </svg>
    );
  }

  if (name === 'notifications_active') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M6 10a6 6 0 1112 0v4l2 2H4l2-2v-4z" />
        <path d="M10 18a2 2 0 004 0" />
      </svg>
    );
  }

  if (name === 'description') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M6 3h9l5 5v13H6z" />
        <path d="M15 3v5h5" />
        <path d="M9 12h8M9 16h8" />
      </svg>
    );
  }

  if (name === 'verified') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M12 3l3 1.5 3.3-.3 1 3.1 2.7 2-1.6 2.9.2 3.3-3 1.3-2 2.7-3-1.2-3 1.2-2-2.7-3-1.3.2-3.3-1.6-2.9 2.7-2 1-3.1L9 4.5 12 3z" />
        <path d="M8.5 12.3l2.2 2.2 4.8-4.8" />
      </svg>
    );
  }

  if (name === 'person') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c1.6-3 4-4.5 7-4.5S17.4 16 19 19" />
      </svg>
    );
  }

  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </svg>
    );
  }

  if (name === 'help') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9.5a2.4 2.4 0 114.6 1c-.5 1-1.8 1.4-2.1 2.4v.6" />
        <circle cx="12" cy="16.8" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === 'headset_mic') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9.7a2.6 2.6 0 015.2 0c0 1.2-.8 1.8-1.6 2.3-.7.4-1.2.9-1.2 1.9" />
        <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === 'event_note') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 2v4M16 2v4M8 11h8M8 15h5M4 8h16" />
      </svg>
    );
  }

  if (name === 'visibility') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    );
  }

  if (name === 'visibility_off') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
        <path d="M3 3l18 18" />
        <path d="M5.3 7.7C3.4 9.4 2.5 11 2.5 12c0 0 3.5 6 9.5 6 2.3 0 4.2-.8 5.7-1.9" />
        <path d="M9.9 9.9a3.2 3.2 0 004.2 4.2" />
        <path d="M12 6c6 0 9.5 6 9.5 6-.4.7-1.2 2-2.6 3.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes}>
      <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" />
      <path d="M7 12h10M12 7v10" />
    </svg>
  );
}

export function StudentAreaNative({ token, user, onLogout }: StudentAreaNativeProps) {
  const INITIAL_PANEL_CLASSES_COUNT = 2;
  const PANEL_CLASSES_STEP = 5;
  const INITIAL_AGENDA_EVENTS_COUNT = 3;
  const AGENDA_EVENTS_STEP = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<StudentDashboardPayload | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('st-student-panel');
  const [fontsReady, setFontsReady] = useState(false);
  const [agendaMonthCursor, setAgendaMonthCursor] = useState(() => new Date());
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(
    user.avatarUrl ?? null,
  );
  const [attendanceSummary, setAttendanceSummary] = useState<StudentAttendanceSummary | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState('');
  const [panelClassesVisibleCount, setPanelClassesVisibleCount] = useState(
    INITIAL_PANEL_CLASSES_COUNT,
  );
  const [agendaEventsVisibleCount, setAgendaEventsVisibleCount] = useState(
    INITIAL_AGENDA_EVENTS_COUNT,
  );
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [payingChargeId, setPayingChargeId] = useState<string | null>(null);
  const [chargePaymentDataById, setChargePaymentDataById] = useState<
    Record<string, StudentChargePaymentResponse>
  >({});
  const [chargePaymentErrorById, setChargePaymentErrorById] = useState<
    Record<string, string>
  >({});
  const [chargePaymentInfoById, setChargePaymentInfoById] = useState<
    Record<string, string>
  >({});
  const [creditCardRequestsByChargeId, setCreditCardRequestsByChargeId] = useState<
    Record<string, CreditCardPaymentRequest>
  >({});
  const [creditCardRequests, setCreditCardRequests] = useState<CreditCardPaymentRequest[]>([]);
  const [pendingContractNotificationCount, setPendingContractNotificationCount] = useState(0);
  const [availableContractCount, setAvailableContractCount] = useState(0);
  const [signedContractCount, setSignedContractCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const initialContractId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const query = new URLSearchParams(window.location.search);
    const value = query.get('contractId')?.trim() || '';
    return value || null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STUDENT_CHARGE_PAYMENT_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, StudentChargePaymentResponse> | null;
      if (parsed && typeof parsed === 'object') {
        setChargePaymentDataById(parsed);
      }
    } catch {
      // Ignora cache inválido.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        STUDENT_CHARGE_PAYMENT_CACHE_KEY,
        JSON.stringify(chargePaymentDataById),
      );
    } catch {
      // Ignora falha de escrita no storage.
    }
  }, [chargePaymentDataById]);

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

    let cobrancas: StudentCharge[] = [];
    let agenda: StudentAgendaEvent[] = [];
    try {
      cobrancas = await apiRequest<StudentCharge[]>(token, '/mis/v1/aluno/cobrancas', undefined, {
        cacheTtlMs: STUDENT_CACHE_TTL_MS,
        bypassCache,
      });
    } catch (chargesError) {
      const status = extractStatusFromError(chargesError);
      if (status !== 404) throw chargesError;
    }

    try {
      agenda = await apiRequest<StudentAgendaEvent[]>(token, '/mis/v1/aluno/agenda', undefined, {
        cacheTtlMs: STUDENT_CACHE_TTL_MS,
        bypassCache,
      });
    } catch (agendaError) {
      const status = extractStatusFromError(agendaError);
      if (status !== 404) throw agendaError;
    }

    return { me, matriculas, materiais, avisos, cobrancas, agenda };
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
      try {
        const creditCardRequestsResponse = await apiRequest<CreditCardPaymentRequest[]>(
          token,
          '/mis/v1/aluno/cartao-solicitacoes',
          undefined,
          {
            cacheTtlMs: STUDENT_CACHE_TTL_MS,
            bypassCache,
          },
        );
        const normalizedCreditCardRequests = Array.isArray(creditCardRequestsResponse)
          ? creditCardRequestsResponse
          : [];
        setCreditCardRequests(normalizedCreditCardRequests);
        setCreditCardRequestsByChargeId(
          Object.fromEntries(
            normalizedCreditCardRequests
              .filter((request) => Boolean(request.monthlyChargeId))
              .map((request) => [request.monthlyChargeId as string, request]),
          ),
        );
      } catch {
        setCreditCardRequests([]);
        setCreditCardRequestsByChargeId({});
      }
      try {
        const summary = await apiRequest<StudentAttendanceSummary>(
          token,
          '/attendance/student/summary',
          undefined,
          {
            cacheTtlMs: STUDENT_CACHE_TTL_MS,
            bypassCache,
          },
        );
        setAttendanceSummary(summary);
      } catch {
        setAttendanceSummary(null);
      }

      try {
        const contracts = await apiRequest<StudentContractNoticeItem[]>(
          token,
          '/contracts/my',
          undefined,
          {
            cacheTtlMs: STUDENT_CACHE_TTL_MS,
            bypassCache,
          },
        );
        const pendingCount = (Array.isArray(contracts) ? contracts : []).filter((item) =>
          hasPendingContractSignature(item),
        ).length;
        const availableCount = Array.isArray(contracts) ? contracts.length : 0;
        const signedCount = (Array.isArray(contracts) ? contracts : []).filter((item) => {
          const normalized = String(item.status || '').trim().toUpperCase();
          return normalized === 'SIGNED' || Boolean(item.signedAt);
        }).length;
        setPendingContractNotificationCount(pendingCount);
        setAvailableContractCount(availableCount);
        setSignedContractCount(signedCount);
      } catch {
        setPendingContractNotificationCount(0);
        setAvailableContractCount(0);
        setSignedContractCount(0);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Não foi possível carregar a Área do Aluno.',
      );
      setPendingContractNotificationCount(0);
      setAvailableContractCount(0);
      setSignedContractCount(0);
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

  useEffect(() => {
    let mounted = true;

    const waitFonts = async () => {
      try {
        const fontReady = typeof document !== 'undefined' && 'fonts' in document
          ? (document as Document & { fonts: FontFaceSet }).fonts.ready
          : Promise.resolve();
        const timeout = new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 1200);
        });
        await Promise.race([fontReady, timeout]);
      } finally {
        if (mounted) setFontsReady(true);
      }
    };

    void waitFonts();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setProfileAvatarUrl(user.avatarUrl ?? null);
  }, [user.avatarUrl]);

  const uploadProfileAvatar = async (file: File) => {
    setAvatarBusy(true);
    setAvatarFeedback('');
    try {
      const body = new FormData();
      body.append('avatar', file);
      const nextUser = await apiRequest<{ avatarUrl?: string | null }>(
        token,
        '/auth/me/avatar',
        {
          method: 'POST',
          body,
        },
      );
      setProfileAvatarUrl(nextUser.avatarUrl ?? null);
      setAvatarFeedback('Foto atualizada com sucesso.');
    } catch (uploadError) {
      setAvatarFeedback(
        uploadError instanceof Error
          ? uploadError.message
          : 'Falha ao enviar imagem de perfil.',
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeProfileAvatar = async () => {
    setAvatarBusy(true);
    setAvatarFeedback('');
    try {
      await apiRequest<{ avatarUrl?: string | null }>(token, '/auth/me/avatar', {
        method: 'DELETE',
      });
      setProfileAvatarUrl(null);
      setAvatarFeedback('Foto removida com sucesso.');
    } catch (removeError) {
      setAvatarFeedback(
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao remover imagem de perfil.',
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleProfileAvatarInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarFeedback('Selecione apenas imagens para foto de perfil.');
      return;
    }

    const maxSizeBytes = 6 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setAvatarFeedback('A imagem deve ter no máximo 6 MB.');
      return;
    }

    void uploadProfileAvatar(file);
  };

  useEffect(() => {
    const applyHash = () => {
      const sectionFromHash = parseSectionFromHash(window.location.hash);
      if (sectionFromHash) {
        setActiveSection(sectionFromHash);
      } else if (initialContractId) {
        setActiveSection('st-student-contracts');
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => {
      window.removeEventListener('hashchange', applyHash);
    };
  }, [initialContractId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (userMenuRef.current.contains(event.target as Node)) return;
      setUserMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const me = dashboard?.me;
  const activeBranding = useMemo(() => resolveStudentBranding(me), [me]);
  const studentTemplateStyle = useMemo(
    () => buildStudentBrandingStyle(activeBranding),
    [activeBranding],
  );
  const brandingLogoAlt = me?.institution?.name || 'Instituição';
  const matriculas = dashboard?.matriculas ?? [];
  const materiais = dashboard?.materiais ?? [];
  const avisos = dashboard?.avisos ?? [];
  const cobrancas = dashboard?.cobrancas ?? [];
  const agenda = dashboard?.agenda ?? [];
  const hasActiveClass = matriculas.length > 0;
  const missingRequiredContractCount = Math.max(
    REQUIRED_SIGNED_CONTRACTS_TO_UNLOCK - signedContractCount,
    0,
  );
  const isPreContractStage = availableContractCount <= 0;
  const isPreSignatureStage =
    availableContractCount > 0 && missingRequiredContractCount > 0;
  const isContractGateLocked = isPreContractStage || isPreSignatureStage;
  const hasPendingContractsToSign = pendingContractNotificationCount > 0;

  const isSectionDisabled = (sectionId: SectionId) => {
    if (isPreContractStage) {
      return !STUDENT_SECTIONS_ENABLED_BEFORE_CONTRACT.has(sectionId);
    }
    if (isPreSignatureStage) {
      return !STUDENT_SECTIONS_ENABLED_WITH_PENDING_CONTRACT.has(sectionId);
    }
    if (hasActiveClass) return false;
    return !STUDENT_SECTIONS_ENABLED_WITHOUT_CLASS.has(sectionId);
  };

  const matriculaPrincipal = matriculas[0] ?? null;

  const periodProgress = useMemo(
    () => progressFromDateRange(matriculaPrincipal?.startDate, matriculaPrincipal?.endDate),
    [matriculaPrincipal?.startDate, matriculaPrincipal?.endDate],
  );

  const upcomingClasses = useMemo(() => {
    const nowTime = Date.now();
    const fromAgenda = [...agenda]
      .map((item) => {
        const start = toDate(item.datetime);
        return {
          raw: item,
          start,
          time: start?.getTime() ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .filter((item) => item.start && item.time >= nowTime)
      .sort((a, b) => a.time - b.time)
      .slice(0, 12)
      .map((item) => {
        const modality = item.raw.type === 'live' ? 'Ao vivo' : 'Presencial';
        const badge = formatCalendarBadge(item.raw.datetime);
        return {
          id: item.raw.id,
          title: item.raw.title || item.raw.className,
          subtitle: `${item.raw.className}${item.raw.teacher ? ` • ${item.raw.teacher}` : ''}`,
          startDate: item.raw.datetime,
          period: item.raw.datetime
            ? `${formatDate(item.raw.datetime)} às ${formatHour(item.raw.datetime)}`
            : 'Data da aula não informada',
          modality,
          modalityTone: modalityTone(modality),
          dayLabel: badge.label,
          day: badge.day,
        };
      });

    if (fromAgenda.length > 0) return fromAgenda;

    const sorted = [...matriculas].sort((a, b) => {
      const aDate = toDate(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDate = toDate(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });

    return sorted.slice(0, 12).map((item) => {
      const badge = formatCalendarBadge(item.startDate);
      const modality = normalizeModality(item.modality);

      return {
        id: item.enrollmentId,
        title: item.className,
        subtitle: item.courseName,
        startDate: item.startDate,
        period: item.startDate
          ? `Início ${formatDate(item.startDate)}${item.endDate ? ` • Término ${formatDate(item.endDate)}` : ''}`
          : 'Data da turma não informada',
        modality,
        modalityTone: modalityTone(modality),
        dayLabel: badge.label,
        day: badge.day,
      };
    });
  }, [agenda, matriculas]);

  const noticesFeed = useMemo<StudentNoticeFeedItem[]>(() => {
    const mappedNotices: StudentNoticeFeedItem[] = avisos.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      priority: item.priority,
      className: item.className,
      publishedAt: item.publishedAt,
    }));

    if (pendingContractNotificationCount <= 0) {
      return mappedNotices;
    }

    const contractReminder: StudentNoticeFeedItem = {
      id: `contracts-pending-${pendingContractNotificationCount}`,
      title:
        pendingContractNotificationCount === 1
          ? 'Contrato com assinatura pendente'
          : 'Contratos com assinatura pendente',
      body:
        pendingContractNotificationCount === 1
          ? 'Existe 1 contrato aguardando assinatura. Acesse a área de Contratos para concluir.'
          : `Existem ${pendingContractNotificationCount} contratos aguardando assinatura. Acesse a área de Contratos para concluir.`,
      priority: 'high',
      className: 'Contratos',
      publishedAt: new Date().toISOString(),
      isContractReminder: true,
    };

    return [contractReminder, ...mappedNotices];
  }, [avisos, pendingContractNotificationCount]);

  const recentNotices = useMemo(() => noticesFeed.slice(0, 6), [noticesFeed]);
  const recentMaterials = useMemo(() => materiais.slice(0, 12), [materiais]);

  const liveMaterials = useMemo(
    () =>
      materiais.filter((material) => {
        const haystack = `${material.kind} ${material.title}`.toLowerCase();
        return (
          haystack.includes('live') ||
          haystack.includes('video') ||
          haystack.includes('aula') ||
          haystack.includes('transmiss')
        );
      }),
    [materiais],
  );

  const liveMaterial = liveMaterials[0] ?? null;
  const archivedLives = liveMaterials.slice(1, 6);

  const materialsByClass = useMemo(() => {
    const map = new Map<string, StudentMaterial[]>();
    for (const material of recentMaterials) {
      const key = material.className || 'Sem turma';
      const list = map.get(key) ?? [];
      list.push(material);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [recentMaterials]);

  const financeMetrics = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const sorted = [...cobrancas].sort((a, b) => {
      const aTime = toDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = toDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

    const pendingAll = sorted.filter((item) => {
      const status = item.status.toUpperCase();
      return status === 'PENDING' || status === 'OVERDUE';
    });
    const paid = sorted.filter((item) => item.status.toUpperCase() === 'PAID');
    const overdue = pendingAll.filter((item) => {
      const due = toDate(item.dueDate);
      if (!due) return item.status.toUpperCase() === 'OVERDUE';
      return due.getTime() < startOfToday.getTime() || item.status.toUpperCase() === 'OVERDUE';
    });
    const pending = pendingAll.filter((item) => {
      const due = toDate(item.dueDate);
      if (!due) return false;
      const dueTime = due.getTime();
      return (
        dueTime >= startOfCurrentMonth.getTime()
        && dueTime <= endOfCurrentMonth.getTime()
        && dueTime >= startOfToday.getTime()
      );
    });
    const visibleBase = [...pendingAll].filter((item) => {
      const due = toDate(item.dueDate);
      if (!due) return item.status.toUpperCase() === 'OVERDUE';
      const dueTime = due.getTime();
      const isOverdue = dueTime < startOfToday.getTime() || item.status.toUpperCase() === 'OVERDUE';
      const isCurrentMonthPending =
        dueTime >= startOfCurrentMonth.getTime()
        && dueTime <= endOfCurrentMonth.getTime()
        && dueTime >= startOfToday.getTime();
      return isOverdue || isCurrentMonthPending;
    });
    const visibleById = new Set(visibleBase.map((item) => item.id));
    const visible = [...visibleBase];
    pendingAll.forEach((item) => {
      if (visibleById.has(item.id)) return;
      const description = String(item.description || '').trim().toLowerCase();
      const shouldAlwaysShow =
        description === 'matrícula' || description.startsWith('mensalidade 1/');
      if (!shouldAlwaysShow) return;
      visible.push(item);
      visibleById.add(item.id);
    });
    const nextCharge = visible[0] ?? null;
    const pendingAmount = pending.reduce((sum, item) => sum + item.amount, 0);
    const overdueAmount = overdue.reduce((sum, item) => sum + item.amount, 0);

    return {
      sorted,
      visible,
      pending,
      paid,
      overdue,
      nextCharge,
      pendingAmount,
      overdueAmount,
    };
  }, [cobrancas]);

  const activeVoucher = useMemo(() => {
    const voucher =
      cobrancas.find((item) => item.appliedVoucher)?.appliedVoucher ||
      creditCardRequests.find(
        (request) => request.studentCourse?.selectedPaymentOption?.appliedVoucher,
      )?.studentCourse?.selectedPaymentOption?.appliedVoucher;
    if (!voucher) return null;
    const label = String(voucher.discountLabel || '').trim();
    if (label) {
      return {
        ...voucher,
        label,
      };
    }
    const discountType = String(voucher.discountType || '').trim().toUpperCase();
    const discountValue = Number(voucher.discountValue || 0);
    if (!Number.isFinite(discountValue) || discountValue <= 0) return null;
    const generatedLabel =
      discountType === 'PERCENT'
        ? `${discountValue.toFixed(2).replace(/\.00$/, '')}% de desconto`
        : formatCurrency(discountValue);
    return {
      ...voucher,
      label:
        discountType === 'PERCENT'
          ? generatedLabel
          : `${generatedLabel} de desconto`,
    };
  }, [cobrancas, creditCardRequests]);
  const activeVoucherTargetLabel = useMemo(() => {
    if (!activeVoucher) return '';
    const targetLabel = String(activeVoucher.targetLabel || '').trim();
    if (targetLabel) return targetLabel;
    const appliesToInstallment =
      String(activeVoucher.appliesTo || '').toUpperCase() === 'INSTALLMENT';
    if (!appliesToInstallment) return 'curso inteiro';
    return String(activeVoucher.installmentScope || '').toUpperCase() === 'SINGLE'
      ? 'uma mensalidade'
      : 'todas as mensalidades';
  }, [activeVoucher]);

  const nextChargeLabel = financeMetrics.nextCharge
    ? formatDayMonth(financeMetrics.nextCharge.dueDate)
    : 'Sem cobrança';

  const nextChargeDescription = financeMetrics.nextCharge
    ? `${normalizeChargeStatus(financeMetrics.nextCharge.status)} • ${formatCurrency(financeMetrics.nextCharge.amount)}`
    : 'Nenhuma mensalidade pendente no momento';
  const hasOverdueCharges = financeMetrics.overdue.length > 0;
  const nextChargeIsOverdue = isChargeOverdue(financeMetrics.nextCharge);
  const nextChargeIsWarning = !nextChargeIsOverdue && isChargeDueSoon(financeMetrics.nextCharge);
  const nextChargeToneClass = nextChargeIsOverdue
    ? 'is-overdue'
    : nextChargeIsWarning
      ? 'is-warning'
      : '';
  const financeProgress =
    cobrancas.length > 0 ? Math.round((financeMetrics.paid.length / cobrancas.length) * 100) : 0;
  const financeSensitiveClass = 'student-finance-sensitive';
  const standaloneCreditCardRequests = useMemo(
    () =>
      creditCardRequests.filter(
        (request) =>
          !request.monthlyChargeId &&
          String(request.status || '').toUpperCase() !== 'CANCELED',
      ),
    [creditCardRequests],
  );
  const enrollmentFeeCardRequest = useMemo(
    () =>
      creditCardRequests.find(
        (request) =>
          String(request.kind || '').toUpperCase() === 'ENROLLMENT_FEE' &&
          String(request.status || '').toUpperCase() !== 'CANCELED',
      ) ?? null,
    [creditCardRequests],
  );
  const preContractPaymentMessage = useMemo(() => {
    const status = String(enrollmentFeeCardRequest?.status || '').toUpperCase();
    if (status === 'REQUESTED') {
      return 'Sua solicitação de pagamento da matrícula foi enviada. Aguarde o financeiro gerar e enviar o link do cartão.';
    }
    if (status === 'LINK_SENT' || status === 'VIEWED' || status === 'COPIED') {
      return 'O link de pagamento da matrícula já está disponível no Financeiro. Após o pagamento, aguarde a aprovação manual.';
    }
    if (status === 'APPROVED') {
      return 'O pagamento da matrícula foi aprovado. Aguarde a definição da turma e a liberação dos contratos pela instituição.';
    }
    return 'Finalize o pagamento da taxa de matrícula no financeiro. Após a quitação, o contrato será liberado para assinatura.';
  }, [enrollmentFeeCardRequest?.status]);

  const titleName = me?.name || user.name;
  const topbarName = firstAndLastName(titleName);
  const profileCityState = useMemo(() => {
    const city = me?.studentProfile?.city;
    const state = me?.studentProfile?.state;
    if (!city) return '-';
    return state ? `${city} - ${state}` : city;
  }, [me?.studentProfile?.city, me?.studentProfile?.state]);

  const supportContactMessage = useMemo(() => {
    const studentName = firstAndLastName(me?.name || user.name);
    const institutionName = me?.institution?.name || 'a instituição';
    return [
      'Olá! Tudo bem?',
      '',
      `Meu nome é ${studentName} e acessei agora a Área do Aluno da ${institutionName}.`,
      'Preciso de suporte e gostaria de atendimento, por favor.',
      '',
      `E-mail de cadastro: ${me?.email || user.email}`,
    ].join('\n');
  }, [me?.email, me?.institution?.name, me?.name, user.email, user.name]);

  const supportContactUrl = useMemo(() => {
    const supportPhone = me?.institution?.contacts?.supportPhone;
    const supportEmail = me?.institution?.contacts?.supportEmail;
    const byWhatsApp = createWhatsAppContactUrl(supportPhone, supportContactMessage);
    if (byWhatsApp) return byWhatsApp;
    return createEmailContactUrl(
      supportEmail,
      'Solicitação de suporte - Área do Aluno',
      supportContactMessage,
    );
  }, [
    me?.institution?.contacts?.supportEmail,
    me?.institution?.contacts?.supportPhone,
    supportContactMessage,
  ]);
  const supportContactChannel = useMemo(() => {
    const supportPhone = me?.institution?.contacts?.supportPhone;
    const supportEmail = me?.institution?.contacts?.supportEmail;
    if (normalizePhoneForWhatsApp(supportPhone)) return 'WhatsApp';
    if (String(supportEmail || '').trim()) return 'e-mail';
    return null;
  }, [me?.institution?.contacts?.supportEmail, me?.institution?.contacts?.supportPhone]);

  const creditChargesForCommercial = useMemo(
    () =>
      financeMetrics.visible.filter(
        (charge) =>
          Boolean(charge.creditCardUnsupported) &&
          String(charge.status || '').trim().toUpperCase() !== 'PAID' &&
          String(charge.status || '').trim().toUpperCase() !== 'CANCELED' &&
          String(charge.status || '').trim().toUpperCase() !== 'CANCELLED',
      ),
    [financeMetrics.visible],
  );

  const buildCommercialCreditMessage = (charges: StudentCharge[]) => {
    const studentName = firstAndLastName(me?.name || user.name);
    const institutionName = me?.institution?.name || 'a instituição';
    const lines = charges.map((charge, index) => {
      const dueDateLabel = formatDate(charge.dueDate);
      return `${index + 1}. ${charge.description || charge.className} (${charge.courseName}) - vencimento ${dueDateLabel} - valor ${formatCurrency(charge.amount)}`;
    });

    return [
      'Olá! Tudo bem?',
      '',
      `Meu nome é ${studentName} e acessei agora a Área do Aluno da ${institutionName}.`,
      'Gostaria de solicitar cobrança no cartão de crédito para os itens abaixo:',
      '',
      ...lines,
      '',
      `E-mail de cadastro: ${me?.email || user.email}`,
    ].join('\n');
  };

  const buildCommercialCreditUrl = (charges: StudentCharge[]) => {
    if (!charges.length) return null;

    const commercialPhone = me?.institution?.contacts?.commercialPhone;
    const commercialEmail = me?.institution?.contacts?.commercialEmail;
    const message = buildCommercialCreditMessage(charges);
    const byWhatsApp = createWhatsAppContactUrl(commercialPhone, message);
    if (byWhatsApp) return byWhatsApp;

    return createEmailContactUrl(
      commercialEmail,
      'Solicitação de cobrança no crédito - Área do Aluno',
      message,
    );
  };

  const commercialCreditUrl = useMemo(
    () => buildCommercialCreditUrl(creditChargesForCommercial),
    [
      creditChargesForCommercial,
      me?.email,
      me?.institution?.contacts?.commercialEmail,
      me?.institution?.contacts?.commercialPhone,
      me?.institution?.name,
      me?.name,
      user.email,
      user.name,
    ],
  );
  const commercialContactChannel = useMemo(() => {
    const commercialPhone = me?.institution?.contacts?.commercialPhone;
    const commercialEmail = me?.institution?.contacts?.commercialEmail;
    if (normalizePhoneForWhatsApp(commercialPhone)) return 'WhatsApp';
    if (String(commercialEmail || '').trim()) return 'e-mail';
    return null;
  }, [me?.institution?.contacts?.commercialEmail, me?.institution?.contacts?.commercialPhone]);

  const openExternalContact = (url: string | null) => {
    if (!url || typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const attendanceStats = useMemo(() => {
    if (attendanceSummary) {
      return {
        total: attendanceSummary.totalOccurred,
        attended: attendanceSummary.present,
        absent: attendanceSummary.absent,
        pending: attendanceSummary.pending,
        evaluated: attendanceSummary.evaluated,
        percent: attendanceSummary.frequencyPercent,
        history: attendanceSummary.history,
      };
    }

    const total = upcomingClasses.length;
    const attended = upcomingClasses.filter((item) => {
      const start = toDate(item.startDate);
      return start ? start.getTime() <= Date.now() : false;
    }).length;
    const pending = Math.max(total - attended, 0);
    const percent = total > 0 ? Math.round((attended / total) * 100) : 0;
    return {
      total,
      attended,
      absent: 0,
      pending,
      evaluated: attended,
      percent,
      history: [],
    };
  }, [attendanceSummary, agenda, agendaMonthCursor, upcomingClasses]);

  const calendarData = useMemo(() => {
    const now = new Date();
    const month = agendaMonthCursor.getMonth();
    const year = agendaMonthCursor.getFullYear();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const eventSource =
      agenda.length > 0
        ? agenda.map((item) => item.datetime)
        : upcomingClasses.map((item) => item.startDate);
    const marks = new Set(eventSource.map((value) => toDate(value)).filter((value): value is Date => Boolean(value)).map((date) => toDateKey(date)));

    const todayKey = toDateKey(now);
    const cells: Array<{ day: number | null; key: string; isMarked: boolean; isToday: boolean }> = [];

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ day: null, key: `empty-${i}`, isMarked: false, isToday: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = toDateKey(date);
      cells.push({
        day,
        key,
        isMarked: marks.has(key),
        isToday: key === todayKey,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        day: null,
        key: `tail-${cells.length}`,
        isMarked: false,
        isToday: false,
      });
    }

    return {
      monthLabel: `${MONTH_SHORT[month]} ${year}`,
      cells,
    };
  }, [agenda, agendaMonthCursor, upcomingClasses]);

  const subtitle =
    periodProgress === null
      ? 'Seu painel acadêmico está sincronizado. Continue acompanhando suas atualizações.'
      : `Seu período letivo está ${periodProgress}% concluído. Continue nesse ritmo.`;

  const isPanelView = activeSection === 'st-student-panel';
  const currentMeta = SECTION_META[activeSection];
  const currentSubtitle =
    activeSection === 'st-student-panel'
      ? periodProgress === null
        ? subtitle
        : `Seu progresso acadêmico está em ${periodProgress}%. Continue acompanhando suas atualizações.`
      : currentMeta.subtitle;

  const activeMobileGroup = useMemo(
    () =>
      MOBILE_NAV_ITEMS.find((item) => item.sections.includes(activeSection)) ?? MOBILE_NAV_ITEMS[0],
    [activeSection],
  );

  const showCourse = isPanelView || activeSection === 'st-student-course';
  const showFinance = isPanelView || activeSection === 'st-student-finance';
  const showClasses = isPanelView || activeSection === 'st-student-classes';
  const showLive = isPanelView || activeSection === 'st-student-live';
  const showNotices = isPanelView || activeSection === 'st-student-notices';
  const showAgenda = isPanelView || activeSection === 'st-student-agenda';
  const showMaterials = isPanelView || activeSection === 'st-student-materials';
  const showCertificate = isPanelView || activeSection === 'st-student-certificate';
  const showProfile = isPanelView || activeSection === 'st-student-profile';
  const visibleUpcomingClasses = isPanelView
    ? upcomingClasses.slice(0, panelClassesVisibleCount)
    : upcomingClasses;
  const canLoadMorePanelClasses =
    isPanelView && panelClassesVisibleCount < upcomingClasses.length;
  const visibleAgendaEvents = upcomingClasses.slice(0, agendaEventsVisibleCount);
  const canLoadMoreAgendaEvents = agendaEventsVisibleCount < upcomingClasses.length;

  useEffect(() => {
    setPanelClassesVisibleCount(INITIAL_PANEL_CLASSES_COUNT);
  }, [upcomingClasses.length]);

  useEffect(() => {
    setAgendaEventsVisibleCount(INITIAL_AGENDA_EVENTS_COUNT);
  }, [upcomingClasses.length]);

  const studentSearchSuggestions = useMemo(() => {
    const normalizedQuery = normalizeSearchTerm(studentSearchQuery);
    if (!normalizedQuery) return [] as Array<{ target: SectionId; label: string; score: number }>;

    return NAV_ITEMS
      .filter((item) => !isSectionDisabled(item.target))
      .map((item) => {
        const normalizedLabel = normalizeSearchTerm(item.label);
        const aliasTerms = STUDENT_SEARCH_ALIAS.find((entry) => entry.target === item.target)?.terms ?? [];

        let score = 0;
        if (normalizedLabel.startsWith(normalizedQuery)) score = 120;
        else if (normalizedLabel.includes(normalizedQuery)) score = 100;

        for (const term of aliasTerms) {
          const normalizedTerm = normalizeSearchTerm(term);
          if (normalizedTerm.startsWith(normalizedQuery)) score = Math.max(score, 90);
          else if (
            normalizedQuery.includes(normalizedTerm) ||
            normalizedTerm.includes(normalizedQuery)
          ) {
            score = Math.max(score, 80);
          }
        }

        return {
          target: item.target,
          label: item.label,
          score,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'pt-BR'))
      .slice(0, 6);
  }, [studentSearchQuery, hasActiveClass, isPreContractStage, isPreSignatureStage]);

  const executeStudentSearch = () => {
    const topSuggestion = studentSearchSuggestions[0];
    if (!topSuggestion) return;
    openSection(topSuggestion.target);
    setStudentSearchQuery(topSuggestion.label);
  };

  const openSection = (sectionId: SectionId) => {
    if (isSectionDisabled(sectionId)) return;
    setActiveSection(sectionId);
    setUserMenuOpen(false);
    if (sectionId === 'st-student-agenda') {
      setAgendaMonthCursor(new Date());
      setAgendaEventsVisibleCount(INITIAL_AGENDA_EVENTS_COUNT);
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${SECTION_HASH_PREFIX}${sectionId}`);
    }
  };

  useEffect(() => {
    if (!isSectionDisabled(activeSection)) return;
    if (isPreContractStage) {
      setActiveSection('st-student-finance');
      return;
    }
    if (isPreSignatureStage) {
      setActiveSection('st-student-contracts');
      return;
    }
    setActiveSection('st-student-panel');
  }, [activeSection, hasActiveClass, isPreContractStage, isPreSignatureStage]);

  useEffect(() => {
    const target = document.getElementById(activeSection);
    if (target) {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeSection]);

  const handlePayCharge = async (charge: StudentCharge) => {
    setPayingChargeId(charge.id);
    setChargePaymentErrorById((current) => ({
      ...current,
      [charge.id]: '',
    }));
    setChargePaymentInfoById((current) => ({
      ...current,
      [charge.id]: '',
    }));

    try {
      const returnUrl =
        typeof window !== 'undefined' ? window.location.href : undefined;
      const payment = await apiRequest<StudentChargePaymentResponse>(
        token,
        `/mis/v1/aluno/cobrancas/${charge.id}/pagar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            returnUrl,
          }),
        },
      );

      const normalizedGatewayMessage = String(payment.message || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const duplicatedTitleDetected =
        normalizedGatewayMessage.includes('ja existe um titulo') &&
        normalizedGatewayMessage.includes('identificacao');
      const friendlyDuplicatedTitleMessage =
        'Este boleto já foi emitido. Use os botões Ver PDF/Baixar.';

      setChargePaymentDataById((current) => {
        const previous = current[charge.id];
        const incomingHasBankSlipLink = Boolean(
          payment.bankSlipViewUrl?.trim()
            || payment.bankSlipDownloadUrl?.trim()
            || payment.bankSlipUrl?.trim()
            || payment.checkoutUrl?.trim()
            || payment.invoiceUrl?.trim(),
        );
        const previousHasBankSlipLink = Boolean(
          previous?.bankSlipViewUrl?.trim()
            || previous?.bankSlipDownloadUrl?.trim()
            || previous?.bankSlipUrl?.trim()
            || previous?.checkoutUrl?.trim()
            || previous?.invoiceUrl?.trim(),
        );
        const mergedPayment =
          !incomingHasBankSlipLink && previousHasBankSlipLink
            ? {
                ...previous,
                ...payment,
                bankSlipViewUrl: previous.bankSlipViewUrl || previous.bankSlipUrl || previous.checkoutUrl || null,
                bankSlipDownloadUrl:
                  previous.bankSlipDownloadUrl
                  || previous.invoiceUrl
                  || previous.bankSlipUrl
                  || previous.checkoutUrl
                  || null,
                bankSlipUrl: previous.bankSlipUrl || previous.bankSlipViewUrl || previous.checkoutUrl || null,
                checkoutUrl: previous.checkoutUrl || previous.bankSlipViewUrl || null,
                invoiceUrl: previous.invoiceUrl || previous.bankSlipDownloadUrl || null,
                bankSlipDigitableLine:
                  payment.bankSlipDigitableLine || previous.bankSlipDigitableLine || null,
              }
            : payment;

        return {
          ...current,
          [charge.id]: mergedPayment,
        };
      });

      const preferredOpenUrl = payment.bankSlipViewUrl || payment.checkoutUrl;
      if (preferredOpenUrl && typeof window !== 'undefined') {
        const opened = window.open(
          preferredOpenUrl,
          '_blank',
          'noopener,noreferrer',
        );
        if (!opened) {
          setChargePaymentInfoById((current) => ({
            ...current,
            [charge.id]:
              'Pagamento gerado. Use os botões de visualização/download para continuar.',
          }));
        }
      } else {
        setChargePaymentInfoById((current) => ({
          ...current,
          [charge.id]:
            duplicatedTitleDetected
              ? friendlyDuplicatedTitleMessage
              : payment.message || 'Cobrança preparada com sucesso.',
        }));
      }

      void loadDashboard({ bypassCache: true });
    } catch (paymentError) {
      const rawMessage =
        paymentError instanceof Error
          ? paymentError.message
          : 'Não foi possível iniciar o pagamento.';
      const normalizedGatewayMessage = String(rawMessage || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const duplicatedTitleDetected =
        normalizedGatewayMessage.includes('ja existe um titulo') &&
        normalizedGatewayMessage.includes('identificacao');
      setChargePaymentErrorById((current) => ({
        ...current,
        [charge.id]:
          duplicatedTitleDetected
            ? 'Este boleto já foi emitido. Use os botões Ver PDF/Baixar.'
            : rawMessage,
      }));
    } finally {
      setPayingChargeId((current) => (current === charge.id ? null : current));
    }
  };

  const storeCreditCardRequest = (request: CreditCardPaymentRequest) => {
    setCreditCardRequests((current) => {
      const existingIndex = current.findIndex((item) => item.id === request.id);
      if (existingIndex < 0) return [request, ...current];
      return current.map((item) => (item.id === request.id ? request : item));
    });
    if (request.monthlyChargeId) {
      setCreditCardRequestsByChargeId((current) => ({
        ...current,
        [request.monthlyChargeId as string]: request,
      }));
    }
  };

  const handleRequestCreditCardLink = async (charge: StudentCharge) => {
    setPayingChargeId(charge.id);
    setChargePaymentErrorById((current) => ({
      ...current,
      [charge.id]: '',
    }));
    setChargePaymentInfoById((current) => ({
      ...current,
      [charge.id]: '',
    }));

    try {
      const request = await apiRequest<CreditCardPaymentRequest>(
        token,
        `/mis/v1/aluno/cobrancas/${charge.id}/cartao/solicitar`,
        { method: 'POST' },
      );
      storeCreditCardRequest(request);
      setChargePaymentInfoById((current) => ({
        ...current,
        [charge.id]:
          request.paymentLinkUrl
            ? 'Link de pagamento disponível.'
            : 'Solicitação enviada ao financeiro. Aguarde o envio do link.',
      }));
      void loadDashboard({ bypassCache: true });
    } catch (requestError) {
      setChargePaymentErrorById((current) => ({
        ...current,
        [charge.id]:
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível solicitar o link de pagamento.',
      }));
    } finally {
      setPayingChargeId((current) => (current === charge.id ? null : current));
    }
  };

  const handleOpenCreditCardLink = async (
    request: CreditCardPaymentRequest,
  ) => {
    const paymentLink = request.paymentLinkUrl?.trim();
    if (!paymentLink) return;

    try {
      const updated = await apiRequest<CreditCardPaymentRequest>(
        token,
        `/mis/v1/aluno/cartao-solicitacoes/${request.id}/visualizar`,
        { method: 'POST' },
      );
      storeCreditCardRequest(updated);
    } catch {
      // O link ainda pode ser aberto mesmo se o registro de visualização falhar.
    }

    if (typeof window !== 'undefined') {
      window.open(paymentLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyCreditCardLink = async (
    request: CreditCardPaymentRequest,
  ) => {
    const paymentLink = request.paymentLinkUrl?.trim();
    if (!paymentLink) return;

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
      ) {
        throw new Error('Clipboard indisponível');
      }

      await navigator.clipboard.writeText(paymentLink);
      const updated = await apiRequest<CreditCardPaymentRequest>(
        token,
        `/mis/v1/aluno/cartao-solicitacoes/${request.id}/copiar`,
        { method: 'POST' },
      );
      storeCreditCardRequest(updated);
      if (request.monthlyChargeId) {
        setChargePaymentInfoById((current) => ({
          ...current,
          [request.monthlyChargeId as string]: 'Link de pagamento copiado.',
        }));
      }
    } catch {
      if (request.monthlyChargeId) {
        setChargePaymentErrorById((current) => ({
          ...current,
          [request.monthlyChargeId as string]: 'Não foi possível copiar o link automaticamente.',
        }));
      }
    }
  };

  const handleCopyPixCode = async (chargeId: string) => {
    const pixCode = chargePaymentDataById[chargeId]?.pixCopyPaste?.trim() || '';
    if (!pixCode) return;

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
      ) {
        throw new Error('Clipboard indisponível');
      }
      await navigator.clipboard.writeText(pixCode);
      setChargePaymentInfoById((current) => ({
        ...current,
        [chargeId]: 'Código Pix copiado.',
      }));
    } catch {
      setChargePaymentErrorById((current) => ({
        ...current,
        [chargeId]: 'Não foi possível copiar o código Pix automaticamente.',
      }));
    }
  };

  const handleCopyBankSlipLine = async (chargeId: string) => {
    const line = chargePaymentDataById[chargeId]?.bankSlipDigitableLine?.trim() || '';
    if (!line) return;

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
      ) {
        throw new Error('Clipboard indisponível');
      }
      await navigator.clipboard.writeText(line);
      setChargePaymentInfoById((current) => ({
        ...current,
        [chargeId]: 'Linha digitável copiada.',
      }));
    } catch {
      setChargePaymentErrorById((current) => ({
        ...current,
        [chargeId]: 'Não foi possível copiar a linha digitável automaticamente.',
      }));
    }
  };

  const renderProfileAvatarActions = () => (
    <div className="student-template-profile-actions">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleProfileAvatarInputChange}
        hidden
      />
      <button
        type="button"
        className="student-template-profile-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={avatarBusy}
      >
        {avatarBusy ? 'Processando...' : 'Trocar foto'}
      </button>
      {profileAvatarUrl ? (
        <button
          type="button"
          className="student-template-profile-btn ghost"
          onClick={() => void removeProfileAvatar()}
          disabled={avatarBusy}
        >
          Remover foto
        </button>
      ) : null}
      {avatarFeedback ? <small className="student-template-profile-feedback">{avatarFeedback}</small> : null}
    </div>
  );

  const renderDedicatedPage = () => {
    if (activeSection === 'st-student-classes') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-2">
            <article className="student-page-card is-hero">
              <div className="student-page-chip-row">
                <span>Minha matrícula</span>
                <span>{normalizeStatus(matriculaPrincipal?.status)}</span>
              </div>
              <h3>{matriculaPrincipal?.courseName || 'Sem curso ativo'}</h3>
              <p>
                {matriculaPrincipal
                  ? `Turma ${matriculaPrincipal.className} • ${normalizeModality(matriculaPrincipal.modality)}`
                  : 'Nenhuma matrícula ativa no momento.'}
              </p>
              <div className="student-page-kpis">
                <article>
                  <span>Início</span>
                  <strong>{formatDate(matriculaPrincipal?.startDate)}</strong>
                </article>
                <article>
                  <span>Término</span>
                  <strong>{formatDate(matriculaPrincipal?.endDate)}</strong>
                </article>
                <article>
                  <span>Progresso</span>
                  <strong>{periodProgress === null ? 'N/D' : `${periodProgress}%`}</strong>
                </article>
              </div>
            </article>

            <article className="student-page-card">
              <h4>Turmas matriculadas</h4>
              {matriculas.length === 0 ? (
                <p className="student-template-empty">Nenhuma turma ativa para exibir.</p>
              ) : (
                <div className="student-page-list">
                  {matriculas.map((item) => (
                    <article key={item.enrollmentId} className="student-page-list-item">
                      <div>
                        <strong>{item.className}</strong>
                        <small>{item.courseName}</small>
                      </div>
                      <span>{normalizeStatus(item.status)}</span>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </div>
        </section>
      );
    }

    if (activeSection === 'st-student-agenda') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-2">
            <article className="student-page-card">
              <div className="student-page-card-head">
                <h4>{calendarData.monthLabel}</h4>
                <div className="student-page-month-nav">
                  <button
                    type="button"
                    onClick={() =>
                      setAgendaMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                    }
                    aria-label="Mês anterior"
                  >
                    {'<'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAgendaMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                    }
                    aria-label="Próximo mês"
                  >
                    {'>'}
                  </button>
                </div>
              </div>
              <div className="student-calendar-weekdays">
                {WEEKDAY_TINY.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="student-calendar-days">
                {calendarData.cells.map((cell) => (
                  <div
                    key={cell.key}
                    className={`student-calendar-day ${cell.day === null ? 'is-empty' : ''} ${
                      cell.isToday ? 'is-today' : ''
                    } ${cell.isMarked ? 'is-marked' : ''}`}
                  >
                    {cell.day}
                  </div>
                ))}
              </div>
            </article>

            <article className="student-page-card">
              <h4>Próximos eventos</h4>
              {upcomingClasses.length === 0 ? (
                <p className="student-template-empty">Nenhum evento agendado no momento.</p>
              ) : (
                <div className="student-page-list">
                  {visibleAgendaEvents.map((item) => (
                    <article key={`${item.id}-agenda`} className="student-page-list-item is-calendar">
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.period}</small>
                      </div>
                      <span>{item.modality}</span>
                    </article>
                  ))}
                  {canLoadMoreAgendaEvents ? (
                    <button
                      type="button"
                      className="student-template-class-load-more"
                      onClick={() =>
                        setAgendaEventsVisibleCount((current) =>
                          Math.min(upcomingClasses.length, current + AGENDA_EVENTS_STEP),
                        )
                      }
                    >
                      Ver mais
                    </button>
                  ) : null}
                </div>
              )}
            </article>
          </div>
        </section>
      );
    }

    if (activeSection === 'st-student-live') {
      const liveHistory = archivedLives.length > 0 ? archivedLives : liveMaterials;
      return (
        <section className="student-page-layout">
          <article className="student-page-card is-live-highlight">
            <div>
              <small>Transmissão em destaque</small>
              <h3>{liveMaterial?.title || 'Nenhuma transmissão no momento'}</h3>
              <p>
                {liveMaterial?.description ||
                  'As transmissões ao vivo e gravações aparecerão aqui conforme publicação da turma.'}
              </p>
            </div>
            {liveMaterial?.externalUrl || liveMaterial?.fileUrl ? (
              <a
                href={liveMaterial.externalUrl || liveMaterial.fileUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                Assistir agora
              </a>
            ) : (
              <button type="button" disabled>
                Indisponível
              </button>
            )}
          </article>

          <article className="student-page-card">
            <h4>Transmissões publicadas</h4>
            {liveHistory.length === 0 ? (
              <p className="student-template-empty">Nenhuma transmissão disponível.</p>
            ) : (
              <div className="student-page-list">
                {liveHistory.map((material) => (
                  <article key={material.id} className="student-page-list-item">
                    <div>
                      <strong>{material.title}</strong>
                      <small>{material.className}</small>
                    </div>
                    {material.externalUrl || material.fileUrl ? (
                      <a
                        href={material.externalUrl || material.fileUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir
                      </a>
                    ) : (
                      <span>Sem link</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-course') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <div className="student-page-card-head">
              <h4>Frequência geral</h4>
              <strong>{attendanceStats.percent}%</strong>
            </div>
            <div className="student-template-progress-bar" aria-hidden="true">
              <span style={{ width: `${attendanceStats.percent}%` }} />
            </div>
            <div className="student-page-kpis">
              <article>
                <span>Aulas realizadas</span>
                <strong>{attendanceStats.total}</strong>
              </article>
              <article>
                <span>Presenças registradas</span>
                <strong>{attendanceStats.attended}</strong>
              </article>
              <article>
                <span>Faltas registradas</span>
                <strong>{attendanceStats.absent}</strong>
              </article>
            </div>
          </article>

          <article className="student-page-card">
            <h4>Histórico de presença</h4>
            {attendanceStats.history.length === 0 ? (
              <p className="student-template-empty">Sem eventos suficientes para cálculo de frequência.</p>
            ) : (
              <div className="student-page-list">
                {attendanceStats.history.map((item) => {
                  const statusLabel =
                    item.status === 'present'
                      ? 'Presente'
                      : item.status === 'absent'
                        ? 'Falta'
                        : 'Pendente';
                  return (
                    <article key={`${item.id}-freq`} className="student-page-list-item">
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.className} • {formatDate(item.datetime)} às {formatHour(item.datetime)}
                        </small>
                      </div>
                      <span>{statusLabel}</span>
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-contracts') {
      return (
        <StudentContractsNative
          token={token}
          initialContractId={initialContractId}
          onSignedSuccess={() => {
            void loadDashboard({ bypassCache: true });
          }}
        />
      );
    }

    if (activeSection === 'st-student-finance') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-3">
            <article className="student-page-card">
              <h4>Mensalidades pendentes</h4>
              <strong className="student-page-big">{financeMetrics.pending.length}</strong>
              <p>
                Total em aberto:{' '}
                <span className={financeSensitiveClass}>{formatCurrency(financeMetrics.pendingAmount)}</span>
              </p>
            </article>
            <article className={`student-page-card ${hasOverdueCharges ? 'is-overdue' : ''}`}>
              <h4>{activeVoucher ? 'Voucher ativo' : 'Mensalidades vencidas'}</h4>
              {activeVoucher ? (
                <>
                  <strong className="student-page-big">{activeVoucher.label}</strong>
                  <p>
                    Código aplicado:{' '}
                    <span className={financeSensitiveClass}>{activeVoucher.code}</span>
                  </p>
                  <p>
                    Aplicação:{' '}
                    <span className={financeSensitiveClass}>{activeVoucherTargetLabel}</span>
                  </p>
                </>
              ) : (
                <>
                  <strong className="student-page-big">{financeMetrics.overdue.length}</strong>
                  <p>
                    Total vencido:{' '}
                    <span className={`${financeSensitiveClass} ${hasOverdueCharges ? 'is-overdue' : ''}`}>
                      {formatCurrency(financeMetrics.overdueAmount)}
                    </span>
                  </p>
                </>
              )}
            </article>
            <article className={`student-page-card ${nextChargeToneClass}`}>
              <h4>Próxima mensalidade</h4>
              <strong className={`student-page-big ${nextChargeToneClass}`}>
                {nextChargeLabel}
              </strong>
              <p className={`${financeSensitiveClass} ${nextChargeToneClass}`}>
                {nextChargeDescription}
              </p>
            </article>
          </div>
          {standaloneCreditCardRequests.length > 0 ? (
            <article className="student-page-card student-card-payment-requests">
              <h4>Pagamentos por cartão</h4>
              <p>Acompanhe aqui os links enviados e as cobranças programadas pelo financeiro.</p>
              <div className="student-card-payment-request-list">
                {standaloneCreditCardRequests.map((request) => {
                  const paymentLink = request.paymentLinkUrl?.trim() || '';
                  const courseName =
                    request.studentCourse?.course?.name || 'Curso não informado';
                  const voucher =
                    request.studentCourse?.selectedPaymentOption?.appliedVoucher;
                  const installmentLabel =
                    request.installmentCount && request.installmentCount > 1
                      ? `${request.installmentCount}x de ${formatCurrency(
                          Number(request.installmentAmount || 0),
                        )}`
                      : 'À vista';
                  return (
                    <div className="student-card-payment-request-row" key={request.id}>
                      <div>
                        <strong>{creditCardRequestKindLabel(request.kind)}</strong>
                        <small>{courseName}</small>
                        <p>{creditCardRequestStudentStatus(request)}</p>
                        {voucher?.code ? (
                          <small className="student-card-payment-voucher">
                            Voucher {voucher.code}
                            {voucher.discountLabel ? ` • ${voucher.discountLabel}` : ''}
                          </small>
                        ) : null}
                      </div>
                      <div className="student-card-payment-request-values">
                        <strong className={financeSensitiveClass}>
                          {formatCurrency(request.amount)}
                        </strong>
                        <small>{installmentLabel}</small>
                        {paymentLink ? (
                          <div className="student-charge-inline-actions">
                            <button
                              type="button"
                              className="student-charge-commercial-action"
                              onClick={() => void handleOpenCreditCardLink(request)}
                            >
                              Abrir link
                            </button>
                            <button
                              type="button"
                              className="student-charge-secondary-action"
                              onClick={() => void handleCopyCreditCardLink(request)}
                            >
                              Copiar link
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ) : null}
          {creditChargesForCommercial.length > 0 ? (
            <article className="student-page-card student-page-card-contact-assist">
              <h4>Pagamento no crédito</h4>
              <p>
                Encontramos {creditChargesForCommercial.length} cobrança(s) com forma de pagamento
                em cartão de crédito. Como o gateway financeiro atual não processa cartão, sua
                solicitação deve ser feita diretamente com o comercial.
              </p>
              <div className="student-page-contact-actions">
                <button
                  type="button"
                  onClick={() => openExternalContact(commercialCreditUrl)}
                  disabled={!commercialCreditUrl}
                >
                  Solicitar cobrança no crédito
                </button>
                <small>
                  {commercialCreditUrl
                    ? `Canal de atendimento: ${commercialContactChannel}.`
                    : 'Contato comercial ainda não configurado pela instituição.'}
                </small>
              </div>
            </article>
          ) : null}
          <article className="student-page-card">
            <h4>Extrato de cobranças</h4>
            {financeMetrics.visible.length === 0 ? (
              <p className="student-template-empty">Nenhuma cobrança pendente no mês atual ou em atraso.</p>
            ) : (
              <div className="student-page-list">
                {financeMetrics.visible.map((charge) => {
                  const isOverdue = isChargeOverdue(charge);
                  const paymentData = chargePaymentDataById[charge.id];
                  const paymentError = chargePaymentErrorById[charge.id];
                  const paymentInfo = chargePaymentInfoById[charge.id];
                  const bankSlipViewUrl =
                    paymentData?.bankSlipViewUrl?.trim() ||
                    paymentData?.bankSlipUrl?.trim() ||
                    paymentData?.checkoutUrl?.trim() ||
                    paymentData?.invoiceUrl?.trim() ||
                    '';
                  const bankSlipDownloadUrl =
                    paymentData?.bankSlipDownloadUrl?.trim() ||
                    paymentData?.invoiceUrl?.trim() ||
                    paymentData?.bankSlipUrl?.trim() ||
                    bankSlipViewUrl;
                  const isBankSlipPayment =
                    charge.paymentMethod === 'BANK_SLIP' || paymentData?.method === 'BANK_SLIP';
                  const chargeDescription = String(charge.description || '').trim();
                  const isPaying = payingChargeId === charge.id;
                  const duplicatedExistingTitleMessage = 'Este boleto já foi emitido. Use os botões Ver PDF/Baixar.';
                  const hasDuplicatedTitleHint =
                    String(paymentInfo || '')
                      .toLowerCase()
                      .includes(duplicatedExistingTitleMessage.toLowerCase()) ||
                    String(paymentError || '')
                      .toLowerCase()
                      .includes(duplicatedExistingTitleMessage.toLowerCase());
                  const hasAnyBankSlipLink = Boolean(bankSlipViewUrl || bankSlipDownloadUrl);
                  const isSearchingExistingBankSlip =
                    isPaying && isBankSlipPayment && hasDuplicatedTitleHint && !hasAnyBankSlipLink;
                  const normalizedStatus = String(charge.status || '')
                    .trim()
                    .toUpperCase();
                  const canPay =
                    charge.canPay !== false
                    && (normalizedStatus === 'PENDING' || normalizedStatus === 'OVERDUE');
                  const requiresCommercialContact =
                    Boolean(charge.creditCardUnsupported) &&
                    normalizedStatus !== 'PAID' &&
                    normalizedStatus !== 'CANCELED' &&
                    normalizedStatus !== 'CANCELLED';
                  const creditCardRequest = creditCardRequestsByChargeId[charge.id];
                  const creditCardPaymentLink = creditCardRequest?.paymentLinkUrl?.trim() || '';
                  const creditCardRequestStatus = String(
                    creditCardRequest?.status || '',
                  ).toUpperCase();
                  return (
                    <article key={charge.id} className={`student-page-list-item ${isOverdue ? 'is-overdue' : ''}`}>
                    <div>
                      <strong className={`${financeSensitiveClass} ${isOverdue ? 'is-overdue' : ''}`}>
                        {formatCurrency(charge.amount)}
                      </strong>
                      <small>
                        {chargeDescription || charge.className} • {paymentMethodLabel(charge.paymentMethod)} •
                        {' '}Vencimento {formatDate(charge.dueDate)}
                      </small>
                      {paymentInfo ? (
                        <small className="student-charge-feedback">{paymentInfo}</small>
                      ) : null}
                      {paymentError ? (
                        <small className="student-charge-feedback is-error">{paymentError}</small>
                      ) : null}
                      {requiresCommercialContact ? (
                        <small className="student-charge-feedback is-warning">
                          {creditCardRequestStatus === 'WAITING_COURSE_START'
                            ? 'Pagamento registrado para o início do curso. Aguarde o envio do link pelo financeiro.'
                            : 'Cartão de crédito indisponível neste gateway. Solicite a cobrança ao comercial.'}
                        </small>
                      ) : null}
                      {paymentData?.pixCopyPaste ? (
                        <div className="student-charge-inline-actions">
                          <button
                            type="button"
                            className="student-charge-secondary-action"
                            onClick={() => void handleCopyPixCode(charge.id)}
                          >
                            Copiar Pix
                          </button>
                        </div>
                      ) : null}
                      {isBankSlipPayment && paymentData?.bankSlipDigitableLine ? (
                        <div className="student-charge-inline-actions">
                          <button
                            type="button"
                            className="student-charge-secondary-action"
                            onClick={() => void handleCopyBankSlipLine(charge.id)}
                          >
                            Copiar linha digitável
                          </button>
                        </div>
                      ) : null}
                      {isBankSlipPayment && hasDuplicatedTitleHint && !hasAnyBankSlipLink ? (
                        <div className="student-charge-inline-actions">
                          <button
                            type="button"
                            className="student-charge-secondary-action"
                            onClick={() => void handlePayCharge(charge)}
                            disabled={isPaying}
                          >
                            {isPaying ? 'Buscando...' : 'Buscar boleto emitido'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="student-charge-actions">
                      <span className={isOverdue ? 'student-charge-status is-overdue' : 'student-charge-status'}>
                        {normalizeChargeStatus(charge.status)}
                      </span>
                      {requiresCommercialContact ? (
                        <>
                          {creditCardPaymentLink && creditCardRequest ? (
                            <>
                              <button
                                type="button"
                                className="student-charge-commercial-action"
                                onClick={() =>
                                  void handleOpenCreditCardLink(creditCardRequest)
                                }
                              >
                                Abrir link
                              </button>
                              <button
                                type="button"
                                className="student-charge-commercial-action"
                                onClick={() =>
                                  void handleCopyCreditCardLink(creditCardRequest)
                                }
                              >
                                Copiar link
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="student-charge-commercial-action"
                              onClick={() => void handleRequestCreditCardLink(charge)}
                              disabled={
                                isPaying ||
                                creditCardRequestStatus === 'WAITING_COURSE_START' ||
                                creditCardRequestStatus === 'REQUESTED' ||
                                creditCardRequestStatus === 'LINK_SENT'
                              }
                            >
                              {isPaying
                                ? 'Enviando...'
                                : creditCardRequestStatus === 'WAITING_COURSE_START'
                                  ? 'Aguardando início'
                                : creditCardRequest
                                  ? 'Solicitado'
                                  : 'Solicitar link'}
                            </button>
                          )}
                        </>
                      ) : null}
                      {canPay && !isSearchingExistingBankSlip ? (
                        <button
                          type="button"
                          onClick={() => void handlePayCharge(charge)}
                          disabled={isPaying}
                        >
                          {isPaying ? 'Gerando...' : 'Pagar'}
                        </button>
                      ) : null}
                      {!isBankSlipPayment && paymentData?.checkoutUrl ? (
                        <a
                          href={paymentData.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir cobrança
                        </a>
                      ) : null}
                      {isBankSlipPayment && bankSlipViewUrl ? (
                        <a
                          href={bankSlipViewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver PDF
                        </a>
                      ) : null}
                      {isBankSlipPayment && bankSlipDownloadUrl ? (
                        <a
                          href={bankSlipDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                        >
                          Baixar boleto
                        </a>
                      ) : null}
                    </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-materials') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <h4>Biblioteca por turma</h4>
            {materialsByClass.length === 0 ? (
              <p className="student-template-empty">Nenhum material disponível para sua turma.</p>
            ) : (
              <div className="student-material-groups">
                {materialsByClass.map(([className, items]) => (
                  <section key={className}>
                    <header>
                      <strong>{className}</strong>
                      <small>{items.length} Item(s)</small>
                    </header>
                    <ul>
                      {items.map((material) => (
                        <li key={material.id}>
                          <div>
                            <h5>{material.title}</h5>
                            <p>{material.description || `Tipo: ${material.kind}`}</p>
                            <small>{formatDateTime(material.publishedAt)}</small>
                          </div>
                          {material.fileUrl || material.externalUrl ? (
                            <a
                              href={material.fileUrl || material.externalUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Abrir
                            </a>
                          ) : (
                            <span>Sem link</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-notices') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <h4>Mural de notificações</h4>
            {recentNotices.length === 0 ? (
              <p className="student-template-empty">Nenhum aviso publicado no momento.</p>
            ) : (
              <div className="student-notice-feed">
                {recentNotices.map((aviso) => (
                  <article key={aviso.id} className={aviso.priority === 'high' ? 'is-priority' : ''}>
                    <header>
                      <strong>{aviso.title}</strong>
                      <span>{formatRelative(aviso.publishedAt)}</span>
                    </header>
                    <small>{aviso.className}</small>
                    <p>{aviso.body}</p>
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-certificate') {
      return (
        <section className="student-page-layout">
          <article className="student-page-card">
            <h4>Certificado de conclusão</h4>
            {matriculas.length === 0 ? (
              <p className="student-template-empty">Sem matrícula ativa para emissão de certificado.</p>
            ) : (
              <div className="student-page-list">
                {matriculas.map((item) => {
                  const status = normalizeStatus(item.status);
                  const isConcluded = status.toLowerCase().includes('conclu');
                  return (
                    <article key={`${item.enrollmentId}-cert`} className="student-page-list-item">
                      <div>
                        <strong>{item.courseName}</strong>
                        <small>
                          {item.className} • {status}
                        </small>
                      </div>
                      {isConcluded ? <button type="button">Baixar PDF</button> : <span>Pendente</span>}
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activeSection === 'st-student-profile') {
      return (
        <section className="student-page-layout">
          <div className="student-page-grid cols-2">
            <article className="student-page-card">
              <div className="student-template-profile-row">
                {profileAvatarUrl ? (
                  <img src={profileAvatarUrl} alt={`Avatar de ${titleName}`} />
                ) : (
                  <span>{initials(titleName)}</span>
                )}
                <div>
                  <strong>{titleName}</strong>
                  <small>{maskEmail(me?.email || user.email)}</small>
                </div>
              </div>
              {renderProfileAvatarActions()}
              <dl className="student-profile-grid">
                <div>
                  <dt>CPF</dt>
                  <dd>{maskCpf(me?.studentProfile?.documentCpf)}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>{maskPhone(me?.studentProfile?.phone)}</dd>
                </div>
                <div>
                  <dt>Nascimento</dt>
                  <dd>{formatDate(me?.studentProfile?.birthDate)}</dd>
                </div>
                <div>
                  <dt>Cidade/UF</dt>
                  <dd>{profileCityState}</dd>
                </div>
              </dl>
            </article>
            <article className="student-page-card">
              <h4>Suporte acadêmico</h4>
              <p>
                Para atualização cadastral, documentos e dúvidas administrativas, utilize a Secretaria
                Virtual no menu lateral.
              </p>
            </article>
          </div>
        </section>
      );
    }

    return null;
  };

  const studentId = me?.id ? me.id.slice(0, 8).toUpperCase() : '---';
  const showBootOverlay = loading || !fontsReady;

  return (
    <section
      className={`student-template-shell ${showBootOverlay ? 'is-booting' : ''}`}
      style={studentTemplateStyle}
    >
      {showBootOverlay ? (
        <div className="student-template-boot" role="status" aria-live="polite">
          <div className="student-template-boot-card">
            <img src={activeBranding.logoUrl} alt={brandingLogoAlt} />
            <strong>Carregando ambiente do aluno</strong>
            <p>Preparando layout e dados com estabilidade visual...</p>
            <span className="student-template-boot-spinner" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      <aside className="student-template-sidebar" aria-label="Navegação principal do aluno">
        <div className="student-template-brand">
          <img src={activeBranding.logoUrl} alt={brandingLogoAlt} />
        </div>

        <nav className="student-template-menu">
          {NAV_ITEMS.map((item) => {
            const disabled = isSectionDisabled(item.target);
            const active = !disabled && activeSection === item.target;
            return (
              <button
                key={`${item.label}-${item.target}`}
                type="button"
                className={`${active ? 'active' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
                onClick={() => openSection(item.target)}
                disabled={disabled}
              >
                <StudentIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="student-template-main">
        <header className="student-template-topbar">
          <label className="student-template-search" htmlFor="student-search">
            <StudentIcon name="search" />
            <input
              id="student-search"
              type="text"
              placeholder="Buscar materiais, aulas ou notificações..."
              value={studentSearchQuery}
              onChange={(event) => setStudentSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  executeStudentSearch();
                }
              }}
              aria-label="Busca rápida"
            />
            {studentSearchSuggestions.length > 0 ? (
              <div className="student-template-search-menu" role="listbox" aria-label="Sugestões de busca">
                {studentSearchSuggestions.map((suggestion) => (
                  <button
                    key={`student-search-${suggestion.target}`}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      openSection(suggestion.target);
                      setStudentSearchQuery(suggestion.label);
                    }}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          <div className="student-template-topbar-right">
            <button
              type="button"
              className="student-template-icon-btn"
              aria-label="Notificações"
              onClick={() => openSection('st-student-notices')}
            >
              <StudentIcon name="notifications_active" />
              {noticesFeed.length > 0 ? <span className="student-template-icon-dot" /> : null}
            </button>
            <button type="button" className="student-template-icon-btn" aria-label="Ajuda">
              <StudentIcon name="help" />
            </button>

            <div className="student-template-user-menu-wrap" ref={userMenuRef}>
              <button
                type="button"
                className="student-template-user-trigger"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((current) => !current)}
              >
                <div className="student-template-user">
                  <div>
                    <strong>{topbarName}</strong>
                    <small>ID: {studentId}</small>
                  </div>

                  {profileAvatarUrl ? (
                    <img src={profileAvatarUrl} alt={`Avatar de ${titleName}`} />
                  ) : (
                    <span className="student-template-user-fallback">{initials(titleName)}</span>
                  )}
                </div>
                <span className="student-template-user-caret" aria-hidden="true" />
              </button>

              {userMenuOpen ? (
                <div className="student-template-user-menu" role="menu" aria-label="Menu do perfil">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openSection('st-student-profile')}
                  >
                    Meu perfil
                  </button>
                  <button type="button" role="menuitem" onClick={onLogout}>
                    Sair
                  </button>
                </div>
              ) : null}
            </div>

            <button type="button" className="student-template-logout" onClick={onLogout}>
              Sair
            </button>
          </div>
        </header>

        <div className="student-template-content">
          {loading ? <p className="student-template-loading">Carregando painel do aluno...</p> : null}

          {error ? (
            <p className="student-template-error">
              {error}
              <button type="button" onClick={() => void loadDashboard({ bypassCache: true })}>
                Atualizar
              </button>
            </p>
          ) : null}

          {!dashboard || error ? null : (
            <>
              <section id="st-student-panel" className="student-template-welcome">
                <div className="student-template-welcome-title-row">
                  <h2>
                    {activeSection === 'st-student-panel'
                      ? `Bem-vindo de volta, ${firstName(titleName)}!`
                      : currentMeta.title}
                  </h2>
                </div>
                <p>{currentSubtitle}</p>
              </section>

              {isContractGateLocked ? (
                <section className="student-contract-gate-banner" role="alert">
                  <div>
                    <strong>
                      {isPreContractStage
                        ? 'Acesso parcial liberado: falta o pagamento'
                        : missingRequiredContractCount > 1
                          ? 'Acesso parcial liberado: faltam assinaturas obrigatórias'
                          : 'Acesso parcial liberado: falta uma assinatura obrigatória'}
                    </strong>
                    {isPreContractStage ? (
                      <p>{preContractPaymentMessage}</p>
                    ) : !hasPendingContractsToSign ? (
                      <p>
                        Ainda faltam {missingRequiredContractCount} contrato(s) obrigatório(s).
                        Aguarde o envio dos documentos pendentes pela instituição e assine na área
                        de Contratos para desbloquear o restante.
                      </p>
                    ) : (
                      <p>
                        Assine os contratos pendentes para desbloquear aulas, agenda,
                        transmissões, frequência, materiais e certificado.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openSection(
                        isPreContractStage ? 'st-student-finance' : 'st-student-contracts',
                      )
                    }
                  >
                    {isPreContractStage ? 'Ir para Financeiro' : 'Ir para Contratos'}
                  </button>
                </section>
              ) : null}

              {activeMobileGroup.sections.length > 1 ? (
                <nav className="student-mobile-section-tabs" aria-label="Seções do grupo ativo">
                  {activeMobileGroup.sections.map((sectionId) => {
                    const disabled = isSectionDisabled(sectionId);
                    const active = !disabled && activeSection === sectionId;
                    return (
                      <button
                        key={`mobile-subtab-${sectionId}`}
                        type="button"
                        className={`${active ? 'active' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
                        onClick={() => openSection(sectionId)}
                        disabled={disabled}
                      >
                        {SECTION_MOBILE_LABEL[sectionId]}
                      </button>
                    );
                  })}
                </nav>
              ) : null}

              {isPanelView ? (
                <>
              <div className={`student-template-bento-grid ${isPanelView ? '' : 'is-single-view'}`}>
                {showCourse ? (
                <article
                  id="st-student-course"
                  className={`student-template-course-card ${isPanelView ? '' : 'is-full-span'}`}
                >
                  <div className="student-template-course-header">
                    <div className="student-template-course-badges">
                      <span>Curso atual</span>
                      <span>{normalizeModality(matriculaPrincipal?.modality)}</span>
                    </div>
                  </div>
                  <StudentIcon name="school" className="student-template-course-watermark" />

                  {matriculaPrincipal ? <h3>{matriculaPrincipal.courseName}</h3> : null}
                  <p>
                    {matriculaPrincipal
                      ? `${matriculaPrincipal.className} • ${formatDate(matriculaPrincipal.startDate)} a ${formatDate(matriculaPrincipal.endDate)}`
                      : 'Você ainda não tem turma cadastrada. Aguarde o professor atribuir uma turma para liberar suas aulas.'}
                  </p>

                  <div className="student-template-progress">
                    <div>
                      <strong>Progresso do período</strong>
                      <small>
                        {periodProgress === null
                          ? 'Sem intervalo de datas para cálculo.'
                          : 'Estimado pela janela de início e término da turma.'}
                      </small>
                    </div>
                    <b>{periodProgress === null ? 'N/D' : `${periodProgress}%`}</b>
                  </div>

                  <div className="student-template-progress-bar" aria-hidden="true">
                    <span style={{ width: `${periodProgress ?? 0}%` }} />
                  </div>
                </article>
                ) : null}

                {showFinance ? (
                <div className={`student-template-side-stack ${isPanelView ? '' : 'is-full-span'}`}>
                  <article
                    id="st-student-finance"
                    className={`student-template-next-due-card ${nextChargeToneClass}`}
                  >
                    <div>
                      <StudentIcon name="payments" />
                      <small>Próxima mensalidade</small>
                    </div>
                    <strong>{nextChargeLabel}</strong>
                    <p className={`${financeSensitiveClass} ${nextChargeToneClass}`}>
                      {nextChargeDescription}
                    </p>
                  </article>

                  <article className="student-template-credit-card">
                    <div>
                      <StudentIcon name="checklist_rtl" />
                      <small>Mensalidades</small>
                    </div>
                    <strong>
                      {financeMetrics.visible.length} <em>em aberto (mês atual + vencidas)</em>
                    </strong>
                    <div className="student-template-progress-mini" aria-hidden="true">
                      <span style={{ width: `${financeProgress}%` }} />
                    </div>
                  </article>
                </div>
                ) : null}

                {showClasses ? (
                <article
                  id="st-student-classes"
                  className={`student-template-classes-card ${isPanelView ? '' : 'is-full-span'}`}
                >
                  <div className="student-template-card-title">
                    <h4>
                      <StudentIcon name="event_note" />
                      Próximas aulas
                    </h4>
                    <button type="button" onClick={() => openSection('st-student-materials')}>
                      Ver materiais
                    </button>
                  </div>

                  {upcomingClasses.length === 0 ? (
                    <p className="student-template-empty">Nenhuma aula programada no momento.</p>
                  ) : (
                    <div className="student-template-class-list">
                      {visibleUpcomingClasses.map((item) => (
                        <article key={item.id} className="student-template-class-item">
                          <div className="student-template-class-date">
                            <span>{item.dayLabel}</span>
                            <strong>{item.day}</strong>
                          </div>

                          <div className="student-template-class-content">
                            <h5>{item.title}</h5>
                            <p>{item.subtitle}</p>
                            <small>{item.period}</small>
                          </div>

                          <span className={`student-template-class-tag ${item.modalityTone}`}>{item.modality}</span>
                        </article>
                      ))}

                      {canLoadMorePanelClasses ? (
                        <button
                          type="button"
                          className="student-template-class-load-more"
                          onClick={() =>
                            setPanelClassesVisibleCount((current) =>
                              Math.min(upcomingClasses.length, current + PANEL_CLASSES_STEP),
                            )
                          }
                        >
                          Ver mais
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
                ) : null}

                {(showLive || showNotices) ? (
                <div className={`student-template-right-column ${isPanelView ? '' : 'is-full-span'}`}>
                  {showLive ? (
                  <article id="st-student-live" className="student-template-live-card">
                    <div>
                      <StudentIcon name="live_tv" />
                      <div>
                        <h4>{liveMaterial ? 'Transmissão em destaque' : 'Sem transmissão no momento'}</h4>
                        <p>
                          {liveMaterial
                            ? liveMaterial.title
                            : 'Assim que uma live for publicada, ela aparecerá aqui.'}
                        </p>
                      </div>
                    </div>

                    {liveMaterial?.externalUrl || liveMaterial?.fileUrl ? (
                      <a
                        href={liveMaterial.externalUrl || liveMaterial.fileUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Assistir
                      </a>
                    ) : (
                      <button type="button" disabled>
                        Indisponível
                      </button>
                    )}
                  </article>
                  ) : null}

                  {showNotices ? (
                  <article id="st-student-notices" className="student-template-notices-card">
                    <div className="student-template-card-title">
                      <h4>
                        <StudentIcon name="notifications_active" />
                        Notificações recentes
                      </h4>
                    </div>

                    {recentNotices.length === 0 ? (
                      <p className="student-template-empty">Nenhum aviso recente.</p>
                    ) : (
                      <div className="student-template-notice-list">
                        {recentNotices.map((aviso) => (
                          <article
                            key={aviso.id}
                            className={aviso.priority === 'high' ? 'is-priority' : 'is-neutral'}
                          >
                            <small>
                              {aviso.className} • {formatRelative(aviso.publishedAt)}
                            </small>
                            <h5>{aviso.title}</h5>
                            <p>{aviso.body}</p>
                          </article>
                        ))}
                      </div>
                    )}

                    <button type="button" onClick={() => openSection('st-student-notices')}>
                      VER TODAS
                    </button>
                  </article>
                  ) : null}
                </div>
                ) : null}
              </div>

              {isPanelView ? (
              <footer className="student-template-support">
                <div className="student-template-support-main">
                  <StudentIcon name="headset_mic" />
                  <div>
                    <h4>Precisa de auxílio acadêmico?</h4>
                    <p>
                      Nosso time está disponível de segunda a sexta, das 09h às 21h.
                      {supportContactChannel
                        ? ` Atendimento via ${supportContactChannel}.`
                        : ' Contato de suporte ainda não configurado pela instituição.'}
                    </p>
                  </div>
                </div>
                <div className="student-template-support-actions">
                  <button type="button" onClick={() => openSection('st-student-notices')}>
                    Central de ajuda
                  </button>
                  <button
                    type="button"
                    onClick={() => openExternalContact(supportContactUrl)}
                    disabled={!supportContactUrl}
                  >
                    Falar com suporte
                  </button>
                </div>
              </footer>
              ) : null}

              {!isPanelView && (showAgenda || showMaterials || showCertificate || showProfile) ? (
              <section className={`student-template-lower-grid ${isPanelView ? '' : 'is-single-view'}`}>
                {showAgenda ? (
                <article
                  id="st-student-agenda"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
                  <h4>Agenda acadêmica</h4>
                  {upcomingClasses.length === 0 ? (
                    <p className="student-template-empty">Nenhum evento acadêmico próximo.</p>
                  ) : (
                    <ul>
                      {visibleAgendaEvents.map((item) => (
                        <li key={`${item.id}-agenda`}>
                          <div>
                            <strong>{item.title}</strong>
                            <small>{item.period}</small>
                          </div>
                          <span>{item.modality}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canLoadMoreAgendaEvents ? (
                    <button
                      type="button"
                      className="student-template-class-load-more"
                      onClick={() =>
                        setAgendaEventsVisibleCount((current) =>
                          Math.min(upcomingClasses.length, current + AGENDA_EVENTS_STEP),
                        )
                      }
                    >
                      Ver mais
                    </button>
                  ) : null}
                </article>
                ) : null}

                {showMaterials ? (
                <article
                  id="st-student-materials"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
                  <h4>Materiais de apoio</h4>
                  {recentMaterials.length === 0 ? (
                    <p className="student-template-empty">Nenhum material publicado para sua turma.</p>
                  ) : (
                    <ul>
                      {recentMaterials.map((material) => (
                        <li key={material.id}>
                          <div>
                            <strong>{material.title}</strong>
                            <small>
                              {material.className} • {formatDateTime(material.publishedAt)}
                            </small>
                          </div>
                          {material.fileUrl || material.externalUrl ? (
                            <a
                              href={material.fileUrl || material.externalUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Abrir
                            </a>
                          ) : (
                            <span>Sem link</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
                ) : null}

                {showCertificate ? (
                <article
                  id="st-student-certificate"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
                  <h4>Certificado</h4>
                  <p>
                    {matriculaPrincipal
                      ? `Status da matrícula: ${normalizeStatus(matriculaPrincipal.status)}.`
                      : 'Sem matrícula ativa para emissão de certificado.'}
                  </p>
                  <p>
                    Assim que a turma for concluída e homologada, o certificado ficará disponível para
                    download neste painel.
                  </p>
                </article>
                ) : null}

                {showProfile ? (
                <article
                  id="st-student-profile"
                  className={`student-template-lower-card ${isPanelView ? '' : 'is-full-span'}`}
                >
                  <h4>Meu perfil</h4>
                  <div className="student-template-profile-row">
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt={`Avatar de ${titleName}`} />
                    ) : (
                      <span>{initials(titleName)}</span>
                    )}
                    <div>
                      <strong>{titleName}</strong>
                      <small>{maskEmail(me?.email || user.email)}</small>
                    </div>
                  </div>
                  {renderProfileAvatarActions()}

                  <dl>
                    <div>
                      <dt>CPF</dt>
                      <dd>{maskCpf(me?.studentProfile?.documentCpf)}</dd>
                    </div>
                    <div>
                      <dt>Telefone</dt>
                      <dd>{maskPhone(me?.studentProfile?.phone)}</dd>
                    </div>
                    <div>
                      <dt>Nascimento</dt>
                      <dd>{formatDate(me?.studentProfile?.birthDate)}</dd>
                    </div>
                    <div>
                      <dt>Cidade/UF</dt>
                      <dd>{profileCityState}</dd>
                    </div>
                  </dl>
                </article>
                ) : null}
              </section>
              ) : null}
                </>
              ) : (
                renderDedicatedPage()
              )}
            </>
          )}
        </div>
      </main>

      <nav className="student-template-bottom-nav" aria-label="Navegação móvel">
        {MOBILE_NAV_ITEMS.map((item) => {
          const disabled = isSectionDisabled(item.target);
          const active = !disabled && item.sections.includes(activeSection);
          return (
            <button
              key={`${item.label}-${item.target}`}
              type="button"
              className={`${active ? 'active' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
              onClick={() => openSection(item.target)}
              disabled={disabled}
            >
              <StudentIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
