import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUser } from '../../common/decorators/current-user.decorator';

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    tenantId: string | null;
    role: string | null;
    permissions: string[];
    branches: { id: string; name: string; isMain: boolean }[];
    settings: {
      logoUrl: string | null;
      colorPrimary: string;
      colorSecondary: string;
      currency: string;
      taxRate: number;
      language: string;
    } | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  /**
   * Login by email + password. If `tenantSlug` is provided, the user must belong to that tenant.
   * If omitted, we resolve the user uniquely by email; users in multiple tenants must pass slug.
   */
  async login(email: string, password: string, tenantSlug?: string): Promise<LoginResult> {
    if (!email || !password) throw new BadRequestException('البريد الإلكتروني وكلمة المرور مطلوبان');

    const where: any = { email };
    if (tenantSlug) {
      const t = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!t) throw new UnauthorizedException('الشركة غير موجودة');
      where.tenantId = t.id;
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        tenant: { include: { settings: true } },
        userBranches: { include: { branch: true } },
      },
      take: 2,
    });

    if (users.length === 0) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    if (users.length > 1) throw new UnauthorizedException('البريد مرتبط بأكثر من شركة — يرجى تحديد مُعرّف الشركة');

    const user = users[0]!;
    if (!user.isActive) throw new UnauthorizedException('الحساب معطّل — تواصل مع المالك');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    const permissions = user.role?.rolePermissions.map((rp) => rp.permission.code) ?? [];
    const payload: JwtUser = {
      sub: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      email: user.email ?? undefined,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const expiresIn = parseInt(this.cfg.get<string>('JWT_ACCESS_TTL', '3600'), 10);

    // update last login (fire and forget)
    this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => undefined);

    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role?.name ?? null,
        permissions,
        branches: user.userBranches.map((ub) => ({
          id: ub.branch.id, name: ub.branch.name, isMain: ub.branch.isMain,
        })),
        settings: user.tenant?.settings ? {
          logoUrl: user.tenant.settings.logoUrl,
          colorPrimary: user.tenant.settings.colorPrimary,
          colorSecondary: user.tenant.settings.colorSecondary,
          currency: user.tenant.settings.currency,
          taxRate: Number(user.tenant.settings.taxRate),
          language: user.tenant.settings.language,
        } : null,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, tenant: { include: { settings: true } }, userBranches: { include: { branch: true } } },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
