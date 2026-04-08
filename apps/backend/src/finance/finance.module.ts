import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [ContractsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
