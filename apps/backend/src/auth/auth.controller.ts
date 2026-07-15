import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetCodeDto } from './dto/request-password-reset-code.dto';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto';
import { ResendVerificationEmailDto } from './dto/resend-verification-email.dto';
import { RegisterDto } from './dto/register.dto';
import { SwitchInstitutionDto } from './dto/switch-institution.dto';
import { UpdateInstitutionContactsDto } from './dto/update-institution-contacts.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { VerifyEmailLinkDto } from './dto/verify-email-link.dto';
import { VerifyPasswordResetCodeDto } from './dto/verify-password-reset-code.dto';
import { JwtPayload } from './types/app-role.type';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
  file: () => Promise<MultipartFile | undefined>;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('switch-institution')
  async switchInstitution(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SwitchInstitutionDto,
  ) {
    return this.authService.switchInstitution(request.user.sub, dto.institutionId);
  }

  @Get('my-institutions')
  async myInstitutions(@Req() request: AuthenticatedRequest) {
    return this.authService.getMyInstitutions(request.user.sub, {
      activeInstitutionId: request.user.activeInstitutionId ?? null,
      activeMemberId: request.user.activeMemberId ?? null,
      activeRoleCodes: request.user.activeRoleCodes ?? [],
      activePermissionCodes: request.user.activePermissionCodes ?? [],
    });
  }

  @Public()
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailLinkDto) {
    return this.authService.verifyEmailLink(dto);
  }

  @Public()
  @Post('resend-verification-email')
  async resendVerificationEmail(@Body() dto: ResendVerificationEmailDto) {
    return this.authService.resendVerificationEmail(dto);
  }

  @Public()
  @Post('resend-verification-code')
  async resendVerificationEmailLegacy(@Body() dto: ResendVerificationEmailDto) {
    return this.authService.resendVerificationEmail(dto);
  }

  @Public()
  @Post('request-password-reset-code')
  async requestPasswordResetCode(@Body() dto: RequestPasswordResetCodeDto) {
    return this.authService.requestPasswordResetCode(dto);
  }

  @Public()
  @Post('reset-password-with-code')
  async resetPasswordWithCode(@Body() dto: ResetPasswordWithCodeDto) {
    return this.authService.resetPasswordWithCode(dto);
  }

  @Public()
  @Post('verify-password-reset-code')
  async verifyPasswordResetCode(@Body() dto: VerifyPasswordResetCodeDto) {
    return this.authService.verifyPasswordResetCode(dto);
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(
      request.user.sub,
      request.user.activeInstitutionId ?? null,
    );
  }

  @Patch('me')
  async updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateMeDto,
  ) {
    return this.authService.updateMe(request.user.sub, dto);
  }

  @Get('institution-contacts')
  async getInstitutionContacts(@Req() request: AuthenticatedRequest) {
    return this.authService.getInstitutionContacts(
      request.user.sub,
      request.user.role,
      request.user.activeInstitutionId ?? null,
    );
  }

  @Patch('institution-contacts')
  async updateInstitutionContacts(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateInstitutionContactsDto,
  ) {
    return this.authService.updateInstitutionContacts(
      request.user.sub,
      request.user.role,
      request.user.activeInstitutionId ?? null,
      dto,
    );
  }

  @Post('me/avatar')
  async uploadAvatar(@Req() request: AuthenticatedRequest) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException(
        'Envie um arquivo de imagem no campo avatar.',
      );
    }

    return this.authService.uploadMyAvatar(request.user.sub, file);
  }

  @Delete('me/avatar')
  async removeAvatar(@Req() request: AuthenticatedRequest) {
    return this.authService.removeMyAvatar(request.user.sub);
  }
}
