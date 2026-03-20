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
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CoursesService } from './courses.service';

@Roles('admin', 'superadmin')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async findAll() {
    return this.coursesService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.coursesService.remove(id);
  }

  @Post(':id/banner')
  async uploadBanner(@Param('id') id: string, @Req() request: FastifyRequest) {
    const multipartRequest = request as FastifyRequest & {
      file: () => Promise<MultipartFile | undefined>;
    };

    const file = await multipartRequest.file();
    if (!file) {
      throw new BadRequestException('Envie um arquivo de imagem no campo banner.');
    }

    return this.coursesService.uploadBanner(id, file);
  }
}

