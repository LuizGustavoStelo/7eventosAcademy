import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtPayload } from '../auth/types/app-role.type';
import { PrismaService } from '../database/prisma.service';

type NoticePriority = 'normal' | 'importante' | 'urgente';
type NoticeStatus = 'entregue' | 'programado' | 'finalizado';

@Injectable()
export class ClassesNoticesService {
  private static readonly ARCHIVE_RETENTION_DAYS = 7;

  constructor(private readonly prisma: PrismaService) {}

  async createNotice(dto: {
    classId: string;
    title: string;
    body: string;
    priority?: string;
    expiresAt?: Date | string | null;
    publishedAt?: Date | string | null;
    scheduledAt?: Date | string | null;
    publishedBy?: string;
    actor: Pick<JwtPayload, 'sub' | 'role'>;
  }) {
    await this.ensureClassExists(dto.classId, dto.actor);

    const now = new Date();
    const publishedAt =
      this.parseDate(dto.scheduledAt) ??
      this.parseDate(dto.publishedAt) ??
      now;
    const expiresAt = this.parseDate(dto.expiresAt);

    return this.prisma.classNotice.create({
      data: {
        classId: dto.classId,
        title: dto.title,
        body: dto.body,
        priority: this.normalizePriority(dto.priority),
        publishedAt,
        expiresAt,
        publishedBy: dto.publishedBy,
      },
      include: {
        schoolClass: { select: { name: true } },
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupArchivedNotices() {
    await this.removeExpiredArchivedNotices();
  }

  async getAllNotices(actor: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.removeExpiredArchivedNotices();

    const notices = await this.prisma.classNotice.findMany({
      where:
        actor.role === 'superadmin'
          ? {}
          : { schoolClass: { course: { ownerAdminId: actor.sub } } },
      orderBy: { createdAt: 'desc' },
      include: {
        schoolClass: { select: { name: true } },
        _count: { select: { views: true } },
      },
    });

    const classIds = Array.from(new Set(notices.map((item) => item.classId)));
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: {
        classId: { in: classIds },
        status: 'ACTIVE',
      },
      select: { classId: true },
    });

    const audienceByClassId = activeEnrollments.reduce<Record<string, number>>(
      (acc, current) => {
        acc[current.classId] = (acc[current.classId] ?? 0) + 1;
        return acc;
      },
      {},
    );

    const now = new Date();
    const retentionMs = this.archiveRetentionMs();

    return notices.map((notice) => {
      const status = this.resolveStatus(notice.publishedAt, notice.expiresAt, now);
      const expectedViewers = audienceByClassId[notice.classId] ?? 0;
      const viewedCount = notice._count.views;
      const deliveredRate =
        expectedViewers > 0
          ? Math.min(100, Math.round((viewedCount / expectedViewers) * 100))
          : 0;

      const archivedUntil =
        status === 'finalizado' && notice.expiresAt
          ? new Date(notice.expiresAt.getTime() + retentionMs)
          : null;

      return {
        id: notice.id,
        classId: notice.classId,
        title: notice.title,
        body: notice.body,
        priority: this.normalizePriority(notice.priority),
        status,
        publishedBy: notice.publishedBy,
        publishedAt: notice.publishedAt,
        expiresAt: notice.expiresAt,
        archivedUntil,
        expectedViewers,
        viewedCount,
        deliveredRate,
        createdAt: notice.createdAt,
        updatedAt: notice.updatedAt,
        schoolClass: notice.schoolClass,
      };
    });
  }

  async deleteNotice(noticeId: string, actor: Pick<JwtPayload, 'sub' | 'role'>) {
    const notice = await this.prisma.classNotice.findFirst({
      where: {
        id: noticeId,
        ...(actor.role === 'superadmin'
          ? {}
          : { schoolClass: { course: { ownerAdminId: actor.sub } } }),
      },
      select: { id: true },
    });

    if (!notice) {
      throw new NotFoundException('Aviso não encontrado.');
    }

    await this.prisma.classNotice.delete({
      where: { id: notice.id },
    });
    return { success: true };
  }

  private normalizePriority(value?: string | null): NoticePriority {
    if (value === 'urgente') return 'urgente';
    if (value === 'importante') return 'importante';
    return 'normal';
  }

  private parseDate(value?: Date | string | null): Date | null {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolveStatus(
    publishedAt: Date,
    expiresAt: Date | null,
    now: Date,
  ): NoticeStatus {
    if (publishedAt.getTime() > now.getTime()) return 'programado';
    if (expiresAt && expiresAt.getTime() <= now.getTime()) return 'finalizado';
    return 'entregue';
  }

  private archiveRetentionMs() {
    return ClassesNoticesService.ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  }

  private async removeExpiredArchivedNotices() {
    const threshold = new Date(Date.now() - this.archiveRetentionMs());
    await this.prisma.classNotice.deleteMany({
      where: {
        expiresAt: {
          lt: threshold,
        },
      },
    });
  }

  private async ensureClassExists(
    classId: string,
    actor: Pick<JwtPayload, 'sub' | 'role'>,
  ) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: {
        id: classId,
        ...(actor.role === 'superadmin'
          ? {}
          : { course: { ownerAdminId: actor.sub } }),
      },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }
  }
}
