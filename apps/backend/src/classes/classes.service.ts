import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/types/app-role.type';
import { PrismaService } from '../database/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

type ClassStatusInput =
  | 'planning'
  | 'enrollments_open'
  | 'in_progress'
  | 'closed';
type ClassActor = Pick<JwtPayload, 'sub' | 'role' | 'activeInstitutionId'>;

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateClassDto,
    actor: ClassActor,
  ) {
    const institutionId = await this.resolveInstitutionIdForWrite(actor);
    const course = await this.prisma.course.findFirst({
      where: {
        id: dto.courseId,
        institutionId,
      },
      select: { id: true, institutionId: true },
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
        institutionId: course.institutionId,
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

  async findAll(actor: ClassActor) {
    return this.prisma.schoolClass.findMany({
      where: this.buildClassWhere(actor),
      include: {
        course: true,
        _count: {
          select: { enrollments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    classId: string,
    dto: UpdateClassDto,
    actor: ClassActor,
  ) {
    const existingClass = await this.prisma.schoolClass.findFirst({
      where: {
        id: classId,
        ...this.buildClassWhere(actor),
      },
      select: {
        id: true,
        courseId: true,
        institutionId: true,
        name: true,
        totalSeats: true,
        occupiedSeats: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!existingClass) {
      throw new NotFoundException('Turma não encontrada.');
    }

    if (dto.courseId && dto.courseId !== existingClass.courseId) {
      const course = await this.prisma.course.findFirst({
        where: {
          id: dto.courseId,
          institutionId: existingClass.institutionId,
        },
        select: { id: true },
      });

      if (!course) {
        throw new NotFoundException('Curso não encontrado.');
      }
    }

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : existingClass.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existingClass.endDate;

    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'A data de término não pode ser menor que a data de início.',
      );
    }

    const nextTotalSeats = dto.totalSeats ?? existingClass.totalSeats;
    if (nextTotalSeats < existingClass.occupiedSeats) {
      throw new BadRequestException(
        'Total de vagas não pode ser menor que o número de alunos já matriculados.',
      );
    }

    return this.prisma.schoolClass.update({
      where: { id: classId },
      data: {
        courseId: dto.courseId ?? existingClass.courseId,
        institutionId: existingClass.institutionId,
        name: dto.name ? dto.name.trim() : existingClass.name,
        totalSeats: nextTotalSeats,
        startDate,
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

  async updateStatus(
    classId: string,
    status: string,
    actor: ClassActor,
  ) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: {
        id: classId,
        ...this.buildClassWhere(actor),
      },
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

  async remove(classId: string, actor: ClassActor) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: {
        id: classId,
        ...this.buildClassWhere(actor),
      },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.schoolClass.delete({ where: { id: classId } });
      await tx.systemSetting.deleteMany({
        where: { key: `agenda-class:${classId}` },
      });
    });

    return { success: true };
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

  private buildCourseWhere(actor: ClassActor) {
    if (actor.activeInstitutionId) {
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

  private buildClassWhere(actor: ClassActor) {
    if (actor.activeInstitutionId) {
      return {
        institutionId: actor.activeInstitutionId,
      };
    }

    if (!actor || actor.role === 'superadmin') {
      return {};
    }

    return {
      course: {
        ownerAdminId: actor.sub,
      },
    };
  }

  private async resolveInstitutionIdForWrite(actor: ClassActor) {
    if (actor.activeInstitutionId) {
      return actor.activeInstitutionId;
    }

    if (actor.role === 'superadmin') {
      throw new NotFoundException(
        'Selecione uma instituição ativa para criar turmas.',
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
}
