import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

type AgendaSession = {
  id: string;
  title: string;
  datetime: string;
};

type AttendanceMark = {
  studentId: string;
  present: boolean;
  note: string | null;
  markedAt: string;
  markedBy: string;
};

type AttendanceSessionRecord = {
  sessionId: string;
  classId: string;
  title: string;
  datetime: string;
  updatedAt: string;
  updatedBy: string;
  items: AttendanceMark[];
};

type AttendanceStorage = {
  records: AttendanceSessionRecord[];
};

@Injectable()
export class AttendanceService {
  private readonly agendaKeyPrefix = 'agenda-class:';
  private readonly attendanceKeyPrefix = 'attendance-class:';

  constructor(private readonly prisma: PrismaService) {}

  async getTeacherClasses(actor: { sub: string; role?: string }) {
    const classes = await this.prisma.schoolClass.findMany({
      where: this.buildClassOwnershipFilter(actor),
      include: {
        course: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });

    return Promise.all(
      classes.map(async (item) => {
        const sessions = await this.getClassSessions(item.id);
        const pastCount = sessions.filter(
          (session) => new Date(session.datetime).getTime() <= Date.now(),
        ).length;

        return {
          id: item.id,
          name: item.name,
          courseName: item.course.name,
          status: item.status,
          enrollments: item._count.enrollments,
          sessionsTotal: sessions.length,
          sessionsPast: pastCount,
          startDate: item.startDate,
          endDate: item.endDate,
        };
      }),
    );
  }

  async getTeacherClassSessions(
    classId: string,
    actor: { sub: string; role?: string },
  ) {
    await this.ensureClassExists(classId, actor);

    const [sessions, roster, storage] = await Promise.all([
      this.getClassSessions(classId),
      this.getClassRoster(classId),
      this.readAttendanceStorage(classId),
    ]);

    const now = Date.now();

    return sessions.map((session) => {
      const record = storage.records.find((item) => item.sessionId === session.id);
      const presentCount = record?.items.filter((item) => item.present).length ?? 0;
      const absentCount = record?.items.filter((item) => !item.present).length ?? 0;

      return {
        ...session,
        canMark: new Date(session.datetime).getTime() <= now,
        presentCount,
        absentCount,
        pendingCount: Math.max(roster.length - presentCount - absentCount, 0),
        updatedAt: record?.updatedAt ?? null,
      };
    });
  }

  async getTeacherSessionRoster(
    classId: string,
    sessionId: string,
    actor: { sub: string; role?: string },
  ) {
    await this.ensureClassExists(classId, actor);

    const session = await this.getClassSessionOrFail(classId, sessionId);
    const [roster, storage] = await Promise.all([
      this.getClassRoster(classId),
      this.readAttendanceStorage(classId),
    ]);

    const record = storage.records.find((item) => item.sessionId === sessionId);
    const marksByStudentId = new Map(record?.items.map((item) => [item.studentId, item]));

    return {
      classId,
      session,
      canMark: new Date(session.datetime).getTime() <= Date.now(),
      students: roster.map((student) => {
        const mark = marksByStudentId.get(student.studentId);
        return {
          studentId: student.studentId,
          name: student.name,
          email: student.email,
          enrollmentStatus: student.enrollmentStatus,
          present: mark ? mark.present : null,
          note: mark?.note ?? null,
          markedAt: mark?.markedAt ?? null,
        };
      }),
    };
  }

  async saveTeacherSessionAttendance(params: {
    classId: string;
    sessionId: string;
    actorId: string;
    actorRole?: string;
    items: Array<{ studentId: string; present: boolean; note?: string }>;
  }) {
    const { classId, sessionId, actorId, actorRole, items } = params;
    await this.ensureClassExists(classId, { sub: actorId, role: actorRole });

    const session = await this.getClassSessionOrFail(classId, sessionId);
    const sessionTime = new Date(session.datetime).getTime();
    if (sessionTime > Date.now()) {
      throw new BadRequestException(
        'Não é permitido lançar presença para aulas futuras.',
      );
    }

    const roster = await this.getClassRoster(classId);
    const rosterIds = new Set(roster.map((item) => item.studentId));

    const dedup = new Map<string, { studentId: string; present: boolean; note?: string }>();
    items.forEach((item) => {
      dedup.set(item.studentId, item);
    });

    for (const studentId of dedup.keys()) {
      if (!rosterIds.has(studentId)) {
        throw new BadRequestException(
          `Aluno ${studentId} não pertence à turma selecionada.`,
        );
      }
    }

    const nowIso = new Date().toISOString();
    const marks: AttendanceMark[] = Array.from(dedup.values()).map((item) => ({
      studentId: item.studentId,
      present: Boolean(item.present),
      note: item.note?.trim() || null,
      markedAt: nowIso,
      markedBy: actorId,
    }));

    const storage = await this.readAttendanceStorage(classId);
    const nextRecord: AttendanceSessionRecord = {
      sessionId,
      classId,
      title: session.title,
      datetime: session.datetime,
      updatedAt: nowIso,
      updatedBy: actorId,
      items: marks,
    };

    const existingIndex = storage.records.findIndex(
      (item) => item.sessionId === sessionId,
    );

    if (existingIndex >= 0) {
      storage.records[existingIndex] = nextRecord;
    } else {
      storage.records.push(nextRecord);
    }

    storage.records = storage.records
      .sort((a, b) =>
        new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
      )
      .slice(-2000);

    await this.writeAttendanceStorage(classId, storage);

    return this.getTeacherSessionRoster(classId, sessionId, {
      sub: actorId,
      role: actorRole,
    });
  }

  async getStudentSummary(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      select: {
        classId: true,
        schoolClass: {
          select: {
            name: true,
            course: { select: { name: true } },
          },
        },
      },
    });

