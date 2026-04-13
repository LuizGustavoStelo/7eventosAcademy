import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SuperadminIntegrationsModule } from '../superadmin-integrations/superadmin-integrations.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [MailModule, SuperadminIntegrationsModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
