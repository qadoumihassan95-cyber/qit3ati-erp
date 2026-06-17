import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Reads X-Tenant-ID header (if any) and attaches to req.tenantId.
 * The JwtStrategy will also attach tenantId from the JWT — that wins over the header.
 * Mostly useful for unauthenticated routes (e.g. login by slug).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { tenantId?: string }, _res: Response, next: NextFunction) {
    const header = req.headers['x-tenant-id'];
    if (typeof header === 'string' && header.length > 0) {
      req.tenantId = header;
    }
    next();
  }
}
