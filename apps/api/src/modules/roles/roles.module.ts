/**
 * Roles + Permissions API.
 *
 * All endpoints require the `users.manage` permission — role editing
 * is administrative surface. Super-admins bypass automatically via
 * PermissionsGuard.
 *
 * Endpoints:
 *   GET    /roles                       — list tenant roles + counts
 *   GET    /roles/:id                   — role detail + full perm list
 *   POST   /roles                       — create a custom role (name + optional starter perms)
 *   PATCH  /roles/:id                   — rename / update label
 *   PATCH  /roles/:id/permissions       — REPLACE the role's perm set (idempotent bulk set)
 *   DELETE /roles/:id                   — delete a role (blocked when in use by any user)
 *   GET    /permissions                 — full catalog grouped by module
 *
 * Design notes:
 *   • System roles (owner / manager / branch_manager / accountant /
 *     warehouse / cashier / viewer / workshop) come from the seed as
 *     tenant-less templates and can't be renamed or deleted. Their
 *     permission set CAN be edited (a shop might want to lock down
 *     "cashier" further), and the change scopes to the current tenant
 *     — we do that by CLONING the template into a tenant-specific row
 *     on first edit. This keeps other tenants unaffected.
 *   • Owner role always retains every permission — we refuse a save
 *     that would strip anything from owner in the current tenant, to
 *     prevent an admin from accidentally locking themselves out.
 */
import { Module, Controller, Get, Post, Patch, Delete, Body, Param, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(40)  name!: string;
  @IsOptional() @IsString() @MaxLength(120) labelAr?: string;
  @IsOptional() @IsArray()  permissions?: string[];   // permission codes
}

class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(40)  name?: string;
  @IsOptional() @IsString() @MaxLength(120)               labelAr?: string;
}

class SetPermissionsDto {
  @IsArray() permissions!: string[];
}

