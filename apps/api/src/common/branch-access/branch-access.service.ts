/**
 * BranchAccessService — central enforcement of multi-branch RBAC.
 * ─────────────────────────────────────────────────────────────
 * Rule of thumb for every backend endpoint in Qit3ati:
 *
 *   • WRITE endpoints (create sale, create purchase, transfer, …)
 *     must call `assertWrite(user, tenantId, branchId)` BEFORE
 *     touching any Prisma model. Owners bypass; managers/employees
 *     restricted to their assigned branches. Cross-branch writes
 *     return 403.
 *
 *   • READ list endpoints (list sales, list stock, …) should call
 *     `scope(user, tenantId, requestedBranchId?)` which returns
 *     either a single branchId (respected + validated) or an array
 *     of branchIds (the user's assigned set) to be used with
 *     `where: { branchId: { in: […] } }`. Owners get `null`
 *     meaning "no filter — show all branches".
 *
 *   • Transfers, which touch TWO branches, must call
 *     `assertWrite(...)` twice — once for source, once for target.
 *
 * Owner criteria (any of):
 *   1. `isSuperAdmin === true` (platform-level admin)
 *   2. `permissions` includes `branches.view_all`  (role-level)
 *
 * We deliberately cache nothing here — the DB round-trip is cheap
 * (single indexed `user_branches` lookup), and staleness on a role
 * change would be far more expensive than the query.
 */
import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtUser } from '../decorators/current-user.decorator';

@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns true if the user has org-wide access (owner/admin) and
   * should NOT be restricted to their UserBranch rows.
   */
  isOwner(user: JwtUser): boolean {
    if (user.isSuperAdmin) return true;
    return (user.permissions ?? []).includes('branches.view_all');
  }

  /**
   * Returns the set of branch IDs a user can access within a tenant.
   * Owners get `null` (meaning "no restriction — all branches").
   * Non-owners with zero UserBranch rows get `[]` (they can access
   * nothing branch-scoped — this is the safe default).
   */
  async getAccessibleBranchIds(user: JwtUser, tenantId: string): Promise<string[] | null> {
    if (this.isOwner(user)) return null;
    const rows = await this.prisma.userBranch.findMany({
      where: { userId: user.sub, branch: { tenantId, isActive: true, deletedAt: null } },
      select: { branchId: true },
    });
    return rows.map((r) => r.branchId);
  }

  /**
   * Throws 403 if the user cannot write to `branchId`. Also validates
   * the branch belongs to the tenant (so a caller can't just guess
   * a UUID from another tenant).
   *
   * Owners pass through without a DB round-trip on the UserBranch
   * table (still validates tenant ownership).
   */
  async assertWrite(user: JwtUser, tenantId: string, branchId: string): Promise<void> {
    if (!branchId) throw new BadRequestException('branchId required');

    // Confirm the branch belongs to this tenant + is active
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!branch)          throw new ForbiddenException('branch not in your tenant');
    if (!branch.isActive) throw new ForbiddenException('branch inactive');

    if (this.isOwner(user)) return;

    const link = await this.prisma.userBranch.findFirst({
      where: { userId: user.sub, branchId },
      select: { userId: true },
    });
    if (!link) throw new ForbiddenException('you are not assigned to this branch');
  }

  /**
   * Compute the branchId filter for a read/list query.
   *
   * Cases:
   *   • Caller passed `requestedBranchId` → validate access + return it
   *     as a single filter (in Prisma: `where: { branchId }`).
   *   • Caller passed no filter and user is owner → return null →
   *     the caller should NOT add a branchId filter at all.
   *   • Caller passed no filter and user is non-owner → return the
   *     user's UserBranch list (empty array means "no results").
   *
   * Callers use it like this:
   *   const scope = await branchAccess.scope(user, tenantId, q.branchId);
   *   const where = { tenantId,
   *     ...(scope === null ? {}
   *        : Array.isArray(scope) ? { branchId: { in: scope } }
   *        : { branchId: scope }) };
   */
  async scope(
    user: JwtUser,
    tenantId: string,
    requestedBranchId?: string | null,
  ): Promise<string | string[] | null> {
    if (requestedBranchId) {
      await this.assertWrite(user, tenantId, requestedBranchId);
      return requestedBranchId;
    }
    if (this.isOwner(user)) return null;
    const accessible = await this.getAccessibleBranchIds(user, tenantId);
    return accessible ?? [];
  }

  /**
   * Verifies a branch belongs to the tenant + is active, without
   * requiring the current user to be assigned to it. Used for the
   * TARGET branch of a transfer, which the initiator doesn't need
   * to have direct access to (they're just sending stock; a
   * different user at the target branch handles the receive).
   */
  async assertBranchInTenant(tenantId: string, branchId: string): Promise<void> {
    if (!branchId) throw new BadRequestException('branchId required');
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!branch)          throw new ForbiddenException('branch not in your tenant');
    if (!branch.isActive) throw new ForbiddenException('branch inactive');
  }
}
