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
  CoursePaymentModelDto,
  CreateCourseDto,
} from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtPayload } from '../auth/types/app-role.type';

const COURSE_BANNER_KIND = 'COURSE_BANNER';
type CourseActor = Pick<JwtPayload, 'sub' | 'role' | 'activeInstitutionId'>;

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
}
