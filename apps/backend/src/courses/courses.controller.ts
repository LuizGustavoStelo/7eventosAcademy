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
import type { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CoursesService } from './courses.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @RequirePermissions('courses.read')
  @Get()
  async findAll(@Req() request: AuthenticatedRequest) {
    return this.coursesService.findAll(request.user);
  }

  @RequirePermissions('courses.create')
  @Post()
  async create(@Body() dto: CreateCourseDto, @Req() request: AuthenticatedRequest) {
    return this.coursesService.create(dto, request.user);
  }

  @RequirePermissions('courses.update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coursesService.update(id, dto, request.user);
  }

  @RequirePermissions('courses.delete')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.coursesService.remove(id, request.user);
  }

  @RequirePermissions('courses.update')
  @Post(':id/banner')
  async uploadBanner(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const multipartRequest = request as AuthenticatedRequest & {
      file: () => Promise<MultipartFile | undefined>;
    };

    const file = await multipartRequest.file();
    if (!file) {
      throw new BadRequestException(
        'Envie um arquivo de imagem no campo banner.',
      );
    }

    return this.coursesService.uploadBanner(id, file, request.user);
  }
}
