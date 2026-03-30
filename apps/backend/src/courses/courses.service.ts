import { Injectable, NotFoundException } from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import {
  CoursePaymentModel,
  Prisma,
  StudentCourseStatus,
  UploadOwnerType,
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

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(dto: CreateCourseDto, actor: Pick<JwtPayload, 'sub' | 'role'>) {
    const paymentData = this.normalizePayment({
      price: dto.price,
      paymentModel: dto.paymentModel,
      installmentMonths: dto.installmentMonths,
      installmentValue: dto.installmentValue,
    });

    const course = await this.prisma.course.create({
      data: {
        ownerAdminId: actor.sub,
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

  async findAll(actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    const where = this.buildCourseWhere(actor);

    const [courses, studentCounts] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentCourse.groupBy({
        by: ['courseId'],
        where: {
          status: {
            in: [StudentCourseStatus.INTERESTED, StudentCourseStatus.ACTIVE],
          },
        },
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
    actor: Pick<JwtPayload, 'sub' | 'role'>,
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

    const paymentData = this.normalizePayment({
      price,
      paymentModel,
      installmentMonths,
      installmentValue,
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

  async remove(id: string, actor: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.ensureCourseExists(id, actor);

    await this.prisma.course.delete({ where: { id } });
    await this.uploadsService.deleteOwnerAssets(UploadOwnerType.COURSE, id);

    return { success: true };
  }

  async uploadBanner(
    id: string,
    file: MultipartFile,
    actor: Pick<JwtPayload, 'sub' | 'role'>,
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
    actor?: Pick<JwtPayload, 'sub' | 'role'>,
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

  private buildCourseWhere(actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    if (!actor || actor.role === 'superadmin') {
      return {};
    }

    return {
      ownerAdminId: actor.sub,
    };
  }

  private mapCourseWithBanner(
    course: Prisma.CourseGetPayload<Record<string, never>>,
    banner: { assetId: string; url: string } | null,
  ) {
    return {
      ...course,
      price: course.price ? Number(course.price) : null,
      installmentValue: course.installmentValue
        ? Number(course.installmentValue)
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
    installmentMonths?: number;
    installmentValue?: number;
  }) {
    const paymentModel = input.paymentModel ?? CoursePaymentModelDto.CASH;

    if (paymentModel !== CoursePaymentModelDto.INSTALLMENTS) {
      return {
        paymentModel: CoursePaymentModelDto.CASH,
        installmentMonths: null,
        installmentValue: null,
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
      installmentMonths: months,
      installmentValue: this.toDecimal(installmentValue),
    };
  }
}
