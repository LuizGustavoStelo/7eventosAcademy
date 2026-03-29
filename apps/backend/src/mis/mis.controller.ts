import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicStudentRegistrationDto } from '../students/dto/public-student-registration.dto';
import { StudentsService } from '../students/students.service';
import { CoursesService } from '../courses/courses.service';
import { MisService } from './mis.service';

/**
 * MisController — Módulo Incorporado Seguro (MIS)
 *
 * Rotas autenticadas do aluno: /api/mis/v1/aluno/*
 * Rota pública de cadastro:    POST /api/mis/v1/public/cadastros
 *
 * Rate limiting:
 *  - Rotas autenticadas: sem throttle adicional (aluno já autenticado, JWT limita por si)
 *  - Cadastro público: perfil 'public-mis' (10 req / 60s por IP, muito restritivo anti-bot)
 */
@Controller('mis/v1')
export class MisController {
  constructor(
    private readonly misService: MisService,
    private readonly studentsService: StudentsService,
    private readonly coursesService: CoursesService,
  ) {}

  // ── Área autenticada ─────────────────────────────────────────────────────

  @SkipThrottle()   // JWT já protege — usuário autenticado não precisa de rate limit adicional
  @Roles('user', 'admin', 'superadmin')
  @Get('aluno/me')
  async getMe(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.misService.getAlunoMe(user?.sub);
  }

  @SkipThrottle()
  @Roles('user', 'admin', 'superadmin')
  @Get('aluno/matriculas')
  async getMatriculas(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.misService.getAlunoMatriculas(user?.sub);
  }

  @SkipThrottle()
  @Roles('user', 'admin', 'superadmin')
  @Get('aluno/cobrancas')
  async getCobrancas(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.misService.getAlunoCobrancas(user?.sub);
  }

  @SkipThrottle()
  @Roles('user', 'admin', 'superadmin')
  @Get('aluno/agenda')
  async getAgenda(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.misService.getAlunoAgenda(user?.sub);
  }

  @SkipThrottle()
  @Roles('user', 'admin', 'superadmin')
  @Get('aluno/dashboard')
  async getDashboard(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.misService.getAlunoDashboard(user?.sub);
  }

  @SkipThrottle()
  @Roles('user', 'admin', 'superadmin')
  @Get('aluno/materiais')
  async getMateriais(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.misService.getAlunoMateriais(user?.sub);
  }

  @SkipThrottle()
  @Roles('user', 'admin', 'superadmin')
  @Get('aluno/avisos')
  async getAvisos(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.misService.getAlunoAvisos(user?.sub);
  }

  // ── Cadastro público ─────────────────────────────────────────────────────

  /**
   * POST /api/mis/v1/public/cadastros
   *
   * Perfil 'public-mis': máx. 10 requisições por IP em 60 segundos.
   * Bloqueia bots e abuso de cadastro em massa.
   */
  @Throttle({ 'public-mis': { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('public/cadastros')
  async publicRegister(@Body() dto: PublicStudentRegistrationDto) {
    return this.studentsService.registerPublic(dto);
  }

  @SkipThrottle()
  @Public()
  @Get('public/cursos')
  async publicCourses() {
    const courses = await this.coursesService.findAll();
    return courses.filter(
      (course) => String(course.status || '').toUpperCase() === 'ACTIVE',
    );
  }
}
