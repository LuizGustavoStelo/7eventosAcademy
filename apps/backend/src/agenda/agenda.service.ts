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

@Injectable()
export class AgendaService {
  private readonly maxEvents = 1000;

  constructor(private readonly prisma: PrismaService) {}

  async getEvents(user: JwtPayload) {
    return this.readEvents(user);
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

  private buildKey(user: JwtPayload) {
    return `agenda-events:${user.role}:${user.sub}`;
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
}
