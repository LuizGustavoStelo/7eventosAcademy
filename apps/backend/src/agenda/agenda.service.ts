import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtPayload } from '../auth/types/app-role.type';
import { PrismaService } from '../database/prisma.service';

type AgendaEventType = 'class' | 'live';

type AgendaEventRecord = {
  id: string;
  type: AgendaEventType;
  title: string;
  classId: string | null;
  className: string;
  teacher: string;
  datetime: string;
  provider: string | null;
};

type ClassEventMetaRecord = {
  classId: string;
  className: string;
  teacher: string;
  recurrenceKind: 'none' | 'weekly' | 'monthly';
  repeatUntil: string | null;
  monthDay: number | null;
  weeklyDays: number[];
  events: AgendaEventRecord[];
};

@Injectable()
export class AgendaService {
  private readonly maxEvents = 1000;
  private readonly classEventKeyPrefix = 'agenda-class:';

  constructor(private readonly prisma: PrismaService) {}

  async getEvents(user: JwtPayload) {
    const [userEvents, classEvents] = await Promise.all([
      this.readEvents(user),
      this.readAllClassEvents(user),
    ]);
    return [...classEvents, ...userEvents]
      .sort((a, b) => {
        const first = new Date(a.datetime).getTime();
        const second = new Date(b.datetime).getTime();
        return first - second;
      })
      .slice(0, this.maxEvents);
  }

  async createEvent(
    user: JwtPayload,
    input: {
      type?: string;
      title?: string;
      classId?: string | null;
      className?: string;
      teacher?: string;
      datetime?: string;
      provider?: string | null;
    },
  ) {
    const type = input.type === 'live' ? 'live' : 'class';
    const title = String(input.title ?? '').trim();
    const datetime = String(input.datetime ?? '').trim();

    if (!title || !datetime) {
      throw new Error('Informe título e data/hora para salvar o evento.');
    }

    const parsedDate = new Date(datetime);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error('Data/hora do evento inválida.');
    }

    const events = await this.readEvents(user);
    const nextEvent: AgendaEventRecord = {
      id: randomUUID(),
      type,
      title,
      classId: input.classId?.trim() || null,
      className: String(input.className ?? 'Sem turma').trim() || 'Sem turma',
      teacher: String(input.teacher ?? 'Professor(a)').trim() || 'Professor(a)',
      datetime: parsedDate.toISOString(),
      provider:
        type === 'live' ? String(input.provider ?? '').trim() || 'YouTube' : null,
    };

