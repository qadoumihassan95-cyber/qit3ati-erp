import { Module, Controller, Get, Post, Body, Query, Injectable, NotFoundException } from '@nestjs/common';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

// ============================ DTOs ============================

class CreateReceiptDto {
  @IsString() customerId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsEnum(['cash', 'bank', 'cheque', 'card']) method?: 'cash' | 'bank' | 'cheque' | 'card';
  @IsOptional() @IsString() @MaxLength(40) chequeNo?: string;
  @IsOptional() @IsISO8601() chequeDate?: string;
  @IsOptional() @IsISO8601() receiptDate?: string;
  @IsOptional() @IsString() branchId?: string;
}

class CreatePaymentDto {
  @IsString() supplierId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsEnum(['cash', 'bank', 'cheque', 'card']) method?: 'cash' | 'bank' | 'cheque' | 'card';
  @IsOptional() @IsISO8601() paymentDate?: string;
  @IsOptional() @IsString() branchId?: string;
}

class CreateExpenseDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() @IsISO8601() expenseDate?: string;
  @IsOptional() @IsString() branchId?: string;
}

class CreateExpenseCategoryDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
}

// ============================ Services ============================

@Injectable()
class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Receive money from a customer — atomically updates customer balance. */
  async create(tenantId: string, userId: string, d: CreateReceiptDto) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: d.customerId, tenantId, deletedAt: null },
      });
      if (!customer) throw new NotFoundException('العميل غير موجود');

      const receipt = await tx.receipt.create({
        data: {
          tenantId,
          branchId: d.branchId ?? null,
          customerId: d.customerId,
          amount: d.amount,
          method: d.method ?? 'cash',
          chequeNo: d.chequeNo ?? null,
          chequeDate: d.chequeDate ? new Date(d.chequeDate) : null,
          receiptDate: d.receiptDate ? new Date(d.receiptDate) : new Date(),
          createdBy: userId,
        },
        include: { customer: { select: { id: true, name: true } } },
      });

      // customer owes us less now
      await tx.customer.update({
        where: { id: d.customerId },
        data: { balance: { decrement: d.amount } },
      });

      return receipt;
    });
  }

  list(tenantId: string, customerId?: string) {
    return this.prisma.receipt.findMany({
      where: { tenantId, ...(customerId ? { customerId } : {}) },
      include: { customer: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}

@Injectable()
class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pay money to a supplier — atomically reduces what we owe. */
  async create(tenantId: string, userId: string, d: CreatePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: d.supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new NotFoundException('المورد غير موجود');

      const payment = await tx.payment.create({
        data: {
          tenantId,
          branchId: d.branchId ?? null,
          supplierId: d.supplierId,
          amount: d.amount,
          method: d.method ?? 'cash',
          paymentDate: d.paymentDate ? new Date(d.paymentDate) : new Date(),
          createdBy: userId,
        },
        include: { supplier: { select: { id: true, name: true } } },
      });

      // we owe supplier less now
      await tx.supplier.update({
        where: { id: d.supplierId },
        data: { balance: { decrement: d.amount } },
      });

      return payment;
    });
  }

  list(tenantId: string, supplierId?: string) {
    return this.prisma.payment.findMany({
      where: { tenantId, ...(supplierId ? { supplierId } : {}) },
      include: { supplier: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}

@Injectable()
class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, userId: string, d: CreateExpenseDto) {
    if (d.categoryId) {
      const cat = await this.prisma.expenseCategory.findFirst({
        where: { id: d.categoryId, tenantId },
      });
      if (!cat) throw new NotFoundException('فئة المصروف غير موجودة');
    }
    return this.prisma.expense.create({
      data: {
        tenantId,
        branchId: d.branchId ?? null,
        categoryId: d.categoryId ?? null,
        amount: d.amount,
        description: d.description ?? null,
        attachmentUrl: d.attachmentUrl ?? null,
        expenseDate: d.expenseDate ? new Date(d.expenseDate) : new Date(),
        createdBy: userId,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  list(tenantId: string, branchId?: string) {
    return this.prisma.expense.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: {
        category: { select: { id: true, name: true } },
        branch:   { select: { id: true, name: true } },
        creator:  { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ----- categories -----
  listCategories(tenantId: string) {
    return this.prisma.expenseCategory.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  createCategory(tenantId: string, d: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({ data: { tenantId, name: d.name } });
  }
}

// ============================ Controllers ============================

@Controller('receipts')
class ReceiptsController {
  constructor(private readonly svc: ReceiptsService) {}

  @Get()
  @Permissions('accounting.view')
  list(@Tenant() tid: string, @Query('customerId') customerId?: string) {
    return this.svc.list(tid, customerId);
  }

  @Post()
  @Permissions('accounting.entry')
  create(@Tenant() tid: string, @CurrentUser() u: JwtUser, @Body() d: CreateReceiptDto) {
    return this.svc.create(tid, u.sub, d);
  }
}

@Controller('payments')
class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @Permissions('accounting.view')
  list(@Tenant() tid: string, @Query('supplierId') supplierId?: string) {
    return this.svc.list(tid, supplierId);
  }

  @Post()
  @Permissions('accounting.entry')
  create(@Tenant() tid: string, @CurrentUser() u: JwtUser, @Body() d: CreatePaymentDto) {
    return this.svc.create(tid, u.sub, d);
  }
}

@Controller('expenses')
class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permissions('accounting.view')
  list(@Tenant() tid: string, @Query('branchId') branchId?: string) {
    return this.svc.list(tid, branchId);
  }

  @Post()
  @Permissions('accounting.entry')
  create(@Tenant() tid: string, @CurrentUser() u: JwtUser, @Body() d: CreateExpenseDto) {
    return this.svc.create(tid, u.sub, d);
  }

  @Get('categories')
  @Permissions('accounting.view')
  listCategories(@Tenant() tid: string) {
    return this.svc.listCategories(tid);
  }

  @Post('categories')
  @Permissions('accounting.entry')
  createCategory(@Tenant() tid: string, @Body() d: CreateExpenseCategoryDto) {
    return this.svc.createCategory(tid, d);
  }
}

@Module({
  controllers: [ReceiptsController, PaymentsController, ExpensesController],
  providers:   [ReceiptsService,    PaymentsService,    ExpensesService],
})
export class FinanceModule {}
