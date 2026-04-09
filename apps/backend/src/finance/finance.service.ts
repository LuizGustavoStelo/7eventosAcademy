import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types/app-role.type';
import { ContractsService } from '../contracts/contracts.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractsService: ContractsService,
  ) {}

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
    const descriptionByChargeId = this.buildChargeDescriptionMap(charges);

    return charges.map((charge) => ({
      ...charge,
      description:
        descriptionByChargeId.get(charge.id) ?? this.buildDefaultChargeDescription(charge),
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

    if (updatedCharge.status === 'PAID') {
      await this.tryReleaseAutomaticContractsAfterEnrollmentFeePayment(
        updatedCharge.id,
      );
    }

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

    if (status === 'success') {
      await this.tryReleaseAutomaticContractsAfterEnrollmentFeePayment(
        dto.monthlyChargeId,
      );
    }

    this.invalidateDashboardSummaryCache();

    return {
      ...transaction,
      amount: Number(transaction.amount),
    };
  }

  private async tryReleaseAutomaticContractsAfterEnrollmentFeePayment(
    chargeId: string,
  ) {
    try {
      const charge = await this.prisma.monthlyCharge.findUnique({
        where: { id: chargeId },
        select: {
          id: true,
          enrollmentId: true,
          status: true,
          enrollment: {
            select: {
              id: true,
              institutionId: true,
              studentId: true,
              classId: true,
              createdAt: true,
              selectedPaymentOption: true,
              schoolClass: {
                select: {
                  course: {
                    select: {
                      id: true,
                      ownerAdminId: true,
                      enrollmentFee: true,
                      paymentModel: true,
                      installmentMonths: true,
                      installmentValue: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!charge || charge.status !== 'PAID') {
        return;
      }

      const enrollmentCharges = await this.prisma.monthlyCharge.findMany({
        where: {
          enrollmentId: charge.enrollmentId,
        },
        select: {
          id: true,
          status: true,
          dueDate: true,
          createdAt: true,
          amount: true,
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });

      const enrollmentFeeAmount = this.toMoneyValue(
        Number(charge.enrollment.schoolClass.course.enrollmentFee ?? 0),
      );

      const enrollmentFeeCharge =
        enrollmentFeeAmount > 0
          ? (() => {
              const candidates = enrollmentCharges.filter((item) => {
                const amount = this.toMoneyValue(Number(item.amount));
                return amount === enrollmentFeeAmount;
              });
              if (candidates.length === 0) return null;
              if (candidates.length === 1) return candidates[0];

              const enrollmentCreatedAt = charge.enrollment.createdAt.getTime();
              return candidates.sort((a, b) => {
                const distanceA = Math.abs(a.dueDate.getTime() - enrollmentCreatedAt);
                const distanceB = Math.abs(b.dueDate.getTime() - enrollmentCreatedAt);
                if (distanceA !== distanceB) return distanceA - distanceB;
                return a.createdAt.getTime() - b.createdAt.getTime();
              })[0];
            })()
          : null;

      const enrollmentFeePaid =
        enrollmentFeeAmount <= 0 ||
        Boolean(enrollmentFeeCharge && enrollmentFeeCharge.status === 'PAID');
      if (!enrollmentFeePaid) {
        return;
      }

      const selectedOption = this.parseEnrollmentSelectedPaymentOption(
        charge.enrollment.selectedPaymentOption,
      );
      const requiresFirstInstallment =
        selectedOption
          ? selectedOption.type === 'INSTALLMENTS' &&
            Number(selectedOption.installmentCount ?? 0) > 0 &&
            Number(selectedOption.installmentAmount ?? 0) > 0
          : String(charge.enrollment.schoolClass.course.paymentModel).toUpperCase() ===
              'INSTALLMENTS' &&
            Number(charge.enrollment.schoolClass.course.installmentMonths ?? 0) > 0 &&
            Number(charge.enrollment.schoolClass.course.installmentValue ?? 0) > 0;

      const firstInstallmentCharge = enrollmentCharges.find(
        (item) => !enrollmentFeeCharge || item.id !== enrollmentFeeCharge.id,
      );
      const firstInstallmentPaid =
        !requiresFirstInstallment ||
        Boolean(firstInstallmentCharge && firstInstallmentCharge.status === 'PAID');
      if (!firstInstallmentPaid) {
        return;
      }

      const alreadySentContract = await this.prisma.contractInstance.findFirst({
        where: {
          institutionId: charge.enrollment.institutionId,
          enrollmentId: charge.enrollment.id,
          studentId: charge.enrollment.studentId,
          status: {
            notIn: ['CANCELED', 'ARCHIVED'],
          },
        },
        select: { id: true },
      });

      if (alreadySentContract) {
        return;
      }

      await this.contractsService.sendAutomaticContractsForEnrollment({
        institutionId: charge.enrollment.institutionId,
        enrollmentId: charge.enrollment.id,
        studentId: charge.enrollment.studentId,
        courseId: charge.enrollment.schoolClass.course.id,
        classId: charge.enrollment.classId,
        createdByUserId: charge.enrollment.schoolClass.course.ownerAdminId,
      });
    } catch {
      // A falha no envio automático não deve bloquear o financeiro.
    }
  }

  private parseEnrollmentSelectedPaymentOption(
    raw: Prisma.JsonValue | null | undefined,
  ) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const record = raw as Record<string, unknown>;
    const type =
      String(record.type || '').toUpperCase() === 'INSTALLMENTS'
        ? 'INSTALLMENTS'
        : 'CASH';
    const installmentCount = Number(record.installmentCount ?? 0);
    const installmentAmount = Number(record.installmentAmount ?? 0);

    return {
      type,
      installmentCount:
        Number.isFinite(installmentCount) && installmentCount > 0
          ? installmentCount
          : 0,
      installmentAmount:
        Number.isFinite(installmentAmount) && installmentAmount > 0
          ? installmentAmount
          : 0,
    };
  }

  private toMoneyValue(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Number(Math.max(0, numeric).toFixed(2));
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

  private buildChargeDescriptionMap(
    charges: Array<{
      id: string;
      enrollmentId: string;
      amount: Prisma.Decimal | number;
      dueDate: Date;
      createdAt: Date;
      status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
      enrollment: {
        createdAt: Date;
        selectedPaymentOption: Prisma.JsonValue | null;
        schoolClass: {
          course: {
            enrollmentFee: Prisma.Decimal | number | null;
          };
        };
      };
    }>,
  ) {
    const descriptionById = new Map<string, string>();
    const byEnrollment = new Map<string, typeof charges>();

    charges.forEach((charge) => {
      const list = byEnrollment.get(charge.enrollmentId) ?? [];
      list.push(charge);
      byEnrollment.set(charge.enrollmentId, list);
    });

    byEnrollment.forEach((items) => {
      const ordered = [...items].sort(
        (a, b) =>
          a.dueDate.getTime() - b.dueDate.getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );

      const reference = ordered[0];
      if (!reference) return;

      const enrollmentFeeAmount = this.toMoneyValue(
        Number(reference.enrollment.schoolClass.course.enrollmentFee ?? 0),
      );

      const enrollmentFeeCharge =
        enrollmentFeeAmount > 0
          ? (() => {
              const candidates = ordered.filter((item) => {
                const amount = this.toMoneyValue(Number(item.amount));
                return amount === enrollmentFeeAmount;
              });
              if (candidates.length === 0) return null;
              if (candidates.length === 1) return candidates[0];

              const enrollmentCreatedAt = reference.enrollment.createdAt.getTime();
              return candidates.sort((a, b) => {
                const distanceA = Math.abs(a.dueDate.getTime() - enrollmentCreatedAt);
                const distanceB = Math.abs(b.dueDate.getTime() - enrollmentCreatedAt);
                if (distanceA !== distanceB) return distanceA - distanceB;
                return a.createdAt.getTime() - b.createdAt.getTime();
              })[0];
            })()
          : null;

      if (enrollmentFeeCharge) {
        descriptionById.set(enrollmentFeeCharge.id, 'Matrícula');
      }

      const installmentCharges = ordered.filter(
        (item) => !enrollmentFeeCharge || item.id !== enrollmentFeeCharge.id,
      );
      if (installmentCharges.length === 0) return;

      const selectedOption = this.parseEnrollmentSelectedPaymentOption(
        reference.enrollment.selectedPaymentOption,
      );
      const configuredInstallments = Number(selectedOption?.installmentCount ?? 0);
      const totalInstallments =
        configuredInstallments > 0
          ? configuredInstallments
          : installmentCharges.length;

      installmentCharges.forEach((item, index) => {
        if (totalInstallments <= 1) {
          descriptionById.set(item.id, 'Mensalidade 1/1');
          return;
        }
        const position = Math.min(index + 1, totalInstallments);
        descriptionById.set(item.id, `Mensalidade ${position}/${totalInstallments}`);
      });
    });

    return descriptionById;
  }

  private buildDefaultChargeDescription(charge: {
    enrollment: {
      selectedPaymentOption: Prisma.JsonValue | null;
    };
  }) {
    const selectedOption = this.parseEnrollmentSelectedPaymentOption(
      charge.enrollment.selectedPaymentOption,
    );
    if (selectedOption?.type === 'CASH') {
      return 'Pagamento à vista';
    }
    if ((selectedOption?.installmentCount ?? 0) > 0) {
      return `Mensalidade 1/${selectedOption?.installmentCount}`;
    }
    return 'Cobrança';
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