    const nextEvents = [nextEvent, ...events].slice(0, this.maxEvents);
    await this.writeEvents(user, nextEvents);
    return nextEvent;
  }

  async getClassEventsMeta(user: JwtPayload) {
    const schedules = await this.readClassEventMetaRecords(user);
    return schedules.map((item) => ({
      classId: item.classId,
      className: item.className,
      teacher: item.teacher,
      recurrenceKind: item.recurrenceKind,
      repeatUntil: item.repeatUntil,
      monthDay: item.monthDay,
      weeklyDays: item.weeklyDays,
    }));
  }

  async syncClassEvents(
    user: JwtPayload,
    input: {
      classId?: string;
      className?: string;
      teacher?: string;
      recurrenceKind?: 'none' | 'weekly' | 'monthly';
      repeatUntil?: string | null;
      monthDay?: number | null;
      weeklyDays?: number[];
      events?: Array<{
        type?: string;
        title?: string;
        datetime?: string;
        provider?: string | null;
      }>;
    },
  ) {
    const classId = String(input.classId ?? '').trim();
    if (!classId) {
      throw new Error('ClassId é obrigatório para sincronizar agenda da turma.');
    }

    await this.ensureClassAccess(classId, user);

    const className = String(input.className ?? '').trim() || 'Turma';
    const teacher = String(input.teacher ?? '').trim() || 'Professor(a)';
    const recurrenceKind =
      input.recurrenceKind === 'weekly' || input.recurrenceKind === 'monthly'
        ? input.recurrenceKind
        : 'none';
    const repeatUntil = input.repeatUntil ? String(input.repeatUntil) : null;
    const monthDay =
      typeof input.monthDay === 'number' && Number.isFinite(input.monthDay)
        ? input.monthDay
        : null;
    const weeklyDays = Array.isArray(input.weeklyDays)
      ? input.weeklyDays
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6)
      : [];

    const rawEvents = Array.isArray(input.events) ? input.events : [];
    const events: AgendaEventRecord[] = [];
    rawEvents.forEach((eventItem) => {
      const title = String(eventItem.title ?? '').trim() || className;
      const type = eventItem.type === 'live' ? 'live' : 'class';
      const provider =
        type === 'live'
          ? String(eventItem.provider ?? '').trim() || 'YouTube'
          : null;
      const datetime = String(eventItem.datetime ?? '').trim();
      const parsedDate = new Date(datetime);
      if (!datetime || Number.isNaN(parsedDate.getTime())) {
        return;
      }
      events.push({
        id: String(randomUUID()),
        type,
        title,
        classId,
        className,
        teacher,
        datetime: parsedDate.toISOString(),
        provider,
      });
    });

    const payload: ClassEventMetaRecord = {
      classId,
      className,
      teacher,
      recurrenceKind,
      repeatUntil,
      monthDay,
      weeklyDays,
      events,
    };

    const key = this.buildClassEventKey(classId);
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(payload) },
      create: { key, value: JSON.stringify(payload) },
    });

    return {
      classId,
      saved: events.length,
    };
  }

  private buildKey(user: JwtPayload) {
    return `agenda-events:${user.role}:${user.sub}`;
  }

  private buildClassEventKey(classId: string) {
    return `${this.classEventKeyPrefix}${classId}`;
  }

  private async readEvents(user: JwtPayload): Promise<AgendaEventRecord[]> {
    const key = this.buildKey(user);
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });

    if (!setting?.value) return [];

    try {
      const parsed = JSON.parse(setting.value) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => this.isAgendaEventRecord(item))
        .slice(0, this.maxEvents);
    } catch {
      return [];
    }
  }

  private async writeEvents(user: JwtPayload, events: AgendaEventRecord[]) {
    const key = this.buildKey(user);
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(events) },
      create: { key, value: JSON.stringify(events) },
    });
  }

  private async readAllClassEvents(user: JwtPayload): Promise<AgendaEventRecord[]> {
    const schedules = await this.readClassEventMetaRecords(user);
    return schedules.flatMap((item) =>
      item.events.filter((eventItem) => this.isAgendaEventRecord(eventItem)),
    );
  }

  private async readClassEventMetaRecords(
    user: JwtPayload,
  ): Promise<ClassEventMetaRecord[]> {
    const classRows = await this.prisma.schoolClass.findMany({
      where: this.classOwnerWhere(user),
      select: { id: true },
    });
    const allowedKeys = classRows.map((item) => this.buildClassEventKey(item.id));
    if (allowedKeys.length === 0) {
      return [];
    }

    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: allowedKeys,
        },
      },
      select: {
        value: true,
      },
    });

    return rows
      .map((row) => {
        try {
          const parsed = JSON.parse(row.value) as unknown;
          if (!this.isClassEventMetaRecord(parsed)) return null;
          return parsed;
        } catch {
          return null;
        }
      })
      .filter((item): item is ClassEventMetaRecord => item !== null);
  }

  private classOwnerWhere(user: JwtPayload) {
    if (String(user.role || '').toLowerCase() === 'superadmin') {
      return {};
    }

    return {
      course: {
        ownerAdminId: user.sub,
      },
    };
  }

  private async ensureClassAccess(classId: string, user: JwtPayload) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: {
        id: classId,
        ...this.classOwnerWhere(user),
      },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new Error('Turma nÃ£o encontrada para esta conta.');
    }
  }

  private isAgendaEventRecord(value: unknown): value is AgendaEventRecord {
    if (!value || typeof value !== 'object') return false;
    const event = value as Partial<AgendaEventRecord>;
    return (
      typeof event.id === 'string' &&
      (event.type === 'class' || event.type === 'live') &&
      typeof event.title === 'string' &&
      typeof event.datetime === 'string'
    );
  }

  private isClassEventMetaRecord(value: unknown): value is ClassEventMetaRecord {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<ClassEventMetaRecord>;
    if (typeof record.classId !== 'string') return false;
    if (typeof record.className !== 'string') return false;
    if (!Array.isArray(record.events)) return false;
    return true;
  }
}
