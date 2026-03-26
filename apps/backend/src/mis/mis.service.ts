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
    const enrollments = await this.fetchActiveEnrollments(userId);
    return this.mapMatriculas(enrollments);
  }

  async getAlunoMateriais(userId: string) {
    const classIds = await this.fetchActiveClassIds(userId);
    if (classIds.length === 0) {
      return [];
    }

    return this.fetchMateriaisByClassIds(classIds);
  }

  async getAlunoAvisos(userId: string) {
    const classIds = await this.fetchActiveClassIds(userId);
    if (classIds.length === 0) {
      return [];
    }

    return this.fetchAvisosByClassIds(classIds);
  }

  async getAlunoDashboard(userId: string) {
    const [me, enrollments] = await Promise.all([
      this.getAlunoMe(userId),
      this.fetchActiveEnrollments(userId),
    ]);

    const matriculas = this.mapMatriculas(enrollments);
    const classIds = this.uniqueClassIds(enrollments.map((en) => en.classId));

    if (classIds.length === 0) {
      return { me, matriculas, materiais: [], avisos: [] };
    }

    const [materiais, avisos] = await Promise.all([
      this.fetchMateriaisByClassIds(classIds),
      this.fetchAvisosByClassIds(classIds),
    ]);

    return { me, matriculas, materiais, avisos };
  }

  private async fetchActiveEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      select: {
        id: true,
        status: true,
        classId: true,
        schoolClass: {
          select: {
            name: true,
            startDate: true,
            endDate: true,
            course: {
              select: {
                name: true,
                modality: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private mapMatriculas(enrollments: Awaited<ReturnType<MisService['fetchActiveEnrollments']>>) {
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

  private async fetchActiveClassIds(userId: string) {
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      select: { classId: true },
    });
    return this.uniqueClassIds(activeEnrollments.map((e) => e.classId));
  }

  private async fetchMateriaisByClassIds(classIds: string[]) {
    const materials = await this.prisma.studyMaterial.findMany({
      where: { classId: { in: classIds } },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        fileUrl: true,
        externalUrl: true,
        publishedAt: true,
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

  private async fetchAvisosByClassIds(classIds: string[]) {
    const notices = await this.prisma.classNotice.findMany({
      where: { classId: { in: classIds } },
      select: {
        id: true,
        title: true,
        body: true,
        priority: true,
        publishedAt: true,
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

  private uniqueClassIds(classIds: string[]) {
    return Array.from(new Set(classIds));
  }
}
