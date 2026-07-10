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
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { SendCreditCardPaymentLinkDto } from './dto/send-credit-card-payment-link.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { UpdateVoucherStatusDto } from './dto/update-voucher-status.dto';

type ChargeStatusInput = 'pending' | 'paid' | 'overdue' | 'canceled';
type TransactionStatusInput = 'pending' | 'success' | 'failed' | 'refunded';
type VoucherDiscountTypeInput = 'PERCENT' | 'FIXED';
type VoucherAppliesToInput = 'TOTAL' | 'INSTALLMENT';
type VoucherInstallmentScopeInput = 'ALL' | 'SINGLE';
type VoucherPaymentOptionTypeInput = 'CASH' | 'INSTALLMENTS';
type CreditCardRequestAction = 'VIEWED' | 'COPIED';

export type VoucherPaymentOptionShape = {
  id: string;
  title: string;
  method: 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD';
  type: VoucherPaymentOptionTypeInput;
  totalAmount: number;
  installmentCount: number | null;
  installmentAmount: number | null;
  dueDay: number | null;
  installmentStartDate: string | null;
  note: string | null;
  isPromotional: boolean;
  promotionalSlots: number | null;
  promotionalTotalAmount: number | null;
  promotionalInstallmentAmount: number | null;
  promotionalApplied?: boolean;
  active: boolean;
  discountEnabled: boolean;
  discountTotalAmount: number | null;
  discountInstallmentAmount: number | null;
  discountType: 'FIXED' | 'PERCENT' | null;
  discountValue: number | null;
  discountDeadlineDay: number | null;
  discountRequiresActiveCrf: boolean;
  discountAppliesTo: 'INSTALLMENT' | 'TOTAL' | null;
  promotionalDiscountEnabled: boolean;
  promotionalDiscountTotalAmount: number | null;
  promotionalDiscountInstallmentAmount: number | null;
  promotionalDiscountDeadlineDay: number | null;
  promotionalDiscountRequiresActiveCrf: boolean;
  appliedVoucher?: AppliedVoucherSnapshot | null;
};

type VoucherCourseOption = {
  id: string;
  title: string;
  method: 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD';
  type: VoucherPaymentOptionTypeInput;
};

