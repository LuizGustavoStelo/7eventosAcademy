import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { CreateInstitutionRoleDto } from './dto/create-institution-role.dto';
import { CreateInstitutionUserDto } from './dto/create-institution-user.dto';
import { UpdateInstitutionMemberStatusDto } from './dto/update-institution-member-status.dto';
import { UpdateInstitutionRoleDto } from './dto/update-institution-role.dto';
import { UpsertMemberRolesDto } from './dto/upsert-member-roles.dto';
import { UpsertRolePermissionsDto } from './dto/upsert-role-permissions.dto';
import { InstitutionUsersService } from './institution-users.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Controller('institution-users')
export class InstitutionUsersController {
  constructor(private readonly institutionUsersService: InstitutionUsersService) {}

  @RequirePermissions('institution.members.read')
  @Get('catalog')
  async getCatalog(
    @Req() request: AuthenticatedRequest,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.getCatalog(request.user, institutionId);
  }

  @RequirePermissions('institution.members.read')
  @Get('roles')
  async listRoles(
    @Req() request: AuthenticatedRequest,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.listRoles(request.user, institutionId);
  }

  @RequirePermissions('institution.members.manage_roles')
  @Post('roles')
  async createRole(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateInstitutionRoleDto,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.createRole(request.user, dto, institutionId);
  }

  @RequirePermissions('institution.members.manage_roles')
  @Patch('roles/:roleId')
  async updateRole(
    @Req() request: AuthenticatedRequest,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateInstitutionRoleDto,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.updateRole(request.user, roleId, dto, institutionId);
  }

  @RequirePermissions('institution.members.manage_roles')
  @Put('roles/:roleId/permissions')
  async updateRolePermissions(
    @Req() request: AuthenticatedRequest,
    @Param('roleId') roleId: string,
    @Body() dto: UpsertRolePermissionsDto,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.updateRolePermissions(
      request.user,
      roleId,
      dto,
      institutionId,
    );
  }

  @RequirePermissions('institution.members.read')
  @Get('members')
  async listMembers(
    @Req() request: AuthenticatedRequest,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.listMembers(request.user, institutionId);
  }

  @RequirePermissions('institution.members.invite')
  @Post('members')
  async createMember(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateInstitutionUserDto,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.createMember(request.user, dto, institutionId);
  }

  @RequirePermissions('institution.members.manage_roles')
  @Put('members/:memberId/roles')
  async updateMemberRoles(
    @Req() request: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() dto: UpsertMemberRolesDto,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.updateMemberRoles(
      request.user,
      memberId,
      dto,
      institutionId,
    );
  }

  @RequirePermissions('institution.members.manage_roles')
  @Patch('members/:memberId/status')
  async updateMemberStatus(
    @Req() request: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateInstitutionMemberStatusDto,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.updateMemberStatus(
      request.user,
      memberId,
      dto,
      institutionId,
    );
  }

  @RequirePermissions('institution.members.read')
  @Get('audit')
  async listAudit(
    @Req() request: AuthenticatedRequest,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.institutionUsersService.listAudit(request.user, institutionId);
  }

  @Roles('superadmin')
  @Get('superadmin-overview')
  async getSuperadminOverview() {
    return this.institutionUsersService.getSuperadminOverview();
  }
}

