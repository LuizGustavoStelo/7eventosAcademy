import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { SendKobayashiTestPayloadDto } from './dto/send-kobayashi-test-payload.dto';
import { UpsertInstitutionIntegrationDto } from './dto/upsert-institution-integration.dto';
import { SuperadminIntegrationsService } from './superadmin-integrations.service';

@Roles('superadmin')
@Controller('superadmin/integrations')
export class SuperadminIntegrationsController {
  constructor(
    private readonly superadminIntegrationsService: SuperadminIntegrationsService,
  ) {}

  @Get('institutions')
  async listInstitutions() {
    return this.superadminIntegrationsService.listInstitutions();
  }

  @Get('institutions/:institutionId/providers/:provider')
  async getInstitutionProviderConfig(
    @Param('institutionId') institutionId: string,
    @Param('provider') provider: string,
  ) {
    return this.superadminIntegrationsService.getInstitutionProviderConfig(
      institutionId,
      provider,
    );
  }

  @Get('institutions/:institutionId/providers/:provider/logs')
  async listInstitutionProviderDispatchLogs(
    @Param('institutionId') institutionId: string,
    @Param('provider') provider: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.superadminIntegrationsService.listInstitutionProviderDispatchLogs(
      institutionId,
      provider,
      limit,
      status,
      dateFrom,
      dateTo,
      search,
    );
  }

  @Put('institutions/:institutionId/providers/:provider')
  async upsertInstitutionProviderConfig(
    @Param('institutionId') institutionId: string,
    @Param('provider') provider: string,
    @Body() dto: UpsertInstitutionIntegrationDto,
  ) {
    return this.superadminIntegrationsService.upsertInstitutionProviderConfig(
      institutionId,
      provider,
      dto,
    );
  }

  @Post('institutions/:institutionId/providers/:provider/test-request')
  async sendProviderTestRequest(
    @Param('institutionId') institutionId: string,
    @Param('provider') provider: string,
    @Body() dto: SendKobayashiTestPayloadDto,
  ) {
    return this.superadminIntegrationsService.sendProviderTestRequest(
      institutionId,
      provider,
      dto,
    );
  }

  @Post('institutions/:institutionId/providers/:provider/logs/:logId/retry')
  async retryInstitutionProviderDispatchLog(
    @Param('institutionId') institutionId: string,
    @Param('provider') provider: string,
    @Param('logId') logId: string,
  ) {
    return this.superadminIntegrationsService.retryInstitutionProviderDispatchLog(
      institutionId,
      provider,
      logId,
    );
  }
}