type AppliedVoucherSnapshot = {
  id: string;
  code: string;
  title: string | null;
  discountType: VoucherDiscountTypeInput;
  discountValue: number;
  appliesTo: VoucherAppliesToInput;
  appliesToEnrollmentFee: boolean;
  installmentScope: VoucherInstallmentScopeInput;
  discountLabel: string;
  targetLabel: string;
  discountedInstallments: number | null;
  discountedInstallmentAmount: number | null;
  regularInstallmentAmount: number | null;
  usageCount: number;
  maxUses: number | null;
  remainingUses: number | null;
};

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
        creditCardPaymentRequests: {
          orderBy: { requestedAt: 'desc' },
          take: 1,
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
      creditCardPaymentRequest: charge.creditCardPaymentRequests[0]
        ? this.mapCreditCardPaymentRequest(charge.creditCardPaymentRequests[0])
        : null,
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
      await this.markCreditCardRequestApprovedByCharge(
        updatedCharge.id,
        user.sub,
      );
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

        await tx.creditCardPaymentRequest.updateMany({
          where: {
            monthlyChargeId: dto.monthlyChargeId,
            status: { notIn: ['APPROVED', 'CANCELED'] },
          },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedByUserId: user.sub,
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

  async listVoucherCourses(user: JwtPayload) {
    const courses = await this.prisma.course.findMany({
      where: {
        status: 'ACTIVE',
        ...this.buildCourseWhere(user),
      },
      select: {
        id: true,
        name: true,
        paymentModel: true,
        paymentOptions: true,
        price: true,
        installmentMonths: true,
        installmentValue: true,
      },
      orderBy: { name: 'asc' },
    });

    return courses
      .map((course) => {
        const paymentOptions = this.extractVoucherCoursePaymentOptions(course);
        return {
          id: course.id,
          name: course.name,
          paymentOptions,
        };
      })
      .filter((course) => course.paymentOptions.length > 0);
  }

  async listVouchers(user: JwtPayload) {
    const vouchers = await this.prisma.financeVoucher.findMany({
      where: this.buildVoucherWhere(user),
      include: {
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });

    return vouchers.map((voucher) => ({
      id: voucher.id,
      courseId: voucher.courseId,
      courseName: voucher.course?.name ?? 'Todos os cursos',
      code: voucher.code,
      title: voucher.title,
      discountType: voucher.discountType,
      discountValue: Number(voucher.discountValue),
      appliesTo: voucher.appliesTo,
      appliesToEnrollmentFee: voucher.appliesToEnrollmentFee,
      installmentScope: voucher.installmentScope,
      maxUses: voucher.maxUses,
      usageCount: voucher.usageCount,
      remainingUses:
        voucher.maxUses && voucher.maxUses > 0
          ? Math.max(0, voucher.maxUses - voucher.usageCount)
          : null,
      discountLabel: this.formatVoucherDiscountLabel(
        voucher.discountType,
        Number(voucher.discountValue),
      ),
      allowedPaymentOptionIds: this.parseAllowedPaymentOptionIds(
        voucher.allowedPaymentOptionIds,
      ),
      active: voucher.active,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
    }));
  }

  async createVoucher(dto: CreateVoucherDto, user: JwtPayload) {
    const allCourses = dto.allCourses === true;
    if (!allCourses && !dto.courseId) {
      throw new BadRequestException('Selecione o curso do voucher.');
    }

    const availableCourses = await this.prisma.course.findMany({
      where: {
        status: 'ACTIVE',
        ...this.buildCourseWhere(user),
        ...(allCourses ? {} : { id: dto.courseId }),
      },
      select: {
        id: true,
        institutionId: true,
        paymentModel: true,
        paymentOptions: true,
        price: true,
        installmentMonths: true,
        installmentValue: true,
      },
    });

    if (!allCourses && availableCourses.length === 0) {
      throw new NotFoundException('Curso nao encontrado para criar voucher.');
    }

    if (allCourses && availableCourses.length === 0) {
      throw new NotFoundException('Nenhum curso ativo encontrado para criar voucher global.');
    }

    const institutionIds = Array.from(
      new Set(availableCourses.map((course) => course.institutionId)),
    );
    if (institutionIds.length !== 1) {
      throw new BadRequestException('Nao foi possivel determinar a instituicao do voucher. Selecione uma instituicao ativa.');
    }
    const voucherInstitutionId = institutionIds[0]!;

    const allCoursePaymentOptions = availableCourses.flatMap((course) =>
      this.extractVoucherCoursePaymentOptions(course),
    );

    const normalizedAllowedOptionIds = this.normalizePaymentOptionIdList(
      dto.allowedPaymentOptionIds,
    );
    if (normalizedAllowedOptionIds.length === 0) {
      throw new BadRequestException('Selecione pelo menos uma opcao de pagamento para o voucher.');
    }

    if (allCoursePaymentOptions.length === 0) {
      throw new BadRequestException(
        allCourses
          ? 'Nenhum curso ativo possui opcoes de pagamento para vincular voucher.'
          : 'Este curso nao possui opcoes de pagamento ativas para vincular voucher.',
      );
    }

    const availableOptionIds = new Set(allCoursePaymentOptions.map((item) => item.id));
    const invalidOptionId = normalizedAllowedOptionIds.find(
      (item) => !availableOptionIds.has(item),
    );
    if (invalidOptionId) {
      throw new BadRequestException(
        allCourses
          ? 'Uma ou mais opcoes de pagamento selecionadas nao sao validas para os cursos ativos.'
          : 'Uma ou mais opcoes de pagamento selecionadas nao sao validas para este curso.',
      );
    }

    const discountType = this.normalizeVoucherDiscountType(dto.discountType);
    const appliesTo = this.normalizeVoucherAppliesTo(dto.appliesTo);
    const appliesToEnrollmentFee = dto.appliesToEnrollmentFee === true;
    const installmentScope =
      appliesTo === 'INSTALLMENT'
        ? this.normalizeVoucherInstallmentScope(dto.installmentScope)
        : 'ALL';
    const discountValue = this.toMoneyValue(dto.discountValue);
    const maxUses = this.normalizeVoucherMaxUses(dto.maxUses);
    if (discountValue <= 0) {
      throw new BadRequestException('Informe um valor de desconto maior que zero para o voucher.');
    }
    if (discountType === 'PERCENT' && discountValue > 100) {
      throw new BadRequestException(
        'Desconto em percentual deve estar entre 0,01% e 100%.',
      );
    }

    if (appliesTo === 'INSTALLMENT') {
      const optionIdsForInstallmentValidation =
        normalizedAllowedOptionIds.length > 0
          ? new Set(normalizedAllowedOptionIds)
          : new Set(allCoursePaymentOptions.map((item) => item.id));
      const hasInstallmentOption = allCoursePaymentOptions.some(
        (option) =>
          optionIdsForInstallmentValidation.has(option.id) &&
          option.type === 'INSTALLMENTS',
      );
      if (!hasInstallmentOption) {
        throw new BadRequestException(
          'Para desconto em mensalidade, selecione ao menos uma opcao parcelada.',
        );
      }
    }

    const requestedCode = String(dto.code || '').trim();
    const normalizedCode = requestedCode
      ? this.normalizeVoucherCode(requestedCode)
      : await this.generateVoucherCode(voucherInstitutionId);

    const createdVoucher = await this.prisma.financeVoucher.create({
      data: {
        institutionId: voucherInstitutionId,
        ownerAdminId: this.resolveVoucherOwnerAdminId(user),
        courseId: allCourses ? null : dto.courseId!,
        code: normalizedCode,
        title: String(dto.title || '').trim() || null,
        discountType,
        discountValue,
        appliesTo,
        appliesToEnrollmentFee,
        installmentScope,
        maxUses,
        usageCount: 0,
        allowedPaymentOptionIds:
          normalizedAllowedOptionIds.length > 0
            ? (normalizedAllowedOptionIds as Prisma.InputJsonValue)
            : undefined,
        active: dto.active !== false,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      id: createdVoucher.id,
      courseId: createdVoucher.courseId,
      courseName: createdVoucher.course?.name ?? 'Todos os cursos',
      code: createdVoucher.code,
      title: createdVoucher.title,
      discountType: createdVoucher.discountType,
      discountValue: Number(createdVoucher.discountValue),
      appliesTo: createdVoucher.appliesTo,
      appliesToEnrollmentFee: createdVoucher.appliesToEnrollmentFee,
      installmentScope: createdVoucher.installmentScope,
      maxUses: createdVoucher.maxUses,
      usageCount: createdVoucher.usageCount,
      remainingUses:
        createdVoucher.maxUses && createdVoucher.maxUses > 0
          ? Math.max(0, createdVoucher.maxUses - createdVoucher.usageCount)
          : null,
      discountLabel: this.formatVoucherDiscountLabel(
        createdVoucher.discountType,
        Number(createdVoucher.discountValue),
      ),
      allowedPaymentOptionIds: this.parseAllowedPaymentOptionIds(
        createdVoucher.allowedPaymentOptionIds,
      ),
      active: createdVoucher.active,
      createdAt: createdVoucher.createdAt,
      updatedAt: createdVoucher.updatedAt,
    };
  }

  async updateVoucherStatus(
    voucherId: string,
    dto: UpdateVoucherStatusDto,
    user: JwtPayload,
  ) {
    const voucher = await this.prisma.financeVoucher.findFirst({
      where: {
        id: voucherId,
        ...this.buildVoucherWhere(user),
      },
      select: {
        id: true,
      },
    });

    if (!voucher) {
      throw new NotFoundException('Voucher não encontrado.');
    }

    const updatedVoucher = await this.prisma.financeVoucher.update({
      where: { id: voucherId },
      data: {
        active: dto.active,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      id: updatedVoucher.id,
      courseId: updatedVoucher.courseId,
      courseName: updatedVoucher.course?.name ?? 'Todos os cursos',
      code: updatedVoucher.code,
      title: updatedVoucher.title,
      discountType: updatedVoucher.discountType,
      discountValue: Number(updatedVoucher.discountValue),
      appliesTo: updatedVoucher.appliesTo,
      appliesToEnrollmentFee: updatedVoucher.appliesToEnrollmentFee,
      installmentScope: updatedVoucher.installmentScope,
      maxUses: updatedVoucher.maxUses,
      usageCount: updatedVoucher.usageCount,
      remainingUses:
        updatedVoucher.maxUses && updatedVoucher.maxUses > 0
          ? Math.max(0, updatedVoucher.maxUses - updatedVoucher.usageCount)
          : null,
      discountLabel: this.formatVoucherDiscountLabel(
        updatedVoucher.discountType,
        Number(updatedVoucher.discountValue),
      ),
      allowedPaymentOptionIds: this.parseAllowedPaymentOptionIds(
        updatedVoucher.allowedPaymentOptionIds,
      ),
      active: updatedVoucher.active,
      createdAt: updatedVoucher.createdAt,
      updatedAt: updatedVoucher.updatedAt,
    };
  }

  async listCreditCardPaymentRequests(user: JwtPayload) {
    const where = this.buildCreditCardPaymentRequestWhere(user);
    const requests = await this.prisma.creditCardPaymentRequest.findMany({
      where,
      include: this.creditCardPaymentRequestInclude(),
      orderBy: [{ requestedAt: 'desc' }],
    });

    return requests.map((request) => this.mapCreditCardPaymentRequest(request));
  }

  async sendCreditCardPaymentLink(
    requestId: string,
    dto: SendCreditCardPaymentLinkDto,
    user: JwtPayload,
  ) {
    const request = await this.prisma.creditCardPaymentRequest.findFirst({
      where: {
        id: requestId,
        ...this.buildCreditCardPaymentRequestWhere(user),
        status: { notIn: ['APPROVED', 'CANCELED'] },
      },
      select: { id: true },
    });

    if (!request) {
      throw new NotFoundException('Solicitação de cartão não encontrada.');
    }

    const updated = await this.prisma.creditCardPaymentRequest.update({
      where: { id: requestId },
      data: {
        paymentLinkUrl: dto.paymentLinkUrl.trim(),
        adminNote: dto.adminNote?.trim() || null,
        status: 'LINK_SENT',
        linkSentAt: new Date(),
      },
      include: this.creditCardPaymentRequestInclude(),
    });

    return this.mapCreditCardPaymentRequest(updated);
  }

  async approveCreditCardPaymentRequest(requestId: string, user: JwtPayload) {
    const request = await this.prisma.creditCardPaymentRequest.findFirst({
      where: {
        id: requestId,
        ...this.buildCreditCardPaymentRequestWhere(user),
        status: { not: 'CANCELED' },
      },
      include: {
        monthlyCharge: {
          select: {
            id: true,
            status: true,
            ownerAdminId: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação de cartão não encontrada.');
    }

    if (request.status === 'APPROVED' || request.monthlyCharge.status === 'PAID') {
      const current = await this.prisma.creditCardPaymentRequest.findUnique({
        where: { id: request.id },
        include: this.creditCardPaymentRequestInclude(),
      });
      return current ? this.mapCreditCardPaymentRequest(current) : { success: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.create({
        data: {
          monthlyChargeId: request.monthlyChargeId,
          provider: 'sicoob_manual_card_link',
          amount: request.amount,
          status: 'SUCCESS',
          externalTransactionId: `manual-card-link:${request.id}`,
          paidAt: new Date(),
        },
      });

      await tx.monthlyCharge.update({
        where: { id: request.monthlyChargeId },
        data: { status: 'PAID' },
      });

      await tx.creditCardPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedByUserId: user.sub,
        },
      });
    });

    await this.tryReleaseAutomaticContractsAfterEnrollmentFeePayment(
      request.monthlyChargeId,
    );
    this.invalidateDashboardSummaryCache();

    const updated = await this.prisma.creditCardPaymentRequest.findUnique({
      where: { id: request.id },
      include: this.creditCardPaymentRequestInclude(),
    });

    return updated ? this.mapCreditCardPaymentRequest(updated) : { success: true };
  }

  async cancelCreditCardPaymentRequest(requestId: string, user: JwtPayload) {
    const request = await this.prisma.creditCardPaymentRequest.findFirst({
      where: {
        id: requestId,
        ...this.buildCreditCardPaymentRequestWhere(user),
        status: { not: 'APPROVED' },
      },
      select: { id: true },
    });

    if (!request) {
      throw new NotFoundException('Solicitação de cartão não encontrada.');
    }

    const updated = await this.prisma.creditCardPaymentRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELED' },
      include: this.creditCardPaymentRequestInclude(),
    });

    return this.mapCreditCardPaymentRequest(updated);
  }

  async requestCreditCardPaymentForStudent(userId: string, chargeId: string) {
    const charge = await this.prisma.monthlyCharge.findFirst({
      where: {
        id: chargeId,
        status: { in: ['PENDING', 'OVERDUE'] },
        enrollment: {
          studentId: userId,
        },
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: { id: true, name: true, email: true },
            },
            schoolClass: {
              include: {
                course: {
                  select: {
                    id: true,
                    name: true,
                    ownerAdminId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!charge) {
      throw new NotFoundException('Cobrança não encontrada.');
    }

    const selectedOption = this.parseEnrollmentSelectedPaymentOption(
      charge.kind === 'ENROLLMENT_FEE'
        ? charge.enrollment.selectedEnrollmentPaymentOption
        : charge.enrollment.selectedPaymentOption,
    );
    if (selectedOption?.method !== 'CREDIT_CARD') {
      throw new BadRequestException(
        'Esta cobrança não corresponde a uma forma de pagamento por cartão.',
      );
    }

    const existing = await this.prisma.creditCardPaymentRequest.findUnique({
      where: { monthlyChargeId: charge.id },
      include: this.creditCardPaymentRequestInclude(),
    });

    if (existing && existing.status !== 'CANCELED') {
      return this.mapCreditCardPaymentRequest(existing);
    }

    const data = {
      monthlyChargeId: charge.id,
      enrollmentId: charge.enrollmentId,
      studentId: charge.enrollment.studentId,
      ownerAdminId:
        charge.ownerAdminId || charge.enrollment.schoolClass.course.ownerAdminId,
      institutionId: charge.enrollment.institutionId,
      amount: charge.amount,
      installmentCount:
        selectedOption.installmentCount > 0
          ? Math.trunc(selectedOption.installmentCount)
          : null,
      installmentAmount:
        selectedOption.installmentAmount > 0
          ? new Prisma.Decimal(selectedOption.installmentAmount)
          : null,
      status: 'REQUESTED' as const,
      paymentLinkUrl: null,
      adminNote: null,
      requestedAt: new Date(),
      linkSentAt: null,
      viewedAt: null,
      copiedAt: null,
      approvedAt: null,
      approvedByUserId: null,
    };

    const request = existing
      ? await this.prisma.creditCardPaymentRequest.update({
          where: { id: existing.id },
          data,
          include: this.creditCardPaymentRequestInclude(),
        })
      : await this.prisma.creditCardPaymentRequest.create({
          data,
          include: this.creditCardPaymentRequestInclude(),
        });

    return this.mapCreditCardPaymentRequest(request);
  }

  async listStudentCreditCardPaymentRequests(userId: string) {
    const requests = await this.prisma.creditCardPaymentRequest.findMany({
      where: { studentId: userId },
      include: this.creditCardPaymentRequestInclude(),
      orderBy: [{ requestedAt: 'desc' }],
    });

    return requests.map((request) => this.mapCreditCardPaymentRequest(request));
  }

  async markStudentCreditCardPaymentRequestAction(
    userId: string,
    requestId: string,
    action: CreditCardRequestAction,
  ) {
    const request = await this.prisma.creditCardPaymentRequest.findFirst({
      where: {
        id: requestId,
        studentId: userId,
        status: { in: ['LINK_SENT', 'VIEWED', 'COPIED'] },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação de cartão não encontrada.');
    }

    const data =
      action === 'COPIED'
        ? {
            copiedAt: new Date(),
            status: 'COPIED' as const,
          }
        : {
            viewedAt: new Date(),
            status:
              request.status === 'COPIED' ? ('COPIED' as const) : ('VIEWED' as const),
          };

    const updated = await this.prisma.creditCardPaymentRequest.update({
      where: { id: requestId },
      data,
      include: this.creditCardPaymentRequestInclude(),
    });

    return this.mapCreditCardPaymentRequest(updated);
  }

  async deleteVoucher(voucherId: string, user: JwtPayload) {
    const voucher = await this.prisma.financeVoucher.findFirst({
      where: {
        id: voucherId,
        ...this.buildVoucherWhere(user),
      },
      select: {
        id: true,
        active: true,
      },
    });

    if (!voucher) {
      throw new NotFoundException('Voucher não encontrado.');
    }

    if (voucher.active) {
      throw new BadRequestException(
        'Somente vouchers inativos podem ser excluídos.',
      );
    }

    await this.prisma.financeVoucher.delete({
      where: { id: voucherId },
    });

    return { success: true };
  }

  async validatePublicVoucherForCourse(courseId: string, code: string) {
    const normalizedCode = this.normalizeVoucherCode(code);
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        institutionId: true,
        paymentModel: true,
        paymentOptions: true,
        price: true,
        installmentMonths: true,
        installmentValue: true,
      },
    });

    if (!course) {
      throw new NotFoundException('Curso não encontrado para validar voucher.');
    }

    const voucher = await this.prisma.financeVoucher.findFirst({
      where: {
        institutionId: course.institutionId,
        active: true,
        code: normalizedCode,
        OR: [{ courseId: course.id }, { courseId: null }],
      },
      select: {
        id: true,
        code: true,
        title: true,
        discountType: true,
        discountValue: true,
        appliesTo: true,
        appliesToEnrollmentFee: true,
        installmentScope: true,
        maxUses: true,
        usageCount: true,
        allowedPaymentOptionIds: true,
      },
    });

    if (!voucher) {
      throw new BadRequestException('Voucher de desconto inválido para este curso.');
    }
    if (voucher.maxUses && voucher.maxUses > 0 && voucher.usageCount >= voucher.maxUses) {
      throw new BadRequestException('Voucher indisponível: limite de uso atingido.');
    }

    const paymentOptions = this.extractVoucherCoursePaymentOptions(course);
    const affectedPaymentOptionIds = paymentOptions
      .filter((option) =>
        this.isVoucherApplicableToOption({
          allowedPaymentOptionIds: voucher.allowedPaymentOptionIds,
          appliesTo: voucher.appliesTo,
          optionId: option.id,
          optionType: option.type,
        }),
      )
      .map((option) => option.id);

    if (affectedPaymentOptionIds.length === 0) {
      throw new BadRequestException(
        'Voucher válido, mas não é aplicável às formas de pagamento deste curso.',
      );
    }

    return {
      id: voucher.id,
      code: voucher.code,
      title: voucher.title,
      discountType: voucher.discountType,
      discountValue: Number(voucher.discountValue),
      appliesTo: voucher.appliesTo,
      appliesToEnrollmentFee: voucher.appliesToEnrollmentFee,
      installmentScope: voucher.installmentScope,
      discountLabel: this.formatVoucherDiscountLabel(
        voucher.discountType,
        Number(voucher.discountValue),
      ),
      targetLabel:
        voucher.appliesTo === 'INSTALLMENT'
          ? voucher.installmentScope === 'SINGLE'
            ? 'uma mensalidade'
            : 'todas as mensalidades'
          : 'curso inteiro',
      usageCount: voucher.usageCount,
      maxUses: voucher.maxUses,
      remainingUses:
        voucher.maxUses && voucher.maxUses > 0
          ? Math.max(0, voucher.maxUses - voucher.usageCount)
          : null,
      allowedPaymentOptionIds: this.parseAllowedPaymentOptionIds(
        voucher.allowedPaymentOptionIds,
      ),
      affectedPaymentOptionIds,
    };
  }

  async applyVoucherOnPaymentOption(input: {
    tx?: Prisma.TransactionClient;
    institutionId: string;
    courseId: string;
    voucherCode: string;
    paymentOption: VoucherPaymentOptionShape;
    consumeUsage?: boolean;
  }): Promise<VoucherPaymentOptionShape> {
    const normalizedCode = this.normalizeVoucherCode(input.voucherCode);
    const voucher = await this.findActiveVoucherForCourse({
      tx: input.tx,
      institutionId: input.institutionId,
      courseId: input.courseId,
      code: normalizedCode,
    });

    if (!voucher) {
      throw new BadRequestException('Voucher de desconto inválido para este curso.');
    }
    if (voucher.maxUses && voucher.maxUses > 0 && voucher.usageCount >= voucher.maxUses) {
      throw new BadRequestException('Voucher indisponível: limite de uso atingido.');
    }

    if (
      !this.isVoucherApplicableToOption({
        allowedPaymentOptionIds: voucher.allowedPaymentOptionIds,
        appliesTo: voucher.appliesTo,
        optionId: input.paymentOption.id,
        optionType: input.paymentOption.type,
      })
    ) {
      throw new BadRequestException(
        'Voucher não é válido para a forma de pagamento selecionada.',
      );
    }

    const consumeUsage = Boolean(input.consumeUsage);
    let usageCount = voucher.usageCount;
    if (consumeUsage) {
      if (voucher.maxUses && voucher.maxUses > 0) {
        const consumed = await (input.tx ?? this.prisma).financeVoucher.updateMany({
          where: {
            id: voucher.id,
            usageCount: { lt: voucher.maxUses },
          },
          data: {
            usageCount: { increment: 1 },
          },
        });
        if (consumed.count === 0) {
          throw new BadRequestException('Voucher indisponível: limite de uso atingido.');
        }
      } else {
        await (input.tx ?? this.prisma).financeVoucher.update({
          where: { id: voucher.id },
          data: {
            usageCount: { increment: 1 },
          },
        });
      }
      usageCount = Number(voucher.usageCount ?? 0) + 1;
    }

    const adjusted = this.applyVoucherValuesToPaymentOption(input.paymentOption, {
      discountType: voucher.discountType,
      discountValue: Number(voucher.discountValue),
      appliesTo: voucher.appliesTo,
      installmentScope: voucher.installmentScope,
    });

    const discountValue = Number(voucher.discountValue);
    const targetLabel =
      voucher.appliesTo === 'INSTALLMENT'
        ? voucher.installmentScope === 'SINGLE'
          ? 'uma mensalidade'
          : 'todas as mensalidades'
        : 'curso inteiro';

    const installmentCount = Math.max(
      1,
      Number(input.paymentOption.installmentCount ?? 1),
    );
    const regularInstallmentAmount = this.toMoneyValue(
      Number(input.paymentOption.installmentAmount ?? 0),
    );
    const discountedInstallmentAmount =
      voucher.appliesTo === 'INSTALLMENT' &&
      voucher.installmentScope === 'SINGLE' &&
      input.paymentOption.type === 'INSTALLMENTS'
        ? this.toMoneyValue(
            adjusted.totalAmount -
              regularInstallmentAmount * Math.max(0, installmentCount - 1),
          )
        : voucher.appliesTo === 'INSTALLMENT' &&
            input.paymentOption.type === 'INSTALLMENTS'
          ? this.toMoneyValue(Number(adjusted.installmentAmount ?? 0))
          : null;

    return {
      ...adjusted,
      appliedVoucher: {
        id: voucher.id,
        code: voucher.code,
        title: voucher.title,
        discountType: voucher.discountType,
        discountValue,
        appliesTo: voucher.appliesTo,
        appliesToEnrollmentFee: voucher.appliesToEnrollmentFee,
        installmentScope: voucher.installmentScope,
        discountLabel: this.formatVoucherDiscountLabel(
          voucher.discountType,
          discountValue,
        ),
        targetLabel,
        discountedInstallments:
          voucher.appliesTo === 'INSTALLMENT'
            ? voucher.installmentScope === 'SINGLE'
              ? 1
              : installmentCount
            : null,
        discountedInstallmentAmount,
        regularInstallmentAmount:
          voucher.appliesTo === 'INSTALLMENT' &&
          input.paymentOption.type === 'INSTALLMENTS'
            ? regularInstallmentAmount
            : null,
        usageCount,
        maxUses: voucher.maxUses,
        remainingUses:
          voucher.maxUses && voucher.maxUses > 0
            ? Math.max(0, voucher.maxUses - usageCount)
            : null,
      },
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
      const requiresCashCoursePayment =
        Boolean(selectedOption) &&
        selectedOption?.type === 'CASH' &&
        Number(selectedOption.totalAmount ?? 0) > 0;
      const requiresFirstAcademicPayment =
        requiresFirstInstallment || requiresCashCoursePayment;

      const firstInstallmentCharge = enrollmentCharges.find(
        (item) => !enrollmentFeeCharge || item.id !== enrollmentFeeCharge.id,
      );
      const firstInstallmentPaid =
        !requiresFirstAcademicPayment ||
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
    const methodRaw = String(record.method || '').toUpperCase();
    const method =
      methodRaw === 'BANK_SLIP'
        ? 'BANK_SLIP'
        : methodRaw === 'CREDIT_CARD'
          ? 'CREDIT_CARD'
          : 'PIX';
    const collectionModeRaw = String(record.collectionMode || '').toUpperCase();
    const installmentCount = Number(record.installmentCount ?? 0);
    const installmentAmount = Number(record.installmentAmount ?? 0);
    const totalAmount = Number(record.totalAmount ?? 0);

    return {
      method,
      type,
      collectionMode:
        collectionModeRaw === 'MANUAL_LINK'
          ? 'MANUAL_LINK'
          : 'INSTALLMENT_CHARGES',
      installmentCount:
        Number.isFinite(installmentCount) && installmentCount > 0
          ? installmentCount
          : 0,
      installmentAmount:
        Number.isFinite(installmentAmount) && installmentAmount > 0
          ? installmentAmount
          : 0,
      totalAmount:
        Number.isFinite(totalAmount) && totalAmount > 0
          ? totalAmount
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

  private async markCreditCardRequestApprovedByCharge(
    chargeId: string,
    approvedByUserId: string,
  ) {
    await this.prisma.creditCardPaymentRequest.updateMany({
      where: {
        monthlyChargeId: chargeId,
        status: { notIn: ['APPROVED', 'CANCELED'] },
      },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByUserId,
      },
    });
  }

  private buildCreditCardPaymentRequestWhere(
    user: JwtPayload,
  ): Prisma.CreditCardPaymentRequestWhereInput {
    if (user.activeInstitutionId) {
      return { institutionId: user.activeInstitutionId };
    }

    if (user.role === 'superadmin') {
      return {};
    }

    return { ownerAdminId: user.sub };
  }

  private creditCardPaymentRequestInclude() {
    return {
      monthlyCharge: {
        select: {
          id: true,
          amount: true,
          dueDate: true,
          status: true,
        },
      },
      enrollment: {
        select: {
          id: true,
          schoolClass: {
            select: {
              id: true,
              name: true,
              course: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      ownerAdmin: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    } satisfies Prisma.CreditCardPaymentRequestInclude;
  }

  private mapCreditCardPaymentRequest(request: {
    id: string;
    monthlyChargeId: string;
    enrollmentId: string;
    studentId: string;
    ownerAdminId: string | null;
    institutionId: string;
    amount: Prisma.Decimal | number;
    installmentCount: number | null;
    installmentAmount: Prisma.Decimal | number | null;
    status: string;
    paymentLinkUrl: string | null;
    adminNote: string | null;
    requestedAt: Date;
    linkSentAt: Date | null;
    viewedAt: Date | null;
    copiedAt: Date | null;
    approvedAt: Date | null;
    approvedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    monthlyCharge?: {
      id: string;
      amount: Prisma.Decimal | number;
      dueDate: Date;
      status: string;
    } | null;
    enrollment?: {
      id: string;
      schoolClass?: {
        id: string;
        name: string;
        course?: {
          id: string;
          name: string;
        } | null;
      } | null;
    } | null;
    student?: {
      id: string;
      name: string;
      email: string;
    } | null;
    ownerAdmin?: {
      id: string;
      name: string;
      email: string;
    } | null;
    approvedBy?: {
      id: string;
      name: string;
      email: string;
    } | null;
  }) {
    return {
      ...request,
      amount: Number(request.amount),
      installmentAmount:
        request.installmentAmount === null
          ? null
          : Number(request.installmentAmount),
      monthlyCharge: request.monthlyCharge
        ? {
            ...request.monthlyCharge,
            amount: Number(request.monthlyCharge.amount),
          }
        : null,
    };
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

  private buildCourseWhere(user: JwtPayload): Prisma.CourseWhereInput {
    if (user.activeInstitutionId) {
      return {
        institutionId: user.activeInstitutionId,
      };
    }

    if (user.role === 'superadmin') {
      return {};
    }

    return {
      ownerAdminId: user.sub,
    };
  }

  private buildVoucherWhere(user: JwtPayload): Prisma.FinanceVoucherWhereInput {
    if (user.activeInstitutionId) {
      return {
        institutionId: user.activeInstitutionId,
      };
    }

    if (user.role === 'superadmin') {
      return {};
    }

    return {
      OR: [{ ownerAdminId: user.sub }, { course: { ownerAdminId: user.sub } }],
    };
  }

  private resolveVoucherOwnerAdminId(user: JwtPayload): string | null {
    if (user.role === 'admin') {
      return user.sub;
    }

    return null;
  }

  private normalizeVoucherCode(code: string): string {
    const normalized = String(code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9_-]/g, '');

    if (!normalized) {
      throw new BadRequestException('Informe um código de voucher válido.');
    }

    if (normalized.length > 40) {
      throw new BadRequestException(
        'Código do voucher deve ter no máximo 40 caracteres.',
      );
    }

    return normalized;
  }

  private async generateVoucherCode(institutionId: string) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      let generated = '';
      for (let index = 0; index < 8; index += 1) {
        generated += alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'A';
      }

      const existing = await this.prisma.financeVoucher.findFirst({
        where: {
          institutionId,
          code: generated,
        },
        select: { id: true },
      });
      if (!existing) {
        return generated;
      }
    }

    throw new BadRequestException(
      'Não foi possível gerar um código único de voucher. Tente novamente.',
    );
  }

  private normalizeVoucherDiscountType(
    value: string,
  ): VoucherDiscountTypeInput {
    return String(value || '').trim().toUpperCase() === 'PERCENT'
      ? 'PERCENT'
      : 'FIXED';
  }

  private normalizeVoucherAppliesTo(value: string): VoucherAppliesToInput {
    return String(value || '').trim().toUpperCase() === 'INSTALLMENT'
      ? 'INSTALLMENT'
      : 'TOTAL';
  }

  private normalizeVoucherInstallmentScope(
    value?: string | null,
  ): VoucherInstallmentScopeInput {
    return String(value || '').trim().toUpperCase() === 'SINGLE'
      ? 'SINGLE'
      : 'ALL';
  }

  private normalizeVoucherMaxUses(value?: number | null): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(
        'Informe um limite de uso válido (inteiro maior que zero).',
      );
    }
    return parsed;
  }

  private normalizePaymentOptionIdList(ids: string[]) {
    return Array.from(
      new Set(
        (Array.isArray(ids) ? ids : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    );
  }

  private parseAllowedPaymentOptionIds(raw: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(raw)) return [] as string[];
    return this.normalizePaymentOptionIdList(
      raw.map((item) => String(item || '').trim()),
    );
  }

  private isVoucherApplicableToOption(input: {
    allowedPaymentOptionIds: Prisma.JsonValue | null | undefined;
    appliesTo: VoucherAppliesToInput;
    optionId: string;
    optionType: VoucherPaymentOptionTypeInput;
  }) {
    const allowedIds = this.parseAllowedPaymentOptionIds(
      input.allowedPaymentOptionIds,
    );
    if (allowedIds.length > 0 && !allowedIds.includes(input.optionId)) {
      return false;
    }

    if (input.appliesTo === 'INSTALLMENT' && input.optionType !== 'INSTALLMENTS') {
      return false;
    }

    return true;
  }

  private extractVoucherCoursePaymentOptions(course: {
    paymentOptions: Prisma.JsonValue | null;
    paymentModel: string;
    price: Prisma.Decimal | number | null;
    installmentMonths: number | null;
    installmentValue: Prisma.Decimal | number | null;
  }) {
    const fromJson = this.parseVoucherCoursePaymentOptions(course.paymentOptions);
    if (fromJson.length > 0) {
      return fromJson;
    }

    const paymentModel = String(course.paymentModel || '')
      .trim()
      .toUpperCase();
    if (paymentModel === 'INSTALLMENTS') {
      const months = Math.max(1, Number(course.installmentMonths ?? 1));
      return [
        {
          id: 'legacy-installments',
          title: `${months}x (Boleto)`,
          method: 'BANK_SLIP' as const,
          type: 'INSTALLMENTS' as const,
        },
      ];
    }

    return [
      {
        id: 'legacy-cash',
        title: 'À vista (Pix)',
        method: 'PIX' as const,
        type: 'CASH' as const,
      },
    ];
  }

  private parseVoucherCoursePaymentOptions(raw: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(raw)) return [] as VoucherCourseOption[];

    return raw
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const option = item as Record<string, unknown>;
        if (option.active === false) {
          return null;
        }
        const type =
          String(option.type || '').trim().toUpperCase() === 'INSTALLMENTS'
            ? 'INSTALLMENTS'
            : 'CASH';
        const methodRaw = String(option.method || '').trim().toUpperCase();
        const method =
          methodRaw === 'BANK_SLIP'
            ? 'BANK_SLIP'
            : methodRaw === 'CREDIT_CARD'
              ? 'CREDIT_CARD'
              : 'PIX';
        const id = String(option.id || '').trim() || `payment-option-${index + 1}`;
        const title =
          String(option.title || '').trim() ||
          (type === 'INSTALLMENTS' ? 'Parcelado' : 'À vista');
        return {
          id,
          title,
          method,
          type,
        } as VoucherCourseOption;
      })
      .filter((item): item is VoucherCourseOption => item !== null);
  }

  private formatVoucherDiscountLabel(
    discountType: VoucherDiscountTypeInput,
    discountValue: number,
  ) {
    if (discountType === 'PERCENT') {
      return `${this.toMoneyValue(discountValue).toFixed(2).replace(/\.00$/, '')}% de desconto`;
    }
    return `${this.formatCurrencyPtBr(this.toMoneyValue(discountValue))} de desconto`;
  }

  private applyVoucherValuesToPaymentOption(
    paymentOption: VoucherPaymentOptionShape,
    voucher: {
      discountType: VoucherDiscountTypeInput;
      discountValue: number;
      appliesTo: VoucherAppliesToInput;
      installmentScope: VoucherInstallmentScopeInput;
    },
  ): VoucherPaymentOptionShape {
    const next = {
      ...paymentOption,
      appliedVoucher: paymentOption.appliedVoucher ?? null,
    };
    const safeDiscount = this.toMoneyValue(voucher.discountValue);
    const percentRate = voucher.discountType === 'PERCENT' ? safeDiscount / 100 : 0;

    const applyDiscount = (baseValue: number) => {
      const safeBase = this.toMoneyValue(baseValue);
      if (safeBase <= 0) return 0;
      const discount =
        voucher.discountType === 'PERCENT'
          ? safeBase * percentRate
          : safeDiscount;
      return this.toMoneyValue(Math.max(0, safeBase - discount));
    };

    const installmentCount = Math.max(1, Number(next.installmentCount ?? 1));
    const currentTotal = this.toMoneyValue(next.totalAmount);
    const currentInstallment = this.toMoneyValue(
      next.installmentAmount ?? currentTotal / installmentCount,
    );

    if (voucher.appliesTo === 'INSTALLMENT' && next.type === 'INSTALLMENTS') {
      if (voucher.installmentScope === 'SINGLE') {
        const adjustedFirstInstallment = applyDiscount(currentInstallment);
        next.installmentAmount = currentInstallment;
        next.totalAmount = this.toMoneyValue(
          adjustedFirstInstallment +
            currentInstallment * Math.max(0, installmentCount - 1),
        );

        if ((next.discountInstallmentAmount ?? 0) > 0) {
          const adjustedDiscountFirstInstallment = applyDiscount(
            Number(next.discountInstallmentAmount ?? 0),
          );
          next.discountInstallmentAmount = Number(next.discountInstallmentAmount ?? 0);
          next.discountTotalAmount = this.toMoneyValue(
            adjustedDiscountFirstInstallment +
              Number(next.discountInstallmentAmount ?? 0) *
                Math.max(0, installmentCount - 1),
          );
        } else if ((next.discountTotalAmount ?? 0) > 0) {
          next.discountTotalAmount = applyDiscount(Number(next.discountTotalAmount ?? 0));
          next.discountInstallmentAmount = this.toMoneyValue(
            Number(next.discountTotalAmount ?? 0) / installmentCount,
          );
        }

        if ((next.promotionalInstallmentAmount ?? 0) > 0) {
          const adjustedPromotionalFirstInstallment = applyDiscount(
            Number(next.promotionalInstallmentAmount ?? 0),
          );
          next.promotionalInstallmentAmount = Number(
            next.promotionalInstallmentAmount ?? 0,
          );
          next.promotionalTotalAmount = this.toMoneyValue(
            adjustedPromotionalFirstInstallment +
              Number(next.promotionalInstallmentAmount ?? 0) *
                Math.max(0, installmentCount - 1),
          );
        } else if ((next.promotionalTotalAmount ?? 0) > 0) {
          next.promotionalTotalAmount = applyDiscount(
            Number(next.promotionalTotalAmount ?? 0),
          );
          next.promotionalInstallmentAmount = this.toMoneyValue(
            Number(next.promotionalTotalAmount ?? 0) / installmentCount,
          );
        }

        if ((next.promotionalDiscountInstallmentAmount ?? 0) > 0) {
          const adjustedPromotionalDiscountFirstInstallment = applyDiscount(
            Number(next.promotionalDiscountInstallmentAmount ?? 0),
          );
          next.promotionalDiscountInstallmentAmount = Number(
            next.promotionalDiscountInstallmentAmount ?? 0,
          );
          next.promotionalDiscountTotalAmount = this.toMoneyValue(
            adjustedPromotionalDiscountFirstInstallment +
              Number(next.promotionalDiscountInstallmentAmount ?? 0) *
                Math.max(0, installmentCount - 1),
          );
        } else if ((next.promotionalDiscountTotalAmount ?? 0) > 0) {
          next.promotionalDiscountTotalAmount = applyDiscount(
            Number(next.promotionalDiscountTotalAmount ?? 0),
          );
          next.promotionalDiscountInstallmentAmount = this.toMoneyValue(
            Number(next.promotionalDiscountTotalAmount ?? 0) / installmentCount,
          );
        }
      } else {
        const adjustedInstallment = applyDiscount(currentInstallment);
        next.installmentAmount = adjustedInstallment;
        next.totalAmount = this.toMoneyValue(adjustedInstallment * installmentCount);

        if ((next.discountInstallmentAmount ?? 0) > 0) {
          const discountInstallment = applyDiscount(
            Number(next.discountInstallmentAmount ?? 0),
          );
          next.discountInstallmentAmount = discountInstallment;
          next.discountTotalAmount = this.toMoneyValue(
            discountInstallment * installmentCount,
          );
        } else if ((next.discountTotalAmount ?? 0) > 0) {
          const adjustedDiscountTotal = applyDiscount(
            Number(next.discountTotalAmount ?? 0),
          );
          next.discountTotalAmount = adjustedDiscountTotal;
          next.discountInstallmentAmount = this.toMoneyValue(
            adjustedDiscountTotal / installmentCount,
          );
        }

        if ((next.promotionalInstallmentAmount ?? 0) > 0) {
          const adjustedPromotionalInstallment = applyDiscount(
            Number(next.promotionalInstallmentAmount ?? 0),
          );
          next.promotionalInstallmentAmount = adjustedPromotionalInstallment;
          next.promotionalTotalAmount = this.toMoneyValue(
            adjustedPromotionalInstallment * installmentCount,
          );
        } else if ((next.promotionalTotalAmount ?? 0) > 0) {
          const adjustedPromotionalTotal = applyDiscount(
            Number(next.promotionalTotalAmount ?? 0),
          );
          next.promotionalTotalAmount = adjustedPromotionalTotal;
          next.promotionalInstallmentAmount = this.toMoneyValue(
            adjustedPromotionalTotal / installmentCount,
          );
        }

        if ((next.promotionalDiscountInstallmentAmount ?? 0) > 0) {
          const adjustedPromotionalDiscountInstallment = applyDiscount(
            Number(next.promotionalDiscountInstallmentAmount ?? 0),
          );
          next.promotionalDiscountInstallmentAmount =
            adjustedPromotionalDiscountInstallment;
          next.promotionalDiscountTotalAmount = this.toMoneyValue(
            adjustedPromotionalDiscountInstallment * installmentCount,
          );
        } else if ((next.promotionalDiscountTotalAmount ?? 0) > 0) {
          const adjustedPromotionalDiscountTotal = applyDiscount(
            Number(next.promotionalDiscountTotalAmount ?? 0),
          );
          next.promotionalDiscountTotalAmount = adjustedPromotionalDiscountTotal;
          next.promotionalDiscountInstallmentAmount = this.toMoneyValue(
            adjustedPromotionalDiscountTotal / installmentCount,
          );
        }
      }
    } else {
      next.totalAmount = applyDiscount(currentTotal);
      if (next.type === 'INSTALLMENTS') {
        next.installmentAmount = this.toMoneyValue(next.totalAmount / installmentCount);
      }

      if ((next.discountTotalAmount ?? 0) > 0) {
        next.discountTotalAmount = applyDiscount(Number(next.discountTotalAmount ?? 0));
      }
      if (next.type === 'INSTALLMENTS') {
        next.discountInstallmentAmount =
          (next.discountTotalAmount ?? 0) > 0
            ? this.toMoneyValue(Number(next.discountTotalAmount ?? 0) / installmentCount)
            : null;
      }

      if ((next.promotionalTotalAmount ?? 0) > 0) {
        next.promotionalTotalAmount = applyDiscount(
          Number(next.promotionalTotalAmount ?? 0),
        );
      }
      if (next.type === 'INSTALLMENTS') {
        next.promotionalInstallmentAmount =
          (next.promotionalTotalAmount ?? 0) > 0
            ? this.toMoneyValue(
                Number(next.promotionalTotalAmount ?? 0) / installmentCount,
              )
            : null;
      }

      if ((next.promotionalDiscountTotalAmount ?? 0) > 0) {
        next.promotionalDiscountTotalAmount = applyDiscount(
          Number(next.promotionalDiscountTotalAmount ?? 0),
        );
      }
      if (next.type === 'INSTALLMENTS') {
        next.promotionalDiscountInstallmentAmount =
          (next.promotionalDiscountTotalAmount ?? 0) > 0
            ? this.toMoneyValue(
                Number(next.promotionalDiscountTotalAmount ?? 0) / installmentCount,
              )
            : null;
      }
    }

    return next;
  }

  private async findActiveVoucherForCourse(input: {
    tx?: Prisma.TransactionClient;
    institutionId: string;
    courseId: string;
    code: string;
  }) {
    const db = input.tx ?? this.prisma;
    return db.financeVoucher.findFirst({
      where: {
        institutionId: input.institutionId,
        active: true,
        code: input.code,
        OR: [{ courseId: input.courseId }, { courseId: null }],
      },
      select: {
        id: true,
        code: true,
        title: true,
        discountType: true,
        discountValue: true,
        appliesTo: true,
        appliesToEnrollmentFee: true,
        installmentScope: true,
        maxUses: true,
        usageCount: true,
        allowedPaymentOptionIds: true,
      },
    });
  }

  private formatCurrencyPtBr(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(this.toMoneyValue(value));
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
