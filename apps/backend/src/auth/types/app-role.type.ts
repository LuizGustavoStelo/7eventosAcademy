export type AppRole = 'user' | 'admin' | 'superadmin';

export type JwtPayload = {
  sub: string;
  email: string;
  role: AppRole;
  impersonatedBy?: string;
  impersonationReason?: string;
  impersonationStartedAt?: string;
  iat?: number;
  exp?: number;
};
