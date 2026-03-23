import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { CheckUpdatesDto } from './dto/check-updates.dto';
import { CreateLicenseAdminDto } from './dto/create-license-admin.dto';
import { CreateReleaseAdminDto } from './dto/create-release-admin.dto';
import { ValidateLicenseDto } from './dto/validate-license.dto';
import { WordpressIntegrationService } from './wordpress-integration.service';

@Controller('wordpress')
export class WordpressIntegrationController {
  constructor(
    private readonly wordpressIntegrationService: WordpressIntegrationService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return this.wordpressIntegrationService.health();
  }

  @Public()
  @Post('license/activate')
  activateLicense(@Body() dto: ActivateLicenseDto) {
    return this.wordpressIntegrationService.activateLicense(dto);
  }

  @Public()
  @Post('license/validate')
  validateLicense(@Body() dto: ValidateLicenseDto) {
    return this.wordpressIntegrationService.validateLicense(dto);
  }

  @Public()
  @Post('updates/check')
  checkUpdates(@Body() dto: CheckUpdatesDto) {
    return this.wordpressIntegrationService.checkUpdates(dto);
  }

  @Roles('superadmin')
  @Get('admin/licenses')
  listLicenses() {
    return this.wordpressIntegrationService.listLicenses();
  }

  @Roles('superadmin')
  @Post('admin/licenses')
  createOrUpdateLicense(@Body() dto: CreateLicenseAdminDto) {
    return this.wordpressIntegrationService.createOrUpdateLicense(dto);
  }

  @Roles('superadmin')
  @Delete('admin/licenses/:id')
  deleteLicense(@Param('id') id: string) {
    return this.wordpressIntegrationService.deleteLicense(id);
  }

  @Roles('superadmin')
  @Post('admin/licenses/:id/renew')
  renewLicense(@Param('id') id: string, @Body() dto: CreateLicenseAdminDto) {
    return this.wordpressIntegrationService.renewLicense(id, dto);
  }

  @Roles('superadmin')
  @Get('admin/releases')
  listReleases() {
    return this.wordpressIntegrationService.listReleases();
  }

  @Roles('superadmin')
  @Post('admin/releases')
  createOrUpdateRelease(@Body() dto: CreateReleaseAdminDto) {
    return this.wordpressIntegrationService.createOrUpdateRelease(dto);
  }
}
