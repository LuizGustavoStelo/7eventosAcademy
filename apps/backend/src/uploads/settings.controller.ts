import { Body, Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('admin', 'superadmin')
@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

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
}
