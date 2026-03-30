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
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { CreateChargeDto } from './dto/create-charge.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { FinanceService } from './finance.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @RequirePermissions('finance.read')
  @Get('overview')
  async getOverview(@Req() request: AuthenticatedRequest) {
    return this.financeService.getOverview(request.user);
  }

  @RequirePermissions('finance.read')
  @Get('dashboard-summary')
  async getDashboardSummary(@Req() request: AuthenticatedRequest) {
    return this.financeService.getDashboardSummary(request.user);
  }

  @RequirePermissions('finance.read')
  @Get('charges')
  async findCharges(@Req() request: AuthenticatedRequest) {
    return this.financeService.findCharges(request.user);
  }

  @RequirePermissions('finance.write')
  @Post('charges')
  async createCharge(
    @Body() dto: CreateChargeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.createCharge(dto, request.user);
  }

  @RequirePermissions('finance.write')
  @Patch('charges/:chargeId/status')
  async updateChargeStatus(
    @Param('chargeId') chargeId: string,
    @Body() dto: UpdateChargeStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.updateChargeStatus(chargeId, dto, request.user);
  }

  @RequirePermissions('finance.read')
  @Get('gateway-config')
  async getGatewayConfig(@Req() request: AuthenticatedRequest) {
    return this.financeService.getGatewayConfigByUser(request.user.sub);
  }

  @RequirePermissions('finance.write')
  @Post('transactions')
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.createTransaction(dto, request.user);
  }
}
