import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InstitutionStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SecretsService } from '../security/secrets/secrets.service';
import { SendProviderTestPayloadDto } from './dto/send-kobayashi-test-payload.dto';
import { UpsertInstitutionIntegrationDto } from './dto/upsert-institution-integration.dto';

type SupportedProvider = 'kobayashi' | 'rdstation';

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

type RdStationSettings = {
  baseUrl: string;
  apiKey: string;
  conversionIdentifier: string;
  courseFieldKey: string;
  ageFieldKey: string;
  addressFieldKey: string;
  enrollmentIdFieldKey: string;
};

type InstitutionIntegrationSettings = {
  kobayashi?: KobayashiSettings;
  rdstation?: RdStationSettings;
};

type KobayashiRequestResult = {
  statusCode: number;
  ok: boolean;
  body: unknown;
};

type RdStationRequestResult = {
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
const RDSTATION_DEFAULT_BASE_URL = 'https://api.rd.services';
const RDSTATION_DEFAULT_CONVERSION_IDENTIFIER = 'Matricula Efetivada';
const RDSTATION_DEFAULT_COURSE_FIELD_KEY = 'cf_curso_matriculado';
const RDSTATION_DEFAULT_AGE_FIELD_KEY = 'cf_idade';
const RDSTATION_DEFAULT_ADDRESS_FIELD_KEY = 'cf_endereco';
const RDSTATION_DEFAULT_ENROLLMENT_ID_FIELD_KEY = 'cf_matricula_id';

@Injectable()
export class SuperadminIntegrationsService {
  private readonly logger = new Logger(SuperadminIntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  async listInstitutions(rawProvider?: string) {
    const provider = this.normalizeProvider(rawProvider || 'kobayashi');
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
          where: { provider },
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
            provider,
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
    const rdstation = settings.rdstation;

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
        rdstation: {
          baseUrl: rdstation?.baseUrl ?? RDSTATION_DEFAULT_BASE_URL,
          apiKeyConfigured: Boolean(rdstation?.apiKey),
          apiKeyMasked: this.maskSecret(rdstation?.apiKey),
          conversionIdentifier:
            rdstation?.conversionIdentifier ??
            RDSTATION_DEFAULT_CONVERSION_IDENTIFIER,
          courseFieldKey:
            rdstation?.courseFieldKey ?? RDSTATION_DEFAULT_COURSE_FIELD_KEY,
          ageFieldKey: rdstation?.ageFieldKey ?? RDSTATION_DEFAULT_AGE_FIELD_KEY,
          addressFieldKey:
            rdstation?.addressFieldKey ?? RDSTATION_DEFAULT_ADDRESS_FIELD_KEY,
          enrollmentIdFieldKey:
            rdstation?.enrollmentIdFieldKey ??
            RDSTATION_DEFAULT_ENROLLMENT_ID_FIELD_KEY,
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
    dto: SendProviderTestPayloadDto,
  ) {
    const provider = this.normalizeProvider(rawProvider);
    if (provider === 'kobayashi') {
      return this.sendKobayashiTestRequest(institutionId, dto);
    }
    if (provider === 'rdstation') {
      return this.sendRdStationTestRequest(institutionId, dto);
    }

    throw new BadRequestException('Provedor de integração não suportado para teste.');
  }

  async sendKobayashiTestRequest(
    institutionId: string,
    dto: SendProviderTestPayloadDto,
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
    if (!this.isObject(dto.payload)) {
      throw new BadRequestException(
        'Payload de teste da integração KOBAYASHI é obrigatório.',
      );
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

  async sendRdStationTestRequest(
    institutionId: string,
    dto: SendProviderTestPayloadDto,
  ) {
    await this.ensureInstitutionExists(institutionId);

    const integration = await this.prisma.institutionIntegration.findUnique({
      where: {
        institutionId_provider: {
          institutionId,
          provider: 'rdstation',
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
        'Integracao RD Station nao configurada para esta instituicao.',
      );
    }

    const settings = this.decryptSettings(integration.encryptedSettings).rdstation;
    if (!settings) {
      throw new BadRequestException('Configuracao RD Station invalida.');
    }

    let requestPayload: Record<string, unknown> | null = null;
    const enrollmentId = String(dto.enrollmentId || '').trim();
    if (enrollmentId) {
      requestPayload = await this.buildRdStationRequestByEnrollmentId(
        enrollmentId,
        settings,
        institutionId,
      );
    } else if (this.isObject(dto.payload)) {
      requestPayload = this.normalizeRdStationRequestBody(dto.payload, settings);
    }

    if (!requestPayload) {
      throw new BadRequestException(
        'Informe enrollmentId ou payload para testar a integracao RD Station.',
      );
    }

    try {
      const response = await this.requestRdStation(settings, requestPayload);
      if (!response.ok) {
        const message = this.extractIntegrationErrorMessage(
          response.body,
          `RD Station respondeu com status HTTP ${response.statusCode}.`,
        );
        await this.markIntegrationFailure(integration.id, message);
        throw new BadRequestException(message);
      }

      await this.markIntegrationSuccess(integration.id);

      return {
        success: true,
        endpoint: this.maskApiKeyInUrl(this.buildRdStationEndpoint(settings)),
        integrationActive: integration.isActive,
        environment: integration.environment,
        request: {
          payload: requestPayload,
        },
        response,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao enviar payload de teste para RD Station.';
      await this.markIntegrationFailure(integration.id, message);
      throw new BadRequestException(message);
    }
  }

  async dispatchRdStationForEnrollment(enrollmentId: string) {
    const enrollment = await this.loadEnrollmentForRdStation(enrollmentId);

    if (!enrollment) {
      return {
        dispatched: false,
        success: false,
        message: 'Matricula nao encontrada para envio de integracao.',
      };
    }

    const integration = await this.prisma.institutionIntegration.findUnique({
      where: {
        institutionId_provider: {
          institutionId: enrollment.institutionId,
          provider: 'rdstation',
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
        message: 'Integracao RD Station nao esta ativa para a instituicao.',
      };
    }

    const settings = this.decryptSettings(integration.encryptedSettings).rdstation;
    if (!settings) {
      return {
        dispatched: false,
        success: false,
        message: 'Configuracao RD Station invalida para envio automatico.',
      };
    }

    const payload = this.buildRdStationRequestBodyFromEnrollment(enrollment, settings);
    const studentName =
      String(enrollment.student?.name || 'Aluno nao identificado').trim() ||
      'Aluno nao identificado';
    const baseLog = {
      institutionId: enrollment.institutionId,
      integrationId: integration.id,
      provider: 'rdstation' as const,
      studentId: enrollment.student?.id ?? null,
      studentName,
      enrollmentId: enrollment.id,
      requestPayload: payload,
    };

    try {
      const response = await this.requestRdStation(settings, payload);
      if (!response.ok) {
        const message = this.extractIntegrationErrorMessage(
          response.body,
          `RD Station respondeu com status HTTP ${response.statusCode}.`,
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
          : 'Falha inesperada no envio automatico para RD Station.';

      await this.markIntegrationFailure(integration.id, message);
      await this.createDispatchLog({
        ...baseLog,
        status: 'failed',
        errorMessage: message,
      });

      this.logger.warn(
        `[rdstation-dispatch] Falha ao enviar matricula ${enrollment.id}: ${message}`,
      );

      return {
        dispatched: true,
        success: false,
        message,
      };
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

    const decryptedSettings = this.decryptSettings(integration.encryptedSettings);
    const kobayashiSettings = decryptedSettings.kobayashi;
    const rdstationSettings = decryptedSettings.rdstation;
    if (provider === 'kobayashi' && !kobayashiSettings) {
      throw new BadRequestException(
        'Configuracao da integracao KOBAYASHI invalida.',
      );
    }
    if (provider === 'rdstation' && !rdstationSettings) {
      throw new BadRequestException(
        'Configuracao da integracao RD Station invalida.',
      );
    }

    if (!this.isObject(log.requestPayload)) {
      if (provider === 'kobayashi' && log.contractInstanceId) {
        const fallback = await this.dispatchKobayashiForSignedContractInstance(
          log.contractInstanceId,
        );
        return {
          retriedFromLogId: log.id,
          usedFallbackPayload: true,
          ...fallback,
        };
      }
      if (provider === 'rdstation' && log.enrollmentId) {
        const fallback = await this.dispatchRdStationForEnrollment(log.enrollmentId);
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
      const response =
        provider === 'kobayashi'
          ? await this.requestKobayashi(kobayashiSettings!, requestPayload)
          : await this.requestRdStation(rdstationSettings!, requestPayload);

      if (!response.ok) {
        const message = this.extractIntegrationErrorMessage(
          response.body,
          provider === 'kobayashi'
            ? `KOBAYASHI respondeu com status HTTP ${response.statusCode}.`
            : `RD Station respondeu com status HTTP ${response.statusCode}.`,
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
          : provider === 'kobayashi'
            ? 'Falha inesperada no reenvio manual para KOBAYASHI.'
            : 'Falha inesperada no reenvio manual para RD Station.';
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
    if (provider === 'kobayashi') {
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
        throw new BadRequestException(
          'Client ID da integracao KOBAYASHI e obrigatorio.',
        );
      }

      if (!clientSecret) {
        throw new BadRequestException(
          'Client Secret da integracao KOBAYASHI e obrigatorio.',
        );
      }

      this.validateHttpUrl(baseUrl, 'URL base da integracao KOBAYASHI');

      const nextSettings: KobayashiSettings = {
        baseUrl: this.normalizeBaseUrl(baseUrl),
        clientId,
        clientSecret,
        token:
          String(dto.kobayashiToken || '').trim() ||
          currentKobayashi?.token ||
          undefined,
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

    if (provider === 'rdstation') {
      const currentRdStation = current.rdstation;
      const baseUrl =
        String(dto.rdStationBaseUrl || '').trim() ||
        currentRdStation?.baseUrl ||
        RDSTATION_DEFAULT_BASE_URL;
      const apiKey =
        String(dto.rdStationApiKey || '').trim() || currentRdStation?.apiKey || '';
      const conversionIdentifier =
        String(dto.rdStationConversionIdentifier || '').trim() ||
        currentRdStation?.conversionIdentifier ||
        RDSTATION_DEFAULT_CONVERSION_IDENTIFIER;

      if (!apiKey) {
        throw new BadRequestException(
          'API Key da integracao RD Station e obrigatoria.',
        );
      }

      this.validateHttpUrl(baseUrl, 'URL base da integracao RD Station');

      const nextSettings: RdStationSettings = {
        baseUrl: this.normalizeBaseUrl(baseUrl),
        apiKey,
        conversionIdentifier,
        courseFieldKey: this.normalizeRdCustomFieldKey(
          dto.rdStationCourseFieldKey,
          currentRdStation?.courseFieldKey,
          RDSTATION_DEFAULT_COURSE_FIELD_KEY,
        ),
        ageFieldKey: this.normalizeRdCustomFieldKey(
          dto.rdStationAgeFieldKey,
          currentRdStation?.ageFieldKey,
          RDSTATION_DEFAULT_AGE_FIELD_KEY,
        ),
        addressFieldKey: this.normalizeRdCustomFieldKey(
          dto.rdStationAddressFieldKey,
          currentRdStation?.addressFieldKey,
          RDSTATION_DEFAULT_ADDRESS_FIELD_KEY,
        ),
        enrollmentIdFieldKey: this.normalizeRdCustomFieldKey(
          dto.rdStationEnrollmentIdFieldKey,
          currentRdStation?.enrollmentIdFieldKey,
          RDSTATION_DEFAULT_ENROLLMENT_ID_FIELD_KEY,
        ),
      };

      return { rdstation: nextSettings };
    }

    throw new BadRequestException('Provedor de integracao nao suportado.');
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

  private async requestRdStation(
    settings: RdStationSettings,
    payload: Record<string, unknown>,
  ): Promise<RdStationRequestResult> {
    const endpoint = this.buildRdStationEndpoint(settings);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        throw new Error('Tempo limite excedido ao enviar requisicao para RD Station.');
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

  private buildRdStationEndpoint(settings: RdStationSettings) {
    const baseUrl = this.normalizeBaseUrl(settings.baseUrl);
    const endpoint = new URL('/platform/conversions', baseUrl);
    endpoint.searchParams.set('api_key', settings.apiKey);
    return endpoint.toString();
  }

  private maskApiKeyInUrl(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.searchParams.has('api_key')) {
        parsed.searchParams.set('api_key', '****');
      }
      return parsed.toString();
    } catch {
      return url;
    }
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

  private normalizeRdCustomFieldKey(
    inputValue: unknown,
    currentValue: string | undefined,
    fallback: string,
  ) {
    const raw =
      String(inputValue || '').trim() ||
      String(currentValue || '').trim() ||
      String(fallback || '').trim();
    const withoutAccents = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const slug = withoutAccents.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    const key = slug.startsWith('cf_') ? slug : `cf_${slug}`;
    return key || fallback;
  }

  private normalizeRdStationRequestBody(
    payload: Record<string, unknown>,
    settings: RdStationSettings,
  ) {
    if (this.isObject(payload.payload)) {
      const rootPayload = { ...payload };
      rootPayload.event_type =
        String(rootPayload.event_type || '').trim() || 'CONVERSION';
      rootPayload.event_family =
        String(rootPayload.event_family || '').trim() || 'CDP';

      const innerPayload = {
        ...(rootPayload.payload as Record<string, unknown>),
      };
      if (!String(innerPayload.conversion_identifier || '').trim()) {
        innerPayload.conversion_identifier = settings.conversionIdentifier;
      }
      if (!String(innerPayload.email || '').trim()) {
        throw new BadRequestException(
          'Payload RD Station precisa informar payload.email.',
        );
      }
      rootPayload.payload = innerPayload;
      return rootPayload;
    }

    const innerPayload: Record<string, unknown> = {
      conversion_identifier: settings.conversionIdentifier,
      ...payload,
    };
    if (!String(innerPayload.email || '').trim()) {
      throw new BadRequestException('Payload RD Station precisa informar email.');
    }
    return {
      event_type: 'CONVERSION',
      event_family: 'CDP',
      payload: innerPayload,
    };
  }

  private async buildRdStationRequestByEnrollmentId(
    enrollmentId: string,
    settings: RdStationSettings,
    expectedInstitutionId?: string,
  ) {
    const enrollment = await this.loadEnrollmentForRdStation(enrollmentId);
    if (!enrollment) {
      throw new NotFoundException('Matricula nao encontrada para envio de teste.');
    }
    if (
      expectedInstitutionId &&
      enrollment.institutionId &&
      enrollment.institutionId !== expectedInstitutionId
    ) {
      throw new BadRequestException(
        'Matricula nao pertence a instituicao informada.',
      );
    }
    return this.buildRdStationRequestBodyFromEnrollment(enrollment, settings);
  }

  private async loadEnrollmentForRdStation(enrollmentId: string) {
    return this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        institutionId: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: {
              select: {
                phone: true,
                birthDate: true,
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
        schoolClass: {
          select: {
            course: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }

  private buildRdStationRequestBodyFromEnrollment(
    enrollment: {
      id: string;
      createdAt: Date;
      student: {
        id: string;
        name: string;
        email: string;
        studentProfile: {
          phone: string | null;
          birthDate: Date | null;
          street: string | null;
          streetNumber: string | null;
          complement: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
        } | null;
      };
      schoolClass: {
        course: {
          name: string;
        };
      };
    },
    settings: RdStationSettings,
  ) {
    const profile = enrollment.student.studentProfile;
    const email = String(enrollment.student.email || '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Aluno sem email valido para envio ao RD Station.');
    }

    const payload: Record<string, unknown> = {
      conversion_identifier: settings.conversionIdentifier,
      email,
    };

    const studentName = String(enrollment.student.name || '').trim();
    if (studentName) payload.name = studentName;

    const phone = this.onlyDigits(profile?.phone);
    if (phone) payload.mobile_phone = phone;

    const city = String(profile?.city || '').trim();
    const state = String(profile?.state || '').trim();
    const country = String(profile?.country || 'Brasil').trim();
    if (city) payload.city = city;
    if (state) payload.state = state;
    if (country) payload.country = country;

    payload[settings.courseFieldKey] = String(
      enrollment.schoolClass?.course?.name || '',
    ).trim();
    payload[settings.enrollmentIdFieldKey] = enrollment.id;

    const age = this.calculateAge(profile?.birthDate);
    if (age !== null) {
      payload[settings.ageFieldKey] = String(age);
    }

    const address = this.buildStudentAddress(profile);
    if (address) {
      payload[settings.addressFieldKey] = address;
    }

    payload.tags = ['matricula_efetivada'];

    const sanitizedPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return true;
      }),
    );

    return {
      event_type: 'CONVERSION',
      event_family: 'CDP',
      payload: sanitizedPayload,
    };
  }

  private buildStudentAddress(
    profile:
      | {
          street: string | null;
          streetNumber: string | null;
          complement: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
        }
      | null
      | undefined,
  ) {
    if (!profile) return '';
    const parts = [
      String(profile.street || '').trim(),
      String(profile.streetNumber || '').trim(),
      String(profile.complement || '').trim(),
      String(profile.neighborhood || '').trim(),
      String(profile.city || '').trim(),
      String(profile.state || '').trim(),
      String(profile.country || '').trim(),
    ].filter(Boolean);
    return parts.join(', ');
  }

  private calculateAge(birthDate: Date | null | undefined) {
    if (!birthDate) return null;
    const parsed = new Date(birthDate);
    if (Number.isNaN(parsed.getTime())) return null;

    const now = new Date();
    let age = now.getFullYear() - parsed.getFullYear();
    const monthDiff = now.getMonth() - parsed.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
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
    if (
      provider === 'rdstation' ||
      provider === 'rd-station' ||
      provider === 'rd_station'
    ) {
      return 'rdstation';
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

