export type AppRole = 'user' | 'admin' | 'superadmin';

export type JwtPayload = {
  sub: string;
  email: string;
  role: AppRole;
  iat?: number;
  exp?: number;
};
