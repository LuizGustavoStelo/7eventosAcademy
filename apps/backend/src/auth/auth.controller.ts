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
import { ResendVerificationCodeDto } from './dto/resend-verification-code.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    sub: string;
  };
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

  @Public()
  @Post('verify-email-code')
  async verifyEmailCode(@Body() dto: VerifyEmailCodeDto) {
    return this.authService.verifyEmailCode(dto);
  }

  @Public()
  @Post('resend-verification-code')
  async resendVerificationCode(@Body() dto: ResendVerificationCodeDto) {
    return this.authService.resendVerificationCode(dto);
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(request.user.sub);
  }

  @Patch('me')
  async updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateMeDto,
  ) {
    return this.authService.updateMe(request.user.sub, dto);
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
