import {
  Body,
  Controller,
  Delete,
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
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { SendCreditCardPaymentLinkDto } from './dto/send-credit-card-payment-link.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { UpdateVoucherStatusDto } from './dto/update-voucher-status.dto';
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

  @RequirePermissions('finance.read')
  @Get('credit-card-requests')
  async listCreditCardRequests(@Req() request: AuthenticatedRequest) {
    return this.financeService.listCreditCardPaymentRequests(request.user);
  }

  @RequirePermissions('finance.read')
  @Get('credit-card-requests/history')
  async listCreditCardRequestHistory(@Req() request: AuthenticatedRequest) {
    return this.financeService.listCreditCardPaymentRequestHistory(request.user);
  }

  @RequirePermissions('finance.write')
  @Patch('credit-card-requests/:requestId/link')
  async sendCreditCardPaymentLink(
    @Param('requestId') requestId: string,
    @Body() dto: SendCreditCardPaymentLinkDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.sendCreditCardPaymentLink(
      requestId,
      dto,
      request.user,
    );
  }

  @RequirePermissions('finance.write')
  @Patch('credit-card-requests/:requestId/approve')
  async approveCreditCardPaymentRequest(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.approveCreditCardPaymentRequest(
      requestId,
      request.user,
    );
  }

  @RequirePermissions('finance.write')
  @Patch('credit-card-requests/:requestId/cancel')
  async cancelCreditCardPaymentRequest(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.cancelCreditCardPaymentRequest(
      requestId,
      request.user,
    );
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

  @RequirePermissions('finance.read')
  @Get('voucher-courses')
  async getVoucherCourses(@Req() request: AuthenticatedRequest) {
    return this.financeService.listVoucherCourses(request.user);
  }

  @RequirePermissions('finance.read')
  @Get('vouchers')
  async listVouchers(@Req() request: AuthenticatedRequest) {
    return this.financeService.listVouchers(request.user);
  }

  @RequirePermissions('finance.write')
  @Post('vouchers')
  async createVoucher(
    @Body() dto: CreateVoucherDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.createVoucher(dto, request.user);
  }

  @RequirePermissions('finance.write')
  @Patch('vouchers/:voucherId/status')
  async updateVoucherStatus(
    @Param('voucherId') voucherId: string,
    @Body() dto: UpdateVoucherStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.updateVoucherStatus(voucherId, dto, request.user);
  }

  @RequirePermissions('finance.write')
  @Delete('vouchers/:voucherId')
  async deleteVoucher(
    @Param('voucherId') voucherId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.deleteVoucher(voucherId, request.user);
  }
}
