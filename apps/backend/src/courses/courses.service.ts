import { Injectable, NotFoundException } from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { CoursePaymentModel, Prisma, UploadOwnerType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  CoursePaymentModelDto,
  CreateCourseDto,
} from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const COURSE_BANNER_KIND = 'COURSE_BANNER';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(dto: CreateCourseDto) {
    const paymentData = this.normalizePayment({
      price: dto.price,
      paymentModel: dto.paymentModel,
      installmentMonths: dto.installmentMonths,
      installmentValue: dto.installmentValue,
    });

    const course = await this.prisma.course.create({
      data: {
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

  async findAll() {
    const courses = await this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return this.attachBanners(courses);
  }

  async update(id: string, dto: UpdateCourseDto) {
    const current = await this.ensureCourseExists(id);

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

  async remove(id: string) {
    await this.ensureCourseExists(id);

    await this.prisma.course.delete({ where: { id } });
    await this.uploadsService.deleteOwnerAssets(UploadOwnerType.COURSE, id);

    return { success: true };
  }

  async uploadBanner(id: string, file: MultipartFile) {
    await this.ensureCourseExists(id);

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

  private async ensureCourseExists(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
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
