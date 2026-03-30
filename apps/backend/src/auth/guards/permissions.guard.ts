import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { JwtPayload } from '../types/app-role.type';

type AuthenticatedRequest = {
  user?: JwtPayload;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    if (user.role === 'superadmin') {
      return true;
    }

    const granted = new Set(user.activePermissionCodes ?? []);
    const missing = requiredPermissions.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Permissões ausentes: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
