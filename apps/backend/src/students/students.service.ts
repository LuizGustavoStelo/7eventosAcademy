import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { MultipartFile } from '@fastify/multipart';
import {
  Prisma,
  StudentCourseStatus,
  UploadOwnerType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AssignStudentCoursesDto } from './dto/assign-student-courses.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { PublicStudentRegistrationDto } from './dto/public-student-registration.dto';

const STUDENT_AVATAR_KIND = 'STUDENT_AVATAR';

type StudentWithRelations = Prisma.UserGetPayload<{
  include: {
    studentProfile: true;
    studentCourses: {
      include: {
        course: true;
      };
    };
  };
}>;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(dto: CreateStudentDto) {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);

    const tempPassword = randomBytes(12).toString('base64url');
    const passwordHash = await hash(tempPassword, 12);

    const student = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash,
        role: UserRole.USER,
      },
      include: {
        studentProfile: true,
        studentCourses: {
          include: { course: true },
        },
      },
    });

    return this.mapStudentsWithAvatar([student]).then((items) => items[0]);
  }

  async registerPublic(
    dto: PublicStudentRegistrationDto,
    avatar?: MultipartFile,
  ) {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);

    const documentCpf = this.normalizeCpf(dto.documentCpf);
    const phone = this.normalizePhone(dto.phone);
    const guardianPhone = dto.guardianPhone
      ? this.normalizePhone(dto.guardianPhone)
      : undefined;
    const birthDate = new Date(dto.birthDate);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      throw new BadRequestException('Data de nascimento inválida.');
    }

    const existingCpf = await this.prisma.studentProfile.findUnique({
      where: { documentCpf },
      select: { id: true },
    });

    if (existingCpf) {
      throw new BadRequestException('CPF já utilizado em outro cadastro.');
    }

    const uniqueCourseIds = [...new Set(dto.courseIds ?? [])];
    if (uniqueCourseIds.length > 0) {
      await this.ensureCoursesExist(uniqueCourseIds);
    }

    const passwordHash = await hash(dto.password, 12);

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          role: UserRole.USER,
          studentProfile: {
            create: {
              documentCpf,
              phone,
              birthDate,
              gender: dto.gender,
              guardianName: dto.guardianName,
              guardianPhone,
              zipCode: dto.zipCode,
              street: dto.street,
              streetNumber: dto.streetNumber,
              complement: dto.complement,
              neighborhood: dto.neighborhood,
              city: dto.city,
              state: dto.state,
              country: dto.country,
              notes: dto.notes,
            },
          },
          studentCourses:
            uniqueCourseIds.length > 0
              ? {
                  createMany: {
                    data: uniqueCourseIds.map((courseId) => ({
                      courseId,
                      status: StudentCourseStatus.INTERESTED,
                    })),
                  },
                }
              : undefined,
        },
        include: {
          studentProfile: true,
          studentCourses: {
            include: { course: true },
          },
        },
      });

      return created;
    });

    if (avatar) {
      await this.uploadsService.bindFileToOwner({
        ownerType: UploadOwnerType.STUDENT,
        ownerId: student.id,
        kind: STUDENT_AVATAR_KIND,
        file: avatar,
      });
    }

    return this.findById(student.id);
  }

  async assignCourses(studentId: string, dto: AssignStudentCoursesDto) {
    await this.ensureStudentExists(studentId);

    const uniqueCourseIds = [...new Set(dto.courseIds)];
    await this.ensureCoursesExist(uniqueCourseIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.studentCourse.deleteMany({
        where: {
          studentId,
          courseId: { notIn: uniqueCourseIds },
        },
      });

      await tx.studentCourse.createMany({
        data: uniqueCourseIds.map((courseId) => ({
          studentId,
          courseId,
          status: StudentCourseStatus.INTERESTED,
        })),
        skipDuplicates: true,
      });
    });

    return this.findById(studentId);
  }

  async findAll() {
    const students = await this.prisma.user.findMany({
      where: { role: UserRole.USER },
      include: {
        studentProfile: true,
        studentCourses: {
          include: { course: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.mapStudentsWithAvatar(students);
  }

  async uploadAvatar(studentId: string, file: MultipartFile) {
    await this.ensureStudentExists(studentId);

    await this.uploadsService.bindFileToOwner({
      ownerType: UploadOwnerType.STUDENT,
      ownerId: studentId,
      kind: STUDENT_AVATAR_KIND,
      file,
    });

    return this.findById(studentId);
  }

  async removeAvatar(studentId: string) {
    await this.ensureStudentExists(studentId);

    await this.uploadsService.deleteOwnerAssetByKind(
      UploadOwnerType.STUDENT,
      studentId,
      STUDENT_AVATAR_KIND,
    );

    return this.findById(studentId);
  }

  async importCsv(file: MultipartFile) {
    const content = (await file.toBuffer())
      .toString('utf-8')
      .replace(/^\uFEFF/, '');
    const rows = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rows.length < 2) {
      throw new BadRequestException(
        'CSV inválido. Informe cabeçalho e pelo menos uma linha de aluno.',
      );
    }

    const delimiter = this.detectDelimiter(rows[0]);
    const header = this.parseCsvLine(rows[0], delimiter);
    const headers = this.normalizeHeaders(header);

    const imported: Array<{ line: number; id: string; email: string }> = [];
    const errors: Array<{ line: number; message: string }> = [];

    for (let index = 1; index < rows.length; index += 1) {
      const line = rows[index];
      const values = this.parseCsvLine(line, delimiter);
      const row = this.makeRowObject(headers, values);
      const lineNumber = index + 1;

      try {
        const dto = this.mapCsvRowToRegistrationDto(row);
        const created = await this.registerPublic(dto);
        imported.push({
          line: lineNumber,
          id: created.id,
          email: created.email,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Falha ao importar registro.';
        errors.push({ line: lineNumber, message });
      }
    }

    return {
      totalRows: rows.length - 1,
      importedCount: imported.length,
      failedCount: errors.length,
      imported,
      errors,
    };
  }

  async findById(studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.USER,
      },
      include: {
        studentProfile: true,
        studentCourses: {
          include: { course: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Aluno não encontrado.');
    }

    const mapped = await this.mapStudentsWithAvatar([student]);
    return mapped[0];
  }

  private async ensureStudentExists(studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.USER,
      },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Aluno não encontrado.');
    }
  }

  private async ensureEmailAvailable(email: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Já existe um usuário com este e-mail.');
    }
  }

  private async ensureCoursesExist(courseIds: string[]) {
    if (courseIds.length === 0) {
      return;
    }

    const total = await this.prisma.course.count({
      where: { id: { in: courseIds } },
    });

    if (total !== courseIds.length) {
      throw new BadRequestException(
        'Um ou mais cursos informados são inválidos.',
      );
    }
  }

  private normalizeCpf(input: string) {
    const normalized = input.replace(/\D+/g, '');
    if (normalized.length !== 11) {
      throw new BadRequestException('CPF inválido.');
    }

    return normalized;
  }

  private normalizePhone(input: string) {
    const normalized = input.replace(/[^\d+]/g, '');
    if (normalized.length < 10) {
      throw new BadRequestException('Telefone inválido.');
    }

    return normalized;
  }

  private async mapStudentsWithAvatar(students: StudentWithRelations[]) {
    if (students.length === 0) {
      return [];
    }

    const bindings = await this.prisma.uploadBinding.findMany({
      where: {
        ownerType: UploadOwnerType.STUDENT,
        kind: STUDENT_AVATAR_KIND,
        ownerId: { in: students.map((item) => item.id) },
      },
      include: { asset: true },
    });

    const avatarByStudentId = new Map(
      bindings.map((binding) => [
        binding.ownerId,
        `/api/uploads/assets/${binding.asset.id}`,
      ]),
    );

    return students.map((student) => ({
      ...this.resolveStudentStatus(
        student.studentCourses.map((item) => item.status),
      ),
      id: student.id,
      name: student.name,
      email: student.email,
      role: 'user',
      createdAt: student.createdAt,
      avatarUrl: avatarByStudentId.get(student.id) ?? null,
      profile: student.studentProfile,
      courses: student.studentCourses.map((studentCourse) => ({
        id: studentCourse.id,
        status: studentCourse.status,
        course: studentCourse.course,
      })),
    }));
  }

  private resolveStudentStatus(courseStatuses: StudentCourseStatus[]) {
    if (courseStatuses.length === 0) {
      return {
        statusKey: 'pending_course',
        statusLabel: 'Sem curso',
      };
    }

    if (
      courseStatuses.some((status) => status === StudentCourseStatus.ACTIVE)
    ) {
      return {
        statusKey: 'active',
        statusLabel: 'Ativo',
      };
    }

    if (
      courseStatuses.some((status) => status === StudentCourseStatus.INTERESTED)
    ) {
      return {
        statusKey: 'pre_active',
        statusLabel: 'Pré-matrícula',
      };
    }

    if (
      courseStatuses.every((status) => status === StudentCourseStatus.COMPLETED)
    ) {
      return {
        statusKey: 'completed',
        statusLabel: 'Concluído',
      };
    }

    if (
      courseStatuses.every((status) => status === StudentCourseStatus.CANCELED)
    ) {
      return {
        statusKey: 'inactive',
        statusLabel: 'Inativo',
      };
    }

    return {
      statusKey: 'active',
      statusLabel: 'Ativo',
    };
  }

  private detectDelimiter(headerLine: string) {
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const commaCount = (headerLine.match(/,/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
  }

  private parseCsvLine(line: string, delimiter = ',') {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];

      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current.trim());
    return result;
  }

  private normalizeHeaders(headers: string[]) {
    return headers.map((header) =>
      header
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .replace(/_/g, ''),
    );
  }

  private makeRowObject(headers: string[], values: string[]) {
    return headers.reduce<Record<string, string>>(
      (accumulator, header, index) => {
        accumulator[header] = values[index] ?? '';
        return accumulator;
      },
      {},
    );
  }

  private mapCsvRowToRegistrationDto(
    row: Record<string, string>,
  ): PublicStudentRegistrationDto {
    const name = row.nome || row.name;
    const email = row.email;
    const password =
      row.senha || row.password || randomBytes(8).toString('base64url');
    const documentCpf = row.cpf || row.documentocpf || row.documentcpf;
    const phone = row.telefone || row.phone;
    const birthDateRaw = row.datanascimento || row.birthdate;

    if (!name || !email || !documentCpf || !phone || !birthDateRaw) {
      throw new BadRequestException(
        'Campos obrigatórios no CSV: nome, email, cpf, telefone, dataNascimento.',
      );
    }

    const courseIdsRaw = row.courseids || row.cursos || '';
    const courseIds = courseIdsRaw
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);

    const birthDate = this.normalizeBirthDateFromCsv(birthDateRaw);

    return {
      name,
      email,
      password,
      documentCpf,
      phone,
      birthDate,
      gender: row.genero || row.gender || undefined,
      guardianName: row.nomeresponsavel || row.guardianname || undefined,
      guardianPhone: row.telefoneresponsavel || row.guardianphone || undefined,
      zipCode: row.cep || row.zipcode || undefined,
      street: row.rua || row.street || undefined,
      streetNumber: row.numero || row.streetnumber || undefined,
      complement: row.complemento || row.complement || undefined,
      neighborhood: row.bairro || row.neighborhood || undefined,
      city: row.cidade || row.city || undefined,
      state: row.estado || row.state || undefined,
      country: row.pais || row.country || undefined,
      notes: row.observacoes || row.notes || undefined,
      courseIds,
    };
  }

  private normalizeBirthDateFromCsv(raw: string) {
    const value = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      const [, day, month, year] = brMatch;
      return `${year}-${month}-${day}`;
    }

    throw new BadRequestException('Data de nascimento inválida no CSV.');
  }
}
