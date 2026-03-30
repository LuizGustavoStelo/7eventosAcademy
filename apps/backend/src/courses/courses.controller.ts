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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CoursesService } from './courses.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Roles('admin', 'superadmin')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async findAll(@Req() request: AuthenticatedRequest) {
    return this.coursesService.findAll(request.user);
  }

  @Post()
  async create(@Body() dto: CreateCourseDto, @Req() request: AuthenticatedRequest) {
    return this.coursesService.create(dto, request.user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coursesService.update(id, dto, request.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.coursesService.remove(id, request.user);
  }

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
