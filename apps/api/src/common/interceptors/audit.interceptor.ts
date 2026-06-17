import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUser } from '../decorators/current-user.decorator';

/**
 * Maps HTTP method + URL → audit "action" + "entity"
 * Only mutating verbs (POST/PUT/PATCH/DELETE) are logged.
 * Read operations are deliberately NOT logged to avoid noise.
 */
const METHOD_ACTION: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * URL patterns that should NOT be logged (login, health, public endpoints).
 * Keeping the audit log focused on actual business mutations.
 */
const SKIP_PATTERNS = [
  /\/auth\/(login|me)$/,
  /\/health/,
];

/**
 * Extract a sensible (entity, entityId) tuple from the request URL.
 *   /api/v1/sales          → entity = sales,    entityId = (from body or response)
 *   /api/v1/parts/:id      → entity = parts,    entityId = :id
 *   /api/v1/transfers/:id/receive → entity = transfers, entityId = :id
 */
function parseUrl(url: string): { entity: string; entityIdInUrl?: string } {
  // strip /api/v1 prefix and query string
  const beforeQuery = url.replace(/^\/api\/v\d+\//, '').split('?')[0] ?? '';
  const segments = beforeQuery.split('/').filter(Boolean);
  if (segments.length === 0) return { entity: 'unknown' };
  const entity = segments[0] ?? 'unknown';
  // UUID pattern → id
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const second = segments[1];
  const entityIdInUrl = second && uuidRe.test(second) ? second : undefined;
  return { entity, entityIdInUrl };
}

/**
 * Strip sensitive keys before storing in the audit log.
 * Never log raw passwords / tokens / hashes.
 */
const REDACT_KEYS = new Set([
  'password', 'passwordHash', 'accessToken', 'refreshToken', 'token',
  'jwtSecret', 'secret', 'apiKey',
]);

function sanitize(obj: unknown, depth = 0): unknown {
  if (obj == null || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 100).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k)) { out[k] = '***redacted***'; continue; }
    out[k] = sanitize(v, depth + 1);
  }
  return out;
}

/**
 * Global Audit interceptor.
 *
 * - Listens to every controller method.
 * - On success of POST/PUT/PATCH/DELETE, writes one row to audit_logs.
 * - Stored fields: tenantId, userId, action, entity, entityId, oldValue (request body),
 *   newValue (response body), IP, device (user-agent).
 * - Writes are fire-and-forget — never block the response.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const url: string = req.originalUrl ?? req.url;
    const action = METHOD_ACTION[method];

    // Skip read methods and public/health URLs
    if (!action) return next.handle();
    if (SKIP_PATTERNS.some((re) => re.test(url))) return next.handle();

    const user: JwtUser | undefined = req.user;
    const tenantId = user?.tenantId;
    // Skip if no tenant scope (e.g. super-admin endpoints not yet built)
    if (!tenantId) return next.handle();

    const { entity, entityIdInUrl } = parseUrl(url);
    const userId = user.sub;
    const ip = (req.ip || req.headers['x-forwarded-for'] || '').toString().slice(0, 45) || null;
    const device = (req.headers['user-agent'] || '').toString().slice(0, 240) || null;

    const reqBody = sanitize(req.body);
    const oldValue = method === 'DELETE' ? null : (reqBody && Object.keys(reqBody as object).length ? reqBody : null);

    return next.handle().pipe(
      tap({
        next: (response) => {
          // response can be an object with .id, or void for some operations
          const resObj = response && typeof response === 'object' ? response : null;
          const entityId = (resObj as any)?.id ?? entityIdInUrl;
          const newValue = sanitize(resObj);

          this.prisma.auditLog.create({
            data: {
              tenantId,
              userId,
              action,
              entity,
              entityId,
              oldValue: oldValue as any,
              newValue: newValue as any,
              ipAddress: ip,
              device,
            },
          }).catch((e: Error) => {
            // never crash the request on audit failure — log it for ops only
            this.logger.warn(`audit write failed: ${e.message}`);
          });
        },
        error: () => {
          // optionally we could log failed mutations too; skip for now to avoid noise on 400s
        },
      }),
    );
  }
}
