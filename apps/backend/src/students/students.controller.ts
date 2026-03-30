import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Get,
  Post,
  Put,
  Patch,
  Req,
} from '@nestjs/common';
import { Multipart, MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { AssignStudentCoursesDto } from './dto/assign-student-courses.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { PublicStudentRegistrationDto } from './dto/public-student-registration.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

type MultipartFastifyRequest = FastifyRequest & {
  user: JwtPayload;
  file: () => Promise<MultipartFile | undefined>;
  parts: () => AsyncIterableIterator<Multipart>;
};

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @RequirePermissions('students.read')
  @Get()
  async findAll(@Req() request: MultipartFastifyRequest) {
    return this.studentsService.findAll(request.user);
  }

  @RequirePermissions('students.read')
  @Get(':id')
  async findById(@Param('id') id: string, @Req() request: MultipartFastifyRequest) {
    return this.studentsService.findById(id, request.user);
  }

  @RequirePermissions('students.create')
  @Post()
  async create(@Body() dto: CreateStudentDto, @Req() request: MultipartFastifyRequest) {
    return this.studentsService.create(dto, request.user);
  }

  @RequirePermissions('students.update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @Req() request: MultipartFastifyRequest,
  ) {
    return this.studentsService.update(id, dto, request.user);
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

  @RequirePermissions('students.update')
  @Put(':id/courses')
  async assignCourses(
    @Param('id') id: string,
    @Body() dto: AssignStudentCoursesDto,
    @Req() request: MultipartFastifyRequest,
  ) {
    return this.studentsService.assignCourses(id, dto, request.user);
  }

  @RequirePermissions('students.update')
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

    return this.studentsService.uploadAvatar(id, file, request.user);
  }

  @RequirePermissions('students.update')
  @Delete(':id/avatar')
  async removeAvatar(@Param('id') id: string, @Req() request: MultipartFastifyRequest) {
    return this.studentsService.removeAvatar(id, request.user);
  }

  @RequirePermissions('students.delete')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: MultipartFastifyRequest) {
    return this.studentsService.remove(id, request.user);
  }

  @RequirePermissions('students.create')
  @Post('import-csv')
  async importCsv(@Req() request: MultipartFastifyRequest) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException('Envie um arquivo CSV no campo file.');
    }

    return this.studentsService.importCsv(file, request.user);
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
