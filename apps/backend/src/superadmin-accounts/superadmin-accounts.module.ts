import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { SecretsModule } from '../security/secrets/secrets.module';
import { SuperadminAccountsController } from './superadmin-accounts.controller';
import { SuperadminAccountsService } from './superadmin-accounts.service';

@Module({
  imports: [PrismaModule, SecretsModule],
  controllers: [SuperadminAccountsController],
  providers: [SuperadminAccountsService],
  exports: [SuperadminAccountsService],
})
export class SuperadminAccountsModule {}
