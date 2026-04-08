import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateImpersonationSessionDto } from './dto/create-impersonation-session.dto';
import { UpsertAccountBrandingDto } from './dto/upsert-account-branding.dto';
import { UpsertAccountFinancialConfigDto } from './dto/upsert-account-financial-config.dto';
import { SuperadminAccountsService } from './superadmin-accounts.service';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    sub: string;
  };
  file: () => Promise<MultipartFile | undefined>;
};

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

  @Get(':userId/branding')
  async getAccountBrandingConfig(@Param('userId') userId: string) {
    return this.superadminAccountsService.getAccountBrandingConfig(userId);
  }

  @Put(':userId/branding')
  async upsertAccountBrandingConfig(
    @Param('userId') userId: string,
    @Body() dto: UpsertAccountBrandingDto,
  ) {
    return this.superadminAccountsService.upsertAccountBrandingConfig(
      userId,
      dto,
    );
  }

  @Post(':userId/branding/logo')
  async uploadAccountBrandingLogo(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
  ) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException(
        'Envie um arquivo de imagem no campo logo.',
      );
    }

    return this.superadminAccountsService.uploadAccountBrandingLogo(
      userId,
      file,
    );
  }

  @Post(':userId/impersonation-token')
  async createImpersonationToken(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() dto: CreateImpersonationSessionDto,
  ) {
    return this.superadminAccountsService.createImpersonationSession(
      request.user.sub,
      userId,
      dto,
    );
  }
}
