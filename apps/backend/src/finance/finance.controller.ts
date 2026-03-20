import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateChargeDto } from './dto/create-charge.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { FinanceService } from './finance.service';

@Roles('admin', 'superadmin')
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('overview')
  async getOverview() {
    return this.financeService.getOverview();
  }

  @Get('charges')
  async findCharges() {
    return this.financeService.findCharges();
  }

  @Post('charges')
  async createCharge(@Body() dto: CreateChargeDto) {
    return this.financeService.createCharge(dto);
  }

  @Patch('charges/:chargeId/status')
  async updateChargeStatus(
    @Param('chargeId') chargeId: string,
    @Body() dto: UpdateChargeStatusDto,
  ) {
    return this.financeService.updateChargeStatus(chargeId, dto);
  }

  @Post('transactions')
  async createTransaction(@Body() dto: CreateTransactionDto) {
    return this.financeService.createTransaction(dto);
  }
}
