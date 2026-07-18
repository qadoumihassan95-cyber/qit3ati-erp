import {
  Module, Controller, Get, Post, Body, Injectable, BadRequestException,
} from '@nestjs/common';
import { IsArray, IsEmail, IsOptional, IsString, MaxLength, MinLength, IsUUID } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class CreateUserDto {
  @IsString() @MaxLength(150) fullName!: string;
  @IsEmail()  @MaxLength(200) email!: string;
  @IsString() @MinLength(6) @MaxLength(200) password!: string;
  @IsUUID()                                 roleId!: string;
  @IsArray()  @IsOptional() @IsUUID('all', { each: true }) branchIds?: string[];
  @IsString() @IsOptional() @MaxLength(30)  phone?: string;
}

@Injectable()
class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      include: { role: true, userBranches: { include: { branch: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * Create an employee (User row) for the current tenant. Multi-branch
   * assignment via UserBranch pivots. Email uniqueness is enforced at
   * the DB level by @@unique([tenantId, email]) on the User model; on
   * clash we surface a friendly 400.
   */
  async create(tenantId: string, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();

    // Fast-path uniqueness check inside the tenant
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل / Email already in use in this tenant');
    }

    // Role must belong to the same tenant OR be a global role (tenantId null)
    const role = await this.prisma.role.findFirst({
      where: {
        id: dto.roleId,
        OR: [{ tenantId }, { tenantId: null }],
      },
      select: { id: true },
    });
    if (!role) throw new BadRequestException('الدور غير موجود / Role not found');

    // Branches (if any) must belong to the tenant
    const branchIds = Array.isArray(dto.branchIds) ? [...new Set(dto.branchIds)] : [];
    if (branchIds.length) {
      const branches = await this.prisma.branch.findMany({
        where: { id: { in: branchIds }, tenantId },
        select: { id: true },
      });
      if (branches.length !== branchIds.length) {
        throw new BadRequestException('فرع غير صالح / Invalid branch id');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        tenantId,
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone?.trim() || null,
        passwordHash,
        roleId: role.id,
        isActive: true,
        userBranches: branchIds.length
          ? { create: branchIds.map(branchId => ({ branchId })) }
          : undefined,
      },
      include: { role: true, userBranches: { include: { branch: true } } },
    });
    return created;
  }
}

@Controller('users')
class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get() @Permissions('users.manage')
  list(@Tenant() tid: string) { return this.svc.list(tid); }

  @Post() @Permissions('users.manage')
  create(@Tenant() tid: string, @Body() dto: CreateUserDto) {
    return this.svc.create(tid, dto);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
