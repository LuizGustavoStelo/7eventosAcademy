import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

import { SettingsController } from './settings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UploadsController, SettingsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
