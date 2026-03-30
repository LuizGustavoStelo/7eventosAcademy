export type AppRole = 'user' | 'admin' | 'superadmin';

export type JwtPayload = {
  sub: string;
  email: string;
  role: AppRole;
  activeInstitutionId?: string | null;
  activeMemberId?: string | null;
  activeRoleCodes?: string[];
  activePermissionCodes?: string[];
  impersonatedBy?: string;
  impersonationReason?: string;
  impersonationStartedAt?: string;
  iat?: number;
  exp?: number;
};
