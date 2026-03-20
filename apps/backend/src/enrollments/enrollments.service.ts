import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEnrollmentDto) {
    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id: dto.classId },
      select: {
        id: true,
        totalSeats: true,
        occupiedSeats: true,
        status: true,
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
}
