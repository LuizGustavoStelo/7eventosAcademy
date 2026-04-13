import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InstitutionStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SecretsService } from '../security/secrets/secrets.service';
import { SendKobayashiTestPayloadDto } from './dto/send-kobayashi-test-payload.dto';
import { UpsertInstitutionIntegrationDto } from './dto/upsert-institution-integration.dto';

type SupportedProvider = 'kobayashi';

type KobayashiSettings = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  token?: string;
  authorizationBearer?: string;
  grantType: string;
  scopes: string[];
  defaultGcssid?: string;
  defaultIdentificacaoVendedor?: string;
  defaultOfertaCursoId?: string;
};

type InstitutionIntegrationSettings = {
  kobayashi?: KobayashiSettings;
};

type KobayashiRequestResult = {
  statusCode: number;
  ok: boolean;
  body: unknown;
};

type DispatchLogInput = {
  institutionId: string;
  integrationId?: string | null;
  provider: SupportedProvider;
  status: 'success' | 'failed';
  studentId?: string | null;
  studentName: string;
  enrollmentId?: string | null;
  contractInstanceId?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  responseStatusCode?: number | null;
  errorMessage?: string | null;
};

const KOBAYASHI_DEFAULT_BASE_URL = 'https://apiappdo.facinpro.flie.com.br';
const KOBAYASHI_DEFAULT_GRANT_TYPE = 'client_credentials';
const KOBAYASHI_DEFAULT_SCOPES = ['cobranca.parceiro', 'b2b.parceiro'];

