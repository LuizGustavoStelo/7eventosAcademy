import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type AppRole = 'user' | 'admin' | 'superadmin';

type AuthPayload = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: this.mapRole(user.role),
      },
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
