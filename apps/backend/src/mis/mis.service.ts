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

    return this.fetchAvisosByClassIds(classIds, userId);
  }

  async getAlunoCobrancas(userId: string) {
    return this.fetchCobrancasByStudentId(userId);
  }

  async getAlunoAgenda(userId: string) {
    const classIds = await this.fetchActiveClassIds(userId);
    if (classIds.length === 0) return [];
    return this.fetchAgendaByClassIds(classIds);
  }

  async getAlunoDashboard(userId: string) {
    const [me, enrollments, cobrancas] = await Promise.all([
      this.getAlunoMe(userId),
      this.fetchActiveEnrollments(userId),
      this.getAlunoCobrancas(userId),
    ]);

    const matriculas = this.mapMatriculas(enrollments);
    const classIds = this.uniqueClassIds(enrollments.map((en) => en.classId));

    if (classIds.length === 0) {
      return { me, matriculas, materiais: [], avisos: [], cobrancas, agenda: [] };
    }

    const [materiais, avisos, agenda] = await Promise.all([
      this.fetchMateriaisByClassIds(classIds),
      this.fetchAvisosByClassIds(classIds, userId),
      this.fetchAgendaByClassIds(classIds),
    ]);

    return { me, matriculas, materiais, avisos, cobrancas, agenda };
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

  private async fetchAvisosByClassIds(classIds: string[], viewerUserId?: string) {
    const now = new Date();
    const notices = await this.prisma.classNotice.findMany({
      where: {
        classId: { in: classIds },
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
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

    if (viewerUserId && notices.length > 0) {
      await this.prisma.classNoticeView.createMany({
        data: notices.map((notice) => ({
          noticeId: notice.id,
          userId: viewerUserId,
        })),
        skipDuplicates: true,
      });
    }

    return notices.map((notice) => ({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      priority: notice.priority,
      className: notice.schoolClass.name,
      publishedAt: notice.publishedAt,
    }));
  }

  private async fetchAgendaByClassIds(classIds: string[]) {
    const keys = classIds.map((classId) => `agenda-class:${classId}`);
    if (keys.length === 0) return [];

    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: keys,
        },
      },
      select: {
        value: true,
      },
    });

    const events: Array<{
      id: string;
      type: string;
      title: string;
      classId: string | null;
      className: string;
      teacher: string;
      datetime: string;
      provider: string | null;
    }> = [];

    rows.forEach((row) => {
      try {
        const parsed = JSON.parse(row.value) as {
          events?: Array<{
            id?: string;
            type?: string;
            title?: string;
            classId?: string | null;
            className?: string;
            teacher?: string;
            datetime?: string;
            provider?: string | null;
          }>;
        };
        if (!Array.isArray(parsed.events)) return;
        parsed.events.forEach((eventItem) => {
          if (!eventItem?.datetime) return;
          events.push({
            id: String(eventItem.id ?? `${Date.now()}-${Math.random()}`),
            type: eventItem.type === 'live' ? 'live' : 'class',
            title: String(eventItem.title ?? 'Evento'),
            classId: eventItem.classId ?? null,
            className: String(eventItem.className ?? 'Turma'),
            teacher: String(eventItem.teacher ?? 'Professor(a)'),
            datetime: String(eventItem.datetime),
            provider: eventItem.provider ?? null,
          });
        });
      } catch {
        // ignora payload inválido de configuração
      }
    });

    return events
      .sort((a, b) => {
        const first = new Date(a.datetime).getTime();
        const second = new Date(b.datetime).getTime();
        return first - second;
      })
      .slice(0, 120);
  }

  private async fetchCobrancasByStudentId(userId: string) {
    const charges = await this.prisma.monthlyCharge.findMany({
      where: {
        enrollment: {
          studentId: userId,
        },
      },
      select: {
        id: true,
        enrollmentId: true,
        dueDate: true,
        amount: true,
        status: true,
        externalChargeId: true,
        createdAt: true,
        enrollment: {
          select: {
            schoolClass: {
              select: {
                name: true,
                course: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            provider: true,
            status: true,
            amount: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 30,
    });

    return charges.map((charge) => ({
      id: charge.id,
      enrollmentId: charge.enrollmentId,
      dueDate: charge.dueDate,
      amount: Number(charge.amount),
      status: charge.status,
      externalChargeId: charge.externalChargeId,
      className: charge.enrollment.schoolClass.name,
      courseName: charge.enrollment.schoolClass.course.name,
      lastTransaction: charge.paymentTransactions[0]
        ? {
            id: charge.paymentTransactions[0].id,
            provider: charge.paymentTransactions[0].provider,
            status: charge.paymentTransactions[0].status,
            amount: Number(charge.paymentTransactions[0].amount),
            paidAt: charge.paymentTransactions[0].paidAt,
            createdAt: charge.paymentTransactions[0].createdAt,
          }
        : null,
    }));
  }

  private uniqueClassIds(classIds: string[]) {
    return Array.from(new Set(classIds));
  }
}
