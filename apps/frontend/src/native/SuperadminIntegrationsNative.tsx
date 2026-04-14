import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from './api';

type IntegrationOverview = {
  provider: 'kobayashi' | 'rdstation';
  isConfigured: boolean;
  isActive: boolean;
  environment: 'production' | 'sandbox' | string;
  updatedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

type InstitutionOverview = {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerAdmin: {
    id: string;
    name: string;
    email: string;
  } | null;
  integration: IntegrationOverview;
};

type InstitutionsListResponse = {
  institutions: InstitutionOverview[];
};

type InstitutionProviderConfigResponse = {
  institution: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  integration: {
    id: string | null;
    provider: 'kobayashi' | 'rdstation';
    environment: 'production' | 'sandbox' | string;
    isActive: boolean;
    isConfigured: boolean;
    updatedAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    kobayashi: {
      baseUrl: string;
      clientId: string;
      clientSecretConfigured: boolean;
      clientSecretMasked: string | null;
      tokenConfigured: boolean;
      tokenMasked: string | null;
      authorizationBearerConfigured: boolean;
      authorizationBearerMasked: string | null;
      grantType: string;
      scopes: string[];
      defaultGcssid: string;
      defaultIdentificacaoVendedor: string;
      defaultOfertaCursoId: string;
    };
    rdstation: {
      baseUrl: string;
      apiKeyConfigured: boolean;
      apiKeyMasked: string | null;
      conversionIdentifier: string;
      courseFieldKey: string;
      ageFieldKey: string;
      addressFieldKey: string;
      enrollmentIdFieldKey: string;
    };
  };
};

type TestRequestResponse = {
  success: boolean;
  endpoint: string;
  integrationActive: boolean;
  environment: string;
  request: Record<string, unknown>;
  response: {
    statusCode: number;
    ok: boolean;
    body: unknown;
  };
};

type IntegrationDispatchLog = {
  id: string;
  provider: string;
  status: string;
  studentId: string | null;
  studentName: string;
  enrollmentId: string | null;
  contractInstanceId: string | null;
  responseStatusCode: number | null;
  errorMessage: string | null;
  createdAt: string;
};

type IntegrationDispatchLogsResponse = {
  institution: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  provider: string;
  limit: number;
  logs: IntegrationDispatchLog[];
};

type FormState = {
  environment: 'production' | 'sandbox';
  isActive: boolean;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  token: string;
  authorizationBearer: string;
  grantType: string;
  scopes: string;
  defaultGcssid: string;
  defaultIdentificacaoVendedor: string;
  defaultOfertaCursoId: string;
  rdStationApiKey: string;
  rdStationConversionIdentifier: string;
  rdStationCourseFieldKey: string;
  rdStationAgeFieldKey: string;
  rdStationAddressFieldKey: string;
  rdStationEnrollmentIdFieldKey: string;
};

type SecretFlags = {
  clientSecretConfigured: boolean;
  tokenConfigured: boolean;
  authorizationBearerConfigured: boolean;
  clientSecretMasked: string | null;
  tokenMasked: string | null;
  authorizationBearerMasked: string | null;
  rdStationApiKeyConfigured: boolean;
  rdStationApiKeyMasked: string | null;
};

type SuperadminIntegrationsNativeProps = {
  token: string;
};

type IntegrationProvider = 'kobayashi' | 'rdstation';

type AuditFilters = {
  status: 'all' | 'success' | 'failed';
  dateFrom: string;
  dateTo: string;
  search: string;
};

type ProviderSummary = {
  loading: boolean;
  isConfigured: boolean;
  isActive: boolean;
  environment: string;
  updatedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

const INTEGRATION_OPTIONS: Array<{
  provider: IntegrationProvider;
  name: string;
  description: string;
  badge: string;
}> = [
  {
    provider: 'kobayashi',
    name: 'KOBAYASHI',
    description: 'API de matrículas e contratos',
    badge: 'KB',
  },
  {
    provider: 'rdstation',
    name: 'RD STATION',
    description: 'Leads e conversões de marketing',
    badge: 'RD',
  },
];

const KOBAYASHI_PRESET = {
  baseUrl: 'https://apiappdo.facinpro.flie.com.br',
  clientId: 'c6b7f6ac-87ff-4790-9a22-f54ddb19cff2',
  clientSecret: '',
  token:
    '8198f8e53bba-efac-4355-abec-2aae21b37d3381984c522deb-84ce-4321-8b87-3a48b10147c58198',
  authorizationBearer:
    'Bearer 8198f8e53bba-efac-4355-abec-2aae21b37d3381984c522deb-84ce-4321-8b87-3a48b10147c58198',
  grantType: 'client_credentials',
  scopes: 'cobranca.parceiro, b2b.parceiro',
  defaultGcssid: '1984579899879879525449846',
  defaultIdentificacaoVendedor: 'alinne',
  defaultOfertaCursoId: '999999',
};

const RD_STATION_PRESET = {
  baseUrl: 'https://api.rd.services',
  conversionIdentifier: 'Matricula Efetivada',
  courseFieldKey: 'cf_curso_matriculado',
  ageFieldKey: 'cf_idade',
  addressFieldKey: 'cf_endereco',
  enrollmentIdFieldKey: 'cf_matricula_id',
};

const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  status: 'all',
  dateFrom: '',
  dateTo: '',
  search: '',
};

const DEFAULT_FORM: FormState = {
  environment: 'production',
  isActive: false,
  baseUrl: KOBAYASHI_PRESET.baseUrl,
  clientId: KOBAYASHI_PRESET.clientId,
  clientSecret: KOBAYASHI_PRESET.clientSecret,
  token: KOBAYASHI_PRESET.token,
  authorizationBearer: KOBAYASHI_PRESET.authorizationBearer,
  grantType: KOBAYASHI_PRESET.grantType,
  scopes: KOBAYASHI_PRESET.scopes,
  defaultGcssid: KOBAYASHI_PRESET.defaultGcssid,
  defaultIdentificacaoVendedor: KOBAYASHI_PRESET.defaultIdentificacaoVendedor,
  defaultOfertaCursoId: KOBAYASHI_PRESET.defaultOfertaCursoId,
  rdStationApiKey: '',
  rdStationConversionIdentifier: RD_STATION_PRESET.conversionIdentifier,
  rdStationCourseFieldKey: RD_STATION_PRESET.courseFieldKey,
  rdStationAgeFieldKey: RD_STATION_PRESET.ageFieldKey,
  rdStationAddressFieldKey: RD_STATION_PRESET.addressFieldKey,
  rdStationEnrollmentIdFieldKey: RD_STATION_PRESET.enrollmentIdFieldKey,
};

const DEFAULT_SECRET_FLAGS: SecretFlags = {
  clientSecretConfigured: false,
  tokenConfigured: false,
  authorizationBearerConfigured: false,
  clientSecretMasked: null,
  tokenMasked: null,
  authorizationBearerMasked: null,
  rdStationApiKeyConfigured: false,
  rdStationApiKeyMasked: null,
};

const DEFAULT_PROVIDER_SUMMARY: ProviderSummary = {
  loading: false,
  isConfigured: false,
  isActive: false,
  environment: 'production',
  updatedAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
};

function normalizeSearch(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatDate(value: string | null | undefined): string {
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

function buildKobayashiTestPayloadTemplate(form: FormState) {
  const scopeEntries = form.scopes
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

  return JSON.stringify(
    {
      gcssid: form.defaultGcssid || KOBAYASHI_PRESET.defaultGcssid,
      matricula: {
        orderId: '123456789',
        telefoneCelular: '62991860304',
        nomeCompleto: 'CARLOS DA SILVA',
        nomeSocial: 'Carlos',
        sexo: 'M',
        dataNascimento: '1987-12-26',
        eMail: 'calors@gmail.com',
        CPF: '99999999999',
        EnderecoCEP: '99999999',
        enderecoLogradouro: 'Rua A',
        enderecoNumero: '20',
        enderecoQuadra: '',
        enderecoLote: '',
        enderecoComplemento: '',
        enderecoBairro: 'Centro',
        enderecoCidade: 'Rio de Janeiro',
        enderecoUF: 'RJ',
        enderecoPais: 'Brasil',
        situacaoMatricula: '1',
        identificacaoVendedor:
          form.defaultIdentificacaoVendedor ||
          KOBAYASHI_PRESET.defaultIdentificacaoVendedor,
        idContrato: null,
        situacaooContrato: 'Sim',
        dataPreMatricula: '2026-3-25 00:00:00',
        formaIngresso: '2',
        formaIngressoOpcaoPS: false,
        profissao: null,
        nomeMae: 'NOME DA MAE DA SILVA',
        nomePai: 'NOME DO PAI DA SILVA',
        rg: '9999999999',
        naturalidadeCidade: 'Rio de Janeiro',
        naturalidadeUF: 'RJ',
        naturalidadePais: 'Brasil',
        rgOrgao: 'DIC-RJ',
        ofertaCursoID: form.defaultOfertaCursoId || KOBAYASHI_PRESET.defaultOfertaCursoId,
        valorTotal: '3228.00',
        valorPago: '0',
        dataPagamentoMatricula: '2026-03-25T17:05:00.114Z',
        percentualDesconto: 0,
        descricaoDesconto: null,
        qtdeParcelas: 0,
        tipoPagamento: '7',
        Detalhe: {
          dadosPagamento: {
            dataPagamento: null,
            tipoPagamento: null,
            id: null,
            faturaId: '0',
            valorTotal: '0',
            valorTotalSemDesconto: null,
            PercentualDescontoAVista: '0',
            valorPagoMatricula: '0',
            idItemPagamento: '2',
            ItemPagamento: null,
            situacaoPagamento: 'EM ABERTO',
            cupomUsado: null,
            tipoDescontoCupom: null,
            valorDescontoCupom: null,
            descricaoDesconto: null,
            qtdDeCiclos: 1,
            intervalo: null,
            unidadeIntervalo: null,
            percentualJurosCiclo: '0',
            nomePlanoPagamento: null,
            idRecorrenciaRubeusPay: '0',
            idPagamentoRubeusPay: null,
            vencimento: null,
            dataVencimentoProxPag: null,
            iugu: {
              bank_slip: {
                transaction_number: '0',
              },
              card: {
                arp: null,
                credit_card_bin: null,
                credit_card_brand: null,
                credit_card_last_4: null,
                credit_card_tid: null,
                installments: null,
                nsu: null,
              },
              net_value: 0,
              payable_with: null,
              pix: null,
              secure_url: null,
              status: null,
              taxes: 0,
            },
            dataPagamentoMatricula: null,
          },
          parcelas: [],
        },
        enviadoPortalSGA: 'Não',
      },
      grant_type: form.grantType || KOBAYASHI_PRESET.grantType,
      scopes: scopeEntries.length > 0 ? scopeEntries : [{ name: 'b2b.parceiro' }],
    },
    null,
    2,
  );
}

function buildRdStationTestPayloadTemplate(form: FormState) {
  return JSON.stringify(
    {
      event_type: 'CONVERSION',
      event_family: 'CDP',
      payload: {
        conversion_identifier:
          form.rdStationConversionIdentifier ||
          RD_STATION_PRESET.conversionIdentifier,
        name: 'Carlos da Silva',
        email: 'carlos@teste.com',
        mobile_phone: '62999999999',
        city: 'Cuiaba',
        state: 'MT',
        country: 'Brasil',
        [form.rdStationCourseFieldKey || RD_STATION_PRESET.courseFieldKey]:
          'Tecnico em Enfermagem',
        [form.rdStationAgeFieldKey || RD_STATION_PRESET.ageFieldKey]: '28',
        [form.rdStationAddressFieldKey || RD_STATION_PRESET.addressFieldKey]:
          'Centro, Cuiaba - MT',
        [form.rdStationEnrollmentIdFieldKey ||
        RD_STATION_PRESET.enrollmentIdFieldKey]: 'ENR_TEST_001',
        tags: ['matricula_efetivada'],
      },
    },
    null,
    2,
  );
}

function buildTestPayloadTemplate(provider: IntegrationProvider, form: FormState) {
  return provider === 'rdstation'
    ? buildRdStationTestPayloadTemplate(form)
    : buildKobayashiTestPayloadTemplate(form);
}

function toForm(
  data: InstitutionProviderConfigResponse,
  provider: IntegrationProvider,
): FormState {
  if (!data.integration.isConfigured) {
    return {
      ...DEFAULT_FORM,
      environment:
        data.integration.environment === 'sandbox' ? 'sandbox' : 'production',
      isActive: Boolean(data.integration.isActive),
      baseUrl:
        provider === 'rdstation'
          ? RD_STATION_PRESET.baseUrl
          : KOBAYASHI_PRESET.baseUrl,
    };
  }

  if (provider === 'rdstation') {
    return {
      ...DEFAULT_FORM,
      environment:
        data.integration.environment === 'sandbox' ? 'sandbox' : 'production',
      isActive: Boolean(data.integration.isActive),
      baseUrl: data.integration.rdstation.baseUrl || RD_STATION_PRESET.baseUrl,
      rdStationApiKey: '',
      rdStationConversionIdentifier:
        data.integration.rdstation.conversionIdentifier ||
        RD_STATION_PRESET.conversionIdentifier,
      rdStationCourseFieldKey:
        data.integration.rdstation.courseFieldKey || RD_STATION_PRESET.courseFieldKey,
      rdStationAgeFieldKey:
        data.integration.rdstation.ageFieldKey || RD_STATION_PRESET.ageFieldKey,
      rdStationAddressFieldKey:
        data.integration.rdstation.addressFieldKey ||
        RD_STATION_PRESET.addressFieldKey,
      rdStationEnrollmentIdFieldKey:
        data.integration.rdstation.enrollmentIdFieldKey ||
        RD_STATION_PRESET.enrollmentIdFieldKey,
      clientId: '',
      clientSecret: '',
      token: '',
      authorizationBearer: '',
      grantType: KOBAYASHI_PRESET.grantType,
      scopes: KOBAYASHI_PRESET.scopes,
      defaultGcssid: '',
      defaultIdentificacaoVendedor: '',
      defaultOfertaCursoId: '',
    };
  }

  return {
    environment:
      data.integration.environment === 'sandbox' ? 'sandbox' : 'production',
    isActive: Boolean(data.integration.isActive),
    baseUrl: data.integration.kobayashi.baseUrl || DEFAULT_FORM.baseUrl,
    clientId: data.integration.kobayashi.clientId || '',
    clientSecret: '',
    token: '',
    authorizationBearer: '',
    grantType: data.integration.kobayashi.grantType || 'client_credentials',
    scopes: Array.isArray(data.integration.kobayashi.scopes)
      ? data.integration.kobayashi.scopes.join(', ')
      : DEFAULT_FORM.scopes,
    defaultGcssid: data.integration.kobayashi.defaultGcssid || '',
    defaultIdentificacaoVendedor:
      data.integration.kobayashi.defaultIdentificacaoVendedor || '',
    defaultOfertaCursoId: data.integration.kobayashi.defaultOfertaCursoId || '',
    rdStationApiKey: '',
    rdStationConversionIdentifier: RD_STATION_PRESET.conversionIdentifier,
    rdStationCourseFieldKey: RD_STATION_PRESET.courseFieldKey,
    rdStationAgeFieldKey: RD_STATION_PRESET.ageFieldKey,
    rdStationAddressFieldKey: RD_STATION_PRESET.addressFieldKey,
    rdStationEnrollmentIdFieldKey: RD_STATION_PRESET.enrollmentIdFieldKey,
  };
}

function toSecretFlags(
  data: InstitutionProviderConfigResponse,
  provider: IntegrationProvider,
): SecretFlags {
  if (provider === 'rdstation') {
    return {
      ...DEFAULT_SECRET_FLAGS,
      rdStationApiKeyConfigured: Boolean(data.integration.rdstation.apiKeyConfigured),
      rdStationApiKeyMasked: data.integration.rdstation.apiKeyMasked ?? null,
    };
  }

  return {
    clientSecretConfigured: Boolean(
      data.integration.kobayashi.clientSecretConfigured,
    ),
    tokenConfigured: Boolean(data.integration.kobayashi.tokenConfigured),
    authorizationBearerConfigured: Boolean(
      data.integration.kobayashi.authorizationBearerConfigured,
    ),
    clientSecretMasked: data.integration.kobayashi.clientSecretMasked ?? null,
    tokenMasked: data.integration.kobayashi.tokenMasked ?? null,
    authorizationBearerMasked:
      data.integration.kobayashi.authorizationBearerMasked ?? null,
    rdStationApiKeyConfigured: false,
    rdStationApiKeyMasked: null,
  };
}

function toProviderSummary(
  data: InstitutionProviderConfigResponse,
): ProviderSummary {
  return {
    loading: false,
    isConfigured: Boolean(data.integration.isConfigured),
    isActive: Boolean(data.integration.isActive),
    environment: String(data.integration.environment || 'production'),
    updatedAt: data.integration.updatedAt ?? null,
    lastSuccessAt: data.integration.lastSuccessAt ?? null,
    lastErrorAt: data.integration.lastErrorAt ?? null,
    lastErrorMessage: data.integration.lastErrorMessage ?? null,
  };
}

export function SuperadminIntegrationsNative({
  token,
}: SuperadminIntegrationsNativeProps) {
  const [selectedProvider, setSelectedProvider] =
    useState<IntegrationProvider>('kobayashi');
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [search, setSearch] = useState('');
  const [institutions, setInstitutions] = useState<InstitutionOverview[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [secretFlags, setSecretFlags] = useState<SecretFlags>(
    DEFAULT_SECRET_FLAGS,
  );
  const [lastResult, setLastResult] = useState<TestRequestResponse | null>(null);
  const [dispatchLogs, setDispatchLogs] = useState<IntegrationDispatchLog[]>([]);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [providerSummaries, setProviderSummaries] = useState<
    Record<IntegrationProvider, ProviderSummary>
  >({
    kobayashi: { ...DEFAULT_PROVIDER_SUMMARY },
    rdstation: { ...DEFAULT_PROVIDER_SUMMARY },
  });
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(
    DEFAULT_AUDIT_FILTERS,
  );
  const [testEnrollmentId, setTestEnrollmentId] = useState('');
  const [testPayload, setTestPayload] = useState(
    buildTestPayloadTemplate(selectedProvider, DEFAULT_FORM),
  );

  const applyProviderPreset = (provider: IntegrationProvider) => {
    setForm((current) => {
      const nextForm: FormState = {
        ...DEFAULT_FORM,
        environment: current.environment,
        isActive: current.isActive,
        baseUrl:
          provider === 'rdstation'
            ? RD_STATION_PRESET.baseUrl
            : KOBAYASHI_PRESET.baseUrl,
      };
      setTestPayload(buildTestPayloadTemplate(provider, nextForm));
      setTestEnrollmentId('');
      return nextForm;
    });
  };

  const loadInstitutions = async (showLoading = true) => {
    if (showLoading) setLoadingInstitutions(true);
    setError('');
    try {
      const data = await apiRequest<InstitutionsListResponse>(
        token,
        '/superadmin/integrations/institutions',
      );
      const rows = Array.isArray(data.institutions) ? data.institutions : [];
      setInstitutions(rows);
      setSelectedInstitutionId((current) => {
        if (current && rows.some((item) => item.id === current)) return current;
        return rows[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar instituições.',
      );
    } finally {
      if (showLoading) setLoadingInstitutions(false);
    }
  };

  const fetchProviderConfig = (
    institutionId: string,
    provider: IntegrationProvider,
  ) =>
    apiRequest<InstitutionProviderConfigResponse>(
      token,
      `/superadmin/integrations/institutions/${institutionId}/providers/${provider}`,
    );

  const loadProviderSummary = async (
    institutionId: string,
    provider: IntegrationProvider,
  ) => {
    setProviderSummaries((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        loading: true,
      },
    }));

    try {
      const data = await fetchProviderConfig(institutionId, provider);
      setProviderSummaries((current) => ({
        ...current,
        [provider]: toProviderSummary(data),
      }));
      return data;
    } catch (errorSummary) {
      setProviderSummaries((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          loading: false,
          lastErrorMessage:
            errorSummary instanceof Error
              ? errorSummary.message
              : 'Falha ao carregar status da integração.',
        },
      }));
      return null;
    }
  };

  const loadConfig = async (
    institutionId: string,
    provider: IntegrationProvider = selectedProvider,
  ) => {
    if (!institutionId) return;
    setLoadingConfig(true);
    setError('');
    try {
      const data = await fetchProviderConfig(institutionId, provider);
      const nextForm = toForm(data, provider);
      setSelectedProvider(provider);
      setForm(nextForm);
      setSecretFlags(toSecretFlags(data, provider));
      setTestPayload(buildTestPayloadTemplate(provider, nextForm));
      setTestEnrollmentId('');
      setLastResult(null);
      setProviderSummaries((current) => ({
        ...current,
        [provider]: toProviderSummary(data),
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar configuração da integração.',
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadDispatchLogs = async (
    institutionId: string,
    filters: AuditFilters = auditFilters,
    provider: IntegrationProvider = selectedProvider,
    limit = 50,
  ) => {
    if (!institutionId) return;
    setLoadingLogs(true);
    try {
      const query = new URLSearchParams();
      query.set('limit', String(limit));
      if (filters.status !== 'all') query.set('status', filters.status);
      if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) query.set('dateTo', filters.dateTo);
      if (filters.search.trim()) query.set('search', filters.search.trim());

      const data = await apiRequest<IntegrationDispatchLogsResponse>(
        token,
        `/superadmin/integrations/institutions/${institutionId}/providers/${provider}/logs?${query.toString()}`,
      );
      setDispatchLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar auditoria de envios.',
      );
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadInstitutions(true);
  }, [token]);

  useEffect(() => {
    if (!selectedInstitutionId) return;
    setProviderSummaries({
      kobayashi: { ...DEFAULT_PROVIDER_SUMMARY, loading: true },
      rdstation: { ...DEFAULT_PROVIDER_SUMMARY, loading: true },
    });
    setDispatchLogs([]);
    setLastResult(null);
    void Promise.all([
      loadProviderSummary(selectedInstitutionId, 'kobayashi'),
      loadProviderSummary(selectedInstitutionId, 'rdstation'),
    ]);
  }, [selectedInstitutionId, token]);

  const filteredInstitutions = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return institutions;
    return institutions.filter((institution) => {
      const target = normalizeSearch(
        `${institution.name} ${institution.slug} ${institution.ownerAdmin?.name ?? ''} ${institution.ownerAdmin?.email ?? ''}`,
      );
      return target.includes(query);
    });
  }, [institutions, search]);

  const selectedInstitution = useMemo(
    () => institutions.find((item) => item.id === selectedInstitutionId) ?? null,
    [institutions, selectedInstitutionId],
  );

  const submitIntegration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInstitutionId) {
      setError('Selecione uma instituição para salvar.');
      return;
    }

    setError('');
    setFeedback('');
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        environment: form.environment,
        isActive: form.isActive,
      };

      if (selectedProvider === 'rdstation') {
        payload.rdStationBaseUrl = form.baseUrl.trim();
        payload.rdStationConversionIdentifier =
          form.rdStationConversionIdentifier.trim();
        payload.rdStationCourseFieldKey = form.rdStationCourseFieldKey.trim();
        payload.rdStationAgeFieldKey = form.rdStationAgeFieldKey.trim();
        payload.rdStationAddressFieldKey = form.rdStationAddressFieldKey.trim();
        payload.rdStationEnrollmentIdFieldKey =
          form.rdStationEnrollmentIdFieldKey.trim();
        if (form.rdStationApiKey.trim()) {
          payload.rdStationApiKey = form.rdStationApiKey.trim();
        }
      } else {
        payload.kobayashiBaseUrl = form.baseUrl.trim();
        payload.kobayashiClientId = form.clientId.trim();
        payload.kobayashiGrantType = form.grantType.trim() || 'client_credentials';
        payload.kobayashiDefaultGcssid = form.defaultGcssid.trim();
        payload.kobayashiDefaultIdentificacaoVendedor =
          form.defaultIdentificacaoVendedor.trim();
        payload.kobayashiDefaultOfertaCursoId = form.defaultOfertaCursoId.trim();

        const parsedScopes = form.scopes
          .split(',')
          .map((scope) => scope.trim())
          .filter(Boolean);

        if (parsedScopes.length > 0) {
          payload.kobayashiScopes = parsedScopes;
        }

        if (form.clientSecret.trim()) {
          payload.kobayashiClientSecret = form.clientSecret.trim();
        }
        if (form.token.trim()) {
          payload.kobayashiToken = form.token.trim();
        }
        if (form.authorizationBearer.trim()) {
          payload.kobayashiAuthorizationBearer = form.authorizationBearer.trim();
        }
      }

      await apiRequest(
        token,
        `/superadmin/integrations/institutions/${selectedInstitutionId}/providers/${selectedProvider}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      setFeedback('Configuração da integração salva com sucesso.');
      setForm((current) => ({
        ...current,
        clientSecret: '',
        token: '',
        authorizationBearer: '',
        rdStationApiKey: '',
      }));
      await Promise.all([
        loadConfig(selectedInstitutionId, selectedProvider),
        loadInstitutions(false),
        loadDispatchLogs(selectedInstitutionId, auditFilters, selectedProvider),
        loadProviderSummary(selectedInstitutionId, selectedProvider),
      ]);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao salvar integração.',
      );
    } finally {
      setSaving(false);
    }
  };

  const submitTestRequest = async () => {
    if (!selectedInstitutionId) {
      setError('Selecione uma instituição para executar o teste.');
      return;
    }

    setError('');
    setFeedback('');
    setTesting(true);

    try {
      const body: Record<string, unknown> = {};
      const trimmedEnrollmentId = testEnrollmentId.trim();
      const rawPayload = testPayload.trim();

      if (selectedProvider === 'rdstation' && trimmedEnrollmentId) {
        body.enrollmentId = trimmedEnrollmentId;
      }

      if (rawPayload) {
        let parsedPayload: Record<string, unknown>;
        try {
          const parsed = JSON.parse(rawPayload) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Payload inválido');
          }
          parsedPayload = parsed as Record<string, unknown>;
        } catch {
          setTesting(false);
          setError('O payload de teste precisa ser um JSON v?lido.');
          return;
        }
        body.payload = parsedPayload;
      }

      if (selectedProvider === 'kobayashi' && !body.payload) {
        setTesting(false);
        setError('Informe um payload JSON para executar o teste KOBAYASHI.');
        return;
      }

      if (selectedProvider === 'rdstation' && !body.payload && !body.enrollmentId) {
        setTesting(false);
        setError('Informe o ID da matrícula ou um payload JSON para testar o RD Station.');
        return;
      }

      const result = await apiRequest<TestRequestResponse>(
        token,
        `/superadmin/integrations/institutions/${selectedInstitutionId}/providers/${selectedProvider}/test-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      setLastResult(result);
      setFeedback(
        result.response.ok
          ? 'Teste executado com sucesso.'
          : 'Teste executado, mas a API retornou falha.',
      );
      await Promise.all([
        loadInstitutions(false),
        loadDispatchLogs(selectedInstitutionId, auditFilters, selectedProvider),
        loadProviderSummary(selectedInstitutionId, selectedProvider),
      ]);
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : 'Falha ao executar teste da integração.',
      );
    } finally {
      setTesting(false);
    }
  };

  const applyAuditFilters = async () => {
    if (!selectedInstitutionId) return;
    await loadDispatchLogs(selectedInstitutionId, auditFilters);
  };

  const clearAuditFilters = async () => {
    if (!selectedInstitutionId) {
      setAuditFilters(DEFAULT_AUDIT_FILTERS);
      return;
    }
    setAuditFilters(DEFAULT_AUDIT_FILTERS);
    await loadDispatchLogs(selectedInstitutionId, DEFAULT_AUDIT_FILTERS);
  };

  const retryDispatch = async (log: IntegrationDispatchLog) => {
    if (!selectedInstitutionId) return;
    setRetryingLogId(log.id);
    setError('');
    setFeedback('');
    try {
      const result = await apiRequest<{
        success: boolean;
        message?: string;
      }>(
        token,
        `/superadmin/integrations/institutions/${selectedInstitutionId}/providers/${selectedProvider}/logs/${log.id}/retry`,
        {
          method: 'POST',
        },
      );

      if (result.success) {
        setFeedback(`Reenvio executado com sucesso para ${log.studentName}.`);
      } else {
        setError(result.message || 'O reenvio foi executado, mas retornou falha.');
      }

      await Promise.all([
        loadDispatchLogs(selectedInstitutionId, auditFilters, selectedProvider),
        loadInstitutions(false),
        loadConfig(selectedInstitutionId, selectedProvider),
        loadProviderSummary(selectedInstitutionId, selectedProvider),
      ]);
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : 'Falha ao reenviar aluno para a integração.',
      );
    } finally {
      setRetryingLogId(null);
    }
  };

  const openIntegrationModal = async (provider: IntegrationProvider) => {
    if (!selectedInstitutionId) return;
    setSelectedProvider(provider);
    setAuditFilters(DEFAULT_AUDIT_FILTERS);
    await Promise.all([
      loadConfig(selectedInstitutionId, provider),
      loadDispatchLogs(selectedInstitutionId, DEFAULT_AUDIT_FILTERS, provider),
    ]);
    setIsConfigModalOpen(true);
  };

  return (
    <section className="native-page native-super-integrations">
      <header className="native-page-header">
        <h2>Integrações</h2>
        <p>Configure integrações por instituição.</p>
      </header>

      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      <div className="native-super-integrations-grid">
        <article className="native-panel native-super-integrations-list">
          <header className="native-panel-header">
            <h3>Instituições</h3>
            <button type="button" onClick={() => void loadInstitutions(true)}>
              Atualizar
            </button>
          </header>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por instituição, slug, admin ou e-mail..."
          />

          {loadingInstitutions ? (
            <p className="native-info">Carregando instituições...</p>
          ) : (
            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Instituição</th>
                    <th>Status</th>
                    <th>Atualizado em</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstitutions.length === 0 ? (
                    <tr>
                      <td colSpan={3}>Nenhuma instituição encontrada.</td>
                    </tr>
                  ) : (
                    filteredInstitutions.map((institution) => {
                      const selected = institution.id === selectedInstitutionId;
                      return (
                        <tr
                          key={institution.id}
                          className={selected ? 'is-selected' : ''}
                          onClick={() => setSelectedInstitutionId(institution.id)}
                        >
                          <td>
                            <strong>{institution.name}</strong>
                            <small>{institution.slug}</small>
                          </td>
                          <td>
                            <span
                              className={`native-status-chip ${
                                institution.status === 'active' ? 'is-success' : 'is-warning'
                              }`}
                            >
                              {institution.status === 'active' ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>
                          <td>{formatDate(institution.integration.updatedAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="native-panel native-super-integrations-cards-panel">
          <header className="native-panel-header">
            <h3>Integrações</h3>
            {selectedInstitution ? (
              <small>
                {selectedInstitution.name} ({selectedInstitution.slug})
              </small>
            ) : null}
          </header>

          {!selectedInstitution ? (
            <p className="native-info">Selecione uma instituição para ver as integrações.</p>
          ) : (
            <div className="native-super-integrations-cards">
              {INTEGRATION_OPTIONS.map((option) => {
                const summary = providerSummaries[option.provider];
                const statusClass = summary.loading
                  ? 'is-muted'
                  : !summary.isConfigured
                    ? 'is-warning'
                    : summary.isActive
                      ? 'is-info'
                      : 'is-muted';

                const statusLabel = summary.loading
                  ? 'Carregando...'
                  : !summary.isConfigured
                    ? 'Não configurada'
                    : summary.isActive
                      ? 'Configurada e ativa'
                      : 'Configurada (inativa)';

                return (
                  <button
                    key={option.provider}
                    type="button"
                    className={`native-super-integration-card ${
                      selectedProvider === option.provider ? 'is-selected' : ''
                    }`}
                    onClick={() => {
                      void openIntegrationModal(option.provider);
                    }}
                  >
                    <div className="native-super-integration-card-header">
                      <div className="native-super-integration-card-title">
                        <span className="native-super-integration-icon">{option.badge}</span>
                        <strong>{option.name}</strong>
                      </div>
                      <span className={`native-status-chip ${statusClass}`}>{statusLabel}</span>
                    </div>
                    <small>{option.description}</small>
                    <small>Última atualização: {formatDate(summary.updatedAt)}</small>
                  </button>
                );
              })}
            </div>
          )}
        </article>
      </div>

      {isConfigModalOpen && selectedInstitution ? (
        <div
          className="native-modal-backdrop"
          onClick={() => {
            setIsConfigModalOpen(false);
          }}
        >
          <section
            className="native-modal native-super-integration-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="native-panel-header">
              <h3>Configuração {selectedProvider.toUpperCase()}</h3>
              <button
                type="button"
                onClick={() => {
                  setIsConfigModalOpen(false);
                }}
              >
                Fechar
              </button>
            </header>

            <small>
              {selectedInstitution.name} ({selectedInstitution.slug})
            </small>

            <div className="native-super-integration-modal-grid">
              <section className="native-super-integration-block">
                <header>
                  <h4>Configuração</h4>
                </header>

            <form className="native-form-grid native-super-integration-form" onSubmit={submitIntegration}>
              <label>
                Provedor
                <input value={selectedProvider.toUpperCase()} readOnly />
              </label>

              <label>
                Ambiente
                <select
                  value={form.environment}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      environment:
                        event.target.value === 'sandbox' ? 'sandbox' : 'production',
                    }))
                  }
                >
                  <option value="production">Produção</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </label>

              <label className="native-toggle-row">
                <div>
                  <strong>Integração ativa</strong>
                  <small>Quando ativa, pode ser usada pelos fluxos oficiais.</small>
                </div>
                <button
                  type="button"
                  className={`native-switch ${form.isActive ? 'active' : ''}`}
                  onClick={() =>
                    setForm((current) => ({ ...current, isActive: !current.isActive }))
                  }
                >
                  <span />
                </button>
              </label>

              <label>
                URL base da API
                <input
                  type="url"
                  value={form.baseUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  placeholder={
                    selectedProvider === 'rdstation'
                      ? 'https://api.rd.services'
                      : 'https://apiappdo.facinpro.flie.com.br'
                  }
                  required
                />
              </label>

              {selectedProvider === 'rdstation' ? (
                <>
                  <label>
                    API Key
                    <input
                      type="password"
                      value={form.rdStationApiKey}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          rdStationApiKey: event.target.value,
                        }))
                      }
                      placeholder="Deixe em branco para manter a atual"
                    />
                    <small>
                      {secretFlags.rdStationApiKeyConfigured
                        ? `Chave atual: ${secretFlags.rdStationApiKeyMasked ?? 'configurada'}`
                        : 'Nenhuma API Key salva ainda'}
                    </small>
                  </label>

                  <label>
                    Conversion Identifier
                    <input
                      value={form.rdStationConversionIdentifier}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          rdStationConversionIdentifier: event.target.value,
                        }))
                      }
                      placeholder="Matrícula Efetivada"
                      required
                    />
                  </label>

                  <label>
                    Campo do curso
                    <input
                      value={form.rdStationCourseFieldKey}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          rdStationCourseFieldKey: event.target.value,
                        }))
                      }
                      placeholder="cf_curso_matriculado"
                      required
                    />
                  </label>

                  <label>
                    Campo da idade
                    <input
                      value={form.rdStationAgeFieldKey}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          rdStationAgeFieldKey: event.target.value,
                        }))
                      }
                      placeholder="cf_idade"
                      required
                    />
                  </label>

                  <label>
                    Campo do endereço
                    <input
                      value={form.rdStationAddressFieldKey}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          rdStationAddressFieldKey: event.target.value,
                        }))
                      }
                      placeholder="cf_endereco"
                      required
                    />
                  </label>

                  <label>
                    Campo do ID da matrícula
                    <input
                      value={form.rdStationEnrollmentIdFieldKey}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          rdStationEnrollmentIdFieldKey: event.target.value,
                        }))
                      }
                      placeholder="cf_matricula_id"
                      required
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Client ID
                    <input
                      value={form.clientId}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, clientId: event.target.value }))
                      }
                      placeholder="UUID do client_id"
                      required
                    />
                  </label>

                  <label>
                    Client Secret (opcional)
                    <input
                      type="password"
                      value={form.clientSecret}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          clientSecret: event.target.value,
                        }))
                      }
                      placeholder="Opcional. Deixe em branco para manter o atual"
                    />
                    <small>
                      {secretFlags.clientSecretConfigured
                        ? `Segredo atual: ${secretFlags.clientSecretMasked ?? 'configurado'}`
                        : 'Nenhum segredo salvo ainda'}
                    </small>
                  </label>

                  <label>
                    Authorization Bearer (opcional)
                    <input
                      type="password"
                      value={form.authorizationBearer}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          authorizationBearer: event.target.value,
                        }))
                      }
                      placeholder="Pode começar com Bearer ou sem prefixo"
                    />
                    <small>
                      {secretFlags.authorizationBearerConfigured
                        ? `Bearer atual: ${secretFlags.authorizationBearerMasked ?? 'configurado'}`
                        : 'Se vazio, o sistema usa o token informado abaixo'}
                    </small>
                  </label>

                  <label>
                    Token Bearer (opcional)
                    <input
                      type="password"
                      value={form.token}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, token: event.target.value }))
                      }
                      placeholder="Token usado no header Authorization: Bearer {token}"
                    />
                    <small>
                      {secretFlags.tokenConfigured
                        ? `Token atual: ${secretFlags.tokenMasked ?? 'configurado'}`
                        : 'Token ainda não configurado'}
                    </small>
                  </label>

                  <label>
                    Grant type
                    <input
                      value={form.grantType}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, grantType: event.target.value }))
                      }
                      placeholder="client_credentials"
                    />
                  </label>

                  <label>
                    Scopes (separados por vírgula)
                    <input
                      value={form.scopes}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, scopes: event.target.value }))
                      }
                      placeholder="cobranca.parceiro, b2b.parceiro"
                    />
                  </label>

                  <label>
                    GCSSID padrão (opcional)
                    <input
                      value={form.defaultGcssid}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          defaultGcssid: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Identificação do vendedor padrão (opcional)
                    <input
                      value={form.defaultIdentificacaoVendedor}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          defaultIdentificacaoVendedor: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    OfertaCursoID padrão (opcional)
                    <input
                      value={form.defaultOfertaCursoId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          defaultOfertaCursoId: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              )}

              {loadingConfig ? <p className="native-info">Carregando configuração...</p> : null}

              {providerSummaries[selectedProvider].lastErrorMessage ? (
                <p className="native-super-integration-note">
                  Último erro: {providerSummaries[selectedProvider].lastErrorMessage}
                </p>
              ) : null}

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    applyProviderPreset(selectedProvider);
                  }}
                >
                  Aplicar preset {selectedProvider.toUpperCase()}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (!selectedInstitutionId) return;
                    void Promise.all([
                      loadConfig(selectedInstitutionId, selectedProvider),
                      loadDispatchLogs(
                        selectedInstitutionId,
                        auditFilters,
                        selectedProvider,
                      ),
                    ]);
                  }}
                >
                  Recarregar campos
                </button>
                <button type="submit" disabled={saving || loadingConfig}>
                  {saving ? 'Salvando...' : 'Salvar integração'}
                </button>
              </div>
            </form>
              </section>

              <section className="native-super-integration-block">
                <header>
                  <h4>Teste e Auditoria</h4>
                </header>

            <article className="native-panel native-super-test-request">
              <header className="native-panel-header">
                <h3>Teste de request {selectedProvider.toUpperCase()}</h3>
                <small>
                  Último sucesso: {formatDate(providerSummaries[selectedProvider].lastSuccessAt)}
                </small>
              </header>

              <p className="native-super-integration-note">
                {selectedProvider === 'rdstation'
                  ? 'O teste do RD Station pode ser feito por ID de matrícula (busca dados reais) ou por payload JSON manual.'
                  : 'O teste envia um `POST /b2b/VendaRubeus` com `client_id` e `Authorization: Bearer ...`, aplicando os defaults da configuração da instituição quando o payload não informar esses campos.'}
              </p>

              {selectedProvider === 'rdstation' ? (
                <label>
                  ID da matrícula (opcional)
                  <input
                    value={testEnrollmentId}
                    onChange={(event) => setTestEnrollmentId(event.target.value)}
                    placeholder="Ex.: cm8abc123xyz"
                  />
                  <small>
                    Se informado, o backend monta o payload automaticamente com os dados da
                    matrícula.
                  </small>
                </label>
              ) : null}

              <label>
                Payload JSON
                <textarea
                  rows={14}
                  value={testPayload}
                  onChange={(event) => setTestPayload(event.target.value)}
                />
              </label>

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setTestPayload(buildTestPayloadTemplate(selectedProvider, form))
                  }
                  disabled={testing}
                >
                  Regerar exemplo
                </button>
                <button
                  type="button"
                  onClick={() => void submitTestRequest()}
                  disabled={testing}
                >
                  {testing ? 'Enviando teste...' : 'Enviar payload de teste'}
                </button>
              </div>

              {lastResult ? (
                <pre>
                  {JSON.stringify(
                    {
                      endpoint: lastResult.endpoint,
                      statusCode: lastResult.response.statusCode,
                      ok: lastResult.response.ok,
                      body: lastResult.response.body,
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : null}

              <div className="native-super-integration-audit">
                <header className="native-panel-header">
                  <h3>Auditoria de envios</h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedInstitutionId) return;
                      void loadDispatchLogs(
                        selectedInstitutionId,
                        auditFilters,
                        selectedProvider,
                      );
                    }}
                  >
                    Atualizar auditoria
                  </button>
                </header>

                <div className="native-super-integration-audit-filters">
                  <label>
                    Status
                    <select
                      value={auditFilters.status}
                      onChange={(event) =>
                        setAuditFilters((current) => ({
                          ...current,
                          status:
                            event.target.value === 'success' ||
                            event.target.value === 'failed'
                              ? event.target.value
                              : 'all',
                        }))
                      }
                    >
                      <option value="all">Todos</option>
                      <option value="success">Sucesso</option>
                      <option value="failed">Falha</option>
                    </select>
                  </label>

                  <label>
                    De
                    <input
                      type="date"
                      value={auditFilters.dateFrom}
                      onChange={(event) =>
                        setAuditFilters((current) => ({
                          ...current,
                          dateFrom: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Até
                    <input
                      type="date"
                      value={auditFilters.dateTo}
                      onChange={(event) =>
                        setAuditFilters((current) => ({
                          ...current,
                          dateTo: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Busca
                    <input
                      value={auditFilters.search}
                      onChange={(event) =>
                        setAuditFilters((current) => ({
                          ...current,
                          search: event.target.value,
                        }))
                      }
                      placeholder="Aluno ou erro..."
                    />
                  </label>

                  <div className="native-super-integration-audit-actions">
                    <button type="button" className="ghost" onClick={() => void clearAuditFilters()}>
                      Limpar
                    </button>
                    <button type="button" onClick={() => void applyAuditFilters()}>
                      Aplicar filtros
                    </button>
                  </div>
                </div>

                {loadingLogs ? <p className="native-info">Carregando auditoria...</p> : null}

                <div className="native-table-wrap">
                  <table className="native-table">
                    <thead>
                      <tr>
                        <th>Data/hora</th>
                        <th>Aluno</th>
                        <th>Status</th>
                        <th>HTTP</th>
                        <th>Erro</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!loadingLogs && dispatchLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6}>Nenhum envio auditado para esta instituição.</td>
                        </tr>
                      ) : (
                        dispatchLogs.map((log) => (
                          <tr key={log.id}>
                            <td>{formatDate(log.createdAt)}</td>
                            <td>
                              <strong>{log.studentName || 'Aluno não identificado'}</strong>
                              <small>{log.studentId ? `#${log.studentId.slice(0, 8)}` : '-'}</small>
                            </td>
                            <td>
                              <span
                                className={`native-status-chip ${
                                  log.status === 'success' ? 'is-success' : 'is-danger'
                                }`}
                              >
                                {log.status === 'success' ? 'Sucesso' : 'Falha'}
                              </span>
                            </td>
                            <td>{log.responseStatusCode ?? '-'}</td>
                            <td>{log.errorMessage || '-'}</td>
                            <td>
                              {log.status === 'failed' ? (
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => {
                                    void retryDispatch(log);
                                  }}
                                  disabled={retryingLogId === log.id}
                                >
                                  {retryingLogId === log.id ? 'Reenviando...' : 'Reenviar'}
                                </button>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </article>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
