import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpsertAccountFinancialConfigDto } from './dto/upsert-account-financial-config.dto';
import { SuperadminAccountsService } from './superadmin-accounts.service';

@Roles('superadmin')
@Controller('superadmin/accounts')
export class SuperadminAccountsController {
  constructor(
    private readonly superadminAccountsService: SuperadminAccountsService,
  ) {}

  @Get()
  async getAccountsDashboard() {
    return this.superadminAccountsService.getAccountsDashboard();
  }

  @Get(':userId/financial')
  async getAccountFinancialConfig(@Param('userId') userId: string) {
    return this.superadminAccountsService.getAccountFinancialConfig(userId);
  }

  @Put(':userId/financial')
  async upsertAccountFinancialConfig(
    @Param('userId') userId: string,
    @Body() dto: UpsertAccountFinancialConfigDto,
  ) {
    return this.superadminAccountsService.upsertAccountFinancialConfig(
      userId,
      dto,
    );
  }
}