@Injectable()
export class SuperadminIntegrationsService {
  private readonly logger = new Logger(SuperadminIntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  async listInstitutions() {
    const institutions = await this.prisma.institution.findMany({
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updatedAt: true,
        members: {
          where: {
            status: 'ACTIVE',
            user: { role: UserRole.ADMIN },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        integrations: {
          where: { provider: 'kobayashi' },
          take: 1,
          select: {
            provider: true,
            environment: true,
            isActive: true,
            encryptedSettings: true,
            updatedAt: true,
            lastSuccessAt: true,
            lastErrorAt: true,
            lastErrorMessage: true,
          },
        },
      },
    });

    return {
      institutions: institutions.map((institution) => {
        const ownerAdmin = institution.members[0]?.user ?? null;
        const integration = institution.integrations[0] ?? null;
        return {
          id: institution.id,
          name: institution.name,
          slug: institution.slug,
          status: this.toLowerCaseInstitutionStatus(institution.status),
          updatedAt: institution.updatedAt,
          ownerAdmin,
          integration: {
            provider: 'kobayashi',
            isConfigured: Boolean(integration?.encryptedSettings),
            isActive: Boolean(integration?.isActive),
            environment: (integration?.environment ?? 'production').toLowerCase(),
            updatedAt: integration?.updatedAt ?? null,
            lastSuccessAt: integration?.lastSuccessAt ?? null,
            lastErrorAt: integration?.lastErrorAt ?? null,
            lastErrorMessage: integration?.lastErrorMessage ?? null,
          },
        };
      }),
    };
  }

  async getInstitutionProviderConfig(
    institutionId: string,
    rawProvider: string,
  ) {
    const provider = this.normalizeProvider(rawProvider);
    const institution = await this.ensureInstitutionExists(institutionId);

    const integration = await this.prisma.institutionIntegration.findUnique({
      where: {
        institutionId_provider: {
          institutionId,
          provider,
        },
      },
      select: {
        id: true,
        provider: true,
        environment: true,
        isActive: true,
        encryptedSettings: true,
        updatedAt: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        lastErrorMessage: true,
      },
    });

    const settings = this.decryptSettings(integration?.encryptedSettings);
    const kobayashi = settings.kobayashi;

    return {
      institution,
      integration: {
        id: integration?.id ?? null,
        provider,
        environment: (integration?.environment ?? 'production').toLowerCase(),
        isActive: Boolean(integration?.isActive),
        isConfigured: Boolean(integration?.encryptedSettings),
        updatedAt: integration?.updatedAt ?? null,
        lastSuccessAt: integration?.lastSuccessAt ?? null,
        lastErrorAt: integration?.lastErrorAt ?? null,
        lastErrorMessage: integration?.lastErrorMessage ?? null,
        kobayashi: {
          baseUrl: kobayashi?.baseUrl ?? KOBAYASHI_DEFAULT_BASE_URL,
          clientId: kobayashi?.clientId ?? '',
          clientSecretConfigured: Boolean(kobayashi?.clientSecret),
          clientSecretMasked: this.maskSecret(kobayashi?.clientSecret),
          tokenConfigured: Boolean(kobayashi?.token),
          tokenMasked: this.maskSecret(kobayashi?.token),
          authorizationBearerConfigured: Boolean(kobayashi?.authorizationBearer),
          authorizationBearerMasked: this.maskSecret(kobayashi?.authorizationBearer),
          grantType: kobayashi?.grantType ?? KOBAYASHI_DEFAULT_GRANT_TYPE,
          scopes:
            Array.isArray(kobayashi?.scopes) && kobayashi?.scopes.length > 0
              ? kobayashi.scopes
              : KOBAYASHI_DEFAULT_SCOPES,
          defaultGcssid: kobayashi?.defaultGcssid ?? '',
          defaultIdentificacaoVendedor:
            kobayashi?.defaultIdentificacaoVendedor ?? '',
          defaultOfertaCursoId: kobayashi?.defaultOfertaCursoId ?? '',
        },
      },
    };
  }

  async listInstitutionProviderDispatchLogs(
    institutionId: string,
    rawProvider: string,
    rawLimit?: string,
    rawStatus?: string,
    rawDateFrom?: string,
    rawDateTo?: string,
    rawSearch?: string,
  ) {
    const provider = this.normalizeProvider(rawProvider);
    const institution = await this.ensureInstitutionExists(institutionId);
    const limit = this.parseLogsLimit(rawLimit);
    const status = this.parseDispatchStatusFilter(rawStatus);
    const createdAt = this.parseDispatchDateRange(rawDateFrom, rawDateTo);
    const search = String(rawSearch || '').trim();

    const where: Prisma.InstitutionIntegrationDispatchLogWhereInput = {
      institutionId,
      provider,
    };
    if (status) where.status = status;
    if (createdAt) where.createdAt = createdAt;
    if (search) {
      where.OR = [
        {
          studentName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          errorMessage: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const rows = await this.prisma.institutionIntegrationDispatchLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        provider: true,
        status: true,
        studentId: true,
        studentName: true,
        enrollmentId: true,
        contractInstanceId: true,
        responseStatusCode: true,
        errorMessage: true,
        createdAt: true,
      },
    });

    return {
      institution,
      provider,
      limit,
      filters: {
        status,
        dateFrom: rawDateFrom ?? null,
        dateTo: rawDateTo ?? null,
        search: search || null,
      },
      logs: rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        status: row.status,
        studentId: row.studentId,
        studentName: row.studentName,
        enrollmentId: row.enrollmentId,
        contractInstanceId: row.contractInstanceId,
        responseStatusCode: row.responseStatusCode,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
      })),
    };
  }

  async upsertInstitutionProviderConfig(
    institutionId: string,
    rawProvider: string,
    dto: UpsertInstitutionIntegrationDto,
  ) {
    const provider = this.normalizeProvider(rawProvider);
    await this.ensureInstitutionExists(institutionId);

    const existing = await this.prisma.institutionIntegration.findUnique({
      where: {
        institutionId_provider: {
          institutionId,
          provider,
        },
      },
      select: {
        environment: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    const environment =
      String(dto.environment || '').trim().toLowerCase() ||
      existing?.environment?.toLowerCase() ||
      'production';

    if (environment !== 'production' && environment !== 'sandbox') {
      throw new BadRequestException('Ambiente de integração inválido.');
    }

    const currentSettings = this.decryptSettings(existing?.encryptedSettings);
    const nextSettings = this.buildSettings(provider, dto, currentSettings);
    const encryptedSettings = this.secrets.encrypt(JSON.stringify(nextSettings));
    const isActive =
      typeof dto.isActive === 'boolean' ? dto.isActive : (existing?.isActive ?? false);

    const saved = await this.prisma.institutionIntegration.upsert({
      where: {
        institutionId_provider: {
          institutionId,
          provider,
        },
      },
      update: {
        environment,
        isActive,
        encryptedSettings,
      },
      create: {
        institutionId,
        provider,
        environment,
        isActive,
        encryptedSettings,
      },
      select: {
        id: true,
        provider: true,
        environment: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      integration: {
        id: saved.id,
        provider: saved.provider,
        environment: saved.environment.toLowerCase(),
        isActive: saved.isActive,
        updatedAt: saved.updatedAt,
      },
    };
  }

  async sendProviderTestRequest(
    institutionId: string,
    rawProvider: string,
    dto: SendKobayashiTestPayloadDto,
  ) {
    const provider = this.normalizeProvider(rawProvider);
    if (provider === 'kobayashi') {
      return this.sendKobayashiTestRequest(institutionId, dto);
    }

    throw new BadRequestException('Provedor de integração não suportado para teste.');
  }

  async sendKobayashiTestRequest(
    institutionId: string,
    dto: SendKobayashiTestPayloadDto,
  ) {
    await this.ensureInstitutionExists(institutionId);

    const integration = await this.prisma.institutionIntegration.findUnique({
      where: {
        institutionId_provider: {
          institutionId,
          provider: 'kobayashi',
        },
      },
      select: {
        id: true,
        environment: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    if (!integration || !integration.encryptedSettings) {
      throw new NotFoundException(
        'Integração KOBAYASHI não configurada para esta instituição.',
      );
    }

    const settings = this.decryptSettings(integration.encryptedSettings).kobayashi;
    if (!settings) {
      throw new BadRequestException('Configuração KOBAYASHI inválida.');
    }

    const requestPayload = this.applyKobayashiDefaults(settings, dto.payload);
    const endpoint = this.buildKobayashiEndpoint(settings);

    try {
      const response = await this.requestKobayashi(settings, requestPayload);

      if (!response.ok) {
        const message = this.extractIntegrationErrorMessage(
          response.body,
          `KOBAYASHI respondeu com status HTTP ${response.statusCode}.`,
        );
        await this.markIntegrationFailure(integration.id, message);
        throw new BadRequestException(message);
      }

      await this.markIntegrationSuccess(integration.id);

      return {
        success: true,
        endpoint,
        integrationActive: integration.isActive,
        environment: integration.environment,
        request: {
          hasAuthorizationBearer: true,
          payload: requestPayload,
        },
        response,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao enviar payload de teste para KOBAYASHI.';
      await this.markIntegrationFailure(integration.id, message);
      throw new BadRequestException(message);
    }
  }

  async dispatchKobayashiForSignedContractInstance(contractInstanceId: string) {
    const contract = await this.prisma.contractInstance.findUnique({
      where: { id: contractInstanceId },
      select: {
        id: true,
        institutionId: true,
        enrollmentId: true,
        status: true,
        signedAt: true,
        createdAt: true,
        signatureCode: true,
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: {
              select: {
                documentCpf: true,
                documentRg: true,
                issuingAuthority: true,
                phone: true,
                birthDate: true,
                birthCity: true,
                gender: true,
                fatherName: true,
                motherName: true,
                zipCode: true,
                street: true,
                streetNumber: true,
                complement: true,
                neighborhood: true,
                city: true,
                state: true,
                country: true,
              },
            },
          },
        },
        enrollment: {
          select: {
            id: true,
            createdAt: true,
            selectedPaymentOption: true,
            schoolClass: {
              select: {
                course: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!contract) {
      return {
        dispatched: false,
        success: false,
        message: 'Contrato não encontrado para envio de integração.',
      };
    }

    if (String(contract.status).toUpperCase() !== 'SIGNED') {
      return {
        dispatched: false,
        success: false,
        message: 'Contrato ainda não está assinado.',
      };
    }

    const integration = await this.prisma.institutionIntegration.findUnique({
      where: {
        institutionId_provider: {
          institutionId: contract.institutionId,
          provider: 'kobayashi',
        },
      },
      select: {
        id: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    if (!integration || !integration.isActive || !integration.encryptedSettings) {
      return {
        dispatched: false,
        success: false,
        message: 'Integração KOBAYASHI não está ativa para a instituição.',
      };
    }

    const settings = this.decryptSettings(integration.encryptedSettings).kobayashi;
    if (!settings) {
      return {
        dispatched: false,
        success: false,
        message: 'Configuração KOBAYASHI inválida para envio automático.',
      };
    }

    const payload = this.buildKobayashiEnrollmentPayload({
      settings,
      contract,
    });

    const studentName =
      String(contract.student?.name || 'Aluno não identificado').trim() ||
      'Aluno não identificado';
    const baseLog = {
      institutionId: contract.institutionId,
      integrationId: integration.id,
      provider: 'kobayashi' as const,
      studentId: contract.student?.id ?? null,
      studentName,
      enrollmentId: contract.enrollmentId ?? null,
      contractInstanceId: contract.id,
      requestPayload: payload,
    };

    try {
      const response = await this.requestKobayashi(settings, payload);
      if (!response.ok) {
        const message = this.extractIntegrationErrorMessage(
          response.body,
          `KOBAYASHI respondeu com status HTTP ${response.statusCode}.`,
        );
        await this.markIntegrationFailure(integration.id, message);
        await this.createDispatchLog({
          ...baseLog,
          status: 'failed',
          responsePayload: response.body,
          responseStatusCode: response.statusCode,
          errorMessage: message,
        });
        return {
          dispatched: true,
          success: false,
          message,
        };
      }

      await this.markIntegrationSuccess(integration.id);
      await this.createDispatchLog({
        ...baseLog,
        status: 'success',
        responsePayload: response.body,
        responseStatusCode: response.statusCode,
      });

      return {
        dispatched: true,
        success: true,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha inesperada no envio automático para KOBAYASHI.';

      await this.markIntegrationFailure(integration.id, message);
      await this.createDispatchLog({
        ...baseLog,
        status: 'failed',
        errorMessage: message,
      });

      this.logger.warn(
        `[kobayashi-dispatch] Falha ao enviar contrato ${contract.id}: ${message}`,
      );

      return {
        dispatched: true,
        success: false,
        message,
      };
    }
  }

  async retryInstitutionProviderDispatchLog(
    institutionId: string,
    rawProvider: string,
    logId: string,
  ) {
    const provider = this.normalizeProvider(rawProvider);
    await this.ensureInstitutionExists(institutionId);

    const log = await this.prisma.institutionIntegrationDispatchLog.findFirst({
      where: {
        id: logId,
        institutionId,
        provider,
      },
      select: {
        id: true,
        studentId: true,
        studentName: true,
        enrollmentId: true,
        contractInstanceId: true,
        requestPayload: true,
      },
    });

    if (!log) {
      throw new NotFoundException('Log de auditoria não encontrado.');
    }

    const integration = await this.prisma.institutionIntegration.findUnique({
      where: {
        institutionId_provider: {
          institutionId,
          provider,
        },
      },
      select: {
        id: true,
        encryptedSettings: true,
      },
    });

    if (!integration || !integration.encryptedSettings) {
      throw new NotFoundException(
        'Integração não configurada para reenvio manual.',
      );
    }

    const settings = this.decryptSettings(integration.encryptedSettings).kobayashi;
    if (!settings) {
      throw new BadRequestException(
        'Configuração da integração KOBAYASHI inválida.',
      );
    }

    if (!this.isObject(log.requestPayload)) {
      if (log.contractInstanceId) {
        const fallback = await this.dispatchKobayashiForSignedContractInstance(
          log.contractInstanceId,
        );
        return {
          retriedFromLogId: log.id,
          usedFallbackPayload: true,
          ...fallback,
        };
      }
      throw new BadRequestException(
        'Log sem payload válido para reenvio manual.',
      );
    }

    const requestPayload = log.requestPayload as Record<string, unknown>;
    const baseLog: Omit<DispatchLogInput, 'status'> = {
      institutionId,
      integrationId: integration.id,
      provider,
      studentId: log.studentId ?? null,
      studentName: log.studentName,
      enrollmentId: log.enrollmentId ?? null,
      contractInstanceId: log.contractInstanceId ?? null,
      requestPayload,
    };

    try {
      const response = await this.requestKobayashi(settings, requestPayload);

      if (!response.ok) {
        const message = this.extractIntegrationErrorMessage(
          response.body,
          `KOBAYASHI respondeu com status HTTP ${response.statusCode}.`,
        );
        await this.markIntegrationFailure(integration.id, message);
        await this.createDispatchLog({
          ...baseLog,
          status: 'failed',
          responsePayload: response.body,
          responseStatusCode: response.statusCode,
          errorMessage: message,
        });
        return {
          retriedFromLogId: log.id,
          success: false,
          response,
          message,
        };
      }

      await this.markIntegrationSuccess(integration.id);
      await this.createDispatchLog({
        ...baseLog,
        status: 'success',
        responsePayload: response.body,
        responseStatusCode: response.statusCode,
      });

      return {
        retriedFromLogId: log.id,
        success: true,
        response,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha inesperada no reenvio manual para KOBAYASHI.';
      await this.markIntegrationFailure(integration.id, message);
      await this.createDispatchLog({
        ...baseLog,
        status: 'failed',
        errorMessage: message,
      });
      return {
        retriedFromLogId: log.id,
        success: false,
        message,
      };
    }
  }

  private buildSettings(
    provider: SupportedProvider,
    dto: UpsertInstitutionIntegrationDto,
    current: InstitutionIntegrationSettings,
  ): InstitutionIntegrationSettings {
    if (provider !== 'kobayashi') {
      throw new BadRequestException('Provedor de integração não suportado.');
    }

    const currentKobayashi = current.kobayashi;
    const baseUrl =
      String(dto.kobayashiBaseUrl || '').trim() ||
      currentKobayashi?.baseUrl ||
      KOBAYASHI_DEFAULT_BASE_URL;
    const clientId =
      String(dto.kobayashiClientId || '').trim() || currentKobayashi?.clientId || '';
    const clientSecret =
      String(dto.kobayashiClientSecret || '').trim() ||
      currentKobayashi?.clientSecret ||
      '';

    if (!clientId) {
      throw new BadRequestException('Client ID da integração KOBAYASHI é obrigatório.');
    }

    if (!clientSecret) {
      throw new BadRequestException(
        'Client Secret da integração KOBAYASHI é obrigatório.',
      );
    }

    this.validateHttpUrl(baseUrl, 'URL base da integração KOBAYASHI');

    const nextSettings: KobayashiSettings = {
      baseUrl: this.normalizeBaseUrl(baseUrl),
      clientId,
      clientSecret,
      token:
        String(dto.kobayashiToken || '').trim() || currentKobayashi?.token || undefined,
      authorizationBearer:
        String(dto.kobayashiAuthorizationBearer || '').trim() ||
        currentKobayashi?.authorizationBearer ||
        undefined,
      grantType:
        String(dto.kobayashiGrantType || '').trim() ||
        currentKobayashi?.grantType ||
        KOBAYASHI_DEFAULT_GRANT_TYPE,
      scopes: this.normalizeScopes(dto.kobayashiScopes ?? currentKobayashi?.scopes),
      defaultGcssid:
        String(dto.kobayashiDefaultGcssid || '').trim() ||
        currentKobayashi?.defaultGcssid ||
        undefined,
      defaultIdentificacaoVendedor:
        String(dto.kobayashiDefaultIdentificacaoVendedor || '').trim() ||
        currentKobayashi?.defaultIdentificacaoVendedor ||
        undefined,
      defaultOfertaCursoId:
        String(dto.kobayashiDefaultOfertaCursoId || '').trim() ||
        currentKobayashi?.defaultOfertaCursoId ||
        undefined,
    };

    return { kobayashi: nextSettings };
  }

  private applyKobayashiDefaults(
    settings: KobayashiSettings,
    payload: Record<string, unknown>,
  ) {
    const nextPayload: Record<string, unknown> = { ...payload };

    if (!String(nextPayload.grant_type || '').trim()) {
      nextPayload.grant_type = settings.grantType || KOBAYASHI_DEFAULT_GRANT_TYPE;
    }

    if (!String(nextPayload.gcssid || '').trim() && settings.defaultGcssid) {
      nextPayload.gcssid = settings.defaultGcssid;
    }

    if (!Array.isArray(nextPayload.scopes) || nextPayload.scopes.length === 0) {
      nextPayload.scopes = this.toKobayashiScopeObjects(settings.scopes);
    }

    if (nextPayload.matricula && this.isObject(nextPayload.matricula)) {
      const matricula = { ...(nextPayload.matricula as Record<string, unknown>) };
      if (
        !String(matricula.identificacaoVendedor || '').trim() &&
        settings.defaultIdentificacaoVendedor
      ) {
        matricula.identificacaoVendedor = settings.defaultIdentificacaoVendedor;
      }
      if (
        !String(matricula.ofertaCursoID || '').trim() &&
        settings.defaultOfertaCursoId
      ) {
        matricula.ofertaCursoID = settings.defaultOfertaCursoId;
      }
      nextPayload.matricula = matricula;
    }

    return nextPayload;
  }

  private async requestKobayashi(
    settings: KobayashiSettings,
    payload: Record<string, unknown>,
  ): Promise<KobayashiRequestResult> {
    const endpoint = this.buildKobayashiEndpoint(settings);
    const authorizationBearer = this.resolveKobayashiAuthorizationBearer(settings);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authorizationBearer}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const textBody = await response.text();
      const parsedBody = this.tryParseBody(textBody, contentType);

      return {
        statusCode: response.status,
        ok: response.ok,
        body: parsedBody,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Tempo limite excedido ao enviar requisição para KOBAYASHI.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private tryParseBody(textBody: string, contentType: string): unknown {
    if (!textBody) return null;

    const shouldTryJson = contentType.toLowerCase().includes('application/json');
    if (shouldTryJson) {
      try {
        return JSON.parse(textBody) as unknown;
      } catch {
        return textBody;
      }
    }

    try {
      return JSON.parse(textBody) as unknown;
    } catch {
      return textBody;
    }
  }

  private buildKobayashiEndpoint(settings: KobayashiSettings) {
    const baseUrl = this.normalizeBaseUrl(settings.baseUrl);
    const endpoint = new URL('/b2b/VendaRubeus', baseUrl);
    endpoint.searchParams.set('client_id', settings.clientId);
    return endpoint.toString();
  }

  private resolveKobayashiAuthorizationBearer(settings: KobayashiSettings) {
    const explicitBearer = String(settings.authorizationBearer || '').trim();
    if (explicitBearer) {
      return explicitBearer.replace(/^Bearer\s+/i, '').trim();
    }

    const token = String(settings.token || '').trim();
    if (token) {
      return token.replace(/^Bearer\s+/i, '').trim();
    }

    const value = `${settings.clientId};${settings.clientSecret}`;
    return Buffer.from(value, 'utf8').toString('base64');
  }

  private toKobayashiScopeObjects(scopes?: string[]): Array<{ name: string }> {
    return this.normalizeScopes(scopes).map((name) => ({ name }));
  }

  private normalizeScopes(scopes?: string[]) {
    const fallback = KOBAYASHI_DEFAULT_SCOPES.slice();
    if (!Array.isArray(scopes) || scopes.length === 0) return fallback;

    const normalized = scopes
      .map((scope) => String(scope || '').trim())
      .filter(Boolean)
      .filter((scope, index, arr) => arr.indexOf(scope) === index);

    return normalized.length > 0 ? normalized : fallback;
  }

  private parseLogsLimit(rawLimit?: string) {
    const parsed = Number(rawLimit ?? '');
    if (!Number.isFinite(parsed)) return 50;
    const rounded = Math.trunc(parsed);
    return Math.max(1, Math.min(200, rounded));
  }

  private parseDispatchStatusFilter(rawStatus?: string): 'success' | 'failed' | null {
    const normalized = String(rawStatus || '').trim().toLowerCase();
    if (normalized === 'success') return 'success';
    if (normalized === 'failed') return 'failed';
    return null;
  }

  private parseDispatchDateRange(rawDateFrom?: string, rawDateTo?: string) {
    const fromRaw = String(rawDateFrom || '').trim();
    const toRaw = String(rawDateTo || '').trim();
    if (!fromRaw && !toRaw) return null;

    const range: Prisma.DateTimeFilter = {};

    if (fromRaw) {
      const parsedFrom = new Date(fromRaw);
      if (!Number.isNaN(parsedFrom.getTime())) {
        range.gte = parsedFrom;
      }
    }

    if (toRaw) {
      const normalizedTo =
        /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? `${toRaw}T23:59:59.999` : toRaw;
      const parsedTo = new Date(normalizedTo);
      if (!Number.isNaN(parsedTo.getTime())) {
        range.lte = parsedTo;
      }
    }

    return Object.keys(range).length > 0 ? range : null;
  }

  private async markIntegrationSuccess(integrationId: string) {
    await this.prisma.institutionIntegration.update({
      where: { id: integrationId },
      data: {
        lastSuccessAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
  }

  private async markIntegrationFailure(integrationId: string, message: string) {
    await this.prisma.institutionIntegration.update({
      where: { id: integrationId },
      data: {
        lastErrorAt: new Date(),
        lastErrorMessage: String(message || '').slice(0, 1500),
      },
    });
  }

  private async createDispatchLog(input: DispatchLogInput) {
    await this.prisma.institutionIntegrationDispatchLog.create({
      data: {
        institutionId: input.institutionId,
        integrationId: input.integrationId ?? null,
        provider: input.provider,
        status: input.status,
        studentId: input.studentId ?? null,
        studentName: String(input.studentName || '').trim() || 'Aluno não identificado',
        enrollmentId: input.enrollmentId ?? null,
        contractInstanceId: input.contractInstanceId ?? null,
        requestPayload:
          input.requestPayload === undefined || input.requestPayload === null
            ? Prisma.DbNull
            : this.toPrismaJsonValue(input.requestPayload),
        responsePayload:
          input.responsePayload === undefined || input.responsePayload === null
            ? Prisma.DbNull
            : this.toPrismaJsonValue(input.responsePayload),
        responseStatusCode: input.responseStatusCode ?? null,
        errorMessage: input.errorMessage?.slice(0, 1500) ?? null,
      },
    });
  }

  private buildKobayashiEnrollmentPayload(input: {
    settings: KobayashiSettings;
    contract: {
      id: string;
      createdAt: Date;
      signedAt: Date | null;
      signatureCode: string;
      student: {
        id: string;
        name: string;
        email: string;
        studentProfile: {
          documentCpf: string | null;
          documentRg: string | null;
          issuingAuthority: string | null;
          phone: string | null;
          birthDate: Date | null;
          birthCity: string | null;
          gender: string | null;
          fatherName: string | null;
          motherName: string | null;
          zipCode: string | null;
          street: string | null;
          streetNumber: string | null;
          complement: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
        } | null;
      };
      enrollment: {
        id: string;
        createdAt: Date;
        selectedPaymentOption: Prisma.JsonValue | null;
        schoolClass: {
          course: {
            id: string;
            name: string;
            price: Prisma.Decimal | null;
          };
        } | null;
      } | null;
    };
  }) {
    const profile = input.contract.student.studentProfile;
    const payment = this.parseEnrollmentPaymentSnapshot(
      input.contract.enrollment?.selectedPaymentOption ?? null,
    );
    const totalAmount =
      payment.totalAmount > 0
        ? payment.totalAmount
        : Number(input.contract.enrollment?.schoolClass?.course?.price ?? 0);

    const payload = {
      gcssid: input.settings.defaultGcssid || undefined,
      matricula: {
        orderId: input.contract.signatureCode || input.contract.id,
        telefoneCelular: this.onlyDigits(profile?.phone),
        nomeCompleto: this.asString(input.contract.student.name),
        nomeSocial: this.asString(input.contract.student.name),
        sexo: this.asString(profile?.gender || '').slice(0, 1).toUpperCase() || null,
        dataNascimento: this.formatDateOnly(profile?.birthDate),
        eMail: this.asString(input.contract.student.email),
        CPF: this.onlyDigits(profile?.documentCpf),
        EnderecoCEP: this.onlyDigits(profile?.zipCode),
        enderecoLogradouro: this.asString(profile?.street),
        enderecoNumero: this.asString(profile?.streetNumber),
        enderecoQuadra: '',
        enderecoLote: '',
        enderecoComplemento: this.asString(profile?.complement),
        enderecoBairro: this.asString(profile?.neighborhood),
        enderecoCidade: this.asString(profile?.city),
        enderecoUF: this.asString(profile?.state),
        enderecoPais: this.asString(profile?.country || 'Brasil'),
        situacaoMatricula: '1',
        identificacaoVendedor:
          this.asString(input.settings.defaultIdentificacaoVendedor) || null,
        idContrato: input.contract.id,
        situacaooContrato: 'Sim',
        dataPreMatricula: this.formatDateTimeLocal(
          input.contract.enrollment?.createdAt || input.contract.createdAt,
        ),
        formaIngresso: '2',
        formaIngressoOpcaoPS: false,
        profissao: null,
        nomeMae: this.asString(profile?.motherName),
        nomePai: this.asString(profile?.fatherName),
        rg: this.asString(profile?.documentRg),
        naturalidadeCidade: this.asString(profile?.birthCity),
        naturalidadeUF: this.asString(profile?.state),
        naturalidadePais: this.asString(profile?.country || 'Brasil'),
        rgOrgao: this.asString(profile?.issuingAuthority),
        ofertaCursoID:
          this.asString(input.settings.defaultOfertaCursoId) ||
          this.asString(input.contract.enrollment?.schoolClass?.course?.id),
        valorTotal: this.formatMoney(totalAmount),
        valorPago: '0',
        dataPagamentoMatricula: input.contract.signedAt?.toISOString() ?? null,
        percentualDesconto: payment.percentualDesconto,
        descricaoDesconto: null,
        qtdeParcelas: payment.qtdeParcelas,
        tipoPagamento: payment.tipoPagamento,
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
            qtdDeCiclos: Math.max(1, payment.qtdeParcelas || 1),
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
      grant_type: input.settings.grantType || KOBAYASHI_DEFAULT_GRANT_TYPE,
      scopes: this.toKobayashiScopeObjects(input.settings.scopes),
    } as Record<string, unknown>;

    return this.applyKobayashiDefaults(input.settings, payload);
  }

  private parseEnrollmentPaymentSnapshot(payload: Prisma.JsonValue | null) {
    const fallback = {
      tipoPagamento: '7',
      qtdeParcelas: 0,
      percentualDesconto: 0,
      totalAmount: 0,
    };

    if (!payload || !this.isObject(payload)) {
      return fallback;
    }

    const method = String(payload['method'] || '').trim().toUpperCase();
    const installmentCount = Number(payload['installmentCount'] || 0);
    const totalAmount = Number(payload['totalAmount'] || 0);
    const discountValue = Number(payload['discountValue'] || 0);

    let tipoPagamento = '7';
    if (method === 'BANK_SLIP') tipoPagamento = '1';
    if (method === 'CREDIT_CARD') tipoPagamento = '3';

    return {
      tipoPagamento,
      qtdeParcelas:
        Number.isFinite(installmentCount) && installmentCount > 0
          ? Math.trunc(installmentCount)
          : 0,
      percentualDesconto:
        Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0,
      totalAmount: Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0,
    };
  }

  private extractIntegrationErrorMessage(payload: unknown, fallback: string) {
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim().slice(0, 1500);
    }

    if (this.isObject(payload)) {
      const directCandidates = [
        payload.message,
        payload.error,
        payload.detail,
        payload.mensagem,
      ];
      for (const candidate of directCandidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim().slice(0, 1500);
        }
      }
    }

    return fallback;
  }

  private toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return {} as Prisma.InputJsonValue;
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private asString(value: unknown) {
    return String(value || '').trim();
  }

  private onlyDigits(value: unknown) {
    return String(value || '').replace(/\D/g, '');
  }

  private formatDateOnly(value: Date | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  private formatDateTimeLocal(value: Date | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  private formatMoney(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '0.00';
    return parsed.toFixed(2);
  }

  private async ensureInstitutionExists(institutionId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    });

    if (!institution) {
      throw new NotFoundException('Instituição não encontrada.');
    }

    return {
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      status: this.toLowerCaseInstitutionStatus(institution.status),
    };
  }

  private decryptSettings(payload?: string | null): InstitutionIntegrationSettings {
    if (!payload) {
      return {};
    }

    try {
      const decrypted = this.secrets.decrypt(payload);
      return JSON.parse(decrypted) as InstitutionIntegrationSettings;
    } catch {
      return {};
    }
  }

  private normalizeProvider(value: string): SupportedProvider {
    const provider = String(value || '').trim().toLowerCase();
    if (provider === 'kobayashi') {
      return provider;
    }

    throw new BadRequestException('Provedor de integração inválido.');
  }

  private normalizeBaseUrl(value: string) {
    const parsed = new URL(value.trim());
    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  private validateHttpUrl(value: string, label: string) {
    try {
      const parsed = new URL(value.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new BadRequestException(`${label} inválida.`);
    }
  }

  private maskSecret(value: string | undefined) {
    const cleaned = String(value || '').trim();
    if (!cleaned) return null;
    if (cleaned.length <= 8) return '*'.repeat(cleaned.length);
    return `${cleaned.slice(0, 4)}${'*'.repeat(cleaned.length - 8)}${cleaned.slice(-4)}`;
  }

  private toLowerCaseInstitutionStatus(status: InstitutionStatus) {
    return String(status || '').toLowerCase();
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
