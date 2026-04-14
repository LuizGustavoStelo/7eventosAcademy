import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { FinanceModule } from '../finance/finance.module';
import { SuperadminIntegrationsModule } from '../superadmin-integrations/superadmin-integrations.module';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  imports: [ContractsModule, FinanceModule, SuperadminIntegrationsModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
