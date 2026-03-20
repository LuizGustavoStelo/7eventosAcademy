import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../types/app-role.type';

type AuthenticatedRequest = {
  headers: {
    authorization?: string | string[];
  };
  user?: JwtPayload;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request.headers.authorization);

    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'JWT_SECRET não configurado no ambiente.',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      if (!payload?.sub || !payload?.email || !payload?.role) {
        throw new UnauthorizedException('Token inválido.');
      }

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }

  private extractToken(authorizationHeader?: string | string[]): string {
    const rawHeader = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;

    if (!rawHeader) {
      throw new UnauthorizedException('Token não informado.');
    }

    const [type, token] = rawHeader.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Formato de token inválido.');
    }

    return token;
  }
}
