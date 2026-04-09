import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { ContractsService } from './contracts.service';
import { CreateContractTemplateDto } from './dto/create-contract-template.dto';
import { PublishContractTemplateDto } from './dto/publish-contract-template.dto';
import { RequestContractPinDto } from './dto/request-contract-pin.dto';
import { SendContractInstanceDto } from './dto/send-contract-instance.dto';
import { SignContractInstanceDto } from './dto/sign-contract-instance.dto';
import { SignInstitutionTemplateDto } from './dto/sign-institution-template.dto';
import { UpdateContractTemplateDto } from './dto/update-contract-template.dto';
import { VerifyContractPinDto } from './dto/verify-contract-pin.dto';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly configService: ConfigService,
  ) {}

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.read')
  @Get('templates')
  async listTemplates(@Req() request: AuthenticatedRequest) {
    return this.contractsService.listTemplates(request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.templates.write')
  @Post('templates')
  async createTemplate(
    @Body() dto: CreateContractTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.createTemplate(dto, request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.templates.write')
  @Patch('templates/:templateId')
  async updateTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateContractTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.updateTemplate(templateId, dto, request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.templates.write')
  @Post('templates/:templateId/publish')
  async publishTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: PublishContractTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.publishTemplate(templateId, dto, request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.templates.write')
  @Post('templates/:templateId/sign-institution')
  async signInstitutionTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: SignInstitutionTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.signInstitutionTemplate(
      templateId,
      request.user,
      dto,
    );
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.templates.write')
  @Delete('templates/:templateId')
  async deleteTemplate(
    @Param('templateId') templateId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.deleteTemplate(templateId, request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.read')
  @Get('instances')
  async listInstances(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.contractsService.listInstances(request.user, {
      status,
      studentId,
      templateId,
    });
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.read')
  @Get('instances/:instanceId')
  async getInstanceDetails(
    @Param('instanceId') instanceId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.getInstanceDetails(instanceId, request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.send')
  @Post('instances/send')
  async sendInstance(
    @Body() dto: SendContractInstanceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.sendInstance(dto, request.user, {
      publicOrigin: this.resolvePublicOrigin(request),
    });
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.send')
  @Delete('instances/:instanceId')
  async deleteInstance(
    @Param('instanceId') instanceId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.deleteInstance(instanceId, request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.send')
  @Post('instances/:instanceId/sign-institution')
  async signInstitutionInstance(
    @Param('instanceId') instanceId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.signInstitutionInstance(instanceId, request.user);
  }

  @Public()
  @Get('sign/:token')
  async openSigningLink(
    @Param('token') token: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const resolved = await this.contractsService.resolveSigningToken(token);
    const redirectBase = this.configService
      .get<string>('CONTRACT_SIGNING_REDIRECT_URL')
      ?.trim();

    if (redirectBase) {
      const normalizedBase = redirectBase.endsWith('/')
        ? redirectBase.slice(0, -1)
        : redirectBase;
      const separator = normalizedBase.includes('?') ? '&' : '?';
      const redirectUrl = `${normalizedBase}${separator}contractId=${encodeURIComponent(resolved.instanceId)}#tab=st-student-contracts`;
      reply.redirect(redirectUrl, 302);
      return;
    }

    const fallbackUrl = `/?contractId=${encodeURIComponent(
      resolved.instanceId,
    )}#tab=st-student-contracts`;
    reply.redirect(fallbackUrl, 302);
  }

  @Roles('user', 'admin', 'superadmin')
  @Get('my')
  async listMyInstances(@Req() request: AuthenticatedRequest) {
    return this.contractsService.listMyInstances(request.user);
  }

  @Roles('user', 'admin', 'superadmin')
  @Get('my/:instanceId')
  async getMyInstanceById(
    @Param('instanceId') instanceId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.getMyInstanceById(instanceId, request.user);
  }

  @Roles('admin', 'superadmin')
  @RequirePermissions('contracts.download')
  @Get('instances/:instanceId/download')
  async downloadInstance(
    @Param('instanceId') instanceId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const payload = await this.contractsService.getInstanceDownload(
      instanceId,
      request.user,
    );
    const safeCode = String(payload.signatureCode || 'contrato').replace(
      /[^a-zA-Z0-9_-]/g,
      '',
    );
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="contrato-${safeCode}.html"`,
    );
    return payload.htmlContent;
  }

  @Roles('user', 'admin', 'superadmin')
  @Get('my/:instanceId/download')
  async downloadMyInstance(
    @Param('instanceId') instanceId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const payload = await this.contractsService.getMyInstanceDownload(
      instanceId,
      request.user,
    );
    const safeCode = String(payload.signatureCode || 'contrato').replace(
      /[^a-zA-Z0-9_-]/g,
      '',
    );
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="contrato-${safeCode}.html"`,
    );
    return payload.htmlContent;
  }

  @Roles('user', 'admin', 'superadmin')
  @Post('my/:instanceId/request-pin')
  async requestMyPin(
    @Param('instanceId') instanceId: string,
    @Body() dto: RequestContractPinDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.requestMyPin(instanceId, dto, request.user);
  }

  @Roles('user', 'admin', 'superadmin')
  @Post('my/:instanceId/verify-pin')
  async verifyMyPin(
    @Param('instanceId') instanceId: string,
    @Body() dto: VerifyContractPinDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contractsService.verifyMyPin(instanceId, dto.pin, request.user);
  }

  @Roles('user', 'admin', 'superadmin')
  @Post('my/:instanceId/sign')
  async signMyInstance(
    @Param('instanceId') instanceId: string,
    @Body() dto: SignContractInstanceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const rawUserAgent = request.headers['user-agent'];
    const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;

    return this.contractsService.signMyInstance(instanceId, dto, request.user, {
      ip: request.ip ?? null,
      userAgent: userAgent ?? null,
    });
  }

  private resolvePublicOrigin(request: FastifyRequest): string | null {
    const forwardedProtoRaw = this.headerValue(
      request.headers['x-forwarded-proto'],
    );
    const forwardedHostRaw = this.headerValue(request.headers['x-forwarded-host']);
    const hostRaw = forwardedHostRaw || this.headerValue(request.headers.host);
    if (!hostRaw) return null;

    const protoCandidate = forwardedProtoRaw
      .split(',')[0]
      ?.trim()
      .toLowerCase();
    const requestProtocol = String(
      (request as { protocol?: string })?.protocol ?? '',
    )
      .trim()
      .toLowerCase();
    const protocol =
      protoCandidate === 'https' || protoCandidate === 'http'
        ? protoCandidate
        : requestProtocol === 'https' || requestProtocol === 'http'
          ? requestProtocol
          : 'https';
    const host = hostRaw.split(',')[0]?.trim();
    if (!host) return null;

    return `${protocol}://${host}`;
  }

  private headerValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return String(value[0] ?? '').trim();
    return String(value ?? '').trim();
  }
}
