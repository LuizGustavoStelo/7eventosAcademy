import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { JwtService } from '@nestjs/jwt';
import { UploadOwnerType } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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

const PROFILE_AVATAR_KIND = 'PROFILE_AVATAR';

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

  async uploadMyAvatar(userId: string, file: MultipartFile): Promise<AuthUserPayload> {
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
