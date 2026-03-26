import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { PrismaService } from '../database/prisma.service';
import { StudentCourseStatus } from '@prisma/client';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateEnrollmentDto,
    context?: { actorUserId?: string; actorRole?: string },
  ) {
    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id: dto.classId },
      select: {
        id: true,
        totalSeats: true,
        occupiedSeats: true,
        status: true,
        startDate: true,
        course: {
          select: {
            id: true,
            paymentModel: true,
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

    const student = await this.prisma.user.findUnique({
      where: { id: dto.studentId },
      select: { id: true, role: true },
    });

    if (!student || student.role !== 'USER') {
      throw new NotFoundException('Aluno não encontrado.');
    }

    const studentCourse = await this.prisma.studentCourse.findUnique({
      where: {
        studentId_courseId: {
          studentId: dto.studentId,
          courseId: schoolClass.course.id,
        },
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

    const installmentCharges = this.buildInstallmentCharges({
      classStartDate: schoolClass.startDate,
      installmentMonths: schoolClass.course.installmentMonths,
      installmentValue: schoolClass.course.installmentValue,
      paymentModel: schoolClass.course.paymentModel,
    });

    const ownerAdminId =
      context?.actorUserId && context.actorRole?.toLowerCase() === 'admin'
        ? context.actorUserId
        : null;

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const createdEnrollment = await tx.enrollment.create({
        data: {
          classId: dto.classId,
          studentId: dto.studentId,
          status: 'ACTIVE',
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
            ownerAdminId,
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
    });

    return enrollment;
  }

  async remove(classId: string, studentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        classId_studentId: {
          classId,
          studentId,
        },
      },
      select: {
        id: true,
        classId: true,
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

  async findAll() {
    return this.prisma.enrollment.findMany({
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

  private buildInstallmentCharges(input: {
    classStartDate: Date;
    paymentModel: string;
    installmentMonths: number | null;
    installmentValue: { toNumber: () => number } | null;
  }) {
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
}
