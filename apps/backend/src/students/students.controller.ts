import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Get,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Multipart, MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AssignStudentCoursesDto } from './dto/assign-student-courses.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { PublicStudentRegistrationDto } from './dto/public-student-registration.dto';
import { StudentsService } from './students.service';

type MultipartFastifyRequest = FastifyRequest & {
  file: () => Promise<MultipartFile | undefined>;
  parts: () => AsyncIterableIterator<Multipart>;
};

@Roles('admin', 'superadmin')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  async findAll() {
    return this.studentsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.studentsService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Public()
  @Post('public-register')
  async publicRegister(@Body() dto: PublicStudentRegistrationDto) {
    return this.studentsService.registerPublic(dto);
  }

  @Public()
  @Post('public-register-multipart')
  async publicRegisterMultipart(@Req() request: MultipartFastifyRequest) {
    const { dto, avatar } =
      await this.parsePublicRegistrationMultipart(request);
    return this.studentsService.registerPublic(dto, avatar);
  }

  @Put(':id/courses')
  async assignCourses(
    @Param('id') id: string,
    @Body() dto: AssignStudentCoursesDto,
  ) {
    return this.studentsService.assignCourses(id, dto);
  }

  @Post(':id/avatar')
  async uploadAvatar(
    @Param('id') id: string,
    @Req() request: MultipartFastifyRequest,
  ) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException(
        'Envie um arquivo de imagem no campo avatar.',
      );
    }

    return this.studentsService.uploadAvatar(id, file);
  }

  @Delete(':id/avatar')
  async removeAvatar(@Param('id') id: string) {
    return this.studentsService.removeAvatar(id);
  }

  @Post('import-csv')
  async importCsv(@Req() request: MultipartFastifyRequest) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException('Envie um arquivo CSV no campo file.');
    }

    return this.studentsService.importCsv(file);
  }

  private async parsePublicRegistrationMultipart(
    request: MultipartFastifyRequest,
  ) {
    const fields: Record<string, unknown> = {};
    let avatar: MultipartFile | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'avatar') {
          avatar = part;
        } else {
          await part.toBuffer();
        }
        continue;
      }

      fields[part.fieldname] = part.value;
    }

    const courseIdsRaw = fields.courseIds;
    const courseIds = this.parseCourseIds(courseIdsRaw);

    const payload = {
      ...fields,
      courseIds,
    };

    const dto = plainToInstance(PublicStudentRegistrationDto, payload);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException(
        errors
          .flatMap((error) => Object.values(error.constraints ?? {}))
          .filter(Boolean),
      );
    }

    return { dto, avatar };
  }

  private parseCourseIds(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }

    if (typeof value !== 'string') {
      return [];
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
      } catch {
        return [];
      }
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
