import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types/app-role.type';
import { PrismaService } from '../database/prisma.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';

type ChargeStatusInput = 'pending' | 'paid' | 'overdue' | 'canceled';
type TransactionStatusInput = 'pending' | 'success' | 'failed' | 'refunded';

@Injectable()
export class FinanceService {
  private readonly dashboardSummaryTtlMs = 15_000;
  private dashboardSummaryCache = new Map<
    string,
    { value: Record<string, unknown>; expiresAt: number }
  >();
  private dashboardSummaryInFlight = new Map<
    string,
    Promise<Record<string, unknown>>
  >();

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(user: JwtPayload) {
    await this.syncExpiredPendingCharges(user);

    const where = this.buildChargeWhere(user);
    const endOfCurrentMonth = this.getEndOfCurrentMonth();
    const [totalCharges, pendingCharges, paidCharges, overdueCharges] =
      await Promise.all([
        this.prisma.monthlyCharge.count({ where }),
        this.prisma.monthlyCharge.count({
          where: {
            ...where,
            status: 'PENDING',
            dueDate: { lte: endOfCurrentMonth },
          },
        }),
        this.prisma.monthlyCharge.count({ where: { ...where, status: 'PAID' } }),
        this.prisma.monthlyCharge.count({ where: { ...where, status: 'OVERDUE' } }),
      ]);

    const [pendingAmount, paidAmount, overdueAmount, canceledAmount] =
      await Promise.all([
        this.prisma.monthlyCharge.aggregate({
          where: {
            ...where,
            status: 'PENDING',
            dueDate: { lte: endOfCurrentMonth },
          },
          _sum: { amount: true },
        }),
        this.prisma.monthlyCharge.aggregate({
          where: { ...where, status: 'PAID' },
          _sum: { amount: true },
        }),
        this.prisma.monthlyCharge.aggregate({
          where: { ...where, status: 'OVERDUE' },
          _sum: { amount: true },
        }),
        this.prisma.monthlyCharge.aggregate({
          where: { ...where, status: 'CANCELED' },
          _sum: { amount: true },
        }),
      ]);

    return {
      totalCharges,
      pendingCharges,
      paidCharges,
      overdueCharges,
      amountByStatus: [
        { status: 'pending', amount: Number(pendingAmount._sum.amount ?? 0) },
        { status: 'paid', amount: Number(paidAmount._sum.amount ?? 0) },
        { status: 'overdue', amount: Number(overdueAmount._sum.amount ?? 0) },
        { status: 'canceled', amount: Number(canceledAmount._sum.amount ?? 0) },
      ],
    };
  }

  async getDashboardSummary(user: JwtPayload) {
    await this.syncExpiredPendingCharges(user);

    const cacheKey = this.getDashboardSummaryCacheKey(user);
    const nowMs = Date.now();
    const cachedSummary = this.dashboardSummaryCache.get(cacheKey);
    if (cachedSummary && cachedSummary.expiresAt > nowMs) {
      return cachedSummary.value;
    }

    const inFlightSummary = this.dashboardSummaryInFlight.get(cacheKey);
    if (inFlightSummary) {
      return inFlightSummary;
    }

    const promise = this.buildDashboardSummary(user)
      .then((summary) => {
        this.dashboardSummaryCache.set(cacheKey, {
          value: summary,
          expiresAt: Date.now() + this.dashboardSummaryTtlMs,
        });
        return summary;
      })
      .finally(() => {
        this.dashboardSummaryInFlight.delete(cacheKey);
      });

    this.dashboardSummaryInFlight.set(cacheKey, promise);
    return promise;
  }

