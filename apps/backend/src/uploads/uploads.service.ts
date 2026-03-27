import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Logger
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UploadOwnerType, UserRole } from '@prisma/client';
import { MultipartFile } from '@fastify/multipart';
import { dirname, extname, join, resolve } from 'path';
import { PrismaService } from '../database/prisma.service';

type BindFileInput = {
  ownerType: UploadOwnerType;
  ownerId: string;
  kind: string;
  file: MultipartFile;
};

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private readonly defaultUploadRoot =
    process.platform === 'win32'
      ? join(process.cwd(), 'storage', 'uploads')
      : '/var/www/7eventosAcademy/uploads';
  private readonly uploadRoot = resolve(
    process.env.UPLOADS_DIR ?? this.defaultUploadRoot,
  );

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await mkdir(this.uploadRoot, { recursive: true });
    this.logger.log(`Diretório de uploads ativo: ${this.uploadRoot}`);
  }

  async bindFileToOwner(input: BindFileInput) {
    const { ownerType, ownerId, kind, file } = input;
    this.assertAllowedByKind(file, kind);

    const buffer = await file.toBuffer();
    if (!buffer.length) {
      throw new BadRequestException('Arquivo vazio não é permitido.');
    }

    const extension = this.resolveExtension(file);
    const relativePath = await this.buildRelativePath({
      ownerType,
      ownerId,
      kind,
      extension,
      originalName: file.filename,
    });
    const absolutePath = join(this.uploadRoot, ...relativePath.split('/'));

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    const existingBinding = await this.prisma.uploadBinding.findUnique({
      where: {
        ownerType_ownerId_kind: {
          ownerType,
          ownerId,
          kind,
        },
      },
      include: { asset: true },
    });

    const previousStoragePath: string | null =
      existingBinding?.asset.storagePath ?? null;

    try {
      const asset = await this.prisma.$transaction(async (tx) => {
        const createdAsset = await tx.uploadAsset.create({
          data: {
            storagePath: relativePath,
            originalName: file.filename,
            mimeType: file.mimetype,
            sizeBytes: buffer.length,
          },
        });

        if (existingBinding) {
          await tx.uploadBinding.update({
            where: {
              ownerType_ownerId_kind: {
                ownerType,
                ownerId,
                kind,
              },
            },
            data: { assetId: createdAsset.id },
          });

          await tx.uploadAsset.delete({
            where: { id: existingBinding.asset.id },
          });
        } else {
          await tx.uploadBinding.create({
            data: {
              ownerType,
              ownerId,
              kind,
              assetId: createdAsset.id,
            },
          });
        }

        return createdAsset;
      });

      if (previousStoragePath) {
        await this.safeUnlink(
          join(this.uploadRoot, ...previousStoragePath.split('/')),
        );
      }

      return {
        assetId: asset.id,
        url: this.buildAssetUrl(asset.id),
      };
    } catch (error) {
      await this.safeUnlink(absolutePath);
      throw error;
    }
  }

  async getOwnerAsset(
    ownerType: UploadOwnerType,
    ownerId: string,
    kind: string,
  ) {
    const binding = await this.prisma.uploadBinding.findUnique({
      where: {
        ownerType_ownerId_kind: {
          ownerType,
          ownerId,
          kind,
        },
      },
      include: { asset: true },
    });

    if (!binding) return null;

    return {
      assetId: binding.asset.id,
      url: this.buildAssetUrl(binding.asset.id),
    };
  }

  async deleteOwnerAssets(ownerType: UploadOwnerType, ownerId: string) {
    const bindings = await this.prisma.uploadBinding.findMany({
      where: { ownerType, ownerId },
      include: { asset: true },
    });

    if (bindings.length === 0) {
      return;
    }

    const assetIds = bindings.map((item) => item.assetId);
    const filePaths = bindings.map((item) =>
      join(this.uploadRoot, ...item.asset.storagePath.split('/')),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.uploadBinding.deleteMany({ where: { ownerType, ownerId } });
      await tx.uploadAsset.deleteMany({ where: { id: { in: assetIds } } });
    });

    await Promise.all(filePaths.map((filePath) => this.safeUnlink(filePath)));
  }

  async deleteOwnerAssetByKind(
    ownerType: UploadOwnerType,
    ownerId: string,
    kind: string,
  ) {
    const binding = await this.prisma.uploadBinding.findUnique({
      where: {
        ownerType_ownerId_kind: {
          ownerType,
          ownerId,
          kind,
        },
      },
      include: { asset: true },
    });

    if (!binding) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.uploadBinding.delete({
        where: {
          ownerType_ownerId_kind: {
            ownerType,
            ownerId,
            kind,
          },
        },
      });

      await tx.uploadAsset.delete({
        where: { id: binding.assetId },
      });
    });

    await this.safeUnlink(
      join(this.uploadRoot, ...binding.asset.storagePath.split('/')),
    );
  }

  async getAssetStream(assetId: string) {
    const asset = await this.prisma.uploadAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    const absolutePath = join(this.uploadRoot, ...asset.storagePath.split('/'));
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('Arquivo não encontrado no disco.');
    }

    return {
      mimeType: asset.mimeType,
      stream: createReadStream(absolutePath),
    };
  }

  private buildAssetUrl(assetId: string) {
    return `/api/uploads/assets/${assetId}`;
  }
  private assertAllowedByKind(file: MultipartFile, kind: string) {
    if (
      kind === 'PROFILE_AVATAR' ||
      kind === 'STUDENT_AVATAR' ||
      kind === 'COURSE_BANNER'
    ) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          'Envie uma imagem válida para este tipo de upload.',
        );
      }
      return;
    }

    const allowedPrefixes = [
      'image/',
      'video/',
      'application/pdf',
      'application/vnd',
      'application/msword',
      'audio/',
    ];
    const isAllowed = allowedPrefixes.some((prefix) =>
      file.mimetype.startsWith(prefix),
    );
    if (!isAllowed) {
      throw new BadRequestException(
        'Formato de arquivo não suportado para materiais.',
      );
    }
  }

  private async buildRelativePath(input: {
    ownerType: UploadOwnerType;
    ownerId: string;
    kind: string;
    extension: string;
    originalName?: string;
  }) {
    const { ownerType, ownerId, kind, extension, originalName } = input;
    const fileName = this.buildHashedFileName(originalName, extension);

    if (ownerType === UploadOwnerType.COURSE && kind === 'COURSE_BANNER') {
      const courseFolder = await this.resolveCourseFolder(ownerId);
      return `banners/cursos/${courseFolder}/${fileName}`;
    }

    if (
      (ownerType === UploadOwnerType.USER ||
        ownerType === UploadOwnerType.STUDENT) &&
      (kind === 'PROFILE_AVATAR' || kind === 'STUDENT_AVATAR')
    ) {
      const profileFolder = await this.resolveProfileFolder(ownerType, ownerId);
      return `perfil/${profileFolder}/${fileName}`;
    }

    if (ownerType === UploadOwnerType.CLASS && kind.startsWith('CLASS_MATERIAL_')) {
      const professorFolder = await this.resolveProfessorFolderFromKind(kind);
      const classFolder = await this.resolveClassFolder(ownerId);
      return `materiais/professor-${professorFolder}/turma-${classFolder}/${fileName}`;
    }

    return `outros/${ownerType.toLowerCase()}/${this.safeSegment(ownerId)}/${this.safeSegment(kind)}/${fileName}`;
  }

  private async resolveCourseFolder(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });

    if (!course?.name) {
      return this.safeSegment(courseId);
    }

    return this.safeSegment(course.name);
  }

  private async resolveProfessorFolderFromKind(kind: string) {
    const professorId = this.extractProfessorIdFromKind(kind);
    if (!professorId || professorId === 'desconhecido') {
      return 'desconhecido';
    }

    if (!this.isUuid(professorId)) {
      return this.safeSegment(professorId);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: professorId },
      select: { name: true },
    });

    return this.safeSegment(user?.name ?? professorId);
  }

  private async resolveClassFolder(classId: string) {
    if (!this.isUuid(classId)) {
      return this.safeSegment(classId);
    }

    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id: classId },
      select: { name: true },
    });

    return this.safeSegment(schoolClass?.name ?? classId);
  }

  private async resolveProfileFolder(ownerType: UploadOwnerType, ownerId: string) {
    if (ownerType === UploadOwnerType.STUDENT) {
      const student = await this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { name: true },
      });
      const nameSegment = this.safeSegment(student?.name ?? ownerId);
      return `alunos/${nameSegment}`;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true, role: true },
    });

    const roleSegment =
      user?.role === UserRole.USER
        ? 'alunos'
        : user?.role === UserRole.ADMIN
          ? 'professores'
          : user?.role === UserRole.SUPERADMIN
            ? 'superadmin'
            : 'usuarios';

    const nameSegment = this.safeSegment(user?.name ?? ownerId);
    return `${roleSegment}/${nameSegment}`;
  }

  private safeSegment(value: string) {
    const cleaned = value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return cleaned || 'sem-id';
  }

  private extractProfessorIdFromKind(kind: string) {
    const raw = kind.replace('CLASS_MATERIAL_', '');
    return (raw.split('__')[0] || 'desconhecido').trim();
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private buildHashedFileName(originalName: string | undefined, extension: string) {
    const normalizedName = (originalName ?? '').trim();
    const fileExtFromName = extname(normalizedName);
    const baseName = fileExtFromName
      ? normalizedName.slice(0, -fileExtFromName.length)
      : normalizedName;
    const baseSegment = this.safeSegment(baseName || 'arquivo');
    const hash = randomUUID().replace(/-/g, '').slice(0, 10);
    return `${baseSegment}-${hash}${extension}`;
  }

  private resolveExtension(file: MultipartFile) {
    const fromName = extname(file.filename || '').toLowerCase();
    if (fromName) {
      return fromName;
    }

    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };

    return mimeMap[file.mimetype] ?? '.bin';
  }

  private async safeUnlink(filePath: string) {
    try {
      await unlink(filePath);
    } catch {
      // Ignorar caso o arquivo já não exista ao deletar.
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOrphanAssets() {
    this.logger.log('Iniciando limpeza de arquivos órfãos (UploadAssets sem UploadBindings)...');
    
    // Filtra assets que foram criados há mais de 24 horas e não possuem bindings
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const orphans = await this.prisma.uploadAsset.findMany({
      where: {
        bindings: { none: {} },
        createdAt: { lt: yesterday },
      },
      select: { id: true, storagePath: true },
    });

    if (orphans.length === 0) {
      this.logger.log('Nenhum arquivo órfão encontrado.');
      return;
    }

    this.logger.log(`Encontrados ${orphans.length} arquivos órfãos para remoção.`);

    const assetIds = orphans.map(o => o.id);
    const result = await this.prisma.uploadAsset.deleteMany({
      where: { id: { in: assetIds } },
    });

    for (const orphan of orphans) {
      const absolutePath = join(this.uploadRoot, ...orphan.storagePath.split('/'));
      await this.safeUnlink(absolutePath);
    }

    this.logger.log(`Limpeza concluída. ${result.count} órfãos removidos do banco e do disco.`);
  }
}
