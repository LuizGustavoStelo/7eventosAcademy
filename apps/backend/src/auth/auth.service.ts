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
import { Prisma, UploadOwnerType, UserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { type AccountVerificationAudience } from '../mail/templates/account-verification-email.template';
import { UploadsService } from '../uploads/uploads.service';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetCodeDto } from './dto/request-password-reset-code.dto';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto';
import { ResendVerificationCodeDto } from './dto/resend-verification-code.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { VerifyPasswordResetCodeDto } from './dto/verify-password-reset-code.dto';

type AppRole = 'user' | 'admin' | 'superadmin';

type InstitutionBrandingPalette = {
  primaryColor: string;
  primaryStrongColor: string;
  secondaryColor: string;
  secondaryStrongColor: string;
  backgroundColor: string;
  surfaceColor: string;
  surfaceSoftColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

type AuthUserPayload = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  avatarUrl: string | null;
  institution:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | null;
  branding:
    | {
        logoUrl: string;
        palette: InstitutionBrandingPalette;
        isCustom: boolean;
      }
    | null;
};

type AuthPayload = {
  accessToken: string;
  user: AuthUserPayload;
};

type AuthInstitutionContext = {
  activeInstitutionId: string | null;
  activeMemberId: string | null;
  activeRoleCodes: string[];
  activePermissionCodes: string[];
};

type AuthPayloadWithContext = AuthPayload & {
  context: AuthInstitutionContext;
};

