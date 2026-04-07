import { Injectable, NotFoundException } from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import {
  CoursePaymentModel,
  Prisma,
  StudentCourseStatus,
  UploadOwnerType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  CoursePaymentDiscountAppliesToDto,
  CoursePaymentDiscountTypeDto,
  CoursePaymentOptionDto,
  CoursePaymentOptionMethodDto,
  CoursePaymentOptionTypeDto,
  CoursePaymentModelDto,
  CreateCourseDto,
} from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtPayload } from '../auth/types/app-role.type';

const COURSE_BANNER_KIND = 'COURSE_BANNER';
type CourseActor = Pick<JwtPayload, 'sub' | 'role' | 'activeInstitutionId'>;
type NormalizedCoursePaymentOption = {
  id: string;
  title: string;
  method: CoursePaymentOptionMethodDto;
  type: CoursePaymentOptionTypeDto;
  totalAmount: number;
  installmentCount: number | null;
  installmentAmount: number | null;
  dueDay: number | null;
  note: string | null;
  isPromotional: boolean;
  promotionalSlots: number | null;
  promotionalTotalAmount: number | null;
  promotionalInstallmentAmount: number | null;
  active: boolean;
  discountEnabled: boolean;
  discountTotalAmount: number | null;
  discountInstallmentAmount: number | null;
  discountType: CoursePaymentDiscountTypeDto | null;
  discountValue: number | null;
  discountDeadlineDay: number | null;
  discountRequiresActiveCrf: boolean;
  discountAppliesTo: CoursePaymentDiscountAppliesToDto | null;
  promotionalDiscountEnabled: boolean;
  promotionalDiscountTotalAmount: number | null;
  promotionalDiscountInstallmentAmount: number | null;
  promotionalDiscountDeadlineDay: number | null;
  promotionalDiscountRequiresActiveCrf: boolean;
};

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(dto: CreateCourseDto, actor: CourseActor) {
    const institutionId = await this.resolveInstitutionIdForWrite(actor);
    const ownerAdminId = await this.resolveCourseOwnerAdminId(actor, institutionId);

    const paymentData = this.normalizePayment({
      price: dto.price,
      paymentModel: dto.paymentModel,
      enrollmentFee: dto.enrollmentFee,
      installmentMonths: dto.installmentMonths,
      installmentValue: dto.installmentValue,
      installmentStartDate: dto.installmentStartDate,
    });
    const normalizedPaymentOptions = this.normalizePaymentOptions(
      dto.paymentOptions,
    );
    const fallbackPaymentOptions = this.buildLegacyPaymentOptions({
      price: dto.price,
      paymentModel: paymentData.paymentModel,
      installmentMonths: paymentData.installmentMonths ?? undefined,
      installmentValue: paymentData.installmentValue
        ? Number(paymentData.installmentValue)
        : undefined,
    });
    const paymentOptionsToPersist =
      normalizedPaymentOptions.length > 0
        ? normalizedPaymentOptions
        : fallbackPaymentOptions;

    const course = await this.prisma.course.create({
      data: {
        ownerAdminId,
        institutionId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        workloadHours: dto.workloadHours,
        category: dto.category?.trim(),
        coordinator: dto.coordinator?.trim(),
        price: this.toDecimal(dto.price),
        ...paymentData,
        paymentOptions: paymentOptionsToPersist as Prisma.InputJsonValue,
        modality: dto.modality,
        status: dto.status,
      },
    });

    return this.mapCourseWithBanner(course, null);
  }

  async findAll(actor?: CourseActor) {
    const where = this.buildCourseWhere(actor);
    const studentWhere: Prisma.StudentCourseWhereInput = {
      status: {
        in: [StudentCourseStatus.INTERESTED, StudentCourseStatus.ACTIVE],
      },
      ...(Object.keys(where).length > 0 ? { course: where } : {}),
    };

    const [courses, studentCounts] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentCourse.groupBy({
        by: ['courseId'],
        where: studentWhere,
        _count: {
          _all: true,
        },
      }),
    ]);

    const countByCourseId = new Map(
      studentCounts.map((item) => [item.courseId, item._count._all]),
    );
    const withBanners = await this.attachBanners(courses);

    return withBanners.map((course) => ({
      ...course,
      enrolledStudentsCount: countByCourseId.get(course.id) ?? 0,
    }));
  }

  async update(
    id: string,
    dto: UpdateCourseDto,
    actor: CourseActor,
  ) {
    const current = await this.ensureCourseExists(id, actor);

    const price =
      dto.price === undefined
        ? current.price
          ? Number(current.price)
          : undefined
        : dto.price;

    const paymentModel = dto.paymentModel ?? current.paymentModel;
    const installmentMonths =
      dto.installmentMonths === undefined
        ? (current.installmentMonths ?? undefined)
        : dto.installmentMonths;
    const installmentValue =
      dto.installmentValue === undefined
        ? current.installmentValue
          ? Number(current.installmentValue)
          : undefined
        : dto.installmentValue;
    const enrollmentFee =
      dto.enrollmentFee === undefined
        ? current.enrollmentFee
          ? Number(current.enrollmentFee)
          : undefined
        : dto.enrollmentFee;
    const installmentStartDate =
      dto.installmentStartDate === undefined
        ? current.installmentStartDate
          ? current.installmentStartDate.toISOString()
          : undefined
        : dto.installmentStartDate;

    const paymentData = this.normalizePayment({
      price,
      paymentModel,
      enrollmentFee,
      installmentMonths,
      installmentValue,
      installmentStartDate,
    });
    const paymentOptions =
      dto.paymentOptions === undefined
        ? undefined
        : this.normalizePaymentOptions(dto.paymentOptions);

    const course = await this.prisma.course.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        workloadHours: dto.workloadHours,
        category: dto.category?.trim(),
        coordinator: dto.coordinator?.trim(),
        price: dto.price === undefined ? undefined : this.toDecimal(dto.price),
        ...paymentData,
        paymentOptions:
          paymentOptions === undefined
            ? undefined
            : (paymentOptions as Prisma.InputJsonValue),
        modality: dto.modality,
        status: dto.status,
      },
    });

    const banner = await this.uploadsService.getOwnerAsset(
      UploadOwnerType.COURSE,
      id,
      COURSE_BANNER_KIND,
    );

    return this.mapCourseWithBanner(course, banner);
  }

  async remove(id: string, actor: CourseActor) {
    await this.ensureCourseExists(id, actor);

    await this.prisma.course.delete({ where: { id } });
    await this.uploadsService.deleteOwnerAssets(UploadOwnerType.COURSE, id);

    return { success: true };
  }

  async uploadBanner(
    id: string,
    file: MultipartFile,
    actor: CourseActor,
  ) {
    await this.ensureCourseExists(id, actor);

    const banner = await this.uploadsService.bindFileToOwner({
      ownerType: UploadOwnerType.COURSE,
      ownerId: id,
      kind: COURSE_BANNER_KIND,
      file,
    });

    return {
      courseId: id,
      bannerAssetId: banner.assetId,
      bannerUrl: banner.url,
    };
  }

  private async ensureCourseExists(
    id: string,
    actor?: CourseActor,
  ) {
    const course = await this.prisma.course.findFirst({
      where: {
        id,
        ...this.buildCourseWhere(actor),
      },
    });
    if (!course) {
      throw new NotFoundException('Curso não encontrado.');
    }

    return course;
  }

  private async attachBanners(
    courses: Prisma.CourseGetPayload<Record<string, never>>[],
  ) {
    if (courses.length === 0) return [];

    const bindings = await this.prisma.uploadBinding.findMany({
      where: {
        ownerType: UploadOwnerType.COURSE,
        kind: COURSE_BANNER_KIND,
        ownerId: { in: courses.map((course) => course.id) },
      },
      include: { asset: true },
    });

    const bannerByCourseId = new Map(
      bindings.map((binding) => [
        binding.ownerId,
        {
          assetId: binding.asset.id,
          url: `/api/uploads/assets/${binding.asset.id}`,
        },
      ]),
    );

    return courses.map((course) =>
      this.mapCourseWithBanner(course, bannerByCourseId.get(course.id) ?? null),
    );
  }

  private buildCourseWhere(actor?: CourseActor): Prisma.CourseWhereInput {
    if (actor?.activeInstitutionId) {
      return {
        institutionId: actor.activeInstitutionId,
      };
    }

    if (!actor || actor.role === 'superadmin') {
      return {};
    }

    return {
      ownerAdminId: actor.sub,
    };
  }

  private async resolveInstitutionIdForWrite(actor: CourseActor) {
    if (actor.activeInstitutionId) {
      return actor.activeInstitutionId;
    }

    if (actor.role === 'superadmin') {
      throw new NotFoundException(
        'Selecione uma instituição ativa para criar cursos.',
      );
    }

    const membership = await this.prisma.institutionMember.findFirst({
      where: {
        userId: actor.sub,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
      select: { institutionId: true },
    });

    if (!membership?.institutionId) {
      throw new NotFoundException(
        'Nenhuma instituição ativa foi encontrada para este usuário.',
      );
    }

    return membership.institutionId;
  }

  private async resolveCourseOwnerAdminId(
    actor: CourseActor,
    institutionId: string,
  ) {
    if (actor.role === 'admin') {
      return actor.sub;
    }

    const adminMember = await this.prisma.institutionMember.findFirst({
      where: {
        institutionId,
        status: 'ACTIVE',
        user: {
          role: UserRole.ADMIN,
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });

    if (!adminMember?.userId) {
      throw new NotFoundException(
        'Não há administrador ativo para a instituição selecionada.',
      );
    }

    return adminMember.userId;
  }

  private mapCourseWithBanner(
    course: Prisma.CourseGetPayload<Record<string, never>>,
    banner: { assetId: string; url: string } | null,
  ) {
    return {
      ...course,
      price: course.price ? Number(course.price) : null,
      enrollmentFee: course.enrollmentFee ? Number(course.enrollmentFee) : null,
      installmentValue: course.installmentValue
        ? Number(course.installmentValue)
        : null,
      installmentStartDate: course.installmentStartDate
        ? course.installmentStartDate.toISOString()
        : null,
      paymentOptions: this.resolvePaymentOptionsForRead(course),
      bannerAssetId: banner?.assetId ?? null,
      bannerUrl: banner?.url ?? null,
    };
  }

  private toDecimal(value?: number) {
    if (value === undefined || value === null) {
      return undefined;
    }

    return new Prisma.Decimal(value);
  }

  private normalizePayment(input: {
    price?: number;
    paymentModel?: CoursePaymentModelDto | CoursePaymentModel;
    enrollmentFee?: number;
    installmentMonths?: number;
    installmentValue?: number;
    installmentStartDate?: string;
  }) {
    const paymentModel = input.paymentModel ?? CoursePaymentModelDto.CASH;
    const enrollmentFee =
      input.enrollmentFee === undefined
        ? null
        : this.toDecimal(Math.max(0, Number(input.enrollmentFee)));

    if (paymentModel !== CoursePaymentModelDto.INSTALLMENTS) {
      return {
        paymentModel: CoursePaymentModelDto.CASH,
        enrollmentFee,
        installmentMonths: null,
        installmentValue: null,
        installmentStartDate: null,
      };
    }

    const months = Math.max(1, Number(input.installmentMonths || 1));
    const totalPrice = Number(input.price || 0);
    const calculatedInstallment = totalPrice > 0 ? totalPrice / months : 0;
    const installmentValue =
      input.installmentValue === undefined
        ? calculatedInstallment
        : Number(input.installmentValue);

    return {
      paymentModel: CoursePaymentModelDto.INSTALLMENTS,
      enrollmentFee,
      installmentMonths: months,
      installmentValue: this.toDecimal(installmentValue),
      installmentStartDate: input.installmentStartDate
        ? new Date(input.installmentStartDate)
        : null,
    };
  }

  private normalizePaymentOptions(
    options?: CoursePaymentOptionDto[] | null,
  ): NormalizedCoursePaymentOption[] {
    if (!Array.isArray(options)) return [];

    return options.map((option, index) => {
      const type =
        option.type === CoursePaymentOptionTypeDto.INSTALLMENTS
          ? CoursePaymentOptionTypeDto.INSTALLMENTS
          : CoursePaymentOptionTypeDto.CASH;
      const totalAmount = this.normalizeMoneyValue(option.totalAmount);
      const installmentCount =
        type === CoursePaymentOptionTypeDto.INSTALLMENTS
          ? Math.max(1, Math.trunc(Number(option.installmentCount ?? 1)))
          : null;
      const installmentAmount =
        type === CoursePaymentOptionTypeDto.INSTALLMENTS
          ? option.installmentAmount === undefined
            ? this.normalizeMoneyValue(totalAmount / Math.max(1, installmentCount || 1))
            : this.normalizeMoneyValue(option.installmentAmount)
          : null;
      const dueDay =
        option.dueDay === undefined || option.dueDay === null
          ? null
          : Math.min(31, Math.max(1, Math.trunc(Number(option.dueDay))));
      const isPromotional = Boolean(option.isPromotional);
      const promotionalSlots = isPromotional
        ? Math.max(1, Math.trunc(Number(option.promotionalSlots ?? 20)))
        : null;
      const promotionalTotalAmount =
        isPromotional && option.promotionalTotalAmount !== undefined
          ? this.normalizeMoneyValue(option.promotionalTotalAmount)
          : isPromotional
            ? totalAmount
            : null;
      const promotionalInstallmentAmount =
        isPromotional && type === CoursePaymentOptionTypeDto.INSTALLMENTS
          ? option.promotionalInstallmentAmount === undefined
            ? this.normalizeMoneyValue(
                (promotionalTotalAmount ?? totalAmount) /
                  Math.max(1, installmentCount || 1),
              )
            : this.normalizeMoneyValue(option.promotionalInstallmentAmount)
          : null;
      const hasPromotionalValue =
        isPromotional &&
        (promotionalTotalAmount ?? 0) > 0 &&
        (type !== CoursePaymentOptionTypeDto.INSTALLMENTS ||
          (promotionalInstallmentAmount ?? 0) > 0);
      const discountEnabled = Boolean(option.discountEnabled);
      const discountTotalAmount =
        discountEnabled && option.discountTotalAmount !== undefined
          ? this.normalizeMoneyValue(option.discountTotalAmount)
          : null;
      const discountInstallmentAmount =
        discountEnabled && type === CoursePaymentOptionTypeDto.INSTALLMENTS
          ? option.discountInstallmentAmount === undefined
            ? this.normalizeMoneyValue(
                (discountTotalAmount ?? totalAmount) /
                  Math.max(1, installmentCount || 1),
              )
            : this.normalizeMoneyValue(option.discountInstallmentAmount)
          : null;
      const discountType = discountEnabled
        ? option.discountType === CoursePaymentDiscountTypeDto.PERCENT
          ? CoursePaymentDiscountTypeDto.PERCENT
          : CoursePaymentDiscountTypeDto.FIXED
        : null;
      const discountValue = discountEnabled
        ? this.normalizeMoneyValue(option.discountValue ?? 0)
        : null;
      const discountDeadlineDay =
        discountEnabled && option.discountDeadlineDay !== undefined
          ? Math.min(31, Math.max(1, Math.trunc(Number(option.discountDeadlineDay))))
          : null;
      const discountAppliesTo = discountEnabled
        ? option.discountAppliesTo === CoursePaymentDiscountAppliesToDto.TOTAL
          ? CoursePaymentDiscountAppliesToDto.TOTAL
          : CoursePaymentDiscountAppliesToDto.INSTALLMENT
        : null;
      const hasDiscountValue = (discountValue ?? 0) > 0;
      const hasDiscountAmount = (discountTotalAmount ?? 0) > 0;
      const hasAnyDiscount = discountEnabled && (hasDiscountAmount || hasDiscountValue);
      const promotionalDiscountEnabled =
        isPromotional && Boolean(option.promotionalDiscountEnabled);
      const promotionalDiscountTotalAmount =
        promotionalDiscountEnabled &&
        option.promotionalDiscountTotalAmount !== undefined
          ? this.normalizeMoneyValue(option.promotionalDiscountTotalAmount)
          : null;
      const promotionalDiscountInstallmentAmount =
        promotionalDiscountEnabled &&
        type === CoursePaymentOptionTypeDto.INSTALLMENTS
          ? option.promotionalDiscountInstallmentAmount === undefined
            ? this.normalizeMoneyValue(
                (promotionalDiscountTotalAmount ?? promotionalTotalAmount ?? totalAmount) /
                  Math.max(1, installmentCount || 1),
              )
            : this.normalizeMoneyValue(option.promotionalDiscountInstallmentAmount)
          : null;
      const promotionalDiscountDeadlineDay =
        promotionalDiscountEnabled && option.promotionalDiscountDeadlineDay !== undefined
          ? Math.min(
              31,
              Math.max(1, Math.trunc(Number(option.promotionalDiscountDeadlineDay))),
            )
          : null;

      return {
        id: option.id?.trim() || `payment-option-${index + 1}`,
        title:
          option.title?.trim() ||
          this.buildDefaultPaymentOptionTitle({
            method: option.method,
            type,
            installmentCount,
          }),
        method: option.method,
        type,
        totalAmount,
        installmentCount,
        installmentAmount,
        dueDay,
        note: option.note?.trim() || null,
        isPromotional: hasPromotionalValue,
        promotionalSlots: hasPromotionalValue ? promotionalSlots : null,
        promotionalTotalAmount: hasPromotionalValue ? promotionalTotalAmount : null,
        promotionalInstallmentAmount:
          hasPromotionalValue && type === CoursePaymentOptionTypeDto.INSTALLMENTS
            ? promotionalInstallmentAmount
            : null,
        active: option.active !== false,
        discountEnabled: hasAnyDiscount,
        discountTotalAmount:
          discountEnabled && (discountTotalAmount ?? 0) > 0
            ? discountTotalAmount
            : null,
        discountInstallmentAmount:
          discountEnabled &&
          type === CoursePaymentOptionTypeDto.INSTALLMENTS &&
          (discountInstallmentAmount ?? 0) > 0
            ? discountInstallmentAmount
            : null,
        discountType: hasDiscountValue ? discountType : null,
        discountValue: hasDiscountValue ? discountValue : null,
        discountDeadlineDay: hasAnyDiscount ? discountDeadlineDay : null,
        discountRequiresActiveCrf:
          hasAnyDiscount
            ? Boolean(option.discountRequiresActiveCrf)
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
          type === CoursePaymentOptionTypeDto.INSTALLMENTS &&
          (promotionalDiscountInstallmentAmount ?? 0) > 0
            ? promotionalDiscountInstallmentAmount
            : null,
        promotionalDiscountDeadlineDay:
          promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0
            ? promotionalDiscountDeadlineDay
            : null,
        promotionalDiscountRequiresActiveCrf:
          promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0
            ? Boolean(option.promotionalDiscountRequiresActiveCrf)
            : false,
      };
    });
  }

  private resolvePaymentOptionsForRead(
    course: Prisma.CourseGetPayload<Record<string, never>>,
  ): NormalizedCoursePaymentOption[] {
    const parsed = this.parseStoredPaymentOptions(course.paymentOptions);
    if (parsed.length > 0) {
      return parsed;
    }

    return this.buildLegacyPaymentOptions({
      price: course.price ? Number(course.price) : undefined,
      paymentModel: course.paymentModel,
      installmentMonths: course.installmentMonths ?? undefined,
      installmentValue: course.installmentValue
        ? Number(course.installmentValue)
        : undefined,
    });
  }

  private parseStoredPaymentOptions(
    raw: Prisma.JsonValue | null | undefined,
  ): NormalizedCoursePaymentOption[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item, index) => this.parseStoredPaymentOptionItem(item, index))
      .filter((item): item is NormalizedCoursePaymentOption => item !== null);
  }

  private parseStoredPaymentOptionItem(
    item: Prisma.JsonValue,
    index: number,
  ): NormalizedCoursePaymentOption | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const objectItem = item as Record<string, unknown>;
    const method = this.normalizeOptionMethod(objectItem.method);
    const type = this.normalizeOptionType(objectItem.type);
    const totalAmount = this.normalizeMoneyValue(objectItem.totalAmount);
    const installmentCount =
      type === CoursePaymentOptionTypeDto.INSTALLMENTS
        ? Math.max(
            1,
            Math.trunc(
              this.toFiniteNumber(objectItem.installmentCount) ?? 1,
            ),
          )
        : null;
    const installmentAmount =
      type === CoursePaymentOptionTypeDto.INSTALLMENTS
        ? this.normalizeMoneyValue(
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
    const promotionalSlots =
      isPromotional && this.toFiniteNumber(objectItem.promotionalSlots)
        ? Math.max(
            1,
            Math.trunc(this.toFiniteNumber(objectItem.promotionalSlots) || 1),
          )
      : null;
    const promotionalTotalAmount =
      isPromotional && this.toFiniteNumber(objectItem.promotionalTotalAmount) !== undefined
        ? this.normalizeMoneyValue(
            this.toFiniteNumber(objectItem.promotionalTotalAmount) ?? 0,
          )
        : isPromotional
          ? totalAmount
          : null;
    const promotionalInstallmentAmount =
      isPromotional && type === CoursePaymentOptionTypeDto.INSTALLMENTS
        ? this.normalizeMoneyValue(
            this.toFiniteNumber(objectItem.promotionalInstallmentAmount) ??
              (promotionalTotalAmount ?? totalAmount) /
                Math.max(1, installmentCount || 1),
          )
        : null;
    const hasPromotionalValue =
      isPromotional &&
      (promotionalTotalAmount ?? 0) > 0 &&
      (type !== CoursePaymentOptionTypeDto.INSTALLMENTS ||
        (promotionalInstallmentAmount ?? 0) > 0);
    const discountEnabled = Boolean(objectItem.discountEnabled);
    const discountTypeRaw = String(objectItem.discountType || '').toUpperCase();
    const discountType =
      discountEnabled && discountTypeRaw === CoursePaymentDiscountTypeDto.PERCENT
        ? CoursePaymentDiscountTypeDto.PERCENT
        : discountEnabled
          ? CoursePaymentDiscountTypeDto.FIXED
          : null;
    const discountValue = discountEnabled
      ? this.normalizeMoneyValue(this.toFiniteNumber(objectItem.discountValue) ?? 0)
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
      discountEnabled && discountAppliesToRaw === CoursePaymentDiscountAppliesToDto.TOTAL
        ? CoursePaymentDiscountAppliesToDto.TOTAL
        : discountEnabled
          ? CoursePaymentDiscountAppliesToDto.INSTALLMENT
          : null;
    const discountTotalAmount =
      discountEnabled && this.toFiniteNumber(objectItem.discountTotalAmount) !== undefined
        ? this.normalizeMoneyValue(
            this.toFiniteNumber(objectItem.discountTotalAmount) ?? 0,
          )
        : null;
    const discountInstallmentAmount =
      discountEnabled && type === CoursePaymentOptionTypeDto.INSTALLMENTS
        ? this.normalizeMoneyValue(
            this.toFiniteNumber(objectItem.discountInstallmentAmount) ??
              (discountTotalAmount ?? totalAmount) /
                Math.max(1, installmentCount || 1),
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
        ? this.normalizeMoneyValue(
            this.toFiniteNumber(objectItem.promotionalDiscountTotalAmount) ?? 0,
          )
        : null;
    const promotionalDiscountInstallmentAmount =
      promotionalDiscountEnabled && type === CoursePaymentOptionTypeDto.INSTALLMENTS
        ? this.normalizeMoneyValue(
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
      id:
        String(objectItem.id || '').trim() ||
        `payment-option-${index + 1}`,
      title:
        String(objectItem.title || '').trim() ||
        this.buildDefaultPaymentOptionTitle({
          method,
          type,
          installmentCount,
        }),
      method,
      type,
      totalAmount,
      installmentCount,
      installmentAmount,
      dueDay,
      note: String(objectItem.note || '').trim() || null,
      isPromotional: hasPromotionalValue,
      promotionalSlots: hasPromotionalValue ? promotionalSlots : null,
      promotionalTotalAmount: hasPromotionalValue ? promotionalTotalAmount : null,
      promotionalInstallmentAmount:
        hasPromotionalValue && type === CoursePaymentOptionTypeDto.INSTALLMENTS
          ? promotionalInstallmentAmount
          : null,
      active: objectItem.active !== false,
      discountEnabled: hasAnyDiscount,
      discountTotalAmount:
        discountEnabled && (discountTotalAmount ?? 0) > 0 ? discountTotalAmount : null,
      discountInstallmentAmount:
        discountEnabled &&
        type === CoursePaymentOptionTypeDto.INSTALLMENTS &&
        (discountInstallmentAmount ?? 0) > 0
          ? discountInstallmentAmount
          : null,
      discountType: hasDiscountValue ? discountType : null,
      discountValue: hasDiscountValue ? discountValue : null,
      discountDeadlineDay: hasAnyDiscount ? discountDeadlineDay : null,
      discountRequiresActiveCrf:
        hasAnyDiscount ? discountRequiresActiveCrf : false,
      discountAppliesTo: hasAnyDiscount ? discountAppliesTo : null,
      promotionalDiscountEnabled:
        promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0,
      promotionalDiscountTotalAmount:
        promotionalDiscountEnabled && (promotionalDiscountTotalAmount ?? 0) > 0
          ? promotionalDiscountTotalAmount
          : null,
      promotionalDiscountInstallmentAmount:
        promotionalDiscountEnabled &&
        type === CoursePaymentOptionTypeDto.INSTALLMENTS &&
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

  private normalizeOptionMethod(value: unknown): CoursePaymentOptionMethodDto {
    const normalized = String(value || '').toUpperCase();
    if (normalized === CoursePaymentOptionMethodDto.BANK_SLIP) {
      return CoursePaymentOptionMethodDto.BANK_SLIP;
    }
    if (normalized === CoursePaymentOptionMethodDto.CREDIT_CARD) {
      return CoursePaymentOptionMethodDto.CREDIT_CARD;
    }
    return CoursePaymentOptionMethodDto.PIX;
  }

  private normalizeOptionType(value: unknown): CoursePaymentOptionTypeDto {
    const normalized = String(value || '').toUpperCase();
    if (normalized === CoursePaymentOptionTypeDto.INSTALLMENTS) {
      return CoursePaymentOptionTypeDto.INSTALLMENTS;
    }
    return CoursePaymentOptionTypeDto.CASH;
  }

  private buildDefaultPaymentOptionTitle(input: {
    method?: CoursePaymentOptionMethodDto;
    type: CoursePaymentOptionTypeDto;
    installmentCount: number | null;
  }) {
    const methodLabel =
      input.method === CoursePaymentOptionMethodDto.BANK_SLIP
        ? 'Boleto'
        : input.method === CoursePaymentOptionMethodDto.CREDIT_CARD
          ? 'Cartão de crédito'
          : 'Pix';
    if (input.type === CoursePaymentOptionTypeDto.CASH) {
      return `À vista (${methodLabel})`;
    }

    return `${input.installmentCount || 1}x (${methodLabel})`;
  }

  private buildLegacyPaymentOptions(input: {
    price?: number;
    paymentModel?: CoursePaymentModelDto | CoursePaymentModel;
    installmentMonths?: number;
    installmentValue?: number;
  }): NormalizedCoursePaymentOption[] {
    const paymentModel = String(input.paymentModel || CoursePaymentModelDto.CASH).toUpperCase();
    const totalAmount = this.normalizeMoneyValue(input.price ?? 0);

    if (paymentModel === CoursePaymentModelDto.INSTALLMENTS) {
      const installmentCount = Math.max(1, Math.trunc(Number(input.installmentMonths || 1)));
      const installmentAmountRaw =
        input.installmentValue === undefined
          ? totalAmount / installmentCount
          : Number(input.installmentValue);
      const installmentAmount = this.normalizeMoneyValue(installmentAmountRaw);
      const installmentTotal =
        totalAmount > 0
          ? totalAmount
          : this.normalizeMoneyValue(installmentAmount * installmentCount);

      return [
        {
          id: 'legacy-installments',
          title: `${installmentCount}x (Boleto)`,
          method: CoursePaymentOptionMethodDto.BANK_SLIP,
          type: CoursePaymentOptionTypeDto.INSTALLMENTS,
          totalAmount: installmentTotal,
          installmentCount,
          installmentAmount,
          dueDay: null,
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
        },
      ];
    }

    return [
      {
        id: 'legacy-cash',
        title: 'À vista (Pix)',
        method: CoursePaymentOptionMethodDto.PIX,
        type: CoursePaymentOptionTypeDto.CASH,
        totalAmount,
        installmentCount: null,
        installmentAmount: null,
        dueDay: null,
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
      },
    ];
  }

  private normalizeMoneyValue(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const normalized = Math.max(0, numeric);
    return Number(normalized.toFixed(2));
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return numeric;
  }
}
