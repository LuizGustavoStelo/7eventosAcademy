import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ChangeEvent, FormEvent } from 'react';
import { apiRequest, formatCurrency } from './api';

type FinanceProvider = 'manual' | 'sicoob' | 'asaas' | 'stripe';
type FinanceEnvironment = 'sandbox' | 'production';

type DashboardAccount = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  institution: {
    id: string;
    name: string;
    slug: string;
  } | null;
  branding: {
    logoUrl: string;
    palette: BrandingPalette;
    isCustom: boolean;
    updatedAt: string | null;
  };
  finance: {
    provider: string;
    environment: string;
    isActive: boolean;
    isConfigured: boolean;
    updatedAt: string | null;
  };
};

type AccountsDashboardResponse = {
  overview: {
    totalAccounts: number;
    activeLearners: number;
    activeCourses: number;
    revenueMrr: number;
    configuredFinanceAccounts: number;
  };
  accounts: DashboardAccount[];
};

type SicoobBaseUrls = {
  cobrancaBancaria: string;
  cobrancaBancariaPagamentos: string;
  pixPagamentos: string;
  pixRecebimentos: string;
  spbTransferencias: string;
};

type BrandingPalette = {
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

type AccountFinancialResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  finance: {
    provider: string;
    environment: string;
    isActive: boolean;
    isConfigured: boolean;
    updatedAt: string | null;
    sicoob: {
      clientId: string;
      tokenUrl: string;
      baseUrls: SicoobBaseUrls;
      sandboxBaseUrls: SicoobBaseUrls;
      webhookUrl: string;
      numeroCliente: string;
      scopes: string[];
      certificateConfigured: boolean;
      privateKeyConfigured: boolean;
    };
  };
};

type AccountBrandingResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  institution: {
    id: string;
    name: string;
    slug: string;
  };
  branding: {
    logoUrl: string;
    palette: BrandingPalette;
    isCustom: boolean;
    updatedAt: string | null;
  };
};

type PlatformStudent = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  statusLabel?: string;
  courses?: Array<{
    id: string;
    course?: {
      id: string;
      name: string;
    } | null;
  }>;
  enrollments?: Array<{
    id: string;
  }>;
};

type FinancialFormState = {
  provider: FinanceProvider;
  environment: FinanceEnvironment;
  isActive: boolean;
  genericApiKey: string;
  sicoobClientId: string;
  sicoobNumeroCliente: string;
  sicoobTokenUrl: string;
  sicoobBaseUrlCobrancaBancaria: string;
  sicoobBaseUrlCobrancaBancariaPagamentos: string;
  sicoobBaseUrlPixPagamentos: string;
  sicoobBaseUrlPixRecebimentos: string;
  sicoobBaseUrlSpbTransferencias: string;
  sicoobSandboxBaseUrlCobrancaBancaria: string;
  sicoobSandboxBaseUrlCobrancaBancariaPagamentos: string;
  sicoobSandboxBaseUrlPixPagamentos: string;
  sicoobSandboxBaseUrlPixRecebimentos: string;
  sicoobSandboxBaseUrlSpbTransferencias: string;
  sicoobWebhookUrl: string;
  sicoobScopes: string;
  sicoobCertificatePem: string;
  sicoobPrivateKeyPem: string;
  sicoobCertificatePfxBase64: string;
  sicoobCertificatePfxPassphrase: string;
  sicoobCertificatePfxFileName: string;
};

