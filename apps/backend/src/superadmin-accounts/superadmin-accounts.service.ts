import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prisma, UploadOwnerType, UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { SecretsService } from '../security/secrets/secrets.service';
import { UploadsService } from '../uploads/uploads.service';
import { UpsertAccountBrandingDto } from './dto/upsert-account-branding.dto';
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
  pixKey?: string;
  boletoModalidade?: number;
  boletoNumeroContaCorrente?: number;
  boletoNumeroContratoCobranca?: number;
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

type InstitutionBrandingPalette = {
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

type InstitutionBrandingConfig = {
  logoUrl: string;
  palette: InstitutionBrandingPalette;
  isCustom: boolean;
  updatedAt: Date | null;
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
const DEFAULT_STUDENT_BRANDING_LOGO_URL = '/Logo-IPESK.png';
const DEFAULT_STUDENT_BRANDING_PALETTE: InstitutionBrandingPalette = {
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
const BRANDING_COLOR_FIELDS: Array<keyof InstitutionBrandingPalette> = [
  'primaryColor',
  'primaryStrongColor',
  'secondaryColor',
  'secondaryStrongColor',
  'backgroundColor',
  'surfaceColor',
  'surfaceSoftColor',
  'borderColor',
  'textColor',
  'mutedColor',
];

@Injectable()
export class SuperadminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly authService: AuthService,
    private readonly uploadsService: UploadsService,
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
          institutionMembers: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: {
              institution: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  brandingLogoUrl: true,
                  brandingPalette: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const accountRows = accounts.map((account) => {
      const config = account.financialConfig;
      const institution = account.institutionMembers[0]?.institution ?? null;
      return {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role.toLowerCase(),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        institution: institution
          ? {
              id: institution.id,
              name: institution.name,
              slug: institution.slug,
            }
          : null,
        branding: this.resolveInstitutionBranding(institution),
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
      throw new NotFoundException('Conta admin/professor nÃ£o encontrada.');
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
          pixKey: sicoob?.pixKey ?? '',
          boletoModalidade: sicoob?.boletoModalidade ?? null,
          boletoNumeroContaCorrente:
            sicoob?.boletoNumeroContaCorrente ?? null,
          boletoNumeroContratoCobranca:
            sicoob?.boletoNumeroContratoCobranca ?? null,
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
      throw new NotFoundException('Conta admin/professor nÃ£o encontrada.');
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

  async getAccountBrandingConfig(userId: string) {
    const account = await this.findAdminAccountWithInstitution(userId);
    const branding = this.resolveInstitutionBranding(account.institution);

    return {
      user: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role.toLowerCase(),
      },
      institution: {
        id: account.institution.id,
        name: account.institution.name,
        slug: account.institution.slug,
      },
      branding,
    };
  }

  async upsertAccountBrandingConfig(
    userId: string,
    dto: UpsertAccountBrandingDto,
  ) {
    const account = await this.findAdminAccountWithInstitution(userId);

    if (dto.resetToDefault) {
      await this.uploadsService.deleteOwnerAssetByKind(
        UploadOwnerType.USER,
        account.id,
        'INSTITUTION_BRANDING_LOGO',
      );

      const savedInstitution = await this.prisma.institution.update({
        where: { id: account.institution.id },
        data: {
          brandingLogoUrl: null,
          brandingPalette: Prisma.DbNull,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          brandingLogoUrl: true,
          brandingPalette: true,
          updatedAt: true,
        },
      });

      return {
        success: true,
        institution: {
          id: savedInstitution.id,
          name: savedInstitution.name,
          slug: savedInstitution.slug,
        },
        branding: this.resolveInstitutionBranding(savedInstitution),
      };
    }

    const nextPalette = this.resolveBrandingPalette(
      account.institution.brandingPalette,
    );
    const paletteFieldMap: Array<
      [keyof InstitutionBrandingPalette, string | undefined, string]
    > = [
      ['primaryColor', dto.primaryColor, 'cor primÃ¡ria'],
      ['primaryStrongColor', dto.primaryStrongColor, 'cor primÃ¡ria forte'],
      ['secondaryColor', dto.secondaryColor, 'cor secundÃ¡ria'],
      ['secondaryStrongColor', dto.secondaryStrongColor, 'cor secundÃ¡ria forte'],
      ['backgroundColor', dto.backgroundColor, 'cor de fundo'],
      ['surfaceColor', dto.surfaceColor, 'cor de superfÃ­cie'],
      ['surfaceSoftColor', dto.surfaceSoftColor, 'cor de superfÃ­cie suave'],
      ['borderColor', dto.borderColor, 'cor de borda'],
      ['textColor', dto.textColor, 'cor de texto'],
      ['mutedColor', dto.mutedColor, 'cor de texto auxiliar'],
    ];

    for (const [field, value, label] of paletteFieldMap) {
      if (value === undefined) {
        continue;
      }
      nextPalette[field] = this.normalizeHexColor(value, label);
    }

    const currentLogoUrl = account.institution.brandingLogoUrl;
    let nextLogoUrl = currentLogoUrl;
    if (dto.logoUrl !== undefined) {
      nextLogoUrl = this.normalizeLogoUrl(dto.logoUrl);
    }

    const shouldPersistPalette = !this.isDefaultBrandingPalette(nextPalette);
    const shouldPersistLogo =
      Boolean(nextLogoUrl) && nextLogoUrl !== DEFAULT_STUDENT_BRANDING_LOGO_URL;

    const savedInstitution = await this.prisma.institution.update({
      where: { id: account.institution.id },
      data: {
        brandingLogoUrl: shouldPersistLogo ? nextLogoUrl : null,
        brandingPalette: shouldPersistPalette
          ? (nextPalette as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        brandingLogoUrl: true,
        brandingPalette: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      institution: {
        id: savedInstitution.id,
        name: savedInstitution.name,
        slug: savedInstitution.slug,
      },
      branding: this.resolveInstitutionBranding(savedInstitution),
    };
  }

  async uploadAccountBrandingLogo(userId: string, file: MultipartFile) {
    const account = await this.findAdminAccountWithInstitution(userId);

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Envie um arquivo de imagem válido.');
    }

    const uploaded = await this.uploadsService.bindFileToOwner({
      ownerType: UploadOwnerType.USER,
      ownerId: account.id,
      kind: 'INSTITUTION_BRANDING_LOGO',
      file,
    });

    const savedInstitution = await this.prisma.institution.update({
      where: { id: account.institution.id },
      data: {
        brandingLogoUrl: uploaded.url,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        brandingLogoUrl: true,
        brandingPalette: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      institution: {
        id: savedInstitution.id,
        name: savedInstitution.name,
        slug: savedInstitution.slug,
      },
      branding: this.resolveInstitutionBranding(savedInstitution),
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

  private async findAdminAccountWithInstitution(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        institutionMembers: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            institution: {
              select: {
                id: true,
                name: true,
                slug: true,
                brandingLogoUrl: true,
                brandingPalette: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundException('Conta admin/professor nÃ£o encontrada.');
    }

    const institution = user.institutionMembers[0]?.institution ?? null;
    if (!institution) {
      throw new NotFoundException(
        'InstituiÃ§Ã£o ativa nÃ£o encontrada para esta conta.',
      );
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      institution,
    };
  }

  private resolveInstitutionBranding(
    institution:
      | {
          brandingLogoUrl: string | null;
          brandingPalette: Prisma.JsonValue | null;
          updatedAt: Date;
        }
      | null
      | undefined,
  ): InstitutionBrandingConfig {
    const palette = this.resolveBrandingPalette(institution?.brandingPalette);
    const logoUrl =
      institution?.brandingLogoUrl?.trim() || DEFAULT_STUDENT_BRANDING_LOGO_URL;
    const hasCustomPalette = !this.isDefaultBrandingPalette(palette);
    const hasCustomLogo =
      Boolean(institution?.brandingLogoUrl) &&
      institution?.brandingLogoUrl !== DEFAULT_STUDENT_BRANDING_LOGO_URL;

    return {
      logoUrl,
      palette,
      isCustom: hasCustomPalette || hasCustomLogo,
      updatedAt: institution?.updatedAt ?? null,
    };
  }

  private resolveBrandingPalette(
    rawPalette?: Prisma.JsonValue | null,
  ): InstitutionBrandingPalette {
    const palette = { ...DEFAULT_STUDENT_BRANDING_PALETTE };
    if (!rawPalette || typeof rawPalette !== 'object' || Array.isArray(rawPalette)) {
      return palette;
    }

    const rawMap = rawPalette as Record<string, unknown>;
    for (const field of BRANDING_COLOR_FIELDS) {
      const value = rawMap[field];
      if (typeof value !== 'string') {
        continue;
      }

      const normalized = value.trim().toLowerCase();
      if (this.isHexColor(normalized)) {
        palette[field] = normalized;
      }
    }

    return palette;
  }

  private isDefaultBrandingPalette(palette: InstitutionBrandingPalette) {
    return BRANDING_COLOR_FIELDS.every(
      (field) =>
        palette[field].toLowerCase() ===
        DEFAULT_STUDENT_BRANDING_PALETTE[field].toLowerCase(),
    );
  }

  private normalizeLogoUrl(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > 2_000_000) {
      throw new BadRequestException(
        'Logo muito grande. Use no máximo 2 MB em texto/base64.',
      );
    }

    return normalized;
  }

  private normalizeHexColor(value: string, label: string): string {
    const normalized = value.trim().toLowerCase();
    if (!this.isHexColor(normalized)) {
      throw new BadRequestException(
        `A ${label} deve estar no formato HEX, por exemplo: #139395.`,
      );
    }
    return normalized;
  }

  private isHexColor(value: string) {
    return /^#([0-9a-fA-F]{6})$/.test(value);
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
        pixKey:
          dto.sicoobPixKey?.trim() || currentSicoob?.pixKey?.trim() || '',
        boletoModalidade: this.parseOptionalPositiveInteger(
          dto.sicoobBoletoModalidade,
          currentSicoob?.boletoModalidade,
        ),
        boletoNumeroContaCorrente: this.parseOptionalPositiveInteger(
          dto.sicoobBoletoNumeroContaCorrente,
          currentSicoob?.boletoNumeroContaCorrente,
        ),
        boletoNumeroContratoCobranca: this.parseOptionalPositiveInteger(
          dto.sicoobBoletoNumeroContratoCobranca,
          currentSicoob?.boletoNumeroContratoCobranca,
        ),
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
        ['numeroCliente', 'NÃºmero do cliente/cedente'],
        ['certificatePem', 'Certificado pÃºblico (PEM/CRT)'],
        ['privateKeyPem', 'Chave privada (PEM/KEY)'],
      ];

      for (const [field, label] of requiredFieldMap) {
        const value = nextSicoob[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          throw new BadRequestException(
            `Para Sicoob, o campo "${label}" Ã© obrigatÃ³rio.`,
          );
        }
      }

      const productLabelMap: Array<[keyof SicoobBaseUrls, string]> = [
        ['cobrancaBancaria', 'CobranÃ§a BancÃ¡ria V3'],
        ['cobrancaBancariaPagamentos', 'CobranÃ§a BancÃ¡ria Pagamentos'],
        ['pixPagamentos', 'Pix Pagamentos'],
        ['pixRecebimentos', 'Pix Recebimentos'],
        ['spbTransferencias', 'SPB TransferÃªncias'],
      ];
      const urlsToValidate =
        environment === 'sandbox'
          ? nextSicoob.sandboxBaseUrls
          : nextSicoob.baseUrls;

      for (const [productKey, productLabel] of productLabelMap) {
        const value = urlsToValidate[productKey];
        if (!value || value.trim() === '') {
          const environmentLabel =
            environment === 'sandbox' ? 'sandbox' : 'produÃ§Ã£o';
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
          'Arquivo PFX invÃ¡lido. Verifique o conteÃºdo enviado.',
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
          'OpenSSL nÃ£o estÃ¡ disponÃ­vel no servidor para processar PFX. Use os campos manuais (PEM/KEY) ou instale o OpenSSL.',
        );
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'NÃ£o foi possÃ­vel extrair certificado e chave privada do PFX. Verifique o arquivo e a senha.',
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private extractPemBlock(content: string, pattern: RegExp): string {
    const match = content.match(pattern);
    if (!match || match.length === 0) {
      throw new BadRequestException(
        'Formato de certificado/chave invÃ¡lido ao processar o PFX.',
      );
    }
    return match[0].trim();
  }

  private parseOptionalPositiveInteger(
    value: string | number | null | undefined,
    fallback?: number,
  ): number | undefined {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    const raw = String(value ?? '').trim();
    if (!raw) return fallback;

    const digits = raw.replace(/\D/g, '');
    const parsed = Number(digits || raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private normalizeProvider(provider: string): FinancialProvider {
    const normalized = provider.trim().toLowerCase() as FinancialProvider;
    if (
      normalized !== 'manual' &&
      normalized !== 'sicoob' &&
      normalized !== 'asaas' &&
      normalized !== 'stripe'
    ) {
      throw new BadRequestException('Provedor financeiro invÃ¡lido.');
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

