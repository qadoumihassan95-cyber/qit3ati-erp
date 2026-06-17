import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  sub: string;          // user id
  tenantId: string | null;
  roleId: string | null;
  email?: string;
  fullName?: string;
  isSuperAdmin?: boolean;
  permissions?: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | any => {
    const req = ctx.switchToHttp().getRequest();
    return data ? req.user?.[data] : req.user;
  },
);
