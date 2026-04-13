import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { SecretsModule } from '../security/secrets/secrets.module';
import { SuperadminIntegrationsController } from './superadmin-integrations.controller';
import { SuperadminIntegrationsService } from './superadmin-integrations.service';

@Module({
  imports: [PrismaModule, SecretsModule],
  controllers: [SuperadminIntegrationsController],
  providers: [SuperadminIntegrationsService],
  exports: [SuperadminIntegrationsService],
})
export class SuperadminIntegrationsModule {}
