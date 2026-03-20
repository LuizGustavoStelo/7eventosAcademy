import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';

type ClassStatusInput =
  | 'planning'
  | 'enrollments_open'
  | 'in_progress'
  | 'closed';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClassDto) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Curso não encontrado.');
    }

    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    if (endDate && endDate < new Date(dto.startDate)) {
      throw new BadRequestException(
        'A data de término não pode ser menor que a data de início.',
      );
    }

    return this.prisma.schoolClass.create({
      data: {
        courseId: dto.courseId,
        name: dto.name.trim(),
        totalSeats: dto.totalSeats,
        startDate: new Date(dto.startDate),
        endDate,
      },
      include: {
        course: true,
        _count: {
          select: { enrollments: true },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.schoolClass.findMany({
      include: {
        course: true,
        _count: {
          select: { enrollments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(classId: string, status: string) {
    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }

    return this.prisma.schoolClass.update({
      where: { id: classId },
      data: {
        status: this.toPrismaStatus(status),
      },
      include: {
        course: true,
        _count: {
          select: { enrollments: true },
        },
      },
    });
  }

  private toPrismaStatus(status: string) {
    const statusMap: Record<
      ClassStatusInput,
      'PLANNING' | 'ENROLLMENTS_OPEN' | 'IN_PROGRESS' | 'CLOSED'
    > = {
      planning: 'PLANNING',
      enrollments_open: 'ENROLLMENTS_OPEN',
      in_progress: 'IN_PROGRESS',
      closed: 'CLOSED',
    };

    const normalizedStatus = status as ClassStatusInput;
    const mappedStatus = statusMap[normalizedStatus];
    if (!mappedStatus) {
      throw new BadRequestException('Status de turma inválido.');
    }

    return mappedStatus;
  }
}
