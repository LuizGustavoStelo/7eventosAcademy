import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MisService {
  constructor(private readonly prisma: PrismaService) {}

  async getAlunoMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        studentProfile: {
          select: {
            documentCpf: true,
            phone: true,
            birthDate: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  async getAlunoMatriculas(userId: string) {
    // Busca todas as matrículas ativas do aluno
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      include: {
        schoolClass: {
          include: {
            course: {
              select: {
                name: true,
                description: true,
                modality: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return enrollments.map((en) => ({
      enrollmentId: en.id,
      status: en.status,
      className: en.schoolClass.name,
      courseName: en.schoolClass.course.name,
      modality: en.schoolClass.course.modality,
      startDate: en.schoolClass.startDate,
      endDate: en.schoolClass.endDate,
    }));
  }

  async getAlunoMateriais(userId: string) {
    // Primeiro encontra as turmas que o aluno está ativamente matriculado
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      select: { classId: true },
    });

    const classIds = activeEnrollments.map((e) => e.classId);

    if (classIds.length === 0) {
      return [];
    }

    // Busca materiais das turmas ativas
    const materials = await this.prisma.studyMaterial.findMany({
      where: { classId: { in: classIds } },
      include: {
        schoolClass: { select: { name: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    return materials.map((mat) => ({
      id: mat.id,
      title: mat.title,
      description: mat.description,
      kind: mat.kind,
      fileUrl: mat.fileUrl,
      externalUrl: mat.externalUrl,
      className: mat.schoolClass.name,
      publishedAt: mat.publishedAt,
    }));
  }

  async getAlunoAvisos(userId: string) {
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      select: { classId: true },
    });

    const classIds = activeEnrollments.map((e) => e.classId);

    if (classIds.length === 0) {
      return [];
    }

    // Busca avisos das turmas ativas
    const notices = await this.prisma.classNotice.findMany({
      where: { classId: { in: classIds } },
      include: {
        schoolClass: { select: { name: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    return notices.map((notice) => ({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      priority: notice.priority,
      className: notice.schoolClass.name,
      publishedAt: notice.publishedAt,
    }));
  }
}
