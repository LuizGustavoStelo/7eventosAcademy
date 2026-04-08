import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StudentCourseStatus, UserRole } from '@prisma/client';
import { ContractsService } from '../contracts/contracts.service';
import { PrismaService } from '../database/prisma.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';

type EnrollmentContext = {
  actorUserId?: string;
  actorRole?: string;
  actorInstitutionId?: string | null;
};

type EnrollmentPaymentOptionMethod = 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD';
type EnrollmentPaymentOptionType = 'CASH' | 'INSTALLMENTS';

type EnrollmentPaymentOption = {
  id: string;
  title: string;
  method: EnrollmentPaymentOptionMethod;
  type: EnrollmentPaymentOptionType;
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
};

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractsService: ContractsService,
  ) {}

  async create(
    dto: CreateEnrollmentDto,
    context?: EnrollmentContext,
  ) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: {
        id: dto.classId,
        ...this.buildClassScopeFilter(context),
      },
      select: {
        id: true,
        institutionId: true,
        totalSeats: true,
        occupiedSeats: true,
        status: true,
        startDate: true,
        course: {
          select: {
            id: true,
            ownerAdminId: true,
            paymentModel: true,
            price: true,
            enrollmentFee: true,
            paymentOptions: true,
            installmentMonths: true,
            installmentValue: true,
          },
        },
      },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }

    if (schoolClass.status === 'CLOSED') {
      throw new BadRequestException(
        'Esta turma está encerrada e não aceita novas matrículas.',
      );
    }

    if (schoolClass.occupiedSeats >= schoolClass.totalSeats) {
      throw new BadRequestException('Não há vagas disponíveis nesta turma.');
    }

    const student = await this.prisma.user.findFirst({
      where: {
        id: dto.studentId,
        role: UserRole.USER,
        institutionId: schoolClass.institutionId,
        ...this.buildStudentScopeFilter(context),
      },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Aluno não encontrado.');
    }

    const studentCourse = await this.prisma.studentCourse.findFirst({
      where: {
        studentId: dto.studentId,
        courseId: schoolClass.course.id,
        institutionId: schoolClass.institutionId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (
      !studentCourse ||
      (studentCourse.status !== StudentCourseStatus.INTERESTED &&
        studentCourse.status !== StudentCourseStatus.ACTIVE)
    ) {
      throw new BadRequestException(
        'Aluno não está matriculado no curso desta turma.',
      );
    }

    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: {
        classId_studentId: {
          classId: dto.classId,
          studentId: dto.studentId,
        },
      },
      select: { id: true },
    });

    if (existingEnrollment) {
      throw new BadRequestException('Este aluno já está matriculado na turma.');
    }

    const enrollment = await this.prisma.$transaction(
      async (tx) => {
        const selectedPaymentOption = await this.resolveEnrollmentPaymentOption({
          tx,
          institutionId: schoolClass.institutionId,
          courseId: schoolClass.course.id,
          requestedPaymentOptionId: dto.paymentOptionId,
          course: schoolClass.course,
        });

        const createdEnrollment = await tx.enrollment.create({
          data: {
            classId: dto.classId,
            studentId: dto.studentId,
            institutionId: schoolClass.institutionId,
            status: 'ACTIVE',
            selectedPaymentOptionId: selectedPaymentOption.id,
            selectedPaymentOption:
              selectedPaymentOption as Prisma.InputJsonValue,
          },
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
        });

        await tx.schoolClass.update({
          where: { id: dto.classId },
          data: {
            occupiedSeats: {
              increment: 1,
            },
          },
        });

        await tx.studentCourse.update({
          where: {
            studentId_courseId: {
              studentId: dto.studentId,
              courseId: schoolClass.course.id,
            },
          },
          data: {
            status: StudentCourseStatus.ACTIVE,
          },
        });

        const onboardingCharges = this.buildEnrollmentChargesForPreContractFlow({
          enrollmentCreatedAt: createdEnrollment.createdAt,
          classStartDate: schoolClass.startDate,
          enrollmentFee: Number(schoolClass.course.enrollmentFee ?? 0),
          paymentModel: schoolClass.course.paymentModel,
          installmentMonths: schoolClass.course.installmentMonths,
          installmentValue: schoolClass.course.installmentValue,
          selectedPaymentOption,
        });

        if (onboardingCharges.length > 0) {
          await tx.monthlyCharge.createMany({
            data: onboardingCharges.map((charge) => ({
              enrollmentId: createdEnrollment.id,
              ownerAdminId: schoolClass.course.ownerAdminId,
              dueDate: charge.dueDate,
              amount: charge.amount,
              status: charge.status,
            })),
          });
        }

        return createdEnrollment;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    const enrollmentFeeAmount = Number(
      enrollment.schoolClass?.course?.enrollmentFee ?? 0,
    );
    if (!Number.isFinite(enrollmentFeeAmount) || enrollmentFeeAmount <= 0) {
      try {
        await this.contractsService.sendAutomaticContractsForEnrollment({
          institutionId: enrollment.institutionId,
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          courseId: enrollment.schoolClass?.course?.id ?? null,
          classId: enrollment.classId,
          createdByUserId: enrollment.schoolClass.course.ownerAdminId,
        });
      } catch {
        // O envio automático de contrato não deve bloquear a criação da matrícula.
      }
    }

    return enrollment;
  }

  async remove(
    classId: string,
    studentId: string,
    context?: EnrollmentContext,
  ) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        classId,
        studentId,
        ...this.buildEnrollmentScopeFilter(context),
      },
      select: {
        id: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Matrícula não encontrada para esta turma e aluno.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.delete({
        where: {
          classId_studentId: {
            classId,
            studentId,
          },
        },
      });

      await tx.schoolClass.update({
        where: { id: classId },
        data: {
          occupiedSeats: {
            decrement: 1,
          },
        },
      });
    });

    return { success: true };
  }

  async findAll(context?: EnrollmentContext) {
    return this.prisma.enrollment.findMany({
      where: this.buildEnrollmentScopeFilter(context),
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private buildClassScopeFilter(
    context?: EnrollmentContext,
  ): Prisma.SchoolClassWhereInput {
    if (context?.actorInstitutionId) {
      return {
        institutionId: context.actorInstitutionId,
      };
    }

    if (this.isSuperadmin(context) || !context?.actorUserId) {
      return {};
    }

    return {
      course: {
        ownerAdminId: context.actorUserId,
      },
    };
  }

  private buildStudentScopeFilter(
    context?: EnrollmentContext,
  ): Prisma.UserWhereInput {
    if (context?.actorInstitutionId) {
      return {
        institutionId: context.actorInstitutionId,
      };
    }

    if (this.isSuperadmin(context) || !context?.actorUserId) {
      return {};
    }

    return {
      ownerAdminId: context.actorUserId,
    };
  }

  private buildEnrollmentScopeFilter(
    context?: EnrollmentContext,
  ): Prisma.EnrollmentWhereInput {
    if (context?.actorInstitutionId) {
      return {
        institutionId: context.actorInstitutionId,
      };
    }

    if (this.isSuperadmin(context) || !context?.actorUserId) {
      return {};
    }

    return {
      schoolClass: { course: { ownerAdminId: context.actorUserId } },
      student: { ownerAdminId: context.actorUserId },
    };
  }

  private isSuperadmin(context?: EnrollmentContext) {
    return context?.actorRole?.toLowerCase() === 'superadmin';
  }

  private buildInstallmentCharges(input: {
    classStartDate: Date;
    paymentModel: string;
    installmentMonths: number | null;
    installmentValue: { toNumber: () => number } | null;
    selectedPaymentOption?: EnrollmentPaymentOption;
  }) {
    if (input.selectedPaymentOption) {
      if (input.selectedPaymentOption.type !== 'INSTALLMENTS') {
        return [] as Array<{
          dueDate: Date;
          amount: number;
          status: 'PENDING' | 'OVERDUE';
        }>;
      }

      const months = Number(input.selectedPaymentOption.installmentCount ?? 0);
      const value = Number(input.selectedPaymentOption.installmentAmount ?? 0);
      if (
        !Number.isFinite(months) ||
        months <= 0 ||
        !Number.isFinite(value) ||
        value <= 0
      ) {
        return [];
      }

      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const base = new Date(input.classStartDate);
      if (input.selectedPaymentOption.installmentStartDate) {
        const scheduled = new Date(input.selectedPaymentOption.installmentStartDate);
        if (!Number.isNaN(scheduled.getTime())) {
          base.setTime(scheduled.getTime());
        }
      }
      const result: Array<{
        dueDate: Date;
        amount: number;
        status: 'PENDING' | 'OVERDUE';
      }> = [];

      for (let index = 0; index < months; index += 1) {
        const dueDate = this.buildChargeDueDate(
          base,
          index,
          input.selectedPaymentOption.dueDay ?? undefined,
        );
        const dueDateStart = new Date(
          dueDate.getFullYear(),
          dueDate.getMonth(),
          dueDate.getDate(),
        );
        result.push({
          dueDate,
          amount: value,
          status: dueDateStart < startOfToday ? 'OVERDUE' : 'PENDING',
        });
      }

      return result;
    }

    if (String(input.paymentModel).toUpperCase() !== 'INSTALLMENTS') {
      return [] as Array<{
        dueDate: Date;
        amount: number;
        status: 'PENDING' | 'OVERDUE';
      }>;
    }

    const months = Number(input.installmentMonths ?? 0);
    const value = Number(input.installmentValue?.toNumber?.() ?? 0);
    if (!Number.isFinite(months) || months <= 0 || !Number.isFinite(value) || value <= 0) {
      return [];
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const base = new Date(input.classStartDate);
    const result: Array<{
      dueDate: Date;
      amount: number;
      status: 'PENDING' | 'OVERDUE';
    }> = [];

    for (let index = 0; index < months; index += 1) {
      const dueDate = new Date(base.getTime());
      dueDate.setMonth(dueDate.getMonth() + index);
      const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      result.push({
        dueDate,
        amount: value,
        status: dueDateStart < startOfToday ? 'OVERDUE' : 'PENDING',
      });
    }

    return result;
  }

  private buildEnrollmentChargesForPreContractFlow(input: {
    enrollmentCreatedAt: Date;
    classStartDate: Date;
    enrollmentFee: number;
    paymentModel: string;
    installmentMonths: number | null;
    installmentValue: { toNumber: () => number } | null;
    selectedPaymentOption?: EnrollmentPaymentOption;
  }) {
    const charges = this.buildInstallmentCharges({
      classStartDate: input.classStartDate,
      paymentModel: input.paymentModel,
      installmentMonths: input.installmentMonths,
      installmentValue: input.installmentValue,
      selectedPaymentOption: input.selectedPaymentOption,
    });

    const enrollmentFee = this.toMoneyValue(input.enrollmentFee);
    if (enrollmentFee <= 0) {
      return charges;
    }

    return [
      {
        dueDate: new Date(input.enrollmentCreatedAt),
        amount: enrollmentFee,
        status: 'PENDING' as const,
      },
      ...charges,
    ];
  }

  private buildChargeDueDate(baseDate: Date, monthOffset: number, dueDay?: number) {
    const dueDate = new Date(baseDate.getTime());
    dueDate.setMonth(dueDate.getMonth() + monthOffset);

    if (!dueDay) {
      return dueDate;
    }

    const year = dueDate.getFullYear();
    const month = dueDate.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    dueDate.setDate(Math.min(Math.max(1, dueDay), maxDay));
    return dueDate;
  }

  private async resolveEnrollmentPaymentOption(input: {
    tx: Prisma.TransactionClient;
    institutionId: string;
    courseId: string;
    requestedPaymentOptionId?: string;
    course: {
      paymentModel: string;
      paymentOptions: Prisma.JsonValue | null;
      price: Prisma.Decimal | null;
      installmentMonths: number | null;
      installmentValue: Prisma.Decimal | null;
    };
  }) {
    const availableOptions = this.normalizeCoursePaymentOptionsForEnrollment(
      input.course,
    ).filter((option) => option.active);

    if (availableOptions.length === 0) {
      throw new BadRequestException(
        'Este curso n?o possui op??es de pagamento ativas.',
      );
    }

    if (input.requestedPaymentOptionId) {
      const requestedOption = availableOptions.find(
        (option) => option.id === input.requestedPaymentOptionId,
      );
      if (!requestedOption) {
        throw new BadRequestException('Op??o de pagamento inv?lida para este curso.');
      }

      const promotionalApplied = await this.isPromotionalOptionAvailable({
        tx: input.tx,
        institutionId: input.institutionId,
        courseId: input.courseId,
        option: requestedOption,
      });
      return this.resolveOptionWithPromotion(requestedOption, promotionalApplied);
    }

    const resolvedOptions: EnrollmentPaymentOption[] = [];
    for (const option of availableOptions) {
      const promotionalApplied = await this.isPromotionalOptionAvailable({
        tx: input.tx,
        institutionId: input.institutionId,
        courseId: input.courseId,
        option,
      });
      resolvedOptions.push(this.resolveOptionWithPromotion(option, promotionalApplied));
    }

    resolvedOptions.sort((a, b) => {
      const left = this.resolveOptionTotalForSorting(a);
      const right = this.resolveOptionTotalForSorting(b);
      return left - right;
    });

    return resolvedOptions[0];
  }

  private async isPromotionalOptionAvailable(input: {
    tx: Prisma.TransactionClient;
    institutionId: string;
    courseId: string;
    option: EnrollmentPaymentOption;
  }) {
    if (!input.option.isPromotional) return true;
    const slots = Number(input.option.promotionalSlots ?? 0);
    if (!Number.isFinite(slots) || slots <= 0) return false;

    const used = await input.tx.enrollment.count({
      where: {
        institutionId: input.institutionId,
        status: 'ACTIVE',
        selectedPaymentOption: {
          path: ['promotionalApplied'],
          equals: true,
        },
        schoolClass: {
          courseId: input.courseId,
        },
      },
    });

    return used < slots;
  }

  private resolveOptionWithPromotion(
    option: EnrollmentPaymentOption,
    promotionalApplied: boolean,
  ): EnrollmentPaymentOption {
    if (!promotionalApplied || !option.isPromotional) {
      return {
        ...option,
        promotionalApplied: false,
      };
    }

    if (option.type === 'INSTALLMENTS') {
      const installmentCount = Math.max(1, Number(option.installmentCount ?? 1));
      const promotionalInstallmentAmount = this.toMoneyValue(
        option.promotionalInstallmentAmount ?? option.installmentAmount ?? 0,
      );
      const promotionalTotalAmount = this.toMoneyValue(
        option.promotionalTotalAmount ??
          promotionalInstallmentAmount * installmentCount,
      );
      return {
        ...option,
        totalAmount: promotionalTotalAmount,
        installmentAmount: promotionalInstallmentAmount,
        discountEnabled:
          option.promotionalDiscountEnabled &&
          (option.promotionalDiscountTotalAmount ?? 0) > 0,
        discountTotalAmount:
          option.promotionalDiscountEnabled &&
          (option.promotionalDiscountTotalAmount ?? 0) > 0
            ? this.toMoneyValue(option.promotionalDiscountTotalAmount ?? 0)
            : option.discountTotalAmount,
        discountInstallmentAmount:
          option.promotionalDiscountEnabled &&
          (option.promotionalDiscountInstallmentAmount ?? 0) > 0
            ? this.toMoneyValue(option.promotionalDiscountInstallmentAmount ?? 0)
            : option.discountInstallmentAmount,
        discountDeadlineDay:
          option.promotionalDiscountEnabled &&
          (option.promotionalDiscountTotalAmount ?? 0) > 0
            ? option.promotionalDiscountDeadlineDay
            : option.discountDeadlineDay,
        discountRequiresActiveCrf:
          option.promotionalDiscountEnabled &&
          (option.promotionalDiscountTotalAmount ?? 0) > 0
            ? option.promotionalDiscountRequiresActiveCrf
            : option.discountRequiresActiveCrf,
        promotionalApplied: true,
      };
    }

    return {
      ...option,
      totalAmount: this.toMoneyValue(
        option.promotionalTotalAmount ?? option.totalAmount,
      ),
      discountEnabled:
        option.promotionalDiscountEnabled &&
        (option.promotionalDiscountTotalAmount ?? 0) > 0,
      discountTotalAmount:
        option.promotionalDiscountEnabled &&
        (option.promotionalDiscountTotalAmount ?? 0) > 0
          ? this.toMoneyValue(option.promotionalDiscountTotalAmount ?? 0)
          : option.discountTotalAmount,
      discountDeadlineDay:
        option.promotionalDiscountEnabled &&
        (option.promotionalDiscountTotalAmount ?? 0) > 0
          ? option.promotionalDiscountDeadlineDay
          : option.discountDeadlineDay,
      discountRequiresActiveCrf:
        option.promotionalDiscountEnabled &&
        (option.promotionalDiscountTotalAmount ?? 0) > 0
          ? option.promotionalDiscountRequiresActiveCrf
          : option.discountRequiresActiveCrf,
      promotionalApplied: true,
    };
  }

  private resolveOptionTotalForSorting(option: EnrollmentPaymentOption): number {
    const total = Number(option.totalAmount ?? 0);
    if (Number.isFinite(total) && total > 0) return total;
    if (option.type === 'INSTALLMENTS') {
      const months = Math.max(1, Number(option.installmentCount ?? 1));
      const installment = Number(option.installmentAmount ?? 0);
      if (Number.isFinite(installment) && installment > 0) {
        return this.toMoneyValue(installment * months);
      }
    }
    return Number.MAX_SAFE_INTEGER;
  }

  private normalizeCoursePaymentOptionsForEnrollment(course: {
    paymentModel: string;
    paymentOptions: Prisma.JsonValue | null;
    price: Prisma.Decimal | null;
    installmentMonths: number | null;
    installmentValue: Prisma.Decimal | null;
  }) {
    const parsedFromJson = this.parsePaymentOptionsJson(course.paymentOptions);
    if (parsedFromJson.length > 0) {
      return parsedFromJson;
    }

    return [
      this.buildLegacyEnrollmentPaymentOption({
        paymentModel: course.paymentModel,
        price: course.price ? Number(course.price) : 0,
        installmentMonths: Number(course.installmentMonths ?? 0),
        installmentValue: Number(course.installmentValue?.toNumber?.() ?? 0),
      }),
    ];
  }

  private parsePaymentOptionsJson(raw: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(raw)) return [] as EnrollmentPaymentOption[];

    return raw
      .map((item, index) => this.parsePaymentOptionItem(item, index))
      .filter((option): option is EnrollmentPaymentOption => option !== null);
  }

  private parsePaymentOptionItem(item: Prisma.JsonValue, index: number) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

    const objectItem = item as Record<string, unknown>;
    const type =
      String(objectItem.type || '').toUpperCase() === 'INSTALLMENTS'
        ? 'INSTALLMENTS'
        : 'CASH';
    const totalAmount = this.toMoneyValue(objectItem.totalAmount);
    const installmentCount =
      type === 'INSTALLMENTS'
        ? Math.max(
            1,
            Math.trunc(this.toFiniteNumber(objectItem.installmentCount) ?? 1),
          )
        : null;
    const installmentAmount =
      type === 'INSTALLMENTS'
        ? this.toMoneyValue(
            this.toFiniteNumber(objectItem.installmentAmount) ??
              totalAmount / Math.max(1, installmentCount || 1),
          )
        : null;
    const dueDayRaw = this.toFiniteNumber(objectItem.dueDay);
    const dueDay =
      dueDayRaw === undefined
        ? null
        : Math.min(31, Math.max(1, Math.trunc(dueDayRaw)));
    const installmentStartDateRaw = String(objectItem.installmentStartDate || '').trim();
    const installmentStartDate =
      type === 'INSTALLMENTS' && installmentStartDateRaw
        ? (() => {
            const parsed = new Date(installmentStartDateRaw);
            return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
          })()
        : null;
    const isPromotional = Boolean(objectItem.isPromotional);
    const promotionalSlots = isPromotional
      ? Math.max(
          1,
          Math.trunc(this.toFiniteNumber(objectItem.promotionalSlots) ?? 20),
        )
      : null;
    const promotionalTotalAmount =
      isPromotional && this.toFiniteNumber(objectItem.promotionalTotalAmount) !== undefined
        ? this.toMoneyValue(this.toFiniteNumber(objectItem.promotionalTotalAmount) ?? 0)
        : isPromotional
          ? totalAmount
          : null;
    const promotionalInstallmentAmount =
      isPromotional && type === 'INSTALLMENTS'
        ? this.toMoneyValue(
            this.toFiniteNumber(objectItem.promotionalInstallmentAmount) ??
              (promotionalTotalAmount ?? totalAmount) / Math.max(1, installmentCount || 1),
          )
        : null;
    const hasPromotionalValue =
      isPromotional &&
      (promotionalTotalAmount ?? 0) > 0 &&
      (type !== 'INSTALLMENTS' || (promotionalInstallmentAmount ?? 0) > 0);
    const discountEnabled = Boolean(objectItem.discountEnabled);
    const discountTypeRaw = String(objectItem.discountType || '').toUpperCase();
    const discountType =
      discountEnabled && discountTypeRaw === 'PERCENT'
        ? 'PERCENT'
        : discountEnabled
          ? 'FIXED'
          : null;
    const discountValue = discountEnabled
      ? this.toMoneyValue(this.toFiniteNumber(objectItem.discountValue) ?? 0)
      : null;
    const discountDeadlineDayRaw = this.toFiniteNumber(objectItem.discountDeadlineDay);
    const discountDeadlineDay =
      discountEnabled && discountDeadlineDayRaw !== undefined
        ? Math.min(31, Math.max(1, Math.trunc(discountDeadlineDayRaw)))
        : null;
    const discountRequiresActiveCrf =
      discountEnabled && Boolean(objectItem.discountRequiresActiveCrf);
    const discountAppliesToRaw = String(objectItem.discountAppliesTo || '').toUpperCase();
    const discountAppliesTo =
      discountEnabled && discountAppliesToRaw === 'TOTAL'
        ? 'TOTAL'
        : discountEnabled
          ? 'INSTALLMENT'
          : null;
    const discountTotalAmount =
      discountEnabled && this.toFiniteNumber(objectItem.discountTotalAmount) !== undefined
        ? this.toMoneyValue(this.toFiniteNumber(objectItem.discountTotalAmount) ?? 0)
        : null;
    const discountInstallmentAmount =
      discountEnabled && type === 'INSTALLMENTS'
        ? this.toMoneyValue(
            this.toFiniteNumber(objectItem.discountInstallmentAmount) ??
              (discountTotalAmount ?? totalAmount) / Math.max(1, installmentCount || 1),
          )
        : null;
    const hasDiscountValue = (discountValue ?? 0) > 0;
    const hasDiscountAmount = (discountTotalAmount ?? 0) > 0;
    const hasAnyDiscount = discountEnabled && (hasDiscountAmount || hasDiscountValue);
    const promotionalDiscountEnabled =
      isPromotional && Boolean(objectItem.promotionalDiscountEnabled);
    const promotionalDiscountTotalAmount =
      promotionalDiscountEnabled &&
      this.toFiniteNumber(objectItem.promotionalDiscountTotalAmount) !== undefined
        ? this.toMoneyValue(
            this.toFiniteNumber(objectItem.promotionalDiscountTotalAmount) ?? 0,
          )
        : null;
    const promotionalDiscountInstallmentAmount =
      promotionalDiscountEnabled && type === 'INSTALLMENTS'
        ? this.toMoneyValue(
            this.toFiniteNumber(objectItem.promotionalDiscountInstallmentAmount) ??
              (promotionalDiscountTotalAmount ?? promotionalTotalAmount ?? totalAmount) /
                Math.max(1, installmentCount || 1),
          )
        : null;
    const promotionalDiscountDeadlineDayRaw = this.toFiniteNumber(
      objectItem.promotionalDiscountDeadlineDay,
    );
    const promotionalDiscountDeadlineDay =
      promotionalDiscountEnabled && promotionalDiscountDeadlineDayRaw !== undefined
        ? Math.min(31, Math.max(1, Math.trunc(promotionalDiscountDeadlineDayRaw)))
        : null;

    return {
      id: String(objectItem.id || '').trim() || `payment-option-${index + 1}`,
      title:
        String(objectItem.title || '').trim() ||
        (type === 'INSTALLMENTS' ? `${installmentCount || 1}x` : 'À vista'),
      method: this.normalizePaymentMethod(objectItem.method),
      type,
      totalAmount,
      installmentCount,
      installmentAmount,
      dueDay,
      installmentStartDate,
      note: String(objectItem.note || '').trim() || null,
      isPromotional: hasPromotionalValue,
      promotionalSlots: hasPromotionalValue ? promotionalSlots : null,
      promotionalTotalAmount: hasPromotionalValue ? promotionalTotalAmount : null,
      promotionalInstallmentAmount:
        hasPromotionalValue && type === 'INSTALLMENTS'
          ? promotionalInstallmentAmount
          : null,
      active: objectItem.active !== false,
      discountEnabled: hasAnyDiscount,
      discountTotalAmount:
        discountEnabled && (discountTotalAmount ?? 0) > 0 ? discountTotalAmount : null,
      discountInstallmentAmount:
        discountEnabled &&
        type === 'INSTALLMENTS' &&
        (discountInstallmentAmount ?? 0) > 0
          ? discountInstallmentAmount
          : null,
      discountType: hasDiscountValue ? discountType : null,
      discountValue: hasDiscountValue ? discountValue : null,
      discountDeadlineDay: hasAnyDiscount ? discountDeadlineDay : null,
      discountRequiresActiveCrf:
        hasAnyDiscount
          ? discountRequiresActiveCrf
          : false,
      discountAppliesTo: hasAnyDiscount ? discountAppliesTo : null,
      promotionalDiscountEnabled:
        promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0,
      promotionalDiscountTotalAmount:
        promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0
          ? promotionalDiscountTotalAmount
          : null,
      promotionalDiscountInstallmentAmount:
        promotionalDiscountEnabled &&
        type === 'INSTALLMENTS' &&
        (promotionalDiscountInstallmentAmount ?? 0) > 0
          ? promotionalDiscountInstallmentAmount
          : null,
      promotionalDiscountDeadlineDay:
        promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0
          ? promotionalDiscountDeadlineDay
          : null,
      promotionalDiscountRequiresActiveCrf:
        promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0
          ? Boolean(objectItem.promotionalDiscountRequiresActiveCrf)
          : false,
    };
  }

  private buildLegacyEnrollmentPaymentOption(input: {
    paymentModel: string;
    price: number;
    installmentMonths: number;
    installmentValue: number;
  }): EnrollmentPaymentOption {
    if (String(input.paymentModel).toUpperCase() === 'INSTALLMENTS') {
      const installmentCount = Math.max(1, Number(input.installmentMonths || 1));
      const installmentAmount =
        Number(input.installmentValue || 0) ||
        (input.price > 0 ? input.price / installmentCount : 0);
      return {
        id: 'legacy-installments',
        title: `${installmentCount}x (Boleto)`,
        method: 'BANK_SLIP',
        type: 'INSTALLMENTS',
        totalAmount:
          input.price > 0
            ? this.toMoneyValue(input.price)
            : this.toMoneyValue(installmentAmount * installmentCount),
        installmentCount,
        installmentAmount: this.toMoneyValue(installmentAmount),
        dueDay: null,
        installmentStartDate: null,
        note: null,
        isPromotional: false,
        promotionalSlots: null,
        promotionalTotalAmount: null,
        promotionalInstallmentAmount: null,
        active: true,
        discountEnabled: false,
        discountTotalAmount: null,
        discountInstallmentAmount: null,
        discountType: null,
        discountValue: null,
        discountDeadlineDay: null,
        discountRequiresActiveCrf: false,
        discountAppliesTo: null,
        promotionalDiscountEnabled: false,
        promotionalDiscountTotalAmount: null,
        promotionalDiscountInstallmentAmount: null,
        promotionalDiscountDeadlineDay: null,
        promotionalDiscountRequiresActiveCrf: false,
      };
    }

    return {
      id: 'legacy-cash',
      title: 'À vista (Pix)',
      method: 'PIX',
      type: 'CASH',
      totalAmount: this.toMoneyValue(input.price),
      installmentCount: null,
      installmentAmount: null,
      dueDay: null,
      installmentStartDate: null,
      note: null,
      isPromotional: false,
      promotionalSlots: null,
      promotionalTotalAmount: null,
      promotionalInstallmentAmount: null,
      active: true,
      discountEnabled: false,
      discountTotalAmount: null,
      discountInstallmentAmount: null,
      discountType: null,
      discountValue: null,
      discountDeadlineDay: null,
      discountRequiresActiveCrf: false,
      discountAppliesTo: null,
      promotionalDiscountEnabled: false,
      promotionalDiscountTotalAmount: null,
      promotionalDiscountInstallmentAmount: null,
      promotionalDiscountDeadlineDay: null,
      promotionalDiscountRequiresActiveCrf: false,
    };
  }

  private normalizePaymentMethod(value: unknown): EnrollmentPaymentOptionMethod {
    const normalized = String(value || '').toUpperCase();
    if (normalized === 'BANK_SLIP') return 'BANK_SLIP';
    if (normalized === 'CREDIT_CARD') return 'CREDIT_CARD';
    return 'PIX';
  }

  private toMoneyValue(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Number(Math.max(0, numeric).toFixed(2));
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return numeric;
  }
}