  private async buildDashboardSummary(user: JwtPayload) {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const endOfCurrentMonth = this.getEndOfCurrentMonth(now);
    const chargeWhere = this.buildChargeWhere(user);

    const [
      studentsCount,
      activeEnrollments,
      classesCount,
      openClasses,
      planningClasses,
      classesToday,
      seatTotals,
      pendingChargesCount,
      pendingAmountAggregate,
      upcomingClasses,
      firstPendingCharge,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { role: 'USER' },
      }),
      this.prisma.enrollment.count({
        where: {
          status: 'ACTIVE',
          student: {
            role: UserRole.USER,
          },
        },
      }),
      this.prisma.schoolClass.count(),
      this.prisma.schoolClass.count({
        where: { status: { not: 'CLOSED' } },
      }),
      this.prisma.schoolClass.count({
        where: { status: 'PLANNING' },
      }),
      this.prisma.schoolClass.count({
        where: {
          startDate: {
            gte: startOfToday,
            lt: endOfToday,
          },
        },
      }),
      this.prisma.schoolClass.aggregate({
        _sum: {
          totalSeats: true,
        },
      }),
      this.prisma.monthlyCharge.count({
        where: {
          ...chargeWhere,
          OR: [
            { status: 'OVERDUE' },
            {
              status: 'PENDING',
              dueDate: {
                lte: endOfCurrentMonth,
              },
            },
          ],
        },
      }),
      this.prisma.monthlyCharge.aggregate({
        where: {
          ...chargeWhere,
          OR: [
            { status: 'OVERDUE' },
            {
              status: 'PENDING',
              dueDate: {
                lte: endOfCurrentMonth,
              },
            },
          ],
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.schoolClass.findMany({
        where: {
          startDate: { gte: now },
          status: { not: 'CLOSED' },
        },
        orderBy: { startDate: 'asc' },
        take: 2,
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          course: {
            select: {
              name: true,
            },
          },
        },
      }),
      this.prisma.monthlyCharge.findFirst({
        where: {
          ...chargeWhere,
          OR: [
            { status: 'OVERDUE' },
            {
              status: 'PENDING',
              dueDate: {
                lte: endOfCurrentMonth,
              },
            },
          ],
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          dueDate: true,
          amount: true,
          enrollment: {
            select: {
              student: {
                select: {
                  name: true,
                },
              },
              schoolClass: {
                select: {
                  name: true,
                  course: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const totalSeats = Number(seatTotals._sum.totalSeats ?? 0);
    const occupiedSeats = Number(activeEnrollments ?? 0);
    const occupancyRate =
      totalSeats > 0 ? Number(((occupiedSeats / totalSeats) * 100).toFixed(1)) : 0;

    return {
      generatedAt: now.toISOString(),
      studentsCount,
      activeEnrollments,
      classesCount,
      openClasses,
      planningClasses,
      classesToday,
      totalSeats,
      occupiedSeats,
      occupancyRate,
      pendingChargesCount,
      pendingAmount: Number(pendingAmountAggregate._sum?.amount ?? 0),
      upcomingClasses: upcomingClasses.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        startDate: item.startDate,
        course: item.course,
      })),
      firstPendingCharge: firstPendingCharge
        ? {
            id: firstPendingCharge.id,
            dueDate: firstPendingCharge.dueDate,
            amount: Number(firstPendingCharge.amount),
            studentName: firstPendingCharge.enrollment.student?.name ?? null,
            className: firstPendingCharge.enrollment.schoolClass?.name ?? null,
            courseName:
              firstPendingCharge.enrollment.schoolClass?.course?.name ?? null,
          }
        : null,
    };
  }

  private invalidateDashboardSummaryCache() {
    this.dashboardSummaryCache.clear();
  }

  async findCharges(user: JwtPayload) {
    await this.syncExpiredPendingCharges(user);

    const where = this.buildChargeWhere(user);
    const endOfCurrentMonth = this.getEndOfCurrentMonth();
    const charges = await this.prisma.monthlyCharge.findMany({
      where: {
        ...where,
        OR: [
          { status: 'OVERDUE' },
          { status: 'PAID' },
          { status: 'CANCELED' },
          {
            status: 'PENDING',
            dueDate: {
              lte: endOfCurrentMonth,
            },
          },
        ],
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            schoolClass: {
              include: {
                course: true,
              },
            },
          },
        },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const relevantActionableChargeIds = this.getRelevantActionableChargeIds(charges);

    return charges
      .filter((charge) => {
        if (charge.status === 'PENDING' || charge.status === 'OVERDUE') {
          return relevantActionableChargeIds.has(charge.id);
        }
        return true;
      })
      .map((charge) => ({
      ...charge,
      amount: Number(charge.amount),
      paymentTransactions: charge.paymentTransactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
      })),
      }));
  }

  async createCharge(dto: CreateChargeDto, user: JwtPayload) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: dto.enrollmentId },
      select: { id: true },
    });

    if (!enrollment) {
      throw new NotFoundException('Matrícula não encontrada.');
    }