    const classIdSet = new Set(enrollments.map((item) => item.classId));
    const classMap = new Map(
      enrollments.map((item) => [
        item.classId,
        {
          className: item.schoolClass.name,
          courseName: item.schoolClass.course.name,
        },
      ]),
    );

    let present = 0;
    let absent = 0;
    let totalOccurred = 0;

    const history: Array<{
      id: string;
      classId: string;
      className: string;
      courseName: string;
      title: string;
      datetime: string;
      status: 'present' | 'absent' | 'pending';
      note: string | null;
    }> = [];

    for (const classId of classIdSet) {
      const [sessions, storage] = await Promise.all([
        this.getClassSessions(classId),
        this.readAttendanceStorage(classId),
      ]);

      const pastSessions = sessions.filter(
        (session) => new Date(session.datetime).getTime() <= Date.now(),
      );
      const marksBySessionId = new Map(
        storage.records.map((record) => [
          record.sessionId,
          record.items.find((item) => item.studentId === studentId) ?? null,
        ]),
      );

      const classInfo = classMap.get(classId) ?? {
        className: 'Turma',
        courseName: 'Curso',
      };

      totalOccurred += pastSessions.length;
      pastSessions.forEach((session) => {
        const mark = marksBySessionId.get(session.id);
        const status: 'present' | 'absent' | 'pending' =
          !mark ? 'pending' : mark.present ? 'present' : 'absent';

        if (status === 'present') present += 1;
        if (status === 'absent') absent += 1;

        history.push({
          id: `${classId}:${session.id}`,
          classId,
          className: classInfo.className,
          courseName: classInfo.courseName,
          title: session.title,
          datetime: session.datetime,
          status,
          note: mark?.note ?? null,
        });
      });
    }

    history.sort(
      (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
    );

    const evaluated = present + absent;
    const frequencyPercent =
      evaluated > 0 ? Math.round((present / evaluated) * 100) : 0;

    return {
      totalOccurred,
      present,
      absent,
      pending: Math.max(totalOccurred - present - absent, 0),
      evaluated,
      frequencyPercent,
      history: history.slice(0, 240),
    };
  }

  private async ensureClassExists(
    classId: string,
    actor: { sub: string; role?: string },
  ) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: {
        id: classId,
        ...this.buildClassOwnershipFilter(actor),
      },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }
  }

  private buildClassOwnershipFilter(actor: { sub: string; role?: string }) {
    if (String(actor.role || '').toLowerCase() === 'superadmin') {
      return {};
    }

    return {
      course: {
        ownerAdminId: actor.sub,
      },
    };
  }

  private async getClassRoster(classId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        classId,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      select: {
        studentId: true,
        status: true,
        student: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        student: {
          name: 'asc',
        },
      },
    });

    return enrollments.map((item) => ({
      studentId: item.studentId,
      name: item.student.name,
      email: item.student.email,
      enrollmentStatus: item.status,
    }));
  }

  private async getClassSessionOrFail(classId: string, sessionId: string) {
    const sessions = await this.getClassSessions(classId);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new NotFoundException('Aula não encontrada para esta turma.');
    }
    return session;
  }

  private async getClassSessions(classId: string): Promise<AgendaSession[]> {
    const key = `${this.agendaKeyPrefix}${classId}`;
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });

    if (!row?.value) return [];

    try {
      const parsed = JSON.parse(row.value) as {
        events?: Array<{
          id?: string;
          type?: string;
          title?: string;
          datetime?: string;
        }>;
      };

      if (!Array.isArray(parsed.events)) return [];

      return parsed.events
        .filter((item) => item?.type === 'class' && typeof item.datetime === 'string')
        .map((item) => ({
          id: String(item.id ?? `${classId}-${item.datetime}`),
          title: String(item.title ?? 'Aula'),
          datetime: String(item.datetime),
        }))
        .filter((item) => !Number.isNaN(new Date(item.datetime).getTime()))
        .sort(
          (a, b) =>
            new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
        );
    } catch {
      return [];
    }
  }

  private attendanceKey(classId: string) {
    return `${this.attendanceKeyPrefix}${classId}`;
  }

  private async readAttendanceStorage(classId: string): Promise<AttendanceStorage> {
    const key = this.attendanceKey(classId);
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });

    if (!row?.value) return { records: [] };

    try {
      const parsed = JSON.parse(row.value) as Partial<AttendanceStorage>;
      if (!Array.isArray(parsed.records)) {
        return { records: [] };
      }

      const records = parsed.records
        .filter((record): record is AttendanceSessionRecord => {
          if (!record || typeof record !== 'object') return false;
          return (
            typeof record.sessionId === 'string' &&
            typeof record.classId === 'string' &&
            Array.isArray(record.items)
          );
        })
        .map((record) => ({
          ...record,
          title: String(record.title ?? 'Aula'),
          datetime: String(record.datetime ?? new Date().toISOString()),
          updatedAt: String(record.updatedAt ?? new Date().toISOString()),
          updatedBy: String(record.updatedBy ?? 'system'),
          items: record.items
            .filter((item) => item && typeof item.studentId === 'string')
            .map((item) => ({
              studentId: String(item.studentId),
              present: Boolean(item.present),
              note: item.note ?? null,
              markedAt: String(item.markedAt ?? new Date().toISOString()),
              markedBy: String(item.markedBy ?? 'system'),
            })),
        }));

      return { records };
    } catch {
      return { records: [] };
    }
  }

  private async writeAttendanceStorage(classId: string, storage: AttendanceStorage) {
    const key = this.attendanceKey(classId);
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(storage) },
      create: { key, value: JSON.stringify(storage) },
    });
  }
}
