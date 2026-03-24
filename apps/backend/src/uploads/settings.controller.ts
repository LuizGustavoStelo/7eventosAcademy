import { Body, Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { SecretsService } from '../security/secrets/secrets.service';

@Roles('admin', 'superadmin')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  @Get('storage-limit')
  async getStorageLimit() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'STORAGE_LIMIT_GB' },
    });
    
    // Calcula uso atual
    const assets = await this.prisma.uploadAsset.aggregate({
      _sum: { sizeBytes: true }
    });
    
    const usedBytes = assets._sum.sizeBytes || 0;
    const limitGb = parseInt(setting?.value || '10', 10);
    
    return {
      limitGb,
      usedBytes,
      usedGb: usedBytes / (1024 * 1024 * 1024),
    };
  }

  @Roles('superadmin')
  @Post('storage-limit')
  async setStorageLimit(@Body() dto: { limitGb: number }) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'STORAGE_LIMIT_GB' },
      update: { value: dto.limitGb.toString() },
      create: { key: 'STORAGE_LIMIT_GB', value: dto.limitGb.toString() },
    });
    return { success: true };
  }

  @Get('payment-gateway')
  async getPaymentGateway() {
    const provider = await this.prisma.systemSetting.findUnique({
      where: { key: 'PAYMENT_GATEWAY_PROVIDER' },
    });
    const apiKey = await this.prisma.systemSetting.findUnique({
      where: { key: 'PAYMENT_GATEWAY_API_KEY' },
    });
    
    return {
      provider: provider?.value || 'Nenhum',
      isConfigured: !!apiKey?.value,
    };
  }

  @Roles('superadmin')
  @Post('payment-gateway')
  async setPaymentGateway(@Body() dto: { provider: string, apiKey: string }) {
    if (!dto.provider || !dto.apiKey) return { success: false, error: 'Dados inválidos' };

    const encryptedKey = this.secrets.encrypt(dto.apiKey);

    await this.prisma.systemSetting.upsert({
      where: { key: 'PAYMENT_GATEWAY_PROVIDER' },
      update: { value: dto.provider },
      create: { key: 'PAYMENT_GATEWAY_PROVIDER', value: dto.provider },
    });

    await this.prisma.systemSetting.upsert({
      where: { key: 'PAYMENT_GATEWAY_API_KEY' },
      update: { value: encryptedKey },
      create: { key: 'PAYMENT_GATEWAY_API_KEY', value: encryptedKey },
    });

    return { success: true };
  }
}

