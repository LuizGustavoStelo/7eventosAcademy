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
const MATERIAL_ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v',
]);
const MATERIAL_ALLOWED_EXACT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const MATERIAL_ALLOWED_MIME_PREFIX = ['image/', 'video/'];

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

    this.validateMaterialFile(dto.file);

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

  async createMaterialsWithFiles(dto: {
    classId: string;
    title: string;
    description?: string;
    kind?: string;
    externalUrl?: string;
    publishedBy?: string;
    files: MultipartFile[];
  }) {
    await this.ensureClassExists(dto.classId);

    const created: Awaited<ReturnType<typeof this.createMaterialWithFile>>[] = [];
    const rejected: Array<{ fileName: string; reason: string }> = [];

    for (const [index, file] of dto.files.entries()) {
      const baseTitle = this.resolveBatchTitle(dto.title, file.filename, index);

      try {
        const material = await this.createMaterialWithFile({
          classId: dto.classId,
          title: baseTitle,
          description: dto.description,
          kind: dto.kind,
          externalUrl: dto.externalUrl,
          publishedBy: dto.publishedBy,
          file,
        });
        created.push(material);
      } catch (error) {
        rejected.push({
          fileName: file.filename || `arquivo-${index + 1}`,
          reason:
            error instanceof Error
              ? error.message
              : 'Falha ao processar este arquivo.',
        });
      }
    }

    return {
      created,
      rejected,
      summary: {
        total: dto.files.length,
        created: created.length,
        rejected: rejected.length,
      },
    };
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

  async deleteMaterial(classId: string, materialId: string) {
    await this.ensureClassExists(classId);

    const material = await this.prisma.studyMaterial.findFirst({
      where: { id: materialId, classId },
      select: { id: true, classId: true, publishedBy: true },
    });

    if (!material) {
      throw new NotFoundException('Material não encontrado.');
    }

    const bindingKind = `${CLASS_MATERIAL_KIND_PREFIX}${material.publishedBy || 'desconhecido'}__${material.id}`;

    await this.uploadsService.deleteOwnerAssetByKind(
      UploadOwnerType.CLASS,
      material.classId,
      bindingKind,
    );

    await this.prisma.studyMaterial.delete({
      where: { id: material.id },
    });

    return { deleted: true };
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

  private resolveBatchTitle(baseTitle: string, fileName: string, index: number) {
    const fromInput = (baseTitle || '').trim();
    const cleanedFileName = (fileName || '').trim();
    const titleFromFile = cleanedFileName.replace(/\.[^/.]+$/, '').trim();
    const fallback = titleFromFile || `Material ${index + 1}`;

    if (!fromInput) {
      return fallback;
    }

    return index === 0 ? fromInput : `${fromInput} - ${fallback}`;
  }

  private validateMaterialFile(file: MultipartFile) {
    const fileName = (file.filename || '').trim().toLowerCase();
    const extensionMatch = fileName.match(/\.[a-z0-9]+$/i);
    const extension = extensionMatch?.[0] ?? '';
    const mimeType = (file.mimetype || '').toLowerCase();

    const extensionAllowed = extension
      ? MATERIAL_ALLOWED_EXTENSIONS.has(extension)
      : false;
    const mimeAllowed =
      MATERIAL_ALLOWED_EXACT_MIME.has(mimeType) ||
      MATERIAL_ALLOWED_MIME_PREFIX.some((prefix) =>
        mimeType.startsWith(prefix),
      );

    if (!extensionAllowed && !mimeAllowed) {
      throw new BadRequestException(
        'Formato não suportado. Use PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, JPG, JPEG, PNG, GIF, WEBP, MP4, MOV, AVI, MKV, WEBM ou M4V.',
      );
    }
  }
}

