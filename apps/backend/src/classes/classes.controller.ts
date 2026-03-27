import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { CreateClassMaterialDto } from './dto/create-class-material.dto';
import { UpdateClassStatusDto } from './dto/update-class-status.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { ClassesMaterialsService } from './classes-materials.service';
import { ClassesNoticesService } from './classes-notices.service';

type AuthenticatedRequest = FastifyRequest & {
  user: { sub: string };
  parts: () => AsyncIterable<
    | (MultipartFile & { type: 'file'; fieldname: string })
    | { type: 'field'; fieldname: string; value: string }
  >;
};

async function toBufferedMultipartFile(part: MultipartFile): Promise<MultipartFile> {
  const buffer = await part.toBuffer();
  return {
    ...part,
    toBuffer: async () => buffer,
  } as MultipartFile;
}

@Roles('admin', 'superadmin')
@Controller('classes')
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly materialsService: ClassesMaterialsService,
    private readonly noticesService: ClassesNoticesService,
  ) {}

  @Get()
  async findAll() {
    return this.classesService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateClassDto) {
    return this.classesService.create(dto);
  }

  @Patch(':classId')
  async update(@Param('classId') classId: string, @Body() dto: UpdateClassDto) {
    return this.classesService.update(classId, dto);
  }

  @Patch(':classId/status')
  async updateStatus(
    @Param('classId') classId: string,
    @Body() dto: UpdateClassStatusDto,
  ) {
    return this.classesService.updateStatus(classId, dto.status);
  }

  @Delete(':classId')
  async remove(@Param('classId') classId: string) {
    return this.classesService.remove(classId);
  }

  @Get(':classId/materials')
  async getMaterials(@Param('classId') classId: string) {
    return this.materialsService.getMaterials(classId);
  }

  @Post(':classId/materials')
  async createMaterial(
    @Param('classId') classId: string,
    @Body() dto: CreateClassMaterialDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.materialsService.createMaterial({
      classId,
      ...dto,
      publishedBy: request.user.sub,
    });
  }

  @Post(':classId/materials/upload')
  async createMaterialWithFile(
    @Param('classId') classId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const fields: Record<string, string> = {};
    let file: MultipartFile | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'file') {
          file = await toBufferedMultipartFile(part);
        } else {
          await part.toBuffer();
        }
        continue;
      }

      fields[part.fieldname] = String(part.value ?? '');
    }

    if (!file) {
      throw new BadRequestException(
        'Envie um arquivo no campo file para cadastrar o material.',
      );
    }

    return this.materialsService.createMaterialWithFile({
      classId,
      title: fields.title ?? '',
      description: fields.description,
      kind: fields.kind,
      externalUrl: fields.externalUrl,
      publishedBy: request.user.sub,
      file,
    });
  }

  @Post(':classId/materials/upload-batch')
  async createMaterialsWithFiles(
    @Param('classId') classId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const fields: Record<string, string> = {};
    const files: MultipartFile[] = [];

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'files' || part.fieldname === 'file') {
          files.push(await toBufferedMultipartFile(part));
        } else {
          await part.toBuffer();
        }
        continue;
      }

      fields[part.fieldname] = String(part.value ?? '');
    }

    if (files.length === 0) {
      throw new BadRequestException(
        'Envie ao menos um arquivo no campo files para cadastrar materiais.',
      );
    }

    return this.materialsService.createMaterialsWithFiles({
      classId,
      title: fields.title ?? '',
      description: fields.description,
      kind: fields.kind,
      externalUrl: fields.externalUrl,
      publishedBy: request.user.sub,
      files,
    });
  }

  @Get('materials/all')
  async getAllMaterials() {
    return this.materialsService.getAllMaterials();
  }

  @Post(':classId/notices')
  async createNotice(
    @Param('classId') classId: string,
    @Body() dto: any,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.noticesService.createNotice({
      classId,
      ...dto,
      publishedBy: request.user.sub,
    });
  }

  @Get('notices/all')
  async getAllNotices() {
    return this.noticesService.getAllNotices();
  }
}

