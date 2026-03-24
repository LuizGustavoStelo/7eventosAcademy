import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { UploadOwnerType } from '@prisma/client';
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
  private readonly uploadRoot = resolve(
    process.env.UPLOADS_DIR ?? join(process.cwd(), 'storage', 'uploads'),
  );

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await mkdir(this.uploadRoot, { recursive: true });
  }

  async bindFileToOwner(input: BindFileInput) {
    const { ownerType, ownerId, kind, file } = input;
    this.assertDocumentOrMedia(file);

    const buffer = await file.toBuffer();
    if (!buffer.length) {
      throw new BadRequestException('Arquivo vazio não é permitido.');
    }

    const extension = this.resolveExtension(file);
    const relativePath = `${ownerType.toLowerCase()}/${ownerId}/${Date.now()}-${randomUUID()}${extension}`;
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

  private assertDocumentOrMedia(file: MultipartFile) {
    const allowedPrefixes = ['image/', 'video/', 'application/pdf', 'application/vnd', 'application/msword', 'audio/'];
    const isAllowed = allowedPrefixes.some(prefix => file.mimetype.startsWith(prefix));
    if (!isAllowed) {
      throw new BadRequestException('Formato de arquivo não suportado para materiais.');
    }
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
      // ignora ausência de arquivo físico
    }
  }
}
