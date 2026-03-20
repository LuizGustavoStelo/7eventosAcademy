import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        workloadHours: dto.workloadHours,
      },
    });
  }

  async findAll() {
    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