@Injectable()
class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- reads ----------

  async list(tenantId: string) {
    // Roles table has a nullable tenantId — system templates have null,
    // custom-per-tenant roles have the id. Show both to the current tenant.
    const rows = await this.prisma.role.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      include: {
        rolePermissions: { select: { permissionId: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    });
    // Count tenant users per role in a single follow-up query rather
    // than a filtered `_count` (which needs preview features).
    const roleIds = rows.map(r => r.id);
    const counts = await this.prisma.user.groupBy({
      by: ['roleId'],
      where: { tenantId, deletedAt: null, roleId: { in: roleIds } },
      _count: { _all: true },
    });
    const countByRole = new Map(counts.map(c => [c.roleId!, c._count._all]));
    return rows.map((r) => ({
      id:              r.id,
      name:            r.name,
      labelAr:         r.labelAr,
      isSystem:        r.tenantId === null,
      permissionCount: r.rolePermissions.length,
      userCount:       countByRole.get(r.id) ?? 0,
    }));
  }

  async findOne(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ tenantId: null }, { tenantId }] },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('role not found');
    return {
      id:       role.id,
      name:     role.name,
      labelAr:  role.labelAr,
      isSystem: role.tenantId === null,
      permissions: role.rolePermissions.map((rp) => rp.permission.code),
    };
  }

  async allPermissions() {
    // Group by module for a friendly matrix UI.
    const perms = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
    const byModule = new Map<string, { code: string; module: string; labelAr: string | null }[]>();
    for (const p of perms) {
      const bucket = byModule.get(p.module) ?? [];
      bucket.push({ code: p.code, module: p.module, labelAr: p.labelAr });
      byModule.set(p.module, bucket);
    }
    return Array.from(byModule.entries()).map(([module, items]) => ({ module, items }));
  }

  // ---------- writes ----------

  async create(tenantId: string, dto: CreateRoleDto) {
    // Name must be unique within a tenant's custom-role space
    const clash = await this.prisma.role.findFirst({ where: { tenantId, name: dto.name } });
    if (clash) throw new BadRequestException('role name already in use');

    const role = await this.prisma.role.create({
      data: {
        tenantId,
        name:    dto.name,
        labelAr: dto.labelAr ?? dto.name,
      },
    });
    if (dto.permissions?.length) {
      await this.setPermissions(tenantId, role.id, dto.permissions);
    }
    return this.findOne(tenantId, role.id);
  }

  async update(tenantId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({ where: { id } });
    if (!role) throw new NotFoundException('role not found');
    if (role.tenantId === null) {
      throw new ForbiddenException('system roles cannot be renamed — create a custom copy instead');
    }
    if (role.tenantId !== tenantId) throw new ForbiddenException('role not in your tenant');
    return this.prisma.role.update({
      where: { id },
      data:  { name: dto.name ?? role.name, labelAr: dto.labelAr ?? role.labelAr },
    });
  }

  async remove(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id } });
    if (!role) throw new NotFoundException('role not found');
    if (role.tenantId === null) throw new ForbiddenException('system roles cannot be deleted');
    if (role.tenantId !== tenantId) throw new ForbiddenException('role not in your tenant');
    const inUse = await this.prisma.user.count({ where: { roleId: id, deletedAt: null } });
    if (inUse > 0) throw new BadRequestException('role is assigned to users — reassign them first');
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * REPLACES a role's permission set with `codes`. Idempotent: safe
   * to call repeatedly with the same set.
   *
   * If the target is a system role (tenantId null), we transparently
   * CLONE it into a tenant-specific copy and reassign every user in
   * this tenant who was on the template to the new copy. Other tenants
   * are unaffected.
   *
   * Owner role gets a safety net: refuses saves that don't include
   * ALL permissions (so an admin can't accidentally lock themselves
   * out of the system by editing "owner").
   */
  async setPermissions(tenantId: string, id: string, codes: string[]) {
    // Validate every code exists — reject unknown codes rather than
    // silently ignoring them, which would hide client bugs.
    const perms = await this.prisma.permission.findMany({
      where: { code: { in: codes } }, select: { id: true, code: true },
    });
    if (perms.length !== new Set(codes).size) {
      const found = new Set(perms.map(p => p.code));
      const unknown = codes.filter(c => !found.has(c));
      throw new BadRequestException(`unknown permission codes: ${unknown.join(', ')}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.role.findFirst({ where: { id } });
      if (!template) throw new NotFoundException('role not found');
      if (template.tenantId !== null && template.tenantId !== tenantId) {
        throw new ForbiddenException('role not in your tenant');
      }

      // Owner safety net — owner MUST keep every permission.
      if (template.name === 'owner') {
        const allPerms = await tx.permission.count();
        if (codes.length < allPerms) {
          throw new BadRequestException('owner role must retain every permission');
        }
      }

      let targetId = template.id;
      if (template.tenantId === null) {
        // Clone this system role into a tenant-specific copy the first
        // time it's edited in this tenant. Reuse the copy on future edits.
        const existingCopy = await tx.role.findFirst({
          where: { tenantId, name: template.name },
        });
        if (existingCopy) {
          targetId = existingCopy.id;
        } else {
          const copy = await tx.role.create({
            data: { tenantId, name: template.name, labelAr: template.labelAr },
          });
          targetId = copy.id;
          // Reassign every user in this tenant who was on the template
          // (there won't be any, because assignment uses the template
          // id at seed-time — but we handle both cases defensively).
          await tx.user.updateMany({
            where: { tenantId, roleId: template.id },
            data:  { roleId: copy.id },
          });
        }
      }

      // Wipe + reinsert (simpler than diffing; role_permissions is small)
      await tx.rolePermission.deleteMany({ where: { roleId: targetId } });
      await tx.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: targetId, permissionId: p.id })),
      });

      return this.findOne(tenantId, targetId);
    });
  }
}

@Controller('roles')
class RolesController {
  constructor(private readonly svc: RolesService) {}

  @Get()
  @Permissions('users.manage')
  list(@Tenant() tid: string) { return this.svc.list(tid); }

  @Get(':id')
  @Permissions('users.manage')
  one(@Tenant() tid: string, @Param('id') id: string) { return this.svc.findOne(tid, id); }

  @Post()
  @Permissions('users.manage')
  create(@Tenant() tid: string, @Body() dto: CreateRoleDto) { return this.svc.create(tid, dto); }

  @Patch(':id')
  @Permissions('users.manage')
  update(@Tenant() tid: string, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.svc.update(tid, id, dto);
  }

  @Patch(':id/permissions')
  @Permissions('users.manage')
  setPerms(@Tenant() tid: string, @Param('id') id: string, @Body() dto: SetPermissionsDto) {
    return this.svc.setPermissions(tid, id, dto.permissions);
  }

  @Delete(':id')
  @Permissions('users.manage')
  remove(@Tenant() tid: string, @Param('id') id: string) { return this.svc.remove(tid, id); }
}

@Controller('permissions')
class PermissionsController {
  constructor(private readonly svc: RolesService) {}

  @Get()
  @Permissions('users.manage')
  list() { return this.svc.allPermissions(); }
}

@Module({
  controllers: [RolesController, PermissionsController],
  providers:   [RolesService],
  exports:     [RolesService],
})
export class RolesModule {}