type MyInstitutionsResponse = {
  context: AuthInstitutionContext;
  institutions: Array<{
    institutionId: string;
    institutionName: string;
    institutionSlug: string;
    institutionStatus: string;
    memberId: string;
    memberStatus: string;
    roleCodes: string[];
    permissionCodes: string[];
  }>;
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

type PendingAdminRegistration = {
  name: string;
  email: string;
  passwordHash: string;
  codeHash: string | null;
  codeExpiresAt: string | null;
  codeSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImpersonationAuthPayload = AuthPayloadWithContext & {
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

type RoleTemplate = {
  code: string;
  name: string;
};

const SYSTEM_PERMISSIONS: Array<{ code: string; description: string }> = [
  { code: 'institution.members.read', description: 'Visualizar membros da instituição' },
  { code: 'institution.members.invite', description: 'Convidar membros para instituição' },
  { code: 'institution.members.manage_roles', description: 'Gerenciar papéis dos membros' },
  { code: 'courses.read', description: 'Visualizar cursos' },
  { code: 'courses.create', description: 'Criar cursos' },
  { code: 'courses.update', description: 'Editar cursos' },
  { code: 'courses.delete', description: 'Excluir cursos' },
  { code: 'classes.read', description: 'Visualizar turmas' },
  { code: 'classes.create', description: 'Criar turmas' },
  { code: 'classes.update', description: 'Editar turmas' },
  { code: 'classes.delete', description: 'Excluir turmas' },
  { code: 'students.read', description: 'Visualizar alunos' },
  { code: 'students.create', description: 'Criar alunos' },
  { code: 'students.update', description: 'Editar alunos' },
  { code: 'students.delete', description: 'Excluir alunos' },
  { code: 'enrollments.read', description: 'Visualizar matrículas' },
  { code: 'enrollments.create', description: 'Criar matrículas' },
  { code: 'enrollments.delete', description: 'Excluir matrículas' },
  { code: 'attendance.read', description: 'Visualizar presença' },
  { code: 'attendance.write', description: 'Lançar presença' },
  { code: 'materials.read', description: 'Visualizar materiais' },
  { code: 'materials.write', description: 'Gerenciar materiais' },
  { code: 'notices.write', description: 'Gerenciar avisos' },
  { code: 'finance.read', description: 'Visualizar financeiro' },
  { code: 'finance.write', description: 'Gerenciar financeiro' },
  { code: 'finance.reconcile', description: 'Conciliar financeiro' },
  { code: 'reports.read', description: 'Visualizar relatórios' },
  { code: 'contracts.read', description: 'Visualizar contratos e modelos' },
  {
    code: 'contracts.templates.write',
    description: 'Criar e editar modelos de contrato',
  },
  { code: 'contracts.send', description: 'Enviar contratos para assinatura' },
  {
    code: 'contracts.audit.read',
    description: 'Visualizar trilha de auditoria de contratos',
  },
  { code: 'contracts.download', description: 'Baixar documentos de contrato' },
];

const ROLE_TEMPLATES: RoleTemplate[] = [
  { code: 'institution_owner', name: 'Dono da instituição' },
  { code: 'institution_admin', name: 'Administrador da instituição' },
  { code: 'coordinator', name: 'Coordenador' },
  { code: 'professor', name: 'Professor' },
  { code: 'tutor', name: 'Tutor' },
  { code: 'secretaria', name: 'Secretaria' },
  { code: 'financeiro', name: 'Financeiro' },
  { code: 'viewer', name: 'Visualizador' },
];

const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  institution_owner: [
    'institution.members.read',
    'institution.members.invite',
    'institution.members.manage_roles',
    'courses.read',
    'courses.create',
    'courses.update',
    'courses.delete',
    'classes.read',
    'classes.create',
    'classes.update',
    'classes.delete',
    'students.read',
    'students.create',
    'students.update',
    'students.delete',
    'enrollments.read',
    'enrollments.create',
    'enrollments.delete',
    'attendance.read',
    'attendance.write',
    'materials.read',
    'materials.write',
    'notices.write',
    'finance.read',
    'finance.write',
    'finance.reconcile',
    'reports.read',
    'contracts.read',
    'contracts.templates.write',
    'contracts.send',
    'contracts.audit.read',
    'contracts.download',
  ],
  institution_admin: [
    'institution.members.read',
    'institution.members.invite',
    'courses.read',
    'courses.create',
    'courses.update',
    'courses.delete',
    'classes.read',
    'classes.create',
    'classes.update',
    'classes.delete',
    'students.read',
    'students.create',
    'students.update',
    'students.delete',
    'enrollments.read',
    'enrollments.create',
    'enrollments.delete',
    'attendance.read',
    'attendance.write',
    'materials.read',
    'materials.write',
    'notices.write',
    'finance.read',
    'finance.write',
    'reports.read',
    'contracts.read',
    'contracts.templates.write',
    'contracts.send',
    'contracts.audit.read',
    'contracts.download',
  ],
  coordinator: [
    'courses.read',
    'courses.create',
    'courses.update',
    'classes.read',
    'classes.create',
    'classes.update',
    'students.read',
    'students.create',
    'students.update',
    'enrollments.read',
    'enrollments.create',
    'attendance.read',
    'materials.read',
    'materials.write',
    'notices.write',
    'reports.read',
    'contracts.read',
    'contracts.templates.write',
    'contracts.send',
    'contracts.download',
  ],
  professor: [
    'courses.read',
    'classes.read',
    'students.read',
    'enrollments.read',
    'attendance.read',
    'attendance.write',
    'materials.read',
    'materials.write',
    'notices.write',
    'contracts.read',
    'contracts.templates.write',
    'contracts.send',
    'contracts.download',
  ],
  tutor: [
    'courses.read',
    'classes.read',
    'students.read',
    'enrollments.read',
    'attendance.read',
    'materials.read',
    'contracts.read',
    'contracts.download',
  ],
  secretaria: [
    'students.read',
    'students.create',
    'students.update',
    'enrollments.read',
    'enrollments.create',
    'enrollments.delete',
    'reports.read',
    'contracts.read',
    'contracts.send',
    'contracts.download',
  ],
  financeiro: [
    'students.read',
    'enrollments.read',
    'finance.read',
    'finance.write',
    'finance.reconcile',
    'reports.read',
    'contracts.read',
    'contracts.download',
  ],
  viewer: [
    'courses.read',
    'classes.read',
    'students.read',
    'enrollments.read',
    'attendance.read',
    'materials.read',
    'finance.read',
    'reports.read',
    'contracts.read',
  ],
};

const PROFILE_AVATAR_KIND = 'PROFILE_AVATAR';
const DEFAULT_STUDENT_BRANDING_LOGO_URL = '/Logo-IPESK.png';
const DEFAULT_STUDENT_BRANDING_PALETTE: InstitutionBrandingPalette = {
  primaryColor: '#139395',
  primaryStrongColor: '#0f7f81',
  secondaryColor: '#283e6e',
  secondaryStrongColor: '#1f3158',
  backgroundColor: '#eff3f4',
  surfaceColor: '#ffffff',
  surfaceSoftColor: '#f6f8f9',
  borderColor: '#d9e2e7',
  textColor: '#243650',
  mutedColor: '#5f7087',
};
const BRANDING_COLOR_FIELDS: Array<keyof InstitutionBrandingPalette> = [
  'primaryColor',
  'primaryStrongColor',
  'secondaryColor',
  'secondaryStrongColor',
  'backgroundColor',
  'surfaceColor',
  'surfaceSoftColor',
  'borderColor',
  'textColor',
  'mutedColor',
];
const ACCESS_TOKEN_TTL_SECONDS = 86_400;
const EMAIL_VERIFICATION_CODE_LENGTH = 6;
const DEFAULT_VERIFICATION_TTL_MINUTES = 15;
const DEFAULT_VERIFICATION_COOLDOWN_SECONDS = 60;
const PASSWORD_RESET_CODE_LENGTH = 6;
const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 15;
const DEFAULT_PASSWORD_RESET_COOLDOWN_SECONDS = 60;
const PENDING_ADMIN_REGISTRATION_PREFIX = 'pending-admin-registration:';

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
    const passwordHash = await hash(dto.password, 12);

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

    if (existingUser?.emailConfirmedAt) {
      throw new BadRequestException('Este e-mail já está cadastrado.');
    }

    // Compatibilidade com contas legadas (não confirmadas) criadas antes do fluxo pendente.
    if (existingUser && !existingUser.emailConfirmedAt) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: trimmedName,
          passwordHash,
          emailConfirmedAt: null,
        },
      });

      const dispatch = await this.sendEmailVerificationCodeByUserId(existingUser.id, {
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
            'Cadastro pendente de confirmação, mas não foi possível enviar o código agora. Use a opção de reenviar código para tentar novamente.',
        };
      }

      return {
        requiresEmailVerification: true,
        email,
        expiresAt: dispatch.expiresAt.toISOString(),
        message:
          'Cadastro pendente de confirmação. Enviamos um código de confirmação para o seu e-mail.',
      };
    }

    const previousPending = await this.findPendingAdminRegistration(email);
    const dispatch = await this.sendPendingAdminVerificationCode({
      name: trimmedName,
      email,
      passwordHash,
      previous: previousPending,
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
          'Cadastro pendente de confirmação, mas não foi possível enviar o código agora. Use a opção de reenviar código para tentar novamente.',
      };
    }

    return {
      requiresEmailVerification: true,
      email,
      expiresAt: dispatch.expiresAt.toISOString(),
      message:
        'Cadastro pendente de confirmação. Enviamos um código de confirmação para o seu e-mail.',
    };
  }

  async login(dto: LoginDto): Promise<AuthPayload> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const pending = await this.findPendingAdminRegistration(email);
      if (pending) {
        await this.sendPendingAdminVerificationCode({
          name: pending.name,
          email: pending.email,
          passwordHash: pending.passwordHash,
          previous: pending,
          ignoreCooldown: false,
          throwOnDeliveryFailure: false,
        });

        throw new ForbiddenException({
          code: 'EMAIL_NAO_CONFIRMADO',
          email,
          message:
            'Seu e-mail ainda não foi confirmado. Digite o código enviado para continuar.',
        });
      }

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

  async switchInstitution(
    userId: string,
    institutionId: string,
  ): Promise<AuthPayloadWithContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return this.buildAuthPayload(user, institutionId);
  }

  async getMyInstitutions(
    userId: string,
    currentContext?: AuthInstitutionContext,
  ): Promise<MyInstitutionsResponse> {
    const memberships = await this.prisma.institutionMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        institution: true,
        memberRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const institutions = memberships.map((membership) => {
      const roleCodes = [...new Set(membership.memberRoles.map((item) => item.role.code))];
      const permissionCodes = [
        ...new Set(
          membership.memberRoles.flatMap((item) =>
            item.role.rolePermissions.map((permission) => permission.permission.code),
          ),
        ),
      ];

      return {
        institutionId: membership.institution.id,
        institutionName: membership.institution.name,
        institutionSlug: membership.institution.slug,
        institutionStatus: membership.institution.status.toLowerCase(),
        memberId: membership.id,
        memberStatus: membership.status.toLowerCase(),
        roleCodes,
        permissionCodes,
      };
    });

    return {
      context: currentContext ?? {
        activeInstitutionId: null,
        activeMemberId: null,
        activeRoleCodes: [],
        activePermissionCodes: [],
      },
      institutions,
    };
  }

  async verifyEmailCode(dto: VerifyEmailCodeDto) {
    const email = dto.email.trim().toLowerCase();
    const code = dto.code.trim();

    const pending = await this.findPendingAdminRegistration(email);
    if (pending) {
      if (!pending.codeHash || !pending.codeExpiresAt) {
        throw new BadRequestException(
          'Nenhum código ativo foi encontrado para este e-mail. Solicite um novo código.',
        );
      }

      const pendingExpiresAt = new Date(pending.codeExpiresAt);
      if (
        Number.isNaN(pendingExpiresAt.getTime()) ||
        pendingExpiresAt.getTime() < Date.now()
      ) {
        throw new BadRequestException('Código inválido ou expirado.');
      }

      const validPendingCode = await compare(code, pending.codeHash);
      if (!validPendingCode) {
        throw new BadRequestException('Código inválido ou expirado.');
      }

      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          emailConfirmedAt: true,
        },
      });

      if (existingUser?.emailConfirmedAt) {
        await this.deletePendingAdminRegistration(email);
        return {
          verified: true,
          message: 'Este e-mail já está confirmado. Faça login para continuar.',
        };
      }

      if (existingUser && !existingUser.emailConfirmedAt) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: pending.name,
            passwordHash: pending.passwordHash,
            emailConfirmedAt: new Date(),
            emailVerificationCodeHash: null,
            emailVerificationCodeExpiresAt: null,
            emailVerificationCodeSentAt: null,
          },
        });
      } else {
        await this.prisma.user.create({
          data: {
            name: pending.name,
            email: pending.email,
            passwordHash: pending.passwordHash,
            role: UserRole.ADMIN,
            emailConfirmedAt: new Date(),
          },
        });
      }

      await this.deletePendingAdminRegistration(email);
      return {
        verified: true,
        message: 'E-mail confirmado com sucesso. Faça login para continuar.',
      };
    }

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
    const pending = await this.findPendingAdminRegistration(email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailConfirmedAt: true,
      },
    });

    if (!user) {
      if (pending) {
        const dispatch = await this.sendPendingAdminVerificationCode({
          name: pending.name,
          email: pending.email,
          passwordHash: pending.passwordHash,
          previous: pending,
          ignoreCooldown: false,
          throwOnDeliveryFailure: false,
        });

        if (dispatch.status === 'cooldown') {
          return {
            sent: false,
            message: `Aguarde ${dispatch.waitSeconds ?? 1} segundo(s) antes de solicitar outro código.`,
            expiresAt: dispatch.expiresAt.toISOString(),
          };
        }

        if (dispatch.status === 'failed') {
          return {
            sent: false,
            message:
              'Não foi possível enviar o e-mail de confirmação no momento. Tente novamente em instantes.',
            expiresAt: dispatch.expiresAt.toISOString(),
          };
        }

        return {
          sent: true,
          message: 'Enviamos um novo código de confirmação para o seu e-mail.',
          expiresAt: dispatch.expiresAt.toISOString(),
        };
      }

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
      throwOnDeliveryFailure: false,
    });

    if (dispatch.status === 'cooldown') {
      return {
        sent: false,
        message: `Aguarde ${dispatch.waitSeconds ?? 1} segundo(s) antes de solicitar outro código.`,
        expiresAt: dispatch.expiresAt.toISOString(),
      };
    }

    if (dispatch.status === 'failed') {
      return {
        sent: false,
        message:
          'Não foi possível enviar o e-mail de confirmação no momento. Tente novamente em instantes.',
        expiresAt: dispatch.expiresAt.toISOString(),
      };
    }

    return {
      sent: true,
      message: 'Enviamos um novo código de confirmação para o seu e-mail.',
      expiresAt: dispatch.expiresAt.toISOString(),
    };
  }

  async requestPasswordResetCode(dto: RequestPasswordResetCodeDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        emailConfirmedAt: true,
        passwordResetCodeSentAt: true,
      },
    });

    if (!user?.emailConfirmedAt) {
      return {
        sent: true,
        message:
          'Se este e-mail existir na plataforma, um código de recuperação foi enviado.',
      };
    }

    const now = Date.now();
    const cooldownMs = this.getPasswordResetCooldownSeconds() * 1000;
    const lastSentAt = user.passwordResetCodeSentAt?.getTime() ?? 0;

    if (lastSentAt && now - lastSentAt < cooldownMs) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownMs - (now - lastSentAt)) / 1000));
      return {
        sent: false,
        message: `Aguarde ${waitSeconds} segundo(s) antes de solicitar outro código.`,
      };
    }

    const code = this.generatePasswordResetCode();
    const codeHash = await hash(code, 10);
    const expiresAt = new Date(now + this.getPasswordResetTtlMinutes() * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetCodeHash: codeHash,
        passwordResetCodeExpiresAt: expiresAt,
        passwordResetCodeSentAt: new Date(),
      },
    });

    try {
      await this.mailService.sendPasswordResetCodeEmail({
        to: user.email,
        recipientName: user.name,
        resetCode: code,
        expiresInMinutes: this.getPasswordResetTtlMinutes(),
      });
    } catch (error) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetCodeSentAt: null,
        },
      });
      throw error;
    }

    return {
      sent: true,
      message: 'Enviamos um código de recuperação para o seu e-mail.',
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyPasswordResetCode(dto: VerifyPasswordResetCodeDto) {
    const email = dto.email.trim().toLowerCase();
    const code = dto.code.trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailConfirmedAt: true,
        passwordResetCodeHash: true,
        passwordResetCodeExpiresAt: true,
      },
    });

    if (!user || !user.emailConfirmedAt) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    if (!user.passwordResetCodeHash || !user.passwordResetCodeExpiresAt) {
      throw new BadRequestException(
        'Nenhum código ativo foi encontrado para este e-mail. Solicite um novo código.',
      );
    }

    if (user.passwordResetCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const validCode = await compare(code, user.passwordResetCodeHash);
    if (!validCode) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    return {
      verified: true,
      message: 'Código validado com sucesso.',
    };
  }

  async resetPasswordWithCode(dto: ResetPasswordWithCodeDto): Promise<AuthPayload> {
    const email = dto.email.trim().toLowerCase();
    const code = dto.code.trim();
    const password = dto.password;

    if (!this.isValidPasswordForStudentPortal(password)) {
      throw new BadRequestException(
        'A senha deve ter pelo menos 8 caracteres e conter letras e números.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailConfirmedAt: true,
        passwordResetCodeHash: true,
        passwordResetCodeExpiresAt: true,
      },
    });

    if (!user || !user.emailConfirmedAt) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    if (!user.passwordResetCodeHash || !user.passwordResetCodeExpiresAt) {
      throw new BadRequestException(
        'Nenhum código ativo foi encontrado para este e-mail. Solicite um novo código.',
      );
    }

    if (user.passwordResetCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const validCode = await compare(code, user.passwordResetCodeHash);
    if (!validCode) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const nextPasswordHash = await hash(password, 12);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: nextPasswordHash,
        passwordResetCodeHash: null,
        passwordResetCodeExpiresAt: null,
        passwordResetCodeSentAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return this.buildAuthPayload(updatedUser);
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
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationCodeSentAt: null,
        },
      });

      if (options?.throwOnDeliveryFailure) {
        throw error;
      }

      return {
        status: 'failed',
        expiresAt,
      };
    }
  }

  private async sendPendingAdminVerificationCode(input: {
    name: string;
    email: string;
    passwordHash: string;
    previous?: PendingAdminRegistration | null;
    ignoreCooldown?: boolean;
    throwOnDeliveryFailure?: boolean;
  }): Promise<EmailVerificationDispatchResult> {
    const nowMs = Date.now();
    const cooldownMs = this.getEmailVerificationCooldownSeconds() * 1000;
    const lastSentAt = input.previous?.codeSentAt
      ? new Date(input.previous.codeSentAt).getTime()
      : 0;

    if (
      !input.ignoreCooldown &&
      lastSentAt &&
      Number.isFinite(lastSentAt) &&
      nowMs - lastSentAt < cooldownMs
    ) {
      const waitSeconds = Math.max(
        1,
        Math.ceil((cooldownMs - (nowMs - lastSentAt)) / 1000),
      );
      const fallbackExpiry = input.previous?.codeExpiresAt
        ? new Date(input.previous.codeExpiresAt)
        : new Date(nowMs + this.getEmailVerificationTtlMinutes() * 60 * 1000);

      return {
        status: 'cooldown',
        expiresAt: fallbackExpiry,
        waitSeconds,
      };
    }

    const code = this.generateEmailVerificationCode();
    const codeHash = await hash(code, 10);
    const expiresAt = new Date(
      nowMs + this.getEmailVerificationTtlMinutes() * 60 * 1000,
    );
    const nowIso = new Date(nowMs).toISOString();

    const payload: PendingAdminRegistration = {
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      codeHash,
      codeExpiresAt: expiresAt.toISOString(),
      codeSentAt: nowIso,
      createdAt: input.previous?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    await this.savePendingAdminRegistration(payload);

    try {
      await this.mailService.sendAccountVerificationEmail({
        to: input.email,
        recipientName: input.name,
        verificationCode: code,
        expiresInMinutes: this.getEmailVerificationTtlMinutes(),
        audience: 'professor',
      });

      return {
        status: 'sent',
        expiresAt,
      };
    } catch (error) {
      await this.savePendingAdminRegistration({
        ...payload,
        codeSentAt: null,
        updatedAt: new Date().toISOString(),
      });

      if (input.throwOnDeliveryFailure) {
        throw error;
      }

      return {
        status: 'failed',
        expiresAt,
      };
    }
  }

  private pendingAdminRegistrationKey(email: string) {
    return `${PENDING_ADMIN_REGISTRATION_PREFIX}${encodeURIComponent(email)}`;
  }

  private async findPendingAdminRegistration(
    email: string,
  ): Promise<PendingAdminRegistration | null> {
    const record = await this.prisma.systemSetting.findUnique({
      where: { key: this.pendingAdminRegistrationKey(email) },
      select: { value: true },
    });

    if (!record?.value) {
      return null;
    }

    try {
      const parsed = JSON.parse(record.value) as PendingAdminRegistration;
      if (
        !parsed ||
        typeof parsed.name !== 'string' ||
        typeof parsed.email !== 'string' ||
        typeof parsed.passwordHash !== 'string'
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private async savePendingAdminRegistration(
    payload: PendingAdminRegistration,
  ): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key: this.pendingAdminRegistrationKey(payload.email) },
      update: { value: JSON.stringify(payload) },
      create: {
        key: this.pendingAdminRegistrationKey(payload.email),
        value: JSON.stringify(payload),
      },
    });
  }

  private async deletePendingAdminRegistration(email: string): Promise<void> {
    await this.prisma.systemSetting.deleteMany({
      where: { key: this.pendingAdminRegistrationKey(email) },
    });
  }

  async getMe(
    userId: string,
    activeInstitutionId?: string | null,
  ): Promise<AuthUserPayload> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return this.buildUserPayload(user, activeInstitutionId);
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

    const context = await this.resolveAuthInstitutionContext(target);
    const accessToken = await this.signAccessToken(
      target,
      context,
      {
        impersonatedBy: actor.id,
        impersonationReason: reason,
        impersonationStartedAt: startedAtDate.toISOString(),
      },
      ACCESS_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      user: await this.buildUserPayload(target, context.activeInstitutionId),
      context,
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
  }, requestedInstitutionId?: string): Promise<AuthPayloadWithContext> {
    const context = await this.resolveAuthInstitutionContext(
      user,
      requestedInstitutionId,
    );
    const accessToken = await this.signAccessToken(user, context);

    return {
      accessToken,
      user: await this.buildUserPayload(user, context.activeInstitutionId),
      context,
    };
  }

  private async signAccessToken(
    user: { id: string; email: string; role: string },
    context: AuthInstitutionContext,
    extraPayload?: Record<string, unknown>,
    expiresIn?: number,
  ) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: this.mapRole(user.role),
        activeInstitutionId: context.activeInstitutionId,
        activeMemberId: context.activeMemberId,
        activeRoleCodes: context.activeRoleCodes,
        activePermissionCodes: context.activePermissionCodes,
        ...(extraPayload ?? {}),
      },
      expiresIn
        ? {
            expiresIn,
          }
        : undefined,
    );
  }

  private async resolveAuthInstitutionContext(
    user: { id: string; name: string; email: string; role: string },
    requestedInstitutionId?: string,
  ): Promise<AuthInstitutionContext> {
    const mappedRole = this.mapRole(user.role);
    if (mappedRole === 'admin') {
      await this.ensureDefaultInstitutionForAdmin(user);
    }

    const memberships = await this.prisma.institutionMember.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      include: {
        memberRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (memberships.length === 0) {
      return {
        activeInstitutionId: null,
        activeMemberId: null,
        activeRoleCodes: [],
        activePermissionCodes: [],
      };
    }

    const selectedMembership = requestedInstitutionId
      ? memberships.find((item) => item.institutionId === requestedInstitutionId)
      : memberships[0];

    if (!selectedMembership) {
      throw new ForbiddenException(
        'Você não possui vínculo ativo com a instituição selecionada.',
      );
    }

    const activeRoleCodes = [
      ...new Set(selectedMembership.memberRoles.map((item) => item.role.code)),
    ];
    const activePermissionCodes = [
      ...new Set(
        selectedMembership.memberRoles.flatMap((item) =>
          item.role.rolePermissions.map((permission) => permission.permission.code),
        ),
      ),
    ];

    return {
      activeInstitutionId: selectedMembership.institutionId,
      activeMemberId: selectedMembership.id,
      activeRoleCodes,
      activePermissionCodes,
    };
  }

  private async ensureDefaultInstitutionForAdmin(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }) {
    const institutionSlug = `inst-${user.id.replace(/-/g, '')}`;
    const institutionName = `Instituição de ${user.name || user.email}`;

    const { institution, member } = await this.prisma.$transaction(async (tx) => {
      const ensuredInstitution = await tx.institution.upsert({
        where: { slug: institutionSlug },
        update: {
          name: institutionName,
          status: 'ACTIVE',
        },
        create: {
          slug: institutionSlug,
          name: institutionName,
          status: 'ACTIVE',
        },
      });

      const ensuredMember = await tx.institutionMember.upsert({
        where: {
          institutionId_userId: {
            institutionId: ensuredInstitution.id,
            userId: user.id,
          },
        },
        update: {
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        create: {
          institutionId: ensuredInstitution.id,
          userId: user.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      return {
        institution: ensuredInstitution,
        member: ensuredMember,
      };
    });

    await this.ensurePermissionCatalog();
    await this.ensureRoleTemplatesForInstitution(institution.id);
    await this.ensureOwnerRoleAssignment(member.id, institution.id);
  }

  private async ensurePermissionCatalog() {
    for (const permission of SYSTEM_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        update: {
          description: permission.description,
        },
        create: {
          code: permission.code,
          description: permission.description,
        },
      });
    }
  }

  private async ensureRoleTemplatesForInstitution(institutionId: string) {
    for (const roleTemplate of ROLE_TEMPLATES) {
      await this.prisma.institutionRole.upsert({
        where: {
          institutionId_code: {
            institutionId,
            code: roleTemplate.code,
          },
        },
        update: {
          name: roleTemplate.name,
          isSystem: true,
        },
        create: {
          institutionId,
          code: roleTemplate.code,
          name: roleTemplate.name,
          isSystem: true,
        },
      });
    }

    const roles = await this.prisma.institutionRole.findMany({
      where: { institutionId },
      select: {
        id: true,
        code: true,
      },
    });
    const permissions = await this.prisma.permission.findMany({
      where: {
        code: {
          in: [...new Set(Object.values(ROLE_PERMISSION_MATRIX).flat())],
        },
      },
      select: { id: true, code: true },
    });

    const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
    const permissionIdByCode = new Map(
      permissions.map((permission) => [permission.code, permission.id]),
    );

    const links: Array<{ roleId: string; permissionId: string }> = [];
    Object.entries(ROLE_PERMISSION_MATRIX).forEach(
      ([roleCode, permissionCodes]) => {
        const roleId = roleIdByCode.get(roleCode);
        if (!roleId) return;

        permissionCodes.forEach((permissionCode) => {
          const permissionId = permissionIdByCode.get(permissionCode);
          if (!permissionId) return;
          links.push({ roleId, permissionId });
        });
      },
    );

    if (links.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: links,
        skipDuplicates: true,
      });
    }
  }

  private async ensureOwnerRoleAssignment(memberId: string, institutionId: string) {
    const ownerRole = await this.prisma.institutionRole.findUnique({
      where: {
        institutionId_code: {
          institutionId,
          code: 'institution_owner',
        },
      },
      select: { id: true },
    });

    if (!ownerRole) {
      return;
    }

    await this.prisma.memberRole.createMany({
      data: [{ memberId, roleId: ownerRole.id }],
      skipDuplicates: true,
    });
  }

  private async buildUserPayload(
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
    },
    preferredInstitutionId?: string | null,
  ): Promise<AuthUserPayload> {
    const avatar = await this.uploadsService.getOwnerAsset(
      UploadOwnerType.USER,
      user.id,
      PROFILE_AVATAR_KIND,
    );

    let membership = null as
      | {
          institution: {
            id: string;
            name: string;
            slug: string;
            brandingLogoUrl: string | null;
            brandingPalette: Prisma.JsonValue | null;
          };
        }
      | null;

    if (preferredInstitutionId) {
      membership = await this.prisma.institutionMember.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          institutionId: preferredInstitutionId,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          institution: {
            select: {
              id: true,
              name: true,
              slug: true,
              brandingLogoUrl: true,
              brandingPalette: true,
            },
          },
        },
      });
    }

    if (!membership) {
      membership = await this.prisma.institutionMember.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'asc' },
        select: {
          institution: {
            select: {
              id: true,
              name: true,
              slug: true,
              brandingLogoUrl: true,
              brandingPalette: true,
            },
          },
        },
      });
    }

    const institution = membership?.institution ?? null;
    const branding = institution
      ? this.resolveInstitutionBranding({
          brandingLogoUrl: institution.brandingLogoUrl,
          brandingPalette: institution.brandingPalette,
        })
      : null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: this.mapRole(user.role),
      avatarUrl: avatar?.url ?? null,
      institution: institution
        ? {
            id: institution.id,
            name: institution.name,
            slug: institution.slug,
          }
        : null,
      branding,
    };
  }

  private resolveInstitutionBranding(institution: {
    brandingLogoUrl: string | null;
    brandingPalette: Prisma.JsonValue | null;
  }): {
    logoUrl: string;
    palette: InstitutionBrandingPalette;
    isCustom: boolean;
  } {
    const palette = this.resolveBrandingPalette(institution.brandingPalette);
    const logoUrl =
      institution.brandingLogoUrl?.trim() || DEFAULT_STUDENT_BRANDING_LOGO_URL;
    const hasCustomLogo =
      Boolean(institution.brandingLogoUrl) &&
      institution.brandingLogoUrl !== DEFAULT_STUDENT_BRANDING_LOGO_URL;
    const hasCustomPalette = !this.isDefaultBrandingPalette(palette);

    return {
      logoUrl,
      palette,
      isCustom: hasCustomLogo || hasCustomPalette,
    };
  }

  private resolveBrandingPalette(
    rawPalette?: Prisma.JsonValue | null,
  ): InstitutionBrandingPalette {
    const palette = { ...DEFAULT_STUDENT_BRANDING_PALETTE };
    if (!rawPalette || typeof rawPalette !== 'object' || Array.isArray(rawPalette)) {
      return palette;
    }

    const rawMap = rawPalette as Record<string, unknown>;
    for (const field of BRANDING_COLOR_FIELDS) {
      const value = rawMap[field];
      if (typeof value !== 'string') continue;
      const normalized = value.trim().toLowerCase();
      if (this.isHexColor(normalized)) {
        palette[field] = normalized;
      }
    }

    return palette;
  }

  private isDefaultBrandingPalette(palette: InstitutionBrandingPalette) {
    return BRANDING_COLOR_FIELDS.every(
      (field) =>
        palette[field].toLowerCase() ===
        DEFAULT_STUDENT_BRANDING_PALETTE[field].toLowerCase(),
    );
  }

  private isHexColor(value: string) {
    return /^#([0-9a-fA-F]{6})$/.test(value);
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

  private isValidPasswordForStudentPortal(password: string): boolean {
    const normalized = String(password ?? '');
    if (normalized.length < 8) return false;
    return /[A-Za-z]/.test(normalized) && /\d/.test(normalized);
  }

  private generateEmailVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(
      EMAIL_VERIFICATION_CODE_LENGTH,
      '0',
    );
  }

  private generatePasswordResetCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(
      PASSWORD_RESET_CODE_LENGTH,
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

  private getPasswordResetTtlMinutes(): number {
    const rawValue = Number(
      this.configService.get<string>('PASSWORD_RESET_TTL_MINUTES') ??
        DEFAULT_PASSWORD_RESET_TTL_MINUTES,
    );

    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return DEFAULT_PASSWORD_RESET_TTL_MINUTES;
    }

    return Math.floor(rawValue);
  }

  private getPasswordResetCooldownSeconds(): number {
    const rawValue = Number(
      this.configService.get<string>('PASSWORD_RESET_COOLDOWN_SECONDS') ??
        DEFAULT_PASSWORD_RESET_COOLDOWN_SECONDS,
    );

    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return DEFAULT_PASSWORD_RESET_COOLDOWN_SECONDS;
    }

    return Math.floor(rawValue);
  }
}
