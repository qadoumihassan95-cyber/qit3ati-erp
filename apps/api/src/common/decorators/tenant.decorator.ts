import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

/** Returns the current tenant id (from JWT). Throws if the request is not tenant-scoped. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    const id = req.user?.tenantId ?? req.tenantId;
    if (!id) throw new BadRequestException('tenant context missing');
    return id;
  },
);

import { SetMetadata } from '@nestjs/common';

/** Whitelist endpoints that don't require authentication (e.g. login, health). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permission codes required to invoke a handler (matched against JWT permissions). */
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
