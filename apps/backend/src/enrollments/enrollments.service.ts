import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StudentCourseStatus, UserRole } from '@prisma/client';
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
  note: string | null;
  isPromotional: boolean;
  promotionalSlots: number | null;
  active: boolean;
};

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

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

        const installmentCharges = this.buildInstallmentCharges({
          classStartDate: schoolClass.startDate,
          paymentModel: schoolClass.course.paymentModel,
          installmentMonths: schoolClass.course.installmentMonths,
          installmentValue: schoolClass.course.installmentValue,
          selectedPaymentOption,
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

        if (installmentCharges.length > 0) {
          await tx.monthlyCharge.createMany({
            data: installmentCharges.map((item) => ({
              enrollmentId: createdEnrollment.id,
              ownerAdminId: schoolClass.course.ownerAdminId,
              dueDate: item.dueDate,
              amount: item.amount,
              status: item.status,
            })),
          });
        }

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

        return createdEnrollment;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

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
        'Este curso não possui opções de pagamento ativas.',
      );
    }

    if (input.requestedPaymentOptionId) {
      const requestedOption = availableOptions.find(
        (option) => option.id === input.requestedPaymentOptionId,
      );
      if (!requestedOption) {
        throw new BadRequestException('Opção de pagamento inválida para este curso.');
      }

      await this.ensurePromotionalOptionAvailability({
        tx: input.tx,
        institutionId: input.institutionId,
        courseId: input.courseId,
        option: requestedOption,
      });
      return requestedOption;
    }

    const promotionalOptions = availableOptions.filter(
      (option) => option.isPromotional,
    );
    promotionalOptions.sort((a, b) => a.totalAmount - b.totalAmount);

    for (const option of promotionalOptions) {
      const available = await this.isPromotionalOptionAvailable({
        tx: input.tx,
        institutionId: input.institutionId,
        courseId: input.courseId,
        option,
      });
      if (available) return option;
    }

    const nonPromotionalOption = availableOptions.find(
      (option) => !option.isPromotional,
    );
    if (nonPromotionalOption) return nonPromotionalOption;

    throw new BadRequestException(
      'As opções promocionais deste curso atingiram o limite de inscrições.',
    );
  }

  private async ensurePromotionalOptionAvailability(input: {
    tx: Prisma.TransactionClient;
    institutionId: string;
    courseId: string;
    option: EnrollmentPaymentOption;
  }) {
    if (!input.option.isPromotional) return;
    const available = await this.isPromotionalOptionAvailable(input);
    if (available) return;

    throw new BadRequestException(
      'O limite desta opção promocional já foi atingido.',
    );
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
        selectedPaymentOptionId: input.option.id,
        schoolClass: {
          courseId: input.courseId,
        },
      },
    });

    return used < slots;
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
    const isPromotional = Boolean(objectItem.isPromotional);
    const promotionalSlots = isPromotional
      ? Math.max(
          1,
          Math.trunc(this.toFiniteNumber(objectItem.promotionalSlots) ?? 20),
        )
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
      note: String(objectItem.note || '').trim() || null,
      isPromotional,
      promotionalSlots,
      active: objectItem.active !== false,
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
        note: null,
        isPromotional: false,
        promotionalSlots: null,
        active: true,
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
      note: null,
      isPromotional: false,
      promotionalSlots: null,
      active: true,
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
