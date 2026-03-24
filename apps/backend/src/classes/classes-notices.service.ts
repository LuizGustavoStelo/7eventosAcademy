import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ClassesNoticesService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotice(dto: { classId: string, title: string, body: string, priority: string, expiresAt?: Date, publishedBy?: string }) {
    return this.prisma.classNotice.create({
      data: {
        classId: dto.classId,
        title: dto.title,
        body: dto.body,
        priority: dto.priority || 'normal',
        expiresAt: dto.expiresAt,
        publishedBy: dto.publishedBy,
      },
      include: {
        schoolClass: { select: { name: true } }
      }
    });
  }

  async getAllNotices() {
    return this.prisma.classNotice.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        schoolClass: { select: { name: true } }
      }
    });
  }
}