type BrandingFormState = {
  logoUrl: string;
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

type BrandingMetaState = {
  institutionName: string;
  institutionSlug: string;
  isCustom: boolean;
  updatedAt: string | null;
};

type ConfigFlags = {
  certificateConfigured: boolean;
  privateKeyConfigured: boolean;
};

type SuperadminAccountsNativeProps = {
  token: string;
};

const DEFAULT_STUDENT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#eef2f6"/><circle cx="48" cy="36" r="14" fill="#8ca0b8"/><path d="M22 79c4-13 14-21 26-21s22 8 26 21" fill="#8ca0b8"/></svg>',
)}`;
const DEFAULT_STUDENT_BRANDING_LOGO_URL = '/Logo-IPESK.png';
const DEFAULT_STUDENT_BRANDING_PALETTE: BrandingPalette = {
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
const BRANDING_COLOR_FIELDS: Array<{
  key: keyof BrandingPalette;
  label: string;
}> = [
  { key: 'primaryColor', label: 'Primária' },
  { key: 'primaryStrongColor', label: 'Primária forte' },
  { key: 'secondaryColor', label: 'Secundária' },
  { key: 'secondaryStrongColor', label: 'Secundária forte' },
  { key: 'backgroundColor', label: 'Fundo' },
  { key: 'surfaceColor', label: 'Superfície' },
  { key: 'surfaceSoftColor', label: 'Superfície suave' },
  { key: 'borderColor', label: 'Borda' },
  { key: 'textColor', label: 'Texto' },
  { key: 'mutedColor', label: 'Texto auxiliar' },
];

function defaultForm(): FinancialFormState {
  return {
    provider: 'manual',
    environment: 'sandbox',
    isActive: false,
    genericApiKey: '',
    sicoobClientId: '',
    sicoobNumeroCliente: '',
    sicoobTokenUrl: '',
    sicoobBaseUrlCobrancaBancaria: '',
    sicoobBaseUrlCobrancaBancariaPagamentos: '',
    sicoobBaseUrlPixPagamentos: '',
    sicoobBaseUrlPixRecebimentos: '',
    sicoobBaseUrlSpbTransferencias: '',
    sicoobSandboxBaseUrlCobrancaBancaria: '',
    sicoobSandboxBaseUrlCobrancaBancariaPagamentos: '',
    sicoobSandboxBaseUrlPixPagamentos: '',
    sicoobSandboxBaseUrlPixRecebimentos: '',
    sicoobSandboxBaseUrlSpbTransferencias: '',
    sicoobWebhookUrl: '',
    sicoobScopes: '',
    sicoobCertificatePem: '',
    sicoobPrivateKeyPem: '',
    sicoobCertificatePfxBase64: '',
    sicoobCertificatePfxPassphrase: '',
    sicoobCertificatePfxFileName: '',
  };
}

function defaultBrandingForm(): BrandingFormState {
  return {
    logoUrl: DEFAULT_STUDENT_BRANDING_LOGO_URL,
    ...DEFAULT_STUDENT_BRANDING_PALETTE,
  };
}

function toProvider(value: string): FinanceProvider {
  if (value === 'manual' || value === 'sicoob' || value === 'asaas' || value === 'stripe') {
    return value;
  }
  return 'manual';
}

function toEnvironment(value: string): FinanceEnvironment {
  return value === 'production' ? 'production' : 'sandbox';
}

function financeStateLabel(account: DashboardAccount): string {
  if (!account.finance.isConfigured) return 'Não configurado';
  if (!account.finance.isActive) return 'Configurado (inativo)';
  return 'Ativo';
}

function financeStateTone(account: DashboardAccount): string {
  if (!account.finance.isConfigured) return 'is-warning';
  if (!account.finance.isActive) return 'is-muted';
  return 'is-success';
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeSearch(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveAvatar(avatarUrl?: string | null): string {
  const cleaned = String(avatarUrl || '').trim();
  if (!cleaned) return DEFAULT_STUDENT_AVATAR;
  return cleaned;
}

function normalizeHexColor(value: string, fallback: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^#([0-9a-f]{6})$/i.test(normalized)) {
    return fallback;
  }
  return normalized;
}

function toBrandingForm(
  branding?: AccountBrandingResponse['branding'],
): BrandingFormState {
  const palette = branding?.palette ?? DEFAULT_STUDENT_BRANDING_PALETTE;
  return {
    logoUrl: branding?.logoUrl || DEFAULT_STUDENT_BRANDING_LOGO_URL,
    primaryColor: normalizeHexColor(
      palette.primaryColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.primaryColor,
    ),
    primaryStrongColor: normalizeHexColor(
      palette.primaryStrongColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.primaryStrongColor,
    ),
    secondaryColor: normalizeHexColor(
      palette.secondaryColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.secondaryColor,
    ),
    secondaryStrongColor: normalizeHexColor(
      palette.secondaryStrongColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.secondaryStrongColor,
    ),
    backgroundColor: normalizeHexColor(
      palette.backgroundColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.backgroundColor,
    ),
    surfaceColor: normalizeHexColor(
      palette.surfaceColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.surfaceColor,
    ),
    surfaceSoftColor: normalizeHexColor(
      palette.surfaceSoftColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.surfaceSoftColor,
    ),
    borderColor: normalizeHexColor(
      palette.borderColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.borderColor,
    ),
    textColor: normalizeHexColor(
      palette.textColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.textColor,
    ),
    mutedColor: normalizeHexColor(
      palette.mutedColor,
      DEFAULT_STUDENT_BRANDING_PALETTE.mutedColor,
    ),
  };
}

function buildBrandingPreviewStyle(form: BrandingFormState): CSSProperties {
  return {
    '--preview-primary': form.primaryColor,
    '--preview-primary-strong': form.primaryStrongColor,
    '--preview-secondary': form.secondaryColor,
    '--preview-secondary-strong': form.secondaryStrongColor,
    '--preview-bg': form.backgroundColor,
    '--preview-surface': form.surfaceColor,
    '--preview-surface-soft': form.surfaceSoftColor,
    '--preview-border': form.borderColor,
    '--preview-text': form.textColor,
    '--preview-muted': form.mutedColor,
  } as CSSProperties;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

export function SuperadminAccountsNative({ token }: SuperadminAccountsNativeProps) {
  const [loading, setLoading] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingBranding, setLoadingBranding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [brandingError, setBrandingError] = useState('');
  const [search, setSearch] = useState('');
  const [studentsSearch, setStudentsSearch] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [students, setStudents] = useState<PlatformStudent[]>([]);
  const [dashboard, setDashboard] = useState<AccountsDashboardResponse | null>(
    null,
  );
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [form, setForm] = useState<FinancialFormState>(() => defaultForm());
  const [brandingForm, setBrandingForm] = useState<BrandingFormState>(() =>
    defaultBrandingForm(),
  );
  const [brandingMeta, setBrandingMeta] = useState<BrandingMetaState | null>(null);
  const [configFlags, setConfigFlags] = useState<ConfigFlags>({
    certificateConfigured: false,
    privateKeyConfigured: false,
  });

  const loadDashboard = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = await apiRequest<AccountsDashboardResponse>(
        token,
        '/superadmin/accounts',
      );
      setDashboard(data);
      setSelectedAccountId((current) => {
        if (current && data.accounts.some((item) => item.id === current)) {
          return current;
        }
        return data.accounts[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar contas.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadFinancialConfig = async (accountId: string) => {
    if (!accountId) return;
    setLoadingConfig(true);
    setFormError('');

    try {
      const data = await apiRequest<AccountFinancialResponse>(
        token,
        `/superadmin/accounts/${accountId}/financial`,
      );
      const provider = toProvider(data.finance.provider);
      const environment = toEnvironment(data.finance.environment);

      setForm({
        provider,
        environment,
        isActive: Boolean(data.finance.isActive),
        genericApiKey: '',
        sicoobClientId: data.finance.sicoob.clientId ?? '',
        sicoobNumeroCliente: data.finance.sicoob.numeroCliente ?? '',
        sicoobTokenUrl: data.finance.sicoob.tokenUrl ?? '',
        sicoobBaseUrlCobrancaBancaria: data.finance.sicoob.baseUrls?.cobrancaBancaria ?? '',
        sicoobBaseUrlCobrancaBancariaPagamentos:
          data.finance.sicoob.baseUrls?.cobrancaBancariaPagamentos ?? '',
        sicoobBaseUrlPixPagamentos: data.finance.sicoob.baseUrls?.pixPagamentos ?? '',
        sicoobBaseUrlPixRecebimentos: data.finance.sicoob.baseUrls?.pixRecebimentos ?? '',
        sicoobBaseUrlSpbTransferencias: data.finance.sicoob.baseUrls?.spbTransferencias ?? '',
        sicoobSandboxBaseUrlCobrancaBancaria:
          data.finance.sicoob.sandboxBaseUrls?.cobrancaBancaria ?? '',
        sicoobSandboxBaseUrlCobrancaBancariaPagamentos:
          data.finance.sicoob.sandboxBaseUrls?.cobrancaBancariaPagamentos ?? '',
        sicoobSandboxBaseUrlPixPagamentos:
          data.finance.sicoob.sandboxBaseUrls?.pixPagamentos ?? '',
        sicoobSandboxBaseUrlPixRecebimentos:
          data.finance.sicoob.sandboxBaseUrls?.pixRecebimentos ?? '',
        sicoobSandboxBaseUrlSpbTransferencias:
          data.finance.sicoob.sandboxBaseUrls?.spbTransferencias ?? '',
        sicoobWebhookUrl: data.finance.sicoob.webhookUrl ?? '',
        sicoobScopes: Array.isArray(data.finance.sicoob.scopes)
          ? data.finance.sicoob.scopes.join(', ')
          : '',
        sicoobCertificatePem: '',
        sicoobPrivateKeyPem: '',
        sicoobCertificatePfxBase64: '',
        sicoobCertificatePfxPassphrase: '',
        sicoobCertificatePfxFileName: '',
      });

      setConfigFlags({
        certificateConfigured: Boolean(data.finance.sicoob.certificateConfigured),
        privateKeyConfigured: Boolean(data.finance.sicoob.privateKeyConfigured),
      });
    } catch (loadError) {
      setFormError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar configuração financeira.',
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadBrandingConfig = async (accountId: string) => {
    if (!accountId) return;
    setLoadingBranding(true);
    setBrandingError('');

    try {
      const data = await apiRequest<AccountBrandingResponse>(
        token,
        `/superadmin/accounts/${accountId}/branding`,
      );

      setBrandingForm(toBrandingForm(data.branding));
      setBrandingMeta({
        institutionName: data.institution.name,
        institutionSlug: data.institution.slug,
        isCustom: Boolean(data.branding.isCustom),
        updatedAt: data.branding.updatedAt,
      });
    } catch (loadError) {
      setBrandingError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar identidade visual.',
      );
    } finally {
      setLoadingBranding(false);
    }
  };

  const loadStudents = async (showLoading = true) => {
    if (showLoading) setStudentsLoading(true);
    try {
      const data = await apiRequest<PlatformStudent[]>(token, '/students');
      setStudents(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar alunos da plataforma.',
      );
    } finally {
      if (showLoading) setStudentsLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard(true);
    void loadStudents(true);
  }, [token]);

  useEffect(() => {
    if (!selectedAccountId) return;
    void loadFinancialConfig(selectedAccountId);
    void loadBrandingConfig(selectedAccountId);
  }, [selectedAccountId, token]);

  const accounts = dashboard?.accounts ?? [];

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((item) => {
      const target = `${item.name} ${item.email} ${item.institution?.name ?? ''}`.toLowerCase();
      return target.includes(query);
    });
  }, [accounts, search]);

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const brandingPreviewStyle = useMemo(
    () => buildBrandingPreviewStyle(brandingForm),
    [brandingForm],
  );

  const brandingPreviewLogo = useMemo(() => {
    const value = brandingForm.logoUrl.trim();
    return value || DEFAULT_STUDENT_BRANDING_LOGO_URL;
  }, [brandingForm.logoUrl]);

  const filteredStudents = useMemo(() => {
    const query = normalizeSearch(studentsSearch);
    if (!query) return students;

    return students.filter((student) => {
      const courses = (student.courses ?? [])
        .map((item) => item.course?.name ?? '')
        .join(' ');
      const target = normalizeSearch(`${student.name} ${student.email} ${courses}`);
      return target.includes(query);
    });
  }, [students, studentsSearch]);

  const handlePfxFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setForm((current) => ({
        ...current,
        sicoobCertificatePfxBase64: '',
        sicoobCertificatePfxFileName: '',
      }));
      return;
    }

    try {
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      setForm((current) => ({
        ...current,
        sicoobCertificatePfxBase64: base64,
        sicoobCertificatePfxFileName: file.name,
      }));
      setFormError('');
    } catch {
      setFormError('Falha ao processar arquivo PFX. Tente novamente.');
      setForm((current) => ({
        ...current,
        sicoobCertificatePfxBase64: '',
        sicoobCertificatePfxFileName: '',
      }));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccountId) {
      setFormError('Selecione uma conta para salvar o financeiro.');
      return;
    }

    setSaving(true);
    setFeedback('');
    setFormError('');
    setError('');

    try {
      const payload: Record<string, unknown> = {
        provider: form.provider,
        environment: form.environment,
        isActive: form.isActive,
      };

      if (form.provider === 'sicoob') {
        payload.sicoobClientId = form.sicoobClientId.trim();
        payload.sicoobNumeroCliente = form.sicoobNumeroCliente.trim();
        payload.sicoobTokenUrl = form.sicoobTokenUrl.trim();
        payload.sicoobBaseUrlCobrancaBancaria = form.sicoobBaseUrlCobrancaBancaria.trim();
        payload.sicoobBaseUrlCobrancaBancariaPagamentos =
          form.sicoobBaseUrlCobrancaBancariaPagamentos.trim();
        payload.sicoobBaseUrlPixPagamentos = form.sicoobBaseUrlPixPagamentos.trim();
        payload.sicoobBaseUrlPixRecebimentos = form.sicoobBaseUrlPixRecebimentos.trim();
        payload.sicoobBaseUrlSpbTransferencias = form.sicoobBaseUrlSpbTransferencias.trim();
        payload.sicoobSandboxBaseUrlCobrancaBancaria =
          form.sicoobSandboxBaseUrlCobrancaBancaria.trim();
        payload.sicoobSandboxBaseUrlCobrancaBancariaPagamentos =
          form.sicoobSandboxBaseUrlCobrancaBancariaPagamentos.trim();
        payload.sicoobSandboxBaseUrlPixPagamentos =
          form.sicoobSandboxBaseUrlPixPagamentos.trim();
        payload.sicoobSandboxBaseUrlPixRecebimentos =
          form.sicoobSandboxBaseUrlPixRecebimentos.trim();
        payload.sicoobSandboxBaseUrlSpbTransferencias =
          form.sicoobSandboxBaseUrlSpbTransferencias.trim();
        payload.sicoobWebhookUrl = form.sicoobWebhookUrl.trim() || undefined;
        payload.sicoobScopes = form.sicoobScopes
          .split(/[\n,;]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        payload.sicoobCertificatePem = form.sicoobCertificatePem.trim() || undefined;
        payload.sicoobPrivateKeyPem = form.sicoobPrivateKeyPem.trim() || undefined;
        if (form.sicoobCertificatePfxBase64.trim()) {
          payload.sicoobCertificatePfxBase64 = form.sicoobCertificatePfxBase64.trim();
          payload.sicoobCertificatePfxPassphrase =
            form.sicoobCertificatePfxPassphrase;
        }
      }

      if (form.provider !== 'manual' && form.provider !== 'sicoob') {
        payload.genericApiKey = form.genericApiKey.trim() || undefined;
      }

      await apiRequest(token, `/superadmin/accounts/${selectedAccountId}/financial`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setFeedback('Configuração financeira salva com sucesso.');
      await loadDashboard(false);
      await loadFinancialConfig(selectedAccountId);
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao salvar configuração financeira.',
      );
    } finally {
      setSaving(false);
    }
  };

  const submitBranding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccountId) {
      setBrandingError('Selecione uma conta para salvar a identidade visual.');
      return;
    }

    setSavingBranding(true);
    setBrandingError('');
    setFeedback('');
    setError('');

    try {
      const payload = {
        logoUrl: brandingForm.logoUrl.trim(),
        primaryColor: normalizeHexColor(
          brandingForm.primaryColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.primaryColor,
        ),
        primaryStrongColor: normalizeHexColor(
          brandingForm.primaryStrongColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.primaryStrongColor,
        ),
        secondaryColor: normalizeHexColor(
          brandingForm.secondaryColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.secondaryColor,
        ),
        secondaryStrongColor: normalizeHexColor(
          brandingForm.secondaryStrongColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.secondaryStrongColor,
        ),
        backgroundColor: normalizeHexColor(
          brandingForm.backgroundColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.backgroundColor,
        ),
        surfaceColor: normalizeHexColor(
          brandingForm.surfaceColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.surfaceColor,
        ),
        surfaceSoftColor: normalizeHexColor(
          brandingForm.surfaceSoftColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.surfaceSoftColor,
        ),
        borderColor: normalizeHexColor(
          brandingForm.borderColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.borderColor,
        ),
        textColor: normalizeHexColor(
          brandingForm.textColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.textColor,
        ),
        mutedColor: normalizeHexColor(
          brandingForm.mutedColor,
          DEFAULT_STUDENT_BRANDING_PALETTE.mutedColor,
        ),
      };

      await apiRequest(token, `/superadmin/accounts/${selectedAccountId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setFeedback('Identidade visual da instituição salva com sucesso.');
      await loadDashboard(false);
      await loadBrandingConfig(selectedAccountId);
    } catch (submitError) {
      setBrandingError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao salvar identidade visual.',
      );
    } finally {
      setSavingBranding(false);
    }
  };

  const resetBrandingToDefault = async () => {
    if (!selectedAccountId) {
      setBrandingError('Selecione uma conta para restaurar a identidade visual.');
      return;
    }

    setSavingBranding(true);
    setBrandingError('');
    setFeedback('');
    setError('');

    try {
      await apiRequest(token, `/superadmin/accounts/${selectedAccountId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToDefault: true }),
      });

      setFeedback('Identidade visual restaurada para o padrão da Área do Aluno.');
      await loadDashboard(false);
      await loadBrandingConfig(selectedAccountId);
    } catch (resetError) {
      setBrandingError(
        resetError instanceof Error
          ? resetError.message
          : 'Falha ao restaurar identidade visual.',
      );
    } finally {
      setSavingBranding(false);
    }
  };

  const removeStudent = async (student: PlatformStudent) => {
    const confirmed = window.confirm(
      `Deseja realmente excluir o aluno "${student.name}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setDeletingStudentId(student.id);
    setError('');
    setFeedback('');

    try {
      await apiRequest<{ success: boolean }>(token, `/students/${student.id}`, {
        method: 'DELETE',
      });
      setFeedback(`Aluno "${student.name}" removido com sucesso.`);
      await loadDashboard(false);
      await loadStudents(false);
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao remover aluno.',
      );
    } finally {
      setDeletingStudentId((current) => (current === student.id ? null : current));
    }
  };

  return (
    <section className="native-page native-super-accounts">
      <header className="native-page-header">
        <h2>Gestão de contas</h2>
        <p>
          Configure financeiro e identidade visual por instituição, com fallback
          automático para o padrão da Área do Aluno.
        </p>
      </header>

      <div className="native-kpi-grid native-super-kpi-grid">
        <article className="native-kpi-card">
          <span>Contas admin</span>
          <strong>{dashboard?.overview.totalAccounts ?? 0}</strong>
          <small>Total de clientes com painel</small>
        </article>
        <article className="native-kpi-card">
          <span>Financeiro ativo</span>
          <strong>{dashboard?.overview.configuredFinanceAccounts ?? 0}</strong>
          <small>Com gateway configurado e ativo</small>
        </article>
        <article className="native-kpi-card">
          <span>Alunos ativos</span>
          <strong>{dashboard?.overview.activeLearners ?? 0}</strong>
          <small>Usuários finais em operação</small>
        </article>
        <article className="native-kpi-card">
          <span>Cursos ativos</span>
          <strong>{dashboard?.overview.activeCourses ?? 0}</strong>
          <small>Catálogo atual da rede</small>
        </article>
        <article className="native-kpi-card">
          <span>MRR pago</span>
          <strong>{formatCurrency(dashboard?.overview.revenueMrr ?? 0)}</strong>
          <small>Mês corrente</small>
        </article>
      </div>

      {loading ? <p className="native-info">Carregando contas...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading && !error ? (
        <>
        <div className="native-super-accounts-grid">
          <article className="native-panel native-super-accounts-list-panel">
            <header className="native-panel-header">
              <h3>Contas cadastradas</h3>
              <button type="button" onClick={() => void loadDashboard(false)}>
                Recarregar
              </button>
            </header>

            <div className="native-toolbar">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou e-mail..."
              />
            </div>

            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Instituição</th>
                    <th>Branding</th>
                    <th>Financeiro</th>
                    <th>API</th>
                    <th>Atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Nenhuma conta encontrada.</td>
                    </tr>
                  ) : (
                    filteredAccounts.map((account) => (
                      <tr
                        key={account.id}
                        className={
                          account.id === selectedAccountId
                            ? 'native-super-row-active'
                            : undefined
                        }
                        onClick={() => setSelectedAccountId(account.id)}
                      >
                        <td>
                          <strong>{account.name}</strong>
                          <br />
                          <small>{account.email}</small>
                        </td>
                        <td>
                          <strong>{account.institution?.name ?? 'Sem instituição'}</strong>
                          <br />
                          <small>{account.institution?.slug ?? '-'}</small>
                        </td>
                        <td>
                          <span
                            className={`native-status-chip ${
                              account.branding?.isCustom ? 'is-success' : 'is-muted'
                            }`}
                          >
                            {account.branding?.isCustom ? 'Personalizado' : 'Padrão aluno'}
                          </span>
                        </td>
                        <td>
                          <span className={`native-status-chip ${financeStateTone(account)}`}>
                            {financeStateLabel(account)}
                          </span>
                        </td>
                        <td>{(account.finance.provider || 'manual').toUpperCase()}</td>
                        <td>
                          {formatDate(account.finance.updatedAt ?? account.updatedAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="native-panel native-super-finance-panel">
            <header className="native-panel-header">
              <h3>Financeiro e branding</h3>
            </header>

            {selectedAccount ? (
              <>
                <div className="native-super-selected-account">
                  <strong>{selectedAccount.name}</strong>
                  <small>{selectedAccount.email}</small>
                  <small>
                    Instituição:{' '}
                    {brandingMeta?.institutionName ||
                      selectedAccount.institution?.name ||
                      'Sem instituição'}
                  </small>
                </div>

                <form className="native-form-grid native-super-finance-form" onSubmit={submit}>
                  <label>
                    Provedor
                    <select
                      value={form.provider}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          provider: toProvider(event.target.value),
                        }))
                      }
                    >
                      <option value="manual">Manual (sem gateway)</option>
                      <option value="sicoob">Sicoob</option>
                      <option value="asaas">Asaas</option>
                      <option value="stripe">Stripe</option>
                    </select>
                  </label>

                  <label>
                    Ambiente
                    <select
                      value={form.environment}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          environment: toEnvironment(event.target.value),
                        }))
                      }
                    >
                      <option value="sandbox">Sandbox</option>
                      <option value="production">Produção</option>
                    </select>
                  </label>

                  <label className="native-toggle-row native-super-toggle-row">
                    <div>
                      <strong>Gateway ativo para a conta</strong>
                      <small>Ativa cobrança automatizada para este cliente.</small>
                    </div>
                    <button
                      type="button"
                      className={`native-switch ${form.isActive ? 'active' : ''}`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          isActive: !current.isActive,
                        }))
                      }
                    >
                      <span />
                    </button>
                  </label>

                  {form.provider !== 'manual' && form.provider !== 'sicoob' ? (
                    <label>
                      API Key
                      <input
                        type="password"
                        value={form.genericApiKey}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            genericApiKey: event.target.value,
                          }))
                        }
                        placeholder="Cole a API key do provedor"
                      />
                    </label>
                  ) : null}

                  {form.provider === 'sicoob' ? (
                    <div className="native-super-sicoob-grid">
                      <p className="native-super-note">
                        Sicoob usa OAuth 2.0 Client Credentials com mTLS e
                        certificado A1 ICP-Brasil.
                      </p>

                      <label>
                        Client ID
                        <input
                          value={form.sicoobClientId}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobClientId: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Número do cliente/cedente
                        <input
                          value={form.sicoobNumeroCliente}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobNumeroCliente: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL de token OAuth
                        <input
                          value={form.sicoobTokenUrl}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobTokenUrl: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Produção - Cobrança Bancária V3
                        <input
                          value={form.sicoobBaseUrlCobrancaBancaria}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobBaseUrlCobrancaBancaria: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Produção - Cobrança Bancária Pagamentos
                        <input
                          value={form.sicoobBaseUrlCobrancaBancariaPagamentos}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobBaseUrlCobrancaBancariaPagamentos: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Produção - Pix Pagamentos
                        <input
                          value={form.sicoobBaseUrlPixPagamentos}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobBaseUrlPixPagamentos: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Produção - Pix Recebimentos
                        <input
                          value={form.sicoobBaseUrlPixRecebimentos}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobBaseUrlPixRecebimentos: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Produção - SPB Transferências
                        <input
                          value={form.sicoobBaseUrlSpbTransferencias}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobBaseUrlSpbTransferencias: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Sandbox - Cobrança Bancária V3
                        <input
                          value={form.sicoobSandboxBaseUrlCobrancaBancaria}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobSandboxBaseUrlCobrancaBancaria: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Sandbox - Cobrança Bancária Pagamentos
                        <input
                          value={form.sicoobSandboxBaseUrlCobrancaBancariaPagamentos}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobSandboxBaseUrlCobrancaBancariaPagamentos: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Sandbox - Pix Pagamentos
                        <input
                          value={form.sicoobSandboxBaseUrlPixPagamentos}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobSandboxBaseUrlPixPagamentos: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Sandbox - Pix Recebimentos
                        <input
                          value={form.sicoobSandboxBaseUrlPixRecebimentos}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobSandboxBaseUrlPixRecebimentos: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        URL base Sandbox - SPB Transferências
                        <input
                          value={form.sicoobSandboxBaseUrlSpbTransferencias}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobSandboxBaseUrlSpbTransferencias: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Escopos (separados por vírgula)
                        <input
                          value={form.sicoobScopes}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobScopes: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Webhook URL (opcional)
                        <input
                          value={form.sicoobWebhookUrl}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobWebhookUrl: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Upload automático (PFX/P12)
                        <input
                          type="file"
                          accept=".pfx,.p12,application/x-pkcs12"
                          onChange={(event) => {
                            void handlePfxFileChange(event);
                          }}
                        />
                        <small>
                          {form.sicoobCertificatePfxFileName
                            ? `Arquivo selecionado: ${form.sicoobCertificatePfxFileName}`
                            : 'Opcional. Envie PFX + senha para extração automática de certificado e chave.'}
                        </small>
                      </label>

                      <label>
                        Senha do PFX
                        <input
                          type="password"
                          value={form.sicoobCertificatePfxPassphrase}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobCertificatePfxPassphrase: event.target.value,
                            }))
                          }
                          placeholder="Preencha se usar upload PFX"
                        />
                      </label>

                      <label>
                        Certificado público (PEM/CRT)
                        <textarea
                          rows={4}
                          value={form.sicoobCertificatePem}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobCertificatePem: event.target.value,
                            }))
                          }
                          placeholder="-----BEGIN CERTIFICATE-----"
                        />
                        <small>
                          {configFlags.certificateConfigured
                            ? 'Certificado já configurado'
                            : 'Certificado ainda não cadastrado'}
                        </small>
                      </label>

                      <label>
                        Chave privada (PEM/KEY)
                        <textarea
                          rows={4}
                          value={form.sicoobPrivateKeyPem}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sicoobPrivateKeyPem: event.target.value,
                            }))
                          }
                          placeholder="-----BEGIN PRIVATE KEY-----"
                        />
                        <small>
                          {configFlags.privateKeyConfigured
                            ? 'Chave privada já configurada'
                            : 'Chave privada ainda não cadastrada'}
                        </small>
                      </label>
                    </div>
                  ) : null}

                  {loadingConfig ? (
                    <p className="native-info">Carregando configuração da conta...</p>
                  ) : null}
                  {formError ? <p className="native-error">{formError}</p> : null}

                  <div className="native-modal-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (!selectedAccountId) return;
                        void loadFinancialConfig(selectedAccountId);
                      }}
                    >
                      Recarregar campos
                    </button>
                    <button type="submit" disabled={saving || loadingConfig}>
                      {saving ? 'Salvando...' : 'Salvar financeiro'}
                    </button>
                  </div>
                </form>

                <div className="native-super-divider" />

                <form className="native-form-grid native-super-branding-form" onSubmit={submitBranding}>
                  <header className="native-super-branding-head">
                    <h4>Identidade visual da instituição</h4>
                    <small>
                      {brandingMeta?.isCustom ? 'Personalizada' : 'Padrão da Área do Aluno'}
                      {brandingMeta?.updatedAt ? ` • Atualizada em ${formatDate(brandingMeta.updatedAt)}` : ''}
                    </small>
                  </header>

                  <p className="native-super-note">
                    Personalize logo e paleta por instituição. Se não houver personalização,
                    o sistema usa automaticamente o padrão da Área do Aluno.
                  </p>

                  <label>
                    URL do logo
                    <input
                      type="url"
                      value={brandingForm.logoUrl}
                      onChange={(event) =>
                        setBrandingForm((current) => ({
                          ...current,
                          logoUrl: event.target.value,
                        }))
                      }
                      placeholder="/Logo-IPESK.png"
                    />
                  </label>

                  <div className="native-super-branding-colors">
                    {BRANDING_COLOR_FIELDS.map((field) => (
                      <label key={field.key} className="native-super-branding-color-field">
                        {field.label}
                        <div className="native-super-branding-color-inputs">
                          <input
                            type="color"
                            value={brandingForm[field.key]}
                            onChange={(event) =>
                              setBrandingForm((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                          <input
                            value={brandingForm[field.key]}
                            onChange={(event) =>
                              setBrandingForm((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            placeholder="#000000"
                          />
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="native-super-branding-preview" style={brandingPreviewStyle}>
                    <div className="native-super-branding-preview-top">
                      <img
                        src={brandingPreviewLogo}
                        alt={brandingMeta?.institutionName || selectedAccount.name}
                      />
                      <div>
                        <strong>{brandingMeta?.institutionName || selectedAccount.name}</strong>
                        <small>{brandingMeta?.institutionSlug || selectedAccount.id.slice(0, 8)}</small>
                      </div>
                    </div>
                    <div className="native-super-branding-preview-cards">
                      <article>
                        <span>Primária</span>
                        <strong>{brandingForm.primaryColor}</strong>
                      </article>
                      <article>
                        <span>Secundária</span>
                        <strong>{brandingForm.secondaryColor}</strong>
                      </article>
                    </div>
                  </div>

                  {loadingBranding ? (
                    <p className="native-info">Carregando identidade visual...</p>
                  ) : null}
                  {brandingError ? <p className="native-error">{brandingError}</p> : null}

                  <div className="native-modal-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (!selectedAccountId) return;
                        void loadBrandingConfig(selectedAccountId);
                      }}
                      disabled={savingBranding}
                    >
                      Recarregar identidade
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        void resetBrandingToDefault();
                      }}
                      disabled={savingBranding}
                    >
                      Restaurar padrão
                    </button>
                    <button type="submit" disabled={savingBranding || loadingBranding}>
                      {savingBranding ? 'Salvando...' : 'Salvar identidade'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <p className="native-info">
                Selecione uma conta na lista para editar o financeiro e a identidade visual.
              </p>
            )}
          </aside>
        </div>

        <article className="native-panel native-super-students-panel">
          <header className="native-panel-header">
            <h3>Alunos da plataforma</h3>
            <button type="button" onClick={() => void loadStudents(true)}>
              Recarregar
            </button>
          </header>

          <div className="native-super-students-toolbar">
            <input
              type="search"
              value={studentsSearch}
              onChange={(event) => setStudentsSearch(event.target.value)}
              placeholder="Buscar aluno por nome, e-mail ou curso..."
            />
            <small>{filteredStudents.length} aluno(s)</small>
          </div>

          {studentsLoading ? <p className="native-info">Carregando alunos...</p> : null}

          {!studentsLoading ? (
            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>E-mail</th>
                    <th>Cursos</th>
                    <th>Turmas</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Nenhum aluno encontrado.</td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => {
                      const courses = (student.courses ?? [])
                        .map((item) => item.course?.name)
                        .filter((name): name is string => Boolean(name));

                      return (
                        <tr key={student.id}>
                          <td>
                            <div className="native-super-student-cell">
                              <img
                                src={resolveAvatar(student.avatarUrl)}
                                alt={`Avatar de ${student.name}`}
                              />
                              <div>
                                <strong>{student.name}</strong>
                                <small>#{student.id.slice(0, 8).toUpperCase()}</small>
                              </div>
                            </div>
                          </td>
                          <td>{student.email}</td>
                          <td>{courses[0] ?? 'Sem curso'}</td>
                          <td>{student.enrollments?.length ?? 0}</td>
                          <td>{student.statusLabel ?? 'Sem definição'}</td>
                          <td>
                            <button
                              type="button"
                              className="native-super-student-delete-btn"
                              onClick={() => {
                                void removeStudent(student);
                              }}
                              disabled={deletingStudentId === student.id}
                            >
                              {deletingStudentId === student.id
                                ? 'Excluindo...'
                                : 'Excluir aluno'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>
        </>
      ) : null}
    </section>
  );
}

