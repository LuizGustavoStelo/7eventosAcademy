import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { SecretsService } from '../security/secrets/secrets.service';
import {
  FinancialProvider,
  UpsertAccountFinancialConfigDto,
} from './dto/upsert-account-financial-config.dto';
import { CreateImpersonationSessionDto } from './dto/create-impersonation-session.dto';

type SicoobSettings = {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  baseUrl: string;
  sandboxBaseUrl: string;
  webhookUrl: string;
  numeroCliente: string;
  scopes: string[];
  certificatePem: string;
  privateKeyPem: string;
};

type GenericSettings = {
  apiKey: string;
};

type FinancialSettings = {
  sicoob?: SicoobSettings;
  generic?: GenericSettings;
};

const DEFAULT_SICOOB_TOKEN_URL =
  'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';
const DEFAULT_SICOOB_BASE_URL =
  'https://api.sicoob.com.br/cobranca-bancaria/v3';
const DEFAULT_SICOOB_SANDBOX_BASE_URL =
  'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3';
const DEFAULT_SICOOB_SCOPES = [
  'boletos_inclusao',
  'boletos_consulta',
  'boletos_alteracao',
];

@Injectable()
export class SuperadminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly authService: AuthService,
  ) {}

  async getAccountsDashboard() {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      totalAccounts,
      activeLearners,
      activeCourses,
      mrrRevenueAgg,
      accounts,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      }),
      this.prisma.user.count({
        where: { role: UserRole.USER },
      }),
      this.prisma.course.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: {
          status: 'SUCCESS',
          paidAt: {
            gte: periodStart,
            lt: periodEnd,
          },
        },
      }),
      this.prisma.user.findMany({
        where: { role: UserRole.ADMIN },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          financialConfig: {
            select: {
              provider: true,
              environment: true,
              isActive: true,
              encryptedSettings: true,
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    const accountRows = accounts.map((account) => {
      const config = account.financialConfig;
      return {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role.toLowerCase(),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        finance: {
          provider: (config?.provider ?? 'manual').toLowerCase(),
          environment: (config?.environment ?? 'sandbox').toLowerCase(),
          isActive: Boolean(config?.isActive),
          isConfigured: Boolean(config?.encryptedSettings),
          updatedAt: config?.updatedAt ?? null,
        },
      };
    });

    const configuredFinanceAccounts = accountRows.filter(
      (account) => account.finance.isConfigured && account.finance.isActive,
    ).length;

    return {
      overview: {
        totalAccounts,
        activeLearners,
        activeCourses,
        revenueMrr: Number(mrrRevenueAgg._sum.amount ?? 0),
        configuredFinanceAccounts,
      },
      accounts: accountRows,
    };
  }

  async getAccountFinancialConfig(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundException('Conta admin/professor não encontrada.');
    }

    const config = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId },
    });

    const settings = this.decryptSettings(config?.encryptedSettings);
    const sicoob = settings.sicoob;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
      },
      finance: {
        provider: (config?.provider ?? 'manual').toLowerCase(),
        environment: (config?.environment ?? 'sandbox').toLowerCase(),
        isActive: config?.isActive ?? false,
        isConfigured: Boolean(config?.encryptedSettings),
        updatedAt: config?.updatedAt ?? null,
        sicoob: {
          clientId: sicoob?.clientId ?? '',
          tokenUrl: sicoob?.tokenUrl ?? DEFAULT_SICOOB_TOKEN_URL,
          baseUrl: sicoob?.baseUrl ?? DEFAULT_SICOOB_BASE_URL,
          sandboxBaseUrl:
            sicoob?.sandboxBaseUrl ?? DEFAULT_SICOOB_SANDBOX_BASE_URL,
          webhookUrl: sicoob?.webhookUrl ?? '',
          numeroCliente: sicoob?.numeroCliente ?? '',
          scopes: sicoob?.scopes ?? DEFAULT_SICOOB_SCOPES,
          clientSecretConfigured: Boolean(sicoob?.clientSecret),
          certificateConfigured: Boolean(sicoob?.certificatePem),
          privateKeyConfigured: Boolean(sicoob?.privateKeyPem),
        },
      },
    };
  }

  async upsertAccountFinancialConfig(
    userId: string,
    dto: UpsertAccountFinancialConfigDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundException('Conta admin/professor não encontrada.');
    }

    const existing = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    const provider = this.normalizeProvider(dto.provider);
    const environment =
      dto.environment?.trim().toLowerCase() ||
      existing?.environment?.toLowerCase() ||
      'sandbox';
    const isActive =
      typeof dto.isActive === 'boolean'
        ? dto.isActive
        : (existing?.isActive ?? false);

    const currentSettings = this.decryptSettings(existing?.encryptedSettings);
    const nextSettings = this.buildSettings(
      provider,
      environment,
      dto,
      currentSettings,
    );

    const encryptedSettings = nextSettings
      ? this.secrets.encrypt(JSON.stringify(nextSettings))
      : null;

    const saved = await this.prisma.accountFinancialConfig.upsert({
      where: { userId },
      update: {
        provider,
        environment,
        isActive,
        encryptedSettings,
      },
      create: {
        userId,
        provider,
        environment,
        isActive,
        encryptedSettings,
      },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      finance: {
        provider: saved.provider.toLowerCase(),
        environment: saved.environment.toLowerCase(),
        isActive: saved.isActive,
        updatedAt: saved.updatedAt,
      },
    };
  }

  async createImpersonationSession(
    superadminUserId: string,
    targetUserId: string,
    dto: CreateImpersonationSessionDto,
  ) {
    return this.authService.createImpersonatedAuthPayload({
      actorUserId: superadminUserId,
      targetUserId,
      reason: dto.reason,
      durationMinutes: dto.durationMinutes,
    });
  }

  private buildSettings(
    provider: FinancialProvider,
    environment: string,
    dto: UpsertAccountFinancialConfigDto,
    current: FinancialSettings,
  ): FinancialSettings | null {
    if (provider === 'manual') {
      return null;
    }

    if (provider === 'sicoob') {
      const currentSicoob = current.sicoob;
      const nextSicoob: SicoobSettings = {
        clientId:
          dto.sicoobClientId?.trim() || currentSicoob?.clientId?.trim() || '',
        clientSecret:
          dto.sicoobClientSecret?.trim() ||
          currentSicoob?.clientSecret?.trim() ||
          '',
        tokenUrl:
          dto.sicoobTokenUrl?.trim() ||
          currentSicoob?.tokenUrl?.trim() ||
          DEFAULT_SICOOB_TOKEN_URL,
        baseUrl:
          dto.sicoobBaseUrl?.trim() ||
          currentSicoob?.baseUrl?.trim() ||
          DEFAULT_SICOOB_BASE_URL,
        sandboxBaseUrl:
          dto.sicoobSandboxBaseUrl?.trim() ||
          currentSicoob?.sandboxBaseUrl?.trim() ||
          DEFAULT_SICOOB_SANDBOX_BASE_URL,
        webhookUrl:
          dto.sicoobWebhookUrl?.trim() ||
          currentSicoob?.webhookUrl?.trim() ||
          '',
        numeroCliente:
          dto.sicoobNumeroCliente?.trim() ||
          currentSicoob?.numeroCliente?.trim() ||
          '',
        scopes: this.normalizeScopes(
          dto.sicoobScopes ??
            currentSicoob?.scopes ??
            DEFAULT_SICOOB_SCOPES.slice(),
        ),
        certificatePem:
          dto.sicoobCertificatePem?.trim() ||
          currentSicoob?.certificatePem?.trim() ||
          '',
        privateKeyPem:
          dto.sicoobPrivateKeyPem?.trim() ||
          currentSicoob?.privateKeyPem?.trim() ||
          '',
      };

      const requiredFieldMap: Array<[string, string]> = [
        ['clientId', 'Client ID'],
        ['clientSecret', 'Client Secret'],
        ['tokenUrl', 'URL de token'],
        ['numeroCliente', 'Número do cliente/cedente'],
        ['certificatePem', 'Certificado público (PEM/CRT)'],
        ['privateKeyPem', 'Chave privada (PEM/KEY)'],
      ];

      for (const [field, label] of requiredFieldMap) {
        const value = nextSicoob[field as keyof SicoobSettings];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          throw new BadRequestException(
            `Para Sicoob, o campo "${label}" é obrigatório.`,
          );
        }
      }

      if (environment === 'sandbox' && !nextSicoob.sandboxBaseUrl) {
        throw new BadRequestException(
          'Informe a URL base de sandbox da Sicoob.',
        );
      }

      if (environment === 'production' && !nextSicoob.baseUrl) {
        throw new BadRequestException(
          'Informe a URL base de produção da Sicoob.',
        );
      }

      return { sicoob: nextSicoob };
    }

    const currentGeneric = current.generic;
    const apiKey = dto.genericApiKey?.trim() || currentGeneric?.apiKey || '';
    if (!apiKey) {
      throw new BadRequestException(
        `Para o provedor "${provider}", informe a API key.`,
      );
    }

    return {
      generic: {
        apiKey,
      },
    };
  }

  private normalizeProvider(provider: string): FinancialProvider {
    const normalized = provider.trim().toLowerCase() as FinancialProvider;
    if (
      normalized !== 'manual' &&
      normalized !== 'sicoob' &&
      normalized !== 'asaas' &&
      normalized !== 'stripe'
    ) {
      throw new BadRequestException('Provedor financeiro inválido.');
    }
    return normalized;
  }

  private normalizeScopes(scopes: string[]) {
    const normalized = scopes
      .map((scope) => scope.trim())
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);

    return normalized.length > 0 ? normalized : DEFAULT_SICOOB_SCOPES.slice();
  }

  private decryptSettings(payload?: string | null): FinancialSettings {
    if (!payload) {
      return {};
    }

    try {
      const decrypted = this.secrets.decrypt(payload);
      return JSON.parse(decrypted) as FinancialSettings;
    } catch {
      return {};
    }
  }
}
