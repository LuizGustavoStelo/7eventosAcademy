import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { CreateChargeDto } from './dto/create-charge.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { FinanceService } from './finance.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

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

  @Get('gateway-config')
  async getGatewayConfig(@Req() request: AuthenticatedRequest) {
    return this.financeService.getGatewayConfigByUser(request.user.sub);
  }

  @Post('transactions')
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.createTransaction(dto, request.user.sub);
  }
}
