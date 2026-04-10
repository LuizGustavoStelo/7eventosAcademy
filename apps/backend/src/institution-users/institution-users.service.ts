import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstitutionMemberStatus, Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { JwtPayload } from '../auth/types/app-role.type';
import { PrismaService } from '../database/prisma.service';
import { CreateInstitutionRoleDto } from './dto/create-institution-role.dto';
import { CreateInstitutionUserDto } from './dto/create-institution-user.dto';
import { UpdateInstitutionMemberStatusDto } from './dto/update-institution-member-status.dto';
import { UpdateInstitutionRoleDto } from './dto/update-institution-role.dto';
import { UpsertMemberRolesDto } from './dto/upsert-member-roles.dto';
import { UpsertRolePermissionsDto } from './dto/upsert-role-permissions.dto';

type ActorScope = {
  institutionId: string;
  actorIsSuperadmin: boolean;
  actorPermissionCodes: Set<string>;
};

@Injectable()
export class InstitutionUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCatalog(actor: JwtPayload, requestedInstitutionId?: string) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);

    const [institution, permissions] = await Promise.all([
      this.prisma.institution.findUnique({
        where: { id: scope.institutionId },
        select: { id: true, name: true, slug: true, status: true },
      }),
      this.prisma.permission.findMany({
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          description: true,
        },
      }),
    ]);

    if (!institution) {
      throw new NotFoundException('Instituição não encontrada.');
    }

    return {
      institution: {
        ...institution,
        status: institution.status.toLowerCase(),
      },
      permissions,
    };
  }

  async listRoles(actor: JwtPayload, requestedInstitutionId?: string) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);

    const roles = await this.prisma.institutionRole.findMany({
      where: {
        institutionId: scope.institutionId,
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: {
                id: true,
                code: true,
                description: true,
              },
            },
          },
          orderBy: {
            permission: {
              code: 'asc',
            },
          },
        },
        _count: {
          select: {
            memberRoles: true,
          },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      membersCount: role._count.memberRoles,
      permissions: role.rolePermissions.map((item) => item.permission),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }

  async createRole(
    actor: JwtPayload,
    dto: CreateInstitutionRoleDto,
    requestedInstitutionId?: string,
  ) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);
    const permissionIds = this.uniqueIds(dto.permissionIds);
    if (permissionIds.length === 0) {
      throw new BadRequestException('Selecione ao menos uma permissão para o perfil.');
    }

    const roleCode = this.normalizeRoleCode(dto.code || dto.name);

    const [existingRole, permissions] = await Promise.all([
      this.prisma.institutionRole.findUnique({
        where: {
          institutionId_code: {
            institutionId: scope.institutionId,
            code: roleCode,
          },
        },
        select: { id: true },
      }),
      this.prisma.permission.findMany({
        where: {
          id: {
            in: permissionIds,
          },
        },
        select: {
          id: true,
          code: true,
        },
      }),
    ]);

    if (existingRole) {
      throw new BadRequestException('Já existe um perfil com este código nesta instituição.');
    }

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('Uma ou mais permissões informadas são inválidas.');
    }

    this.ensureActorCanGrantPermissions(scope, permissions.map((item) => item.code));

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.institutionRole.create({
        data: {
          institutionId: scope.institutionId,
          code: roleCode,
          name: dto.name.trim(),
          isSystem: false,
        },
      });

      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });

      return role;
    });

    await this.writeAudit(scope, actor, {
      action: 'role.create',
      resourceType: 'institution_role',
      resourceId: created.id,
      metadata: {
        roleCode,
        permissionIds,
      },
    });

    return {
      success: true,
      roleId: created.id,
      message: 'Perfil criado com sucesso.',
    };
  }

  async updateRole(
    actor: JwtPayload,
    roleId: string,
    dto: UpdateInstitutionRoleDto,
    requestedInstitutionId?: string,
  ) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);
    const role = await this.prisma.institutionRole.findFirst({
      where: {
        id: roleId,
        institutionId: scope.institutionId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSystem: true,
      },
    });

    if (!role) {
      throw new NotFoundException('Perfil não encontrado na instituição selecionada.');
    }

    if (!dto.name || dto.name.trim() === role.name) {
      return {
        success: true,
        message: 'Nenhuma alteração foi necessária.',
      };
    }

    if (!scope.actorIsSuperadmin && role.code === 'institution_owner') {
      throw new ForbiddenException('O perfil de dono da instituição não pode ser renomeado.');
    }

    const updated = await this.prisma.institutionRole.update({
      where: { id: role.id },
      data: { name: dto.name.trim() },
      select: { id: true },
    });

    await this.writeAudit(scope, actor, {
      action: 'role.update',
      resourceType: 'institution_role',
      resourceId: updated.id,
      metadata: {
        previousName: role.name,
        nextName: dto.name.trim(),
      },
    });

    return {
      success: true,
      roleId: updated.id,
      message: 'Perfil atualizado com sucesso.',
    };
  }

  async updateRolePermissions(
    actor: JwtPayload,
    roleId: string,
    dto: UpsertRolePermissionsDto,
    requestedInstitutionId?: string,
  ) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);
    const permissionIds = this.uniqueIds(dto.permissionIds);

    if (permissionIds.length === 0) {
      throw new BadRequestException('Selecione ao menos uma permissão para o perfil.');
    }

    const role = await this.prisma.institutionRole.findFirst({
      where: {
        id: roleId,
        institutionId: scope.institutionId,
      },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: {
                id: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Perfil não encontrado na instituição selecionada.');
    }

    if (!scope.actorIsSuperadmin && role.code === 'institution_owner') {
      throw new ForbiddenException('O perfil de dono da instituição não pode ter permissões alteradas.');
    }

    const permissions = await this.prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('Uma ou mais permissões informadas são inválidas.');
    }

    this.ensureActorCanGrantPermissions(scope, permissions.map((item) => item.code));

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
        },
      });

      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    });

    await this.writeAudit(scope, actor, {
      action: 'role.permissions.update',
      resourceType: 'institution_role',
      resourceId: role.id,
      metadata: {
        roleCode: role.code,
        previousPermissionCodes: role.rolePermissions.map((item) => item.permission.code),
        nextPermissionCodes: permissions.map((item) => item.code),
      },
    });

    return {
      success: true,
      roleId: role.id,
      message: 'Permissões do perfil atualizadas com sucesso.',
    };
  }

  async listMembers(actor: JwtPayload, requestedInstitutionId?: string) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);

    const members = await this.prisma.institutionMember.findMany({
      where: {
        institutionId: scope.institutionId,
      },
      orderBy: [
        {
          status: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            emailConfirmedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        memberRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: {
                      select: {
                        id: true,
                        code: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            role: {
              name: 'asc',
            },
          },
        },
      },
    });

    return members.map((member) => ({
      id: member.id,
      status: member.status.toLowerCase(),
      joinedAt: member.joinedAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.user.role.toLowerCase(),
        emailConfirmedAt: member.user.emailConfirmedAt,
        createdAt: member.user.createdAt,
        updatedAt: member.user.updatedAt,
      },
      roles: member.memberRoles.map((link) => ({
        id: link.role.id,
        code: link.role.code,
        name: link.role.name,
        isSystem: link.role.isSystem,
        permissions: link.role.rolePermissions.map((item) => item.permission),
      })),
    }));
  }

  async createMember(
    actor: JwtPayload,
    dto: CreateInstitutionUserDto,
    requestedInstitutionId?: string,
  ) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);

    const roleIds = this.uniqueIds(dto.roleIds ?? []);
    if (roleIds.length === 0) {
      throw new BadRequestException('Selecione ao menos uma categoria/perfil para o usuário.');
    }

    const roles = await this.prisma.institutionRole.findMany({
      where: {
        id: {
          in: roleIds,
        },
        institutionId: scope.institutionId,
      },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (roles.length !== roleIds.length) {
      throw new BadRequestException('Um ou mais perfis informados são inválidos para esta instituição.');
    }

    this.ensureActorCanGrantPermissions(
      scope,
      [...new Set(roles.flatMap((role) => role.rolePermissions.map((item) => item.permission.code)))],
    );

    const email = dto.email.trim().toLowerCase();
    const passwordHash = await hash(dto.password, 12);
    const name = dto.name.trim();

    const output = await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
        },
      });

      if (existingUser?.role === UserRole.SUPERADMIN) {
        throw new BadRequestException('Não é permitido vincular um superadmin como membro institucional.');
      }

      if (existingUser?.role === UserRole.USER) {
        throw new BadRequestException(
          'Este e-mail já pertence a um aluno. Use outro e-mail para equipe administrativa.',
        );
      }

      const user =
        existingUser ||
        (await tx.user.create({
          data: {
            name,
            email,
            passwordHash,
            role: UserRole.ADMIN,
            emailConfirmedAt: new Date(),
          },
          select: {
            id: true,
            role: true,
          },
        }));

      const member = await tx.institutionMember.upsert({
        where: {
          institutionId_userId: {
            institutionId: scope.institutionId,
            userId: user.id,
          },
        },
        update: {
          status: InstitutionMemberStatus.ACTIVE,
          joinedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          institutionId: scope.institutionId,
          userId: user.id,
          status: InstitutionMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
        select: {
          id: true,
        },
      });

      await tx.memberRole.deleteMany({
        where: {
          memberId: member.id,
        },
      });

      await tx.memberRole.createMany({
        data: roleIds.map((roleId) => ({
          memberId: member.id,
          roleId,
        })),
        skipDuplicates: true,
      });

      return {
        memberId: member.id,
        userId: user.id,
        userAlreadyExisted: Boolean(existingUser),
      };
    });

    await this.writeAudit(scope, actor, {
      action: 'member.create',
      resourceType: 'institution_member',
      resourceId: output.memberId,
      metadata: {
        email,
        roleIds,
        userAlreadyExisted: output.userAlreadyExisted,
        note: dto.note?.trim() || null,
      },
    });

    return {
      success: true,
      memberId: output.memberId,
      userId: output.userId,
      message: output.userAlreadyExisted
        ? 'Acesso atualizado para usuário existente nesta instituição.'
        : 'Acesso criado com sucesso.',
    };
  }

  async updateMemberRoles(
    actor: JwtPayload,
    memberId: string,
    dto: UpsertMemberRolesDto,
    requestedInstitutionId?: string,
  ) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);
    const roleIds = this.uniqueIds(dto.roleIds);

    if (roleIds.length === 0) {
      throw new BadRequestException('Selecione ao menos um perfil para o usuário.');
    }

    const member = await this.prisma.institutionMember.findFirst({
      where: {
        id: memberId,
        institutionId: scope.institutionId,
      },
      include: {
        user: {
          select: {
            id: true,
            role: true,
          },
        },
        memberRoles: {
          include: {
            role: {
              select: {
                id: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado na instituição selecionada.');
    }

    if (member.user.role === UserRole.SUPERADMIN) {
      throw new BadRequestException('Não é permitido alterar perfis de superadmin por este módulo.');
    }

    const roles = await this.prisma.institutionRole.findMany({
      where: {
        id: {
          in: roleIds,
        },
        institutionId: scope.institutionId,
      },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (roles.length !== roleIds.length) {
      throw new BadRequestException('Um ou mais perfis informados são inválidos para esta instituição.');
    }

    this.ensureActorCanGrantPermissions(
      scope,
      [...new Set(roles.flatMap((role) => role.rolePermissions.map((item) => item.permission.code)))],
    );

    const currentRoleCodes = new Set(member.memberRoles.map((link) => link.role.code));
    const nextRoleCodes = new Set(roles.map((role) => role.code));

    const removingOwnerRole = currentRoleCodes.has('institution_owner') && !nextRoleCodes.has('institution_owner');
    if (removingOwnerRole) {
      await this.ensureNotRemovingLastOwner(scope.institutionId, member.id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.memberRole.deleteMany({
        where: {
          memberId: member.id,
        },
      });

      await tx.memberRole.createMany({
        data: roles.map((role) => ({
          memberId: member.id,
          roleId: role.id,
        })),
        skipDuplicates: true,
      });
    });

    await this.writeAudit(scope, actor, {
      action: 'member.roles.update',
      resourceType: 'institution_member',
      resourceId: member.id,
      metadata: {
        previousRoleCodes: [...currentRoleCodes],
        nextRoleCodes: [...nextRoleCodes],
      },
    });

    return {
      success: true,
      memberId: member.id,
      message: 'Perfis do usuário atualizados com sucesso.',
    };
  }

  async updateMemberStatus(
    actor: JwtPayload,
    memberId: string,
    dto: UpdateInstitutionMemberStatusDto,
    requestedInstitutionId?: string,
  ) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);

    const member = await this.prisma.institutionMember.findFirst({
      where: {
        id: memberId,
        institutionId: scope.institutionId,
      },
      include: {
        memberRoles: {
          include: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado na instituição selecionada.');
    }

    if (!scope.actorIsSuperadmin && member.id === actor.activeMemberId) {
      throw new BadRequestException('Não é permitido alterar o próprio status.');
    }

    const nextStatus = this.mapMemberStatus(dto.status);
    if (member.status === nextStatus) {
      return {
        success: true,
        message: 'Nenhuma alteração foi necessária.',
      };
    }

    const memberHasOwnerRole = member.memberRoles.some(
      (item) => item.role.code === 'institution_owner',
    );

    if (memberHasOwnerRole && nextStatus !== InstitutionMemberStatus.ACTIVE) {
      await this.ensureNotSuspendingLastOwner(scope.institutionId, member.id);
    }

    const updated = await this.prisma.institutionMember.update({
      where: { id: member.id },
      data: {
        status: nextStatus,
        joinedAt: nextStatus === InstitutionMemberStatus.ACTIVE ? new Date() : member.joinedAt,
      },
      select: {
        id: true,
      },
    });

    await this.writeAudit(scope, actor, {
      action: 'member.status.update',
      resourceType: 'institution_member',
      resourceId: updated.id,
      metadata: {
        previousStatus: member.status.toLowerCase(),
        nextStatus: nextStatus.toLowerCase(),
      },
    });

    return {
      success: true,
      memberId: updated.id,
      message: 'Status do usuário atualizado com sucesso.',
    };
  }

  async listAudit(actor: JwtPayload, requestedInstitutionId?: string) {
    const scope = await this.resolveScope(actor, requestedInstitutionId);

    const entries = await this.prisma.institutionAuditLog.findMany({
      where: {
        institutionId: scope.institutionId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 150,
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      actor: entry.actorUser
        ? {
            id: entry.actorUser.id,
            name: entry.actorUser.name,
            email: entry.actorUser.email,
            role: entry.actorUser.role.toLowerCase(),
          }
        : null,
    }));
  }

  async getSuperadminOverview() {
    const [
      totalInstitutions,
      totalMembers,
      activeMembers,
      totalRoles,
      customRoles,
      institutions,
    ] = await Promise.all([
      this.prisma.institution.count(),
      this.prisma.institutionMember.count(),
      this.prisma.institutionMember.count({
        where: {
          status: InstitutionMemberStatus.ACTIVE,
        },
      }),
      this.prisma.institutionRole.count(),
      this.prisma.institutionRole.count({
        where: {
          isSystem: false,
        },
      }),
      this.prisma.institution.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          _count: {
            select: {
              members: true,
              roles: true,
              courses: true,
            },
          },
        },
        take: 100,
      }),
    ]);

    return {
      overview: {
        totalInstitutions,
        totalMembers,
        activeMembers,
        totalRoles,
        customRoles,
      },
      institutions: institutions.map((institution) => ({
        id: institution.id,
        name: institution.name,
        slug: institution.slug,
        status: institution.status.toLowerCase(),
        membersCount: institution._count.members,
        rolesCount: institution._count.roles,
        coursesCount: institution._count.courses,
        createdAt: institution.createdAt,
        updatedAt: institution.updatedAt,
      })),
    };
  }

  private async resolveScope(
    actor: JwtPayload,
    requestedInstitutionId?: string,
  ): Promise<ActorScope> {
    if (actor.role === 'superadmin') {
      const institutionId = requestedInstitutionId?.trim() || actor.activeInstitutionId || '';
      if (!institutionId) {
        throw new BadRequestException(
          'Para superadmin, informe o institutionId para gerenciar usuários.',
        );
      }

      const exists = await this.prisma.institution.findUnique({
        where: { id: institutionId },
        select: { id: true },
      });

      if (!exists) {
        throw new NotFoundException('Instituição não encontrada.');
      }

      return {
        institutionId,
        actorIsSuperadmin: true,
        actorPermissionCodes: new Set<string>(),
      };
    }

    const institutionId = actor.activeInstitutionId;
    if (!institutionId) {
      throw new ForbiddenException('Usuário sem instituição ativa no contexto atual.');
    }

    if (requestedInstitutionId && requestedInstitutionId !== institutionId) {
      throw new ForbiddenException('Você só pode gerenciar usuários da instituição ativa.');
    }

    const actorMemberId = actor.activeMemberId;
    if (!actorMemberId) {
      throw new ForbiddenException('Membro institucional inválido para esta sessão.');
    }

    const membership = await this.prisma.institutionMember.findFirst({
      where: {
        id: actorMemberId,
        userId: actor.sub,
        institutionId,
        status: InstitutionMemberStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Seu vínculo institucional está inativo ou inválido.');
    }

    return {
      institutionId,
      actorIsSuperadmin: false,
      actorPermissionCodes: new Set(actor.activePermissionCodes ?? []),
    };
  }

  private ensureActorCanGrantPermissions(scope: ActorScope, permissionCodes: string[]) {
    if (scope.actorIsSuperadmin) {
      return;
    }

    const uniquePermissionCodes = [...new Set(permissionCodes)];
    const missing = uniquePermissionCodes.filter(
      (permissionCode) => !scope.actorPermissionCodes.has(permissionCode),
    );

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Você não pode conceder permissões acima do seu nível: ${missing.join(', ')}`,
      );
    }
  }

  private async ensureNotRemovingLastOwner(institutionId: string, targetMemberId: string) {
    const owners = await this.prisma.memberRole.findMany({
      where: {
        role: {
          institutionId,
          code: 'institution_owner',
        },
        member: {
          status: InstitutionMemberStatus.ACTIVE,
        },
      },
      select: {
        memberId: true,
      },
    });

    const uniqueOwners = [...new Set(owners.map((item) => item.memberId))];
    if (uniqueOwners.length <= 1 && uniqueOwners.includes(targetMemberId)) {
      throw new BadRequestException(
        'Não é permitido remover o último dono ativo da instituição.',
      );
    }
  }

  private async ensureNotSuspendingLastOwner(institutionId: string, targetMemberId: string) {
    const owners = await this.prisma.memberRole.findMany({
      where: {
        role: {
          institutionId,
          code: 'institution_owner',
        },
        member: {
          status: InstitutionMemberStatus.ACTIVE,
        },
      },
      select: {
        memberId: true,
      },
    });

    const uniqueOwners = [...new Set(owners.map((item) => item.memberId))];
    if (uniqueOwners.length <= 1 && uniqueOwners.includes(targetMemberId)) {
      throw new BadRequestException(
        'Não é permitido inativar/suspender o último dono ativo da instituição.',
      );
    }
  }

  private async writeAudit(
    scope: ActorScope,
    actor: JwtPayload,
    input: {
      action: string;
      resourceType: string;
      resourceId?: string | null;
      metadata?: Prisma.JsonObject;
    },
  ) {
    await this.prisma.institutionAuditLog.create({
      data: {
        institutionId: scope.institutionId,
        actorUserId: actor.sub,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  }

  private uniqueIds(values: string[]) {
    return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  }

  private normalizeRoleCode(input: string) {
    const normalized = input
      .normalize('NFD')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase()
      .trim()
      .replace(/^_+|_+$/g, '');

    if (!normalized || normalized.length < 3) {
      throw new BadRequestException('Código do perfil inválido. Use ao menos 3 caracteres.');
    }

    if (normalized.length > 80) {
      throw new BadRequestException('Código do perfil muito longo. Máximo de 80 caracteres.');
    }

    return normalized;
  }

  private mapMemberStatus(status: 'active' | 'invited' | 'suspended') {
    if (status === 'active') return InstitutionMemberStatus.ACTIVE;
    if (status === 'invited') return InstitutionMemberStatus.INVITED;
    return InstitutionMemberStatus.SUSPENDED;
  }
}

