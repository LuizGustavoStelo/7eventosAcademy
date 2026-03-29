import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UploadOwnerType, UserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { type AccountVerificationAudience } from '../mail/templates/account-verification-email.template';
import { UploadsService } from '../uploads/uploads.service';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationCodeDto } from './dto/resend-verification-code.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';

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

type EmailVerificationPendingPayload = {
  requiresEmailVerification: true;
  email: string;
  expiresAt: string;
  message: string;
};

type EmailVerificationDispatchResult = {
  status: 'sent' | 'cooldown' | 'failed';
  expiresAt: Date;
  waitSeconds?: number;
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
const EMAIL_VERIFICATION_CODE_LENGTH = 6;
const DEFAULT_VERIFICATION_TTL_MINUTES = 15;
const DEFAULT_VERIFICATION_COOLDOWN_SECONDS = 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly uploadsService: UploadsService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<EmailVerificationPendingPayload> {
    const email = dto.email.trim().toLowerCase();
    const trimmedName = dto.name.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        emailConfirmedAt: true,
      },
    });

    if (existingUser && existingUser.role !== UserRole.ADMIN) {
      throw new BadRequestException('Este e-mail já está cadastrado.');
    }

    let userId = existingUser?.id;

    if (existingUser?.emailConfirmedAt) {
      throw new BadRequestException('Este e-mail já está cadastrado.');
    }

    if (!existingUser) {
      const passwordHash = await hash(dto.password, 12);
      const createdUser = await this.prisma.user.create({
        data: {
          name: trimmedName,
          email,
          passwordHash,
          role: UserRole.ADMIN,
          emailConfirmedAt: null,
        },
        select: { id: true },
      });

      userId = createdUser.id;
    } else {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: trimmedName,
          passwordHash: await hash(dto.password, 12),
          emailConfirmedAt: null,
        },
      });
    }

    if (!userId) {
      throw new BadRequestException('Não foi possível concluir o cadastro.');
    }

    const dispatch = await this.sendEmailVerificationCodeByUserId(userId, {
      ignoreCooldown: false,
      throwOnDeliveryFailure: false,
    });

    if (dispatch.status === 'cooldown') {
      return {
        requiresEmailVerification: true,
        email,
        expiresAt: dispatch.expiresAt.toISOString(),
        message: `Cadastro pendente de confirmação. Aguarde ${dispatch.waitSeconds ?? 1} segundo(s) para solicitar novo código.`,
      };
    }

    if (dispatch.status === 'failed') {
      return {
        requiresEmailVerification: true,
        email,
        expiresAt: dispatch.expiresAt.toISOString(),
        message:
          'Conta criada, mas não foi possível enviar o código agora. Use a opção de reenviar código para tentar novamente.',
      };
    }

    return {
      requiresEmailVerification: true,
      email,
      expiresAt: dispatch.expiresAt.toISOString(),
      message: 'Conta criada! Enviamos um código de confirmação para o seu e-mail.',
    };
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

    if (!user.emailConfirmedAt) {
      await this.sendEmailVerificationCodeByUserId(user.id, {
        ignoreCooldown: false,
        throwOnDeliveryFailure: false,
      });

      throw new ForbiddenException({
        code: 'EMAIL_NAO_CONFIRMADO',
        email: user.email,
        message:
          'Seu e-mail ainda não foi confirmado. Digite o código enviado para continuar.',
      });
    }

    return this.buildAuthPayload(user);
  }

  async verifyEmailCode(dto: VerifyEmailCodeDto) {
    const email = dto.email.trim().toLowerCase();
    const code = dto.code.trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailConfirmedAt: true,
        emailVerificationCodeHash: true,
        emailVerificationCodeExpiresAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    if (user.emailConfirmedAt) {
      return {
        verified: true,
        message: 'Este e-mail já está confirmado. Faça login para continuar.',
      };
    }

    if (!user.emailVerificationCodeHash || !user.emailVerificationCodeExpiresAt) {
      throw new BadRequestException(
        'Nenhum código ativo foi encontrado para este e-mail. Solicite um novo código.',
      );
    }

    if (user.emailVerificationCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const validCode = await compare(code, user.emailVerificationCodeHash);
    if (!validCode) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmedAt: new Date(),
        emailVerificationCodeHash: null,
        emailVerificationCodeExpiresAt: null,
        emailVerificationCodeSentAt: null,
      },
    });

    return {
      verified: true,
      message: 'E-mail confirmado com sucesso. Faça login para continuar.',
    };
  }

  async resendVerificationCode(dto: ResendVerificationCodeDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailConfirmedAt: true,
      },
    });

    if (!user) {
      return {
        sent: true,
        message:
          'Se este e-mail existir na plataforma, um novo código de confirmação será enviado.',
      };
    }

    if (user.emailConfirmedAt) {
      return {
        sent: true,
        message: 'Este e-mail já está confirmado. Você já pode acessar a plataforma.',
      };
    }

    const dispatch = await this.sendEmailVerificationCodeByUserId(user.id, {
      ignoreCooldown: false,
      throwOnDeliveryFailure: true,
    });

    if (dispatch.status === 'cooldown') {
      throw new BadRequestException(
        `Aguarde ${dispatch.waitSeconds ?? 1} segundo(s) antes de solicitar outro código.`,
      );
    }

    return {
      sent: true,
      message: 'Enviamos um novo código de confirmação para o seu e-mail.',
      expiresAt: dispatch.expiresAt.toISOString(),
    };
  }

  async sendEmailVerificationCodeByUserId(
    userId: string,
    options?: {
      ignoreCooldown?: boolean;
      throwOnDeliveryFailure?: boolean;
    },
  ): Promise<EmailVerificationDispatchResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerificationCodeSentAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const now = Date.now();
    const cooldownMs = this.getEmailVerificationCooldownSeconds() * 1000;
    const lastSentAt = user.emailVerificationCodeSentAt?.getTime() ?? 0;

    if (!options?.ignoreCooldown && lastSentAt && now - lastSentAt < cooldownMs) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownMs - (now - lastSentAt)) / 1000));
      const fallbackExpiry = new Date(
        now + this.getEmailVerificationTtlMinutes() * 60 * 1000,
      );

      return {
        status: 'cooldown',
        expiresAt: fallbackExpiry,
        waitSeconds,
      };
    }

    const code = this.generateEmailVerificationCode();
    const codeHash = await hash(code, 10);
    const expiresAt = new Date(
      now + this.getEmailVerificationTtlMinutes() * 60 * 1000,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmedAt: null,
        emailVerificationCodeHash: codeHash,
        emailVerificationCodeExpiresAt: expiresAt,
        emailVerificationCodeSentAt: new Date(),
      },
    });

    try {
      await this.mailService.sendAccountVerificationEmail({
        to: user.email,
        recipientName: user.name,
        verificationCode: code,
        expiresInMinutes: this.getEmailVerificationTtlMinutes(),
        audience: this.resolveVerificationAudience(user.role),
      });

      return {
        status: 'sent',
        expiresAt,
      };
    } catch (error) {
      if (options?.throwOnDeliveryFailure) {
        throw error;
      }

      return {
        status: 'failed',
        expiresAt,
      };
    }
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

  private resolveVerificationAudience(role: UserRole): AccountVerificationAudience {
    if (role === UserRole.USER) {
      return 'aluno';
    }

    return 'professor';
  }

  private generateEmailVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(
      EMAIL_VERIFICATION_CODE_LENGTH,
      '0',
    );
  }

  private getEmailVerificationTtlMinutes(): number {
    const rawValue = Number(
      this.configService.get<string>('EMAIL_VERIFICATION_TTL_MINUTES') ??
        DEFAULT_VERIFICATION_TTL_MINUTES,
    );

    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return DEFAULT_VERIFICATION_TTL_MINUTES;
    }

    return Math.floor(rawValue);
  }

  private getEmailVerificationCooldownSeconds(): number {
    const rawValue = Number(
      this.configService.get<string>('EMAIL_VERIFICATION_COOLDOWN_SECONDS') ??
        DEFAULT_VERIFICATION_COOLDOWN_SECONDS,
    );

    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return DEFAULT_VERIFICATION_COOLDOWN_SECONDS;
    }

    return Math.floor(rawValue);
  }
}
