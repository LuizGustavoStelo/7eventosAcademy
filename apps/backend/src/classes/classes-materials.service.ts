import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { UploadOwnerType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

const CLASS_MATERIAL_KIND_PREFIX = 'CLASS_MATERIAL_';

@Injectable()
export class ClassesMaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

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
    await this.ensureClassExists(dto.classId);

    if (dto.title.trim().length < 3) {
      throw new BadRequestException(
        'Título do material deve ter pelo menos 3 caracteres.',
      );
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

  async createMaterialWithFile(dto: {
    classId: string;
    title: string;
    description?: string;
    kind?: string;
    externalUrl?: string;
    publishedBy?: string;
    file: MultipartFile;
  }) {
    await this.ensureClassExists(dto.classId);

    if (dto.title.trim().length < 3) {
      throw new BadRequestException(
        'Título do material deve ter pelo menos 3 caracteres.',
      );
    }

    const material = await this.prisma.studyMaterial.create({
      data: {
        classId: dto.classId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        kind: dto.kind?.trim() || 'file',
        mimeType: dto.file.mimetype || null,
        externalUrl: dto.externalUrl?.trim() || null,
        fileUrl: null,
        publishedBy: dto.publishedBy,
      },
    });

    const bindingKind = `${CLASS_MATERIAL_KIND_PREFIX}${dto.publishedBy || 'desconhecido'}__${material.id}`;

    try {
      const upload = await this.uploadsService.bindFileToOwner({
        ownerType: UploadOwnerType.CLASS,
        ownerId: dto.classId,
        kind: bindingKind,
        file: dto.file,
      });

      return this.prisma.studyMaterial.update({
        where: { id: material.id },
        data: { fileUrl: upload.url },
        include: {
          schoolClass: {
            select: { name: true, course: { select: { name: true } } },
          },
        },
      });
    } catch (error) {
      await this.prisma.studyMaterial.delete({ where: { id: material.id } });
      throw error;
    }
  }

  async getMaterials(classId: string) {
    await this.ensureClassExists(classId);

    return this.prisma.studyMaterial.findMany({
      where: { classId },
      orderBy: { createdAt: 'desc' },
      include: {
        schoolClass: {
          select: { name: true, course: { select: { name: true } } },
        },
      },
    });
  }

  async getAllMaterials() {
    return this.prisma.studyMaterial.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        schoolClass: {
          select: { name: true, course: { select: { name: true } } },
        },
      },
    });
  }

  private async ensureClassExists(classId: string) {
    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new NotFoundException('Turma não encontrada.');
    }
  }
}
