import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { CheckUpdatesDto } from './dto/check-updates.dto';
import { CreateLicenseAdminDto } from './dto/create-license-admin.dto';
import { CreateReleaseAdminDto } from './dto/create-release-admin.dto';
import { ValidateLicenseDto } from './dto/validate-license.dto';

@Injectable()
export class WordpressIntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  health() {
    return {
      status: 'ok',
      service: '7academy-wordpress-integration',
      timestamp: new Date().toISOString(),
    };
  }

  async activateLicense(dto: ActivateLicenseDto) {
    const normalizedKey = this.normalizeLicenseKey(dto.licenseKey);
    const keyHash = this.hashLicenseKey(normalizedKey);
    const normalizedDomain = this.normalizeHost(dto.domain);
    const normalizedSiteHost = this.normalizeHost(dto.siteUrl);

    if (!normalizedDomain || !normalizedSiteHost) {
      throw new ForbiddenException('Dominio ou URL do site invalidos.');
    }

    if (normalizedSiteHost !== normalizedDomain) {
      throw new ForbiddenException('Site URL nao corresponde ao dominio informado.');
    }

    const license = await this.prisma.wordpressPluginLicense.findUnique({
      where: { keyHash },
      include: {
        activations: {
          where: { revokedAt: null },
        },
      },
    });

    if (!license || !license.isActive) {
      throw new UnauthorizedException('Licença inválida ou inativa.');
    }

    const existingActivation = license.activations.find(
      (activation) => activation.domain === normalizedDomain,
    );

    if (
      !existingActivation &&
      license.activations.length >= license.maxActivations
    ) {
      throw new ForbiddenException(
        'Limite de ativações atingido para esta licença.',
      );
    }

    const activationToken = this.generateActivationToken();
    const siteUrl = dto.siteUrl?.trim() || null;

    await this.prisma.wordpressPluginActivation.upsert({
      where: {
        licenseId_domain: {
          licenseId: license.id,
          domain: normalizedDomain,
        },
      },
      create: {
        licenseId: license.id,
        domain: normalizedDomain,
        siteUrl,
        activationToken,
        lastValidatedAt: new Date(),
      },
      update: {
        siteUrl,
        activationToken,
        revokedAt: null,
        lastValidatedAt: new Date(),
      },
    });

    return {
      valid: true,
      activationToken,
      license: {
        label: license.label ?? null,
        maxActivations: license.maxActivations,
      },
      domain: normalizedDomain,
    };
  }

  async validateLicense(dto: ValidateLicenseDto) {
    const normalizedDomain = this.normalizeHost(dto.domain);
    const normalizedSiteHost = this.normalizeHost(dto.siteUrl);

    if (!normalizedDomain || !normalizedSiteHost) {
      return {
        valid: false,
        reason: 'invalid_or_revoked',
      };
    }

    const activation = await this.prisma.wordpressPluginActivation.findUnique({
      where: { activationToken: dto.activationToken.trim() },
      include: { license: true },
    });

    if (
      !activation ||
      activation.revokedAt ||
      !activation.license.isActive ||
      activation.domain !== normalizedDomain ||
      normalizedSiteHost !== normalizedDomain ||
      this.normalizeHost(activation.siteUrl ?? undefined) !== normalizedDomain
    ) {
      return {
        valid: false,
        reason: 'invalid_or_revoked',
      };
    }

    await this.prisma.wordpressPluginActivation.update({
      where: { id: activation.id },
      data: {
        siteUrl: dto.siteUrl?.trim() || activation.siteUrl,
        lastValidatedAt: new Date(),
      },
    });

    return {
      valid: true,
      domain: activation.domain,
      license: {
        label: activation.license.label ?? null,
      },
    };
  }

  async checkUpdates(dto: CheckUpdatesDto) {
    const validation = await this.validateLicense({
      activationToken: dto.activationToken,
      domain: dto.domain,
      siteUrl: dto.siteUrl,
    });

    if (!validation.valid) {
      // Lógica de Recuperação Legada:
      // Versões anteriores a 1.0.17 tinham um bug que podia apagar o token de ativação.
      // Se o plugin for antigo, permitimos o check de update se o domínio tiver uma licença ativa no banco,
      // mesmo que o token enviado seja inválido/vazio. Isso permite o auto-update para versões fixadas.
      const isLegacyVersion = this.compareVersions('1.0.17', dto.pluginVersion);

      if (isLegacyVersion) {
        const normalizedDomain = this.normalizeHost(dto.domain);
        const hasValidLicenseForDomain =
          await this.prisma.wordpressPluginLicense.findFirst({
            where: {
              isActive: true,
              activations: {
                some: {
                  domain: normalizedDomain ?? '',
                  revokedAt: null,
                },
              },
            },
          });

        if (!hasValidLicenseForDomain) {
          throw new UnauthorizedException('Licença inválida para atualização.');
        }
        // Se encontramos uma licença válida para o domínio, permitimos continuar o check
      } else {
        throw new UnauthorizedException('Licença inválida para atualização.');
      }
    }

    const latestRelease = await this.prisma.wordpressPluginRelease.findFirst({
      where: { isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latestRelease) {
      throw new NotFoundException('Nenhuma release publicada para o plugin.');
    }

    const hasUpdate = this.compareVersions(
      latestRelease.version,
      dto.pluginVersion,
    );

    return {
      updateAvailable: hasUpdate,
      currentVersion: dto.pluginVersion,
      latestVersion: latestRelease.version,
      mandatory: latestRelease.isMandatory,
      packageUrl: hasUpdate ? latestRelease.packageUrl : null,
      checksumSha256: hasUpdate ? latestRelease.checksumSha256 : null,
      changelogUrl: hasUpdate ? latestRelease.changelogUrl : null,
      requiresWordpress: hasUpdate ? latestRelease.minWpVersion : null,
      requiresPhp: hasUpdate ? latestRelease.minPhpVersion : null,
      publishedAt: latestRelease.publishedAt,
    };
  }

  async listLicenses() {
    const licenses = await this.prisma.wordpressPluginLicense.findMany({
      include: {
        activations: {
          where: { revokedAt: null },
          select: { domain: true, createdAt: true, lastValidatedAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return licenses.map((license) => ({
      id: license.id,
      label: license.label,
      isActive: license.isActive,
      maxActivations: license.maxActivations,
      activations: license.activations,
      expiresAt: license.expiresAt,
      createdAt: license.createdAt,
      updatedAt: license.updatedAt,
    }));
  }

  async createOrUpdateLicense(dto: CreateLicenseAdminDto) {
    const normalizedKey = this.normalizeLicenseKey(dto.licenseKey);
    const keyHash = this.hashLicenseKey(normalizedKey);
    const maxActivations = dto.maxActivations ?? 1;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    const license = await this.prisma.wordpressPluginLicense.upsert({
      where: { keyHash },
      create: {
        keyHash,
        label: dto.label?.trim() || null,
        maxActivations,
        isActive: dto.isActive ?? true,
        expiresAt,
      },
      update: {
        label: dto.label?.trim() || null,
        maxActivations,
        isActive: dto.isActive ?? true,
        expiresAt,
      },
    });

    return {
      id: license.id,
      label: license.label,
      isActive: license.isActive,
      maxActivations: license.maxActivations,
      expiresAt: license.expiresAt,
      keyPreview: this.maskLicenseKey(normalizedKey),
      createdAt: license.createdAt,
      updatedAt: license.updatedAt,
    };
  }

  async deleteLicense(id: string) {
    const license = await this.prisma.wordpressPluginLicense.findUnique({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException('Licença não encontrada.');
    }

    // onDelete: Cascade apaga as ativações automaticamente
    await this.prisma.wordpressPluginLicense.delete({ where: { id } });

    return {
      success: true,
      message: 'Licença apagada permanentemente.',
    };
  }

  async renewLicense(id: string, dto: CreateLicenseAdminDto) {
    const license = await this.prisma.wordpressPluginLicense.findUnique({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException('Licença não encontrada.');
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    const updated = await this.prisma.wordpressPluginLicense.update({
      where: { id },
      data: {
        isActive: true,
        expiresAt,
        maxActivations: dto.maxActivations ?? license.maxActivations,
      },
    });

    // Restaura ativações anteriores removendo a revogação
    await this.prisma.wordpressPluginActivation.updateMany({
      where: { licenseId: id },
      data: { revokedAt: null },
    });

    return {
      id: updated.id,
      label: updated.label,
      isActive: updated.isActive,
      maxActivations: updated.maxActivations,
      expiresAt: updated.expiresAt,
      message: 'Licença renovada com sucesso.',
    };
  }

  async listReleases() {
    return this.prisma.wordpressPluginRelease.findMany({
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createOrUpdateRelease(dto: CreateReleaseAdminDto) {
    const normalizedVersion = dto.version.trim().replace(/^v/i, '');
    const now = new Date();

    return this.prisma.wordpressPluginRelease.upsert({
      where: { version: normalizedVersion },
      create: {
        version: normalizedVersion,
        packageUrl: dto.packageUrl.trim(),
        checksumSha256: dto.checksumSha256?.trim() || null,
        changelogUrl: dto.changelogUrl?.trim() || null,
        minWpVersion: dto.minWpVersion?.trim() || null,
        minPhpVersion: dto.minPhpVersion?.trim() || null,
        isPublished: dto.isPublished,
        isMandatory: dto.isMandatory ?? false,
        publishedAt: dto.isPublished ? now : null,
      },
      update: {
        packageUrl: dto.packageUrl.trim(),
        checksumSha256: dto.checksumSha256?.trim() || null,
        changelogUrl: dto.changelogUrl?.trim() || null,
        minWpVersion: dto.minWpVersion?.trim() || null,
        minPhpVersion: dto.minPhpVersion?.trim() || null,
        isPublished: dto.isPublished,
        isMandatory: dto.isMandatory ?? false,
        publishedAt: dto.isPublished ? now : null,
      },
    });
  }

  private normalizeLicenseKey(value: string): string {
    return value.trim().toUpperCase();
  }

  private hashLicenseKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private normalizeHost(value?: string): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    try {
      const parsed = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`);

      return parsed.hostname.trim().toLowerCase().replace(/^www\./, '');
    } catch {
      return trimmed.toLowerCase().replace(/^www\./, '');
    }
  }

  private generateActivationToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private maskLicenseKey(value: string): string {
    if (value.length <= 8) {
      return '********';
    }

    return `${value.slice(0, 4)}****${value.slice(-4)}`;
  }

  private compareVersions(target: string, current: string): boolean {
    const normalize = (version: string): number[] =>
      version
        .trim()
        .replace(/^v/i, '')
        .split('.')
        .map((part) => Number.parseInt(part, 10) || 0);

    const targetParts = normalize(target);
    const currentParts = normalize(current);
    const maxLength = Math.max(targetParts.length, currentParts.length);

    for (let index = 0; index < maxLength; index += 1) {
      const targetValue = targetParts[index] ?? 0;
      const currentValue = currentParts[index] ?? 0;

      if (targetValue > currentValue) {
        return true;
      }

      if (targetValue < currentValue) {
        return false;
      }
    }

    return false;
  }
}
