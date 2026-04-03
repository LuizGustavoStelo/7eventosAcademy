import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  // Legacy field kept only for backward compatibility with old payloads.
  clientSecret?: string;
  clientId: string;
  tokenUrl: string;
  baseUrls: SicoobBaseUrls;
  sandboxBaseUrls: SicoobBaseUrls;
  // Legacy fields kept only for backward compatibility with old payloads.
  baseUrl?: string;
  sandboxBaseUrl?: string;
  webhookUrl: string;
  numeroCliente: string;
  scopes: string[];
  certificatePem: string;
  privateKeyPem: string;
};

type SicoobBaseUrls = {
  cobrancaBancaria: string;
  cobrancaBancariaPagamentos: string;
  pixPagamentos: string;
  pixRecebimentos: string;
  spbTransferencias: string;
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
const DEFAULT_SICOOB_BASE_URLS: SicoobBaseUrls = {
  cobrancaBancaria: 'https://api.sicoob.com.br/cobranca-bancaria/v3',
  cobrancaBancariaPagamentos: 'https://api.sicoob.com.br/pagamentos/v3',
  pixPagamentos: 'https://api.sicoob.com.br/pix-pagamentos/v2',
  pixRecebimentos: 'https://api.sicoob.com.br/pix/api/v2',
  spbTransferencias: 'https://api.sicoob.com.br/spb/v2',
};
const DEFAULT_SICOOB_SANDBOX_BASE_URLS: SicoobBaseUrls = {
  cobrancaBancaria:
    'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3',
  cobrancaBancariaPagamentos:
    'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria-pagamentos/v3',
  pixPagamentos:
    'https://sandbox.sicoob.com.br/sicoob/sandbox/pix-pagamentos/v2',
  pixRecebimentos: 'https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2',
  spbTransferencias: 'https://sandbox.sicoob.com.br/sicoob/sandbox/spb/v2',
};
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
    const baseUrls = this.resolveSicoobBaseUrls(
      sicoob,
      DEFAULT_SICOOB_BASE_URLS,
      'baseUrl',
    );
    const sandboxBaseUrls = this.resolveSicoobBaseUrls(
      sicoob,
      DEFAULT_SICOOB_SANDBOX_BASE_URLS,
      'sandboxBaseUrl',
    );

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
          baseUrls,
          sandboxBaseUrls,
          webhookUrl: sicoob?.webhookUrl ?? '',
          numeroCliente: sicoob?.numeroCliente ?? '',
          scopes: sicoob?.scopes ?? DEFAULT_SICOOB_SCOPES,
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
      const currentBaseUrls = this.resolveSicoobBaseUrls(
        currentSicoob,
        DEFAULT_SICOOB_BASE_URLS,
        'baseUrl',
      );
      const currentSandboxBaseUrls = this.resolveSicoobBaseUrls(
        currentSicoob,
        DEFAULT_SICOOB_SANDBOX_BASE_URLS,
        'sandboxBaseUrl',
      );
      let certificatePem =
        dto.sicoobCertificatePem?.trim() ||
        currentSicoob?.certificatePem?.trim() ||
        '';
      let privateKeyPem =
        dto.sicoobPrivateKeyPem?.trim() ||
        currentSicoob?.privateKeyPem?.trim() ||
        '';
      const pfxBase64 = dto.sicoobCertificatePfxBase64?.trim() || '';
      if (pfxBase64) {
        const extractedPem = this.extractPemPairFromPfxBase64(
          pfxBase64,
          dto.sicoobCertificatePfxPassphrase ?? '',
        );
        certificatePem = extractedPem.certificatePem;
        privateKeyPem = extractedPem.privateKeyPem;
      }

      const nextSicoob: SicoobSettings = {
        clientId:
          dto.sicoobClientId?.trim() || currentSicoob?.clientId?.trim() || '',
        tokenUrl:
          dto.sicoobTokenUrl?.trim() ||
          currentSicoob?.tokenUrl?.trim() ||
          DEFAULT_SICOOB_TOKEN_URL,
        baseUrls: {
          cobrancaBancaria:
            dto.sicoobBaseUrlCobrancaBancaria?.trim() ||
            currentBaseUrls.cobrancaBancaria,
          cobrancaBancariaPagamentos:
            dto.sicoobBaseUrlCobrancaBancariaPagamentos?.trim() ||
            currentBaseUrls.cobrancaBancariaPagamentos,
          pixPagamentos:
            dto.sicoobBaseUrlPixPagamentos?.trim() ||
            currentBaseUrls.pixPagamentos,
          pixRecebimentos:
            dto.sicoobBaseUrlPixRecebimentos?.trim() ||
            currentBaseUrls.pixRecebimentos,
          spbTransferencias:
            dto.sicoobBaseUrlSpbTransferencias?.trim() ||
            currentBaseUrls.spbTransferencias,
        },
        sandboxBaseUrls: {
          cobrancaBancaria:
            dto.sicoobSandboxBaseUrlCobrancaBancaria?.trim() ||
            currentSandboxBaseUrls.cobrancaBancaria,
          cobrancaBancariaPagamentos:
            dto.sicoobSandboxBaseUrlCobrancaBancariaPagamentos?.trim() ||
            currentSandboxBaseUrls.cobrancaBancariaPagamentos,
          pixPagamentos:
            dto.sicoobSandboxBaseUrlPixPagamentos?.trim() ||
            currentSandboxBaseUrls.pixPagamentos,
          pixRecebimentos:
            dto.sicoobSandboxBaseUrlPixRecebimentos?.trim() ||
            currentSandboxBaseUrls.pixRecebimentos,
          spbTransferencias:
            dto.sicoobSandboxBaseUrlSpbTransferencias?.trim() ||
            currentSandboxBaseUrls.spbTransferencias,
        },
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
        certificatePem,
        privateKeyPem,
      };

      const requiredFieldMap: Array<[keyof SicoobSettings, string]> = [
        ['clientId', 'Client ID'],
        ['tokenUrl', 'URL de token'],
        ['numeroCliente', 'Número do cliente/cedente'],
        ['certificatePem', 'Certificado público (PEM/CRT)'],
        ['privateKeyPem', 'Chave privada (PEM/KEY)'],
      ];

      for (const [field, label] of requiredFieldMap) {
        const value = nextSicoob[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          throw new BadRequestException(
            `Para Sicoob, o campo "${label}" é obrigatório.`,
          );
        }
      }

      const productLabelMap: Array<[keyof SicoobBaseUrls, string]> = [
        ['cobrancaBancaria', 'Cobrança Bancária V3'],
        ['cobrancaBancariaPagamentos', 'Cobrança Bancária Pagamentos'],
        ['pixPagamentos', 'Pix Pagamentos'],
        ['pixRecebimentos', 'Pix Recebimentos'],
        ['spbTransferencias', 'SPB Transferências'],
      ];
      const urlsToValidate =
        environment === 'sandbox'
          ? nextSicoob.sandboxBaseUrls
          : nextSicoob.baseUrls;

      for (const [productKey, productLabel] of productLabelMap) {
        const value = urlsToValidate[productKey];
        if (!value || value.trim() === '') {
          const environmentLabel =
            environment === 'sandbox' ? 'sandbox' : 'produção';
          throw new BadRequestException(
            `Para Sicoob, informe a URL base de ${environmentLabel} para ${productLabel}.`,
          );
        }
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

  private resolveSicoobBaseUrls(
    sicoob: SicoobSettings | undefined,
    defaults: SicoobBaseUrls,
    legacyField: 'baseUrl' | 'sandboxBaseUrl',
  ): SicoobBaseUrls {
    const urls =
      legacyField === 'baseUrl' ? sicoob?.baseUrls : sicoob?.sandboxBaseUrls;
    const legacyValue = sicoob?.[legacyField]?.trim() || '';

    return {
      cobrancaBancaria:
        urls?.cobrancaBancaria?.trim() ||
        legacyValue ||
        defaults.cobrancaBancaria,
      cobrancaBancariaPagamentos:
        urls?.cobrancaBancariaPagamentos?.trim() ||
        defaults.cobrancaBancariaPagamentos,
      pixPagamentos: urls?.pixPagamentos?.trim() || defaults.pixPagamentos,
      pixRecebimentos:
        urls?.pixRecebimentos?.trim() || defaults.pixRecebimentos,
      spbTransferencias:
        urls?.spbTransferencias?.trim() || defaults.spbTransferencias,
    };
  }

  private extractPemPairFromPfxBase64(
    pfxBase64: string,
    passphrase: string,
  ): { certificatePem: string; privateKeyPem: string } {
    const tempDir = mkdtempSync(join(tmpdir(), 'sicoob-pfx-'));
    const pfxPath = join(tempDir, 'certificate.pfx');
    const certPath = join(tempDir, 'certificate.pem');
    const keyPath = join(tempDir, 'private-key.pem');

    try {
      const pfxBuffer = Buffer.from(pfxBase64, 'base64');
      if (!pfxBuffer || pfxBuffer.length === 0) {
        throw new BadRequestException(
          'Arquivo PFX inválido. Verifique o conteúdo enviado.',
        );
      }
      writeFileSync(pfxPath, pfxBuffer);

      const commandEnv = {
        ...process.env,
        SICOOB_PFX_PASS: passphrase,
      };

      execFileSync(
        'openssl',
        [
          'pkcs12',
          '-in',
          pfxPath,
          '-clcerts',
          '-nokeys',
          '-out',
          certPath,
          '-passin',
          'env:SICOOB_PFX_PASS',
        ],
        { stdio: 'pipe', env: commandEnv },
      );

      execFileSync(
        'openssl',
        [
          'pkcs12',
          '-in',
          pfxPath,
          '-nocerts',
          '-nodes',
          '-out',
          keyPath,
          '-passin',
          'env:SICOOB_PFX_PASS',
        ],
        { stdio: 'pipe', env: commandEnv },
      );

      const certContent = readFileSync(certPath, 'utf8');
      const keyContent = readFileSync(keyPath, 'utf8');

      const certificatePem = this.extractPemBlock(
        certContent,
        /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
      );
      const privateKeyPem = this.extractPemBlock(
        keyContent,
        /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/g,
      );

      return { certificatePem, privateKeyPem };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new BadRequestException(
          'OpenSSL não está disponível no servidor para processar PFX. Use os campos manuais (PEM/KEY) ou instale o OpenSSL.',
        );
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Não foi possível extrair certificado e chave privada do PFX. Verifique o arquivo e a senha.',
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private extractPemBlock(content: string, pattern: RegExp): string {
    const match = content.match(pattern);
    if (!match || match.length === 0) {
      throw new BadRequestException(
        'Formato de certificado/chave inválido ao processar o PFX.',
      );
    }
    return match[0].trim();
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