    const charge = await this.prisma.monthlyCharge.create({
      data: {
        enrollmentId: dto.enrollmentId,
        ownerAdminId: user.role === 'admin' ? user.sub : null,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        externalChargeId: dto.externalChargeId?.trim() || null,
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            schoolClass: {
              include: {
                course: true,
              },
            },
          },
        },
      },
    });

    this.invalidateDashboardSummaryCache();

    return {
      ...charge,
      amount: Number(charge.amount),
    };
  }

  async updateChargeStatus(
    chargeId: string,
    dto: UpdateChargeStatusDto,
    user: JwtPayload,
  ) {
    const where = this.buildChargeWhere(user);
    const charge = await this.prisma.monthlyCharge.findFirst({
      where: { id: chargeId, ...where },
      select: { id: true },
    });

    if (!charge) {
      throw new NotFoundException('Cobrança não encontrada.');
    }

    const updatedCharge = await this.prisma.monthlyCharge.update({
      where: { id: chargeId },
      data: {
        status: this.toPrismaChargeStatus(dto.status),
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            schoolClass: {
              include: {
                course: true,
              },
            },
          },
        },
      },
    });

    this.invalidateDashboardSummaryCache();

    return {
      ...updatedCharge,
      amount: Number(updatedCharge.amount),
    };
  }

  async getGatewayConfigByUser(userId: string) {
    const config = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        encryptedSettings: true,
        updatedAt: true,
      },
    });

    return {
      provider: (config?.provider ?? 'manual').toLowerCase(),
      environment: (config?.environment ?? 'sandbox').toLowerCase(),
      isActive: config?.isActive ?? false,
      isConfigured: Boolean(config?.encryptedSettings),
      updatedAt: config?.updatedAt ?? null,
    };
  }

  async createTransaction(dto: CreateTransactionDto, user: JwtPayload) {
    const where = this.buildChargeWhere(user);
    const charge = await this.prisma.monthlyCharge.findFirst({
      where: { id: dto.monthlyChargeId, ...where },
      select: {
        id: true,
        amount: true,
        ownerAdminId: true,
      },
    });

    if (!charge) {
      throw new NotFoundException(
        'Cobrança não encontrada para este lançamento.',
      );
    }

    if (dto.amount <= 0) {
      throw new BadRequestException(
        'O valor da transação precisa ser maior que zero.',
      );
    }

    const status: string = dto.status ?? 'success';
    const provider = await this.resolveProvider(
      dto.provider,
      user,
      charge.ownerAdminId,
    );

    const transaction = await this.prisma.$transaction(async (tx) => {
      const createdTransaction = await tx.paymentTransaction.create({
        data: {
          monthlyChargeId: dto.monthlyChargeId,
          provider,
          amount: dto.amount,
          status: this.toPrismaTransactionStatus(status),
          externalTransactionId: dto.externalTransactionId?.trim() || null,
          paidAt: dto.paidAt
            ? new Date(dto.paidAt)
            : status === 'success'
              ? new Date()
              : null,
        },
      });

      if (status === 'success') {
        await tx.monthlyCharge.update({
          where: { id: dto.monthlyChargeId },
          data: {
            status: 'PAID',
          },
        });
      }

      return createdTransaction;
    });

    this.invalidateDashboardSummaryCache();

    return {
      ...transaction,
      amount: Number(transaction.amount),
    };
  }

  private async resolveProvider(
    providerInput: string | undefined,
    user: JwtPayload,
    chargeOwnerAdminId: string | null,
  ) {
    const provider = providerInput?.trim();
    if (provider) {
      return provider;
    }

    const configUserId =
      user.role === 'superadmin' && chargeOwnerAdminId
        ? chargeOwnerAdminId
        : user.sub;

    const config = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId: configUserId },
      select: {
        provider: true,
        isActive: true,
      },
    });

    if (config?.isActive && config.provider?.trim()) {
      return config.provider.trim();
    }

    return 'manual';
  }

  private buildChargeWhere(user: JwtPayload): Prisma.MonthlyChargeWhereInput {
    if (user.role === 'superadmin') {
      return {};
    }

    return {
      ownerAdminId: user.sub,
    };
  }

  private getDashboardSummaryCacheKey(user: JwtPayload) {
    if (user.role === 'superadmin') {
      return 'superadmin';
    }

    return `admin:${user.sub}`;
  }

  private getEndOfCurrentMonth(referenceDate = new Date()) {
    return new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  }

  private async syncExpiredPendingCharges(user: JwtPayload) {
    const where = this.buildChargeWhere(user);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    await this.prisma.monthlyCharge.updateMany({
      where: {
        ...where,
        status: 'PENDING',
        dueDate: {
          lt: startOfToday,
        },
      },
      data: {
        status: 'OVERDUE',
      },
    });
  }

  private getRelevantActionableChargeIds(
    charges: Array<{
      id: string;
      enrollmentId: string;
      dueDate: Date;
      status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
    }>,
  ) {
    const selectedIds = new Set<string>();
    const byEnrollment = new Map<string, typeof charges>();

    charges.forEach((charge) => {
      const list = byEnrollment.get(charge.enrollmentId) ?? [];
      list.push(charge);
      byEnrollment.set(charge.enrollmentId, list);
    });

    byEnrollment.forEach((items) => {
      const overdue = items
        .filter((item) => item.status === 'OVERDUE')
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      if (overdue.length > 0) {
        selectedIds.add(overdue[0].id);
        return;
      }

      const pending = items
        .filter((item) => item.status === 'PENDING')
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      if (pending.length > 0) {
        selectedIds.add(pending[0].id);
      }
    });

    return selectedIds;
  }

  private toPrismaChargeStatus(status: string) {
    const statusMap: Record<
      ChargeStatusInput,
      'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED'
    > = {
      pending: 'PENDING',
      paid: 'PAID',
      overdue: 'OVERDUE',
      canceled: 'CANCELED',
    };

    const normalizedStatus = status as ChargeStatusInput;
    const mappedStatus = statusMap[normalizedStatus];
    if (!mappedStatus) {
      throw new BadRequestException('Status de cobrança inválido.');
    }

    return mappedStatus;
  }

  private toPrismaTransactionStatus(status: string) {
    const statusMap: Record<
      TransactionStatusInput,
      'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'
    > = {
      pending: 'PENDING',
      success: 'SUCCESS',
      failed: 'FAILED',
      refunded: 'REFUNDED',
    };

    const normalizedStatus = status as TransactionStatusInput;
    const mappedStatus = statusMap[normalizedStatus];
    if (!mappedStatus) {
      throw new BadRequestException('Status de transação inválido.');
    }

    return mappedStatus;
  }
}
