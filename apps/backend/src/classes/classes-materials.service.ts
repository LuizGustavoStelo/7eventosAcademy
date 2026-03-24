import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ClassesMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

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
