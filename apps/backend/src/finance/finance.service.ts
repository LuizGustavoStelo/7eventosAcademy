import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';

type ChargeStatusInput = 'pending' | 'paid' | 'overdue' | 'canceled';
type TransactionStatusInput = 'pending' | 'success' | 'failed' | 'refunded';

@Injectable()
export class FinanceService {
  private readonly dashboardSummaryTtlMs = 15_000;
  private dashboardSummaryCache:
    | { value: Record<string, unknown>; expiresAt: number }
    | null = null;
  private dashboardSummaryInFlight: Promise<Record<string, unknown>> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [totalCharges, pendingCharges, paidCharges, overdueCharges] =
      await Promise.all([
        this.prisma.monthlyCharge.count(),
        this.prisma.monthlyCharge.count({ where: { status: 'PENDING' } }),
        this.prisma.monthlyCharge.count({ where: { status: 'PAID' } }),
        this.prisma.monthlyCharge.count({ where: { status: 'OVERDUE' } }),
      ]);

    const amountByStatus = await this.prisma.monthlyCharge.groupBy({
      by: ['status'],
      _sum: {
        amount: true,
      },
    });

    return {
      totalCharges,
      pendingCharges,
      paidCharges,
      overdueCharges,
      amountByStatus: amountByStatus.map((item) => ({
        status: item.status.toLowerCase(),
        amount: Number(item._sum.amount ?? 0),
      })),
    };
  }

  async getDashboardSummary() {
    const nowMs = Date.now();
    if (
      this.dashboardSummaryCache &&
      this.dashboardSummaryCache.expiresAt > nowMs
    ) {
      return this.dashboardSummaryCache.value;
    }

    if (this.dashboardSummaryInFlight) {
      return this.dashboardSummaryInFlight;
    }

    this.dashboardSummaryInFlight = this.buildDashboardSummary()
      .then((summary) => {
        this.dashboardSummaryCache = {
          value: summary,
          expiresAt: Date.now() + this.dashboardSummaryTtlMs,
        };
        return summary;
      })
      .finally(() => {
        this.dashboardSummaryInFlight = null;
      });

    return this.dashboardSummaryInFlight;
  }

  private async buildDashboardSummary() {
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

    const pendingStatuses: Array<'PENDING' | 'OVERDUE'> = [
      'PENDING',
      'OVERDUE',
    ];

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
        where: { status: 'ACTIVE' },
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
          occupiedSeats: true,
        },
      }),
      this.prisma.monthlyCharge.count({
        where: {
          status: {
            in: pendingStatuses,
          },
        },
      }),
      this.prisma.monthlyCharge.aggregate({
        where: {
          status: {
            in: pendingStatuses,
          },
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
          status: {
            in: pendingStatuses,
          },
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
    const occupiedSeats = Number(seatTotals._sum.occupiedSeats ?? 0);
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
    this.dashboardSummaryCache = null;
  }

  async findCharges() {
    const charges = await this.prisma.monthlyCharge.findMany({
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
      orderBy: { createdAt: 'desc' },
    });

    return charges.map((charge) => ({
      ...charge,
      amount: Number(charge.amount),
      paymentTransactions: charge.paymentTransactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
      })),
    }));
  }

  async createCharge(dto: CreateChargeDto) {
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

  async updateChargeStatus(chargeId: string, dto: UpdateChargeStatusDto) {
    const charge = await this.prisma.monthlyCharge.findUnique({
      where: { id: chargeId },
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

  async createTransaction(dto: CreateTransactionDto, userId: string) {
    const charge = await this.prisma.monthlyCharge.findUnique({
      where: { id: dto.monthlyChargeId },
      select: {
        id: true,
        amount: true,
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
    const provider = await this.resolveProvider(dto.provider, userId);

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

  private async resolveProvider(providerInput: string | undefined, userId: string) {
    const provider = providerInput?.trim();
    if (provider) {
      return provider;
    }

    const config = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId },
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
