import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ClassesMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async createMaterial(dto: {
    classId: string;
    title: string;
    description?: string;
    kind?: string;
    mimeType?: string;
    externalUrl?: string;
    fileUrl?: string;
    publishedBy?: string;
  }) {
    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id: dto.classId },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }

    return this.prisma.studyMaterial.create({
      data: {
        classId: dto.classId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        kind: dto.kind?.trim() || 'file',
        mimeType: dto.mimeType?.trim() || null,
        externalUrl: dto.externalUrl?.trim() || null,
        fileUrl: dto.fileUrl?.trim() || null,
        publishedBy: dto.publishedBy,
      },
      include: {
        schoolClass: {
          select: { name: true, course: { select: { name: true } } },
        },
      },
    });
  }

  async getMaterials(classId: string) {
    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
    });
    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }

    return this.prisma.studyMaterial.findMany({
      where: { classId },
      orderBy: { createdAt: 'desc' },
      include: {
        schoolClass: {
          select: { name: true, course: { select: { name: true } } }
        }
      }
    });
  }

  async getAllMaterials() {
    return this.prisma.studyMaterial.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        schoolClass: {
          select: { name: true, course: { select: { name: true } } }
        }
      }
    });
  }
}
