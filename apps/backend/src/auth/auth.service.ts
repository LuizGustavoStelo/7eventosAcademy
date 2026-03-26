import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { JwtService } from '@nestjs/jwt';
import { UploadOwnerType, UserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';

type AppRole = 'user' | 'admin' | 'superadmin';

type AuthUserPayload = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  avatarUrl: string | null;
};

type AuthPayload = {
  accessToken: string;
  user: AuthUserPayload;
};

type ImpersonationAuthPayload = AuthPayload & {
  impersonation: {
    active: true;
    actorId: string;
    actorName: string;
    actorEmail: string;
    reason: string;
    durationMinutes: number;
    startedAt: string;
    expiresAt: string;
  };
};

const PROFILE_AVATAR_KIND = 'PROFILE_AVATAR';
const ACCESS_TOKEN_TTL_SECONDS = 86_400;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly uploadsService: UploadsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthPayload> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Este e-mail já está cadastrado.');
    }

    const passwordHash = await hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash,
        role: 'ADMIN',
      },
    });

    return this.buildAuthPayload(user);
  }

  async login(dto: LoginDto): Promise<AuthPayload> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const validPassword = await compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return this.buildAuthPayload(user);
  }

  async getMe(userId: string): Promise<AuthUserPayload> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return this.buildUserPayload(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<AuthUserPayload> {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const dataToUpdate: { name?: string; email?: string } = {};

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName.length < 3) {
        throw new BadRequestException('Nome deve ter pelo menos 3 caracteres.');
      }
      dataToUpdate.name = trimmedName;
    }

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== currentUser.email) {
        const existingUser = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new BadRequestException(
            'Já existe um usuário com este e-mail.',
          );
        }
      }
      dataToUpdate.email = normalizedEmail;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return this.getMe(userId);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    return this.buildUserPayload(updated);
  }

  async uploadMyAvatar(
    userId: string,
    file: MultipartFile,
  ): Promise<AuthUserPayload> {
    await this.getMe(userId);

    await this.uploadsService.bindFileToOwner({
      ownerType: UploadOwnerType.USER,
      ownerId: userId,
      kind: PROFILE_AVATAR_KIND,
      file,
    });

    return this.getMe(userId);
  }

  async removeMyAvatar(userId: string): Promise<AuthUserPayload> {
    await this.getMe(userId);

    await this.uploadsService.deleteOwnerAssetByKind(
      UploadOwnerType.USER,
      userId,
      PROFILE_AVATAR_KIND,
    );

    return this.getMe(userId);
  }

  async createImpersonatedAuthPayload(params: {
    actorUserId: string;
    targetUserId: string;
    reason?: string;
    durationMinutes?: number;
  }): Promise<ImpersonationAuthPayload> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorUserId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!actor || actor.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException(
        'Somente superadmin pode iniciar impersonação.',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target || target.role !== UserRole.ADMIN) {
      throw new NotFoundException('Conta admin/professor não encontrada.');
    }
    if (target.id === actor.id) {
      throw new BadRequestException('Não é possível impersonar a própria conta.');
    }

    const reason = params.reason?.trim() || 'Suporte operacional';
    const durationMinutes = Math.floor(ACCESS_TOKEN_TTL_SECONDS / 60);
    const startedAtDate = new Date();
    const expiresAtDate = new Date(
      startedAtDate.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    );

    const accessToken = await this.jwtService.signAsync(
      {
        sub: target.id,
        email: target.email,
        role: this.mapRole(target.role),
        impersonatedBy: actor.id,
        impersonationReason: reason,
        impersonationStartedAt: startedAtDate.toISOString(),
      },
      {
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    return {
      accessToken,
      user: await this.buildUserPayload(target),
      impersonation: {
        active: true,
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        reason,
        durationMinutes,
        startedAt: startedAtDate.toISOString(),
        expiresAt: expiresAtDate.toISOString(),
      },
    };
  }

  private async buildAuthPayload(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }): Promise<AuthPayload> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: this.mapRole(user.role),
    });

    return {
      accessToken,
      user: await this.buildUserPayload(user),
    };
  }

  private async buildUserPayload(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }): Promise<AuthUserPayload> {
    const avatar = await this.uploadsService.getOwnerAsset(
      UploadOwnerType.USER,
      user.id,
      PROFILE_AVATAR_KIND,
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: this.mapRole(user.role),
      avatarUrl: avatar?.url ?? null,
    };
  }

  private mapRole(role: string): AppRole {
    const normalizedRole = role.toLowerCase();
    if (normalizedRole === 'superadmin') {
      return 'superadmin';
    }
    if (normalizedRole === 'admin') {
      return 'admin';
    }
    return 'user';
  }
}


