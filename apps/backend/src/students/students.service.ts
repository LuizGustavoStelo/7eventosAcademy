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
import { JwtPayload } from '../auth/types/app-role.type';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { UploadsService } from '../uploads/uploads.service';
import { AssignStudentCoursesDto } from './dto/assign-student-courses.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { PublicStudentRegistrationDto } from './dto/public-student-registration.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

const STUDENT_AVATAR_KIND = 'STUDENT_AVATAR';
type StudentActor = Pick<
  JwtPayload,
  'sub' | 'role' | 'activeInstitutionId'
>;

type StudentWithRelations = Prisma.UserGetPayload<{
  include: {
    studentProfile: true;
    studentCourses: {
      include: {
        course: true;
      };
    };
    enrollments: {
      include: {
        schoolClass: {
          include: {
            course: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    private readonly authService: AuthService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  async create(dto: CreateStudentDto, actor: StudentActor) {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);
    const institutionId = await this.resolveInstitutionIdForWrite(actor);
    const ownerAdminId = await this.resolveOwnerAdminIdForInstitution(
      actor,
      institutionId,
    );

    const tempPassword = randomBytes(12).toString('base64url');
    const passwordHash = await hash(tempPassword, 12);

    const student = await this.prisma.user.create({
      data: {
        ownerAdminId,
        institutionId,
        name: dto.name.trim(),
        email,
        passwordHash,
        role: UserRole.USER,
        emailConfirmedAt: null,
      },
      include: {
        studentProfile: true,
        studentCourses: {
          include: { course: true },
        },
        enrollments: {
          include: { schoolClass: { include: { course: true } } },
        },
      },
    });

    await this.authService.sendEmailVerificationCodeByUserId(student.id, {
      ignoreCooldown: true,
      throwOnDeliveryFailure: false,
    });

    return this.mapStudentsWithAvatar([student]).then((items) => items[0]);
  }

  async registerPublic(
    dto: PublicStudentRegistrationDto,
    avatar?: MultipartFile,
    actor?: StudentActor,
  ) {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);

    const documentCpf = this.normalizeCpf(dto.documentCpf);
    const documentRg = dto.documentRg.trim();
    const issuingAuthority = dto.issuingAuthority.trim();
    const phone = this.normalizePhone(dto.phone);
    const birthCity = dto.birthCity.trim();
    const maritalStatus = dto.maritalStatus.trim();
    const address = dto.address.trim();
    const fatherName = dto.fatherName.trim();
    const motherName = dto.motherName.trim();
    const graduation = dto.graduation.trim();
    const graduationConclusionYear = Number(dto.graduationConclusionYear);
    const companyName = dto.companyName.trim();
    const jobTitle = dto.jobTitle.trim();
    const birthDate = new Date(dto.birthDate);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      throw new BadRequestException('Data de nascimento invÃ¡lida.');
    }
    if (
      !Number.isInteger(graduationConclusionYear) ||
      graduationConclusionYear < 1900 ||
      graduationConclusionYear > 9999
    ) {
      throw new BadRequestException('Ano de conclusÃ£o da graduaÃ§Ã£o invÃ¡lido.');
    }

    const existingCpf = await this.prisma.studentProfile.findUnique({
      where: { documentCpf },
      select: { id: true },
    });

    if (existingCpf) {
      throw new BadRequestException('CPF jÃ¡ utilizado em outro cadastro.');
    }

    const uniqueCourseIds = [...new Set(dto.courseIds ?? [])];
    let institutionId = this.resolveInstitutionIdFromActor(actor);
    let ownerAdminId = this.resolveOwnerAdminIdFromActor(actor);

    if (!institutionId && actor && actor.role !== 'user') {
      institutionId = await this.resolveInstitutionIdForWrite(actor);
    }

    if (uniqueCourseIds.length > 0) {
      await this.ensureCoursesExist(uniqueCourseIds, actor);
      const ownership = await this.resolveCourseOwnership(uniqueCourseIds);
      const ownerByCourses = ownership.ownerAdminId;
      const institutionByCourses = ownership.institutionId;

      if (
        institutionId &&
        institutionByCourses &&
        institutionId !== institutionByCourses
      ) {
        throw new BadRequestException(
          'Os cursos informados pertencem a outra conta de professor.',
        );
      }
      institutionId = institutionId ?? institutionByCourses;

      ownerAdminId = ownerAdminId ?? ownerByCourses;
    }

    if (!institutionId) {
      throw new BadRequestException(
        'NÃ£o foi possÃ­vel identificar a instituiÃ§Ã£o do cadastro.',
      );
    }

    if (!ownerAdminId) {
      ownerAdminId = await this.resolveOwnerAdminIdForInstitution(
        actor,
        institutionId,
      );
    }

    const passwordHash = await hash(dto.password, 12);

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ownerAdminId,
          institutionId,
          name: dto.name.trim(),
          email,
          passwordHash,
          role: UserRole.USER,
          emailConfirmedAt: null,
          studentProfile: {
            create: {
              documentCpf,
              documentRg,
              issuingAuthority,
              phone,
              birthDate,
              birthCity,
              maritalStatus,
              fatherName,
              motherName,
              graduation,
              graduationConclusionYear,
              companyName,
              jobTitle,
              zipCode: dto.zipCode,
              street: dto.street ?? address,
              streetNumber: dto.streetNumber,
              complement: dto.complement,
              neighborhood: dto.neighborhood,
              city: dto.city,
              state: dto.state,
            },
          },
          studentCourses:
            uniqueCourseIds.length > 0
              ? {
                  createMany: {
                    data: uniqueCourseIds.map((courseId) => ({
                      courseId,
                      institutionId: institutionId!,
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
          enrollments: {
            include: { schoolClass: { include: { course: true } } },
          },
        },
      });

      return created;
    });

    if (uniqueCourseIds.length > 0) {
      await this.autoEnrollStudentInEligibleClasses({
        studentId: student.id,
        courseIds: uniqueCourseIds,
        actor,
      });
    }

    if (avatar) {
      await this.uploadsService.bindFileToOwner({
        ownerType: UploadOwnerType.STUDENT,
        ownerId: student.id,
        kind: STUDENT_AVATAR_KIND,
        file: avatar,
      });
    }

    await this.authService.sendEmailVerificationCodeByUserId(student.id, {
      ignoreCooldown: true,
      throwOnDeliveryFailure: false,
    });

    return this.findById(student.id, actor);
  }

  async update(studentId: string, dto: UpdateStudentDto, actor: StudentActor) {
    await this.ensureStudentExists(studentId, actor);

    const dataToUpdate: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) dataToUpdate.name = dto.name.trim();

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser && existingUser.id !== studentId) {
        throw new BadRequestException('JÃ¡ existe um usuÃ¡rio com este e-mail.');
      }
      dataToUpdate.email = email;
    }

    if (dto.password) {
      dataToUpdate.passwordHash = await hash(dto.password, 12);
    }

    const profileData: Record<string, any> = {};
    if (dto.documentCpf !== undefined) {
      profileData.documentCpf = dto.documentCpf ? this.normalizeCpf(dto.documentCpf) : null;
    }
    if (dto.documentRg !== undefined) {
      profileData.documentRg = dto.documentRg ? dto.documentRg.trim() : null;
    }
    if (dto.issuingAuthority !== undefined) {
      profileData.issuingAuthority = dto.issuingAuthority ? dto.issuingAuthority.trim() : null;
    }
    if (dto.phone !== undefined) {
      profileData.phone = dto.phone ? this.normalizePhone(dto.phone) : null;
    }
    if (dto.birthDate !== undefined) {
      if (dto.birthDate) {
        const bd = new Date(dto.birthDate);
        if (Number.isNaN(bd.getTime()) || bd > new Date()) {
          throw new BadRequestException('Data de nascimento invÃ¡lida.');
        }
        profileData.birthDate = bd;
      } else {
        profileData.birthDate = null;
      }
    }
    if (dto.birthCity !== undefined) {
      profileData.birthCity = dto.birthCity ? dto.birthCity.trim() : null;
    }
    if (dto.maritalStatus !== undefined) {
      profileData.maritalStatus = dto.maritalStatus ? dto.maritalStatus.trim() : null;
    }
    if (dto.fatherName !== undefined) {
      profileData.fatherName = dto.fatherName ? dto.fatherName.trim() : null;
    }
    if (dto.motherName !== undefined) {
      profileData.motherName = dto.motherName ? dto.motherName.trim() : null;
    }
    if (dto.graduation !== undefined) {
      profileData.graduation = dto.graduation ? dto.graduation.trim() : null;
    }
    if (dto.graduationConclusionYear !== undefined) {
      profileData.graduationConclusionYear =
        dto.graduationConclusionYear ?? null;
    }
    if (dto.companyName !== undefined) {
      profileData.companyName = dto.companyName ? dto.companyName.trim() : null;
    }
    if (dto.jobTitle !== undefined) {
      profileData.jobTitle = dto.jobTitle ? dto.jobTitle.trim() : null;
    }

    if (dto.gender !== undefined) profileData.gender = dto.gender;
    if (dto.guardianName !== undefined) profileData.guardianName = dto.guardianName;
    if (dto.guardianPhone !== undefined) {
      profileData.guardianPhone = dto.guardianPhone ? this.normalizePhone(dto.guardianPhone) : null;
    }
    if (dto.zipCode !== undefined) profileData.zipCode = dto.zipCode;
    if (dto.address !== undefined) {
      profileData.street = dto.address ? dto.address.trim() : null;
    }
    if (dto.street !== undefined) profileData.street = dto.street;
    if (dto.streetNumber !== undefined) profileData.streetNumber = dto.streetNumber;
    if (dto.complement !== undefined) profileData.complement = dto.complement;
    if (dto.neighborhood !== undefined) profileData.neighborhood = dto.neighborhood;
    if (dto.city !== undefined) profileData.city = dto.city;
    if (dto.state !== undefined) profileData.state = dto.state;
    if (dto.country !== undefined) profileData.country = dto.country;
    if (dto.notes !== undefined) profileData.notes = dto.notes;

    if (Object.keys(profileData).length > 0) {
      dataToUpdate.studentProfile = {
        upsert: {
          create: profileData as Prisma.StudentProfileCreateWithoutUserInput,
          update: profileData as Prisma.StudentProfileUpdateWithoutUserInput,
        },
      };
    }

    await this.prisma.$transaction(async (tx) => {
      const ownerAdminId = this.resolveOwnerAdminIdFromActor(actor);
      await tx.user.update({
        where: { id: studentId },
        data: {
          ...dataToUpdate,
          ownerAdmin: ownerAdminId
            ? {
                connect: { id: ownerAdminId },
              }
            : undefined,
        },
      });

      if (dto.courseIds !== undefined) {
        const uniqueCourseIds = [...new Set(dto.courseIds)];
        let institutionByCourseId = new Map<string, string>();
        if (uniqueCourseIds.length > 0) {
          const courses = await tx.course.findMany({
            where: {
              id: { in: uniqueCourseIds },
              ...this.buildOwnedCourseWhere(actor),
            },
            select: {
              id: true,
              institutionId: true,
            },
          });
          if (courses.length !== uniqueCourseIds.length) {
            throw new BadRequestException('Um ou mais cursos informados sÃ£o invÃ¡lidos.');
          }
          institutionByCourseId = new Map(
            courses.map((course) => [course.id, course.institutionId]),
          );
        }

        await tx.studentCourse.deleteMany({
          where: {
            studentId,
            courseId: { notIn: uniqueCourseIds },
          },
        });

        if (uniqueCourseIds.length > 0) {
          await tx.studentCourse.createMany({
            data: uniqueCourseIds.map((courseId) => ({
              studentId,
              courseId,
              institutionId: institutionByCourseId.get(courseId)!,
              status: StudentCourseStatus.INTERESTED,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.findById(studentId, actor);
  }

  async assignCourses(
    studentId: string,
    dto: AssignStudentCoursesDto,
    actor: StudentActor,
  ) {
    await this.ensureStudentExists(studentId, actor);

    const uniqueCourseIds = [...new Set(dto.courseIds)];
    await this.ensureCoursesExist(uniqueCourseIds, actor);
    const courses = await this.prisma.course.findMany({
      where: {
        id: { in: uniqueCourseIds },
        ...this.buildOwnedCourseWhere(actor),
      },
      select: {
        id: true,
        institutionId: true,
      },
    });

    if (courses.length !== uniqueCourseIds.length) {
      throw new BadRequestException('Um ou mais cursos informados sÃ£o invÃ¡lidos.');
    }

    const institutionByCourseId = new Map(
      courses.map((course) => [course.id, course.institutionId]),
    );

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
          institutionId: institutionByCourseId.get(courseId)!,
          status: StudentCourseStatus.INTERESTED,
        })),
        skipDuplicates: true,
      });
    });

    return this.findById(studentId, actor);
  }

  async findAll(actor: StudentActor) {
    const where = this.buildOwnedStudentWhere(actor);
    const students = await this.prisma.user.findMany({
      where: {
        role: UserRole.USER,
        ...where,
      },
      include: {
        studentProfile: true,
        studentCourses: {
          include: { course: true },
        },
        enrollments: {
          include: { schoolClass: { include: { course: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.mapStudentsWithAvatar(students);
  }

  async uploadAvatar(
    studentId: string,
    file: MultipartFile,
    actor: StudentActor,
  ) {
    await this.ensureStudentExists(studentId, actor);

    await this.uploadsService.bindFileToOwner({
      ownerType: UploadOwnerType.STUDENT,
      ownerId: studentId,
      kind: STUDENT_AVATAR_KIND,
      file,
    });

    return this.findById(studentId, actor);
  }

  async removeAvatar(studentId: string, actor: StudentActor) {
    await this.ensureStudentExists(studentId, actor);

    await this.uploadsService.deleteOwnerAssetByKind(
      UploadOwnerType.STUDENT,
      studentId,
      STUDENT_AVATAR_KIND,
    );

    return this.findById(studentId, actor);
  }

  async remove(studentId: string, actor: StudentActor) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.USER,
        ...this.buildOwnedStudentWhere(actor),
      },
      select: {
        id: true,
        name: true,
        enrollments: {
          select: {
            classId: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Aluno nÃ£o encontrado.');
    }

    const enrollmentsByClassId = new Map<string, number>();
    for (const enrollment of student.enrollments) {
      const current = enrollmentsByClassId.get(enrollment.classId) ?? 0;
      enrollmentsByClassId.set(enrollment.classId, current + 1);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [classId, enrollmentCount] of enrollmentsByClassId.entries()) {
        const schoolClass = await tx.schoolClass.findUnique({
          where: { id: classId },
          select: { occupiedSeats: true },
        });

        if (!schoolClass) continue;
        const nextOccupiedSeats = Math.max(
          0,
          Number(schoolClass.occupiedSeats) - enrollmentCount,
        );

        await tx.schoolClass.update({
          where: { id: classId },
          data: { occupiedSeats: nextOccupiedSeats },
        });
      }

      await tx.user.delete({
        where: { id: studentId },
      });
    });

    await this.uploadsService.deleteOwnerAssets(UploadOwnerType.STUDENT, studentId);
    await this.uploadsService.deleteOwnerAssets(UploadOwnerType.USER, studentId);

    return {
      success: true,
      id: student.id,
      name: student.name,
    };
  }

  async importCsv(file: MultipartFile, actor: StudentActor) {
    const content = (await file.toBuffer())
      .toString('utf-8')
      .replace(/^\uFEFF/, '');
    const rows = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rows.length < 2) {
      throw new BadRequestException(
        'CSV invÃ¡lido. Informe cabeÃ§alho e pelo menos uma linha de aluno.',
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
        const created = await this.registerPublic(dto, undefined, actor);
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

  async findById(studentId: string, actor?: StudentActor) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.USER,
        ...this.buildOwnedStudentWhere(actor),
      },
      include: {
        studentProfile: true,
        studentCourses: {
          include: { course: true },
        },
        enrollments: {
          include: { schoolClass: { include: { course: true } } },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Aluno nÃ£o encontrado.');
    }

    const mapped = await this.mapStudentsWithAvatar([student]);
    return mapped[0];
  }

  private async ensureStudentExists(studentId: string, actor?: StudentActor) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.USER,
        ...this.buildOwnedStudentWhere(actor),
      },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Aluno nÃ£o encontrado.');
    }
  }

  private async ensureEmailAvailable(email: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('JÃ¡ existe um usuÃ¡rio com este e-mail.');
    }
  }

  private async ensureCoursesExist(courseIds: string[], actor?: StudentActor) {
    if (courseIds.length === 0) {
      return;
    }

    const total = await this.prisma.course.count({
      where: {
        id: { in: courseIds },
        ...this.buildOwnedCourseWhere(actor),
      },
    });

    if (total !== courseIds.length) {
      throw new BadRequestException(
        'Um ou mais cursos informados sÃ£o invÃ¡lidos.',
      );
    }
  }

  private buildOwnedStudentWhere(actor?: StudentActor): Prisma.UserWhereInput {
    if (actor?.activeInstitutionId) {
      return {
        institutionId: actor.activeInstitutionId,
      };
    }

    if (!actor || actor.role === 'superadmin') {
      return {};
    }

    return {
      ownerAdminId: actor.sub,
    };
  }

  private buildOwnedCourseWhere(actor?: StudentActor): Prisma.CourseWhereInput {
    if (actor?.activeInstitutionId) {
      return {
        institutionId: actor.activeInstitutionId,
      };
    }

    if (!actor || actor.role === 'superadmin') {
      return {};
    }

    return {
      ownerAdminId: actor.sub,
    };
  }

  private resolveOwnerAdminIdFromActor(actor?: StudentActor) {
    if (!actor || actor.role === 'user') {
      return null;
    }

    return actor.sub;
  }

  private resolveInstitutionIdFromActor(actor?: StudentActor) {
    if (!actor) {
      return null;
    }

    return actor.activeInstitutionId ?? null;
  }

  private async resolveInstitutionIdForWrite(actor: StudentActor) {
    if (actor.activeInstitutionId) {
      return actor.activeInstitutionId;
    }

    if (actor.role === 'superadmin') {
      throw new NotFoundException(
        'Selecione uma instituiÃ§Ã£o ativa para criar alunos.',
      );
    }

    const membership = await this.prisma.institutionMember.findFirst({
      where: {
        userId: actor.sub,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
      select: { institutionId: true },
    });

    if (!membership?.institutionId) {
      throw new NotFoundException(
        'Nenhuma instituiÃ§Ã£o ativa foi encontrada para este usuÃ¡rio.',
      );
    }

    return membership.institutionId;
  }

  private async resolveOwnerAdminIdForInstitution(
    actor: StudentActor | undefined,
    institutionId: string,
  ) {
    if (actor?.role === 'admin') {
      return actor.sub;
    }

    const adminMember = await this.prisma.institutionMember.findFirst({
      where: {
        institutionId,
        status: 'ACTIVE',
        user: {
          role: UserRole.ADMIN,
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });

    if (!adminMember?.userId) {
      throw new NotFoundException(
        'NÃ£o hÃ¡ administrador ativo para a instituiÃ§Ã£o selecionada.',
      );
    }

    return adminMember.userId;
  }

  private async resolveCourseOwnership(courseIds: string[]) {
    if (courseIds.length === 0) {
      return { ownerAdminId: null, institutionId: null };
    }

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { ownerAdminId: true, institutionId: true },
    });

    const institutionIds = [...new Set(courses.map((course) => course.institutionId))];
    if (institutionIds.length > 1) {
      throw new BadRequestException(
        'Selecione cursos de apenas uma instituiÃ§Ã£o por cadastro.',
      );
    }

    const ownerIds = [...new Set(courses.map((course) => course.ownerAdminId))];
    return {
      ownerAdminId: ownerIds.length === 1 ? ownerIds[0] ?? null : null,
      institutionId: institutionIds[0] ?? null,
    };
  }

  private normalizeCpf(input: string) {
    const normalized = input.replace(/\D+/g, '');
    if (normalized.length !== 11) {
      throw new BadRequestException('CPF invÃ¡lido.');
    }

    return normalized;
  }

  private normalizePhone(input: string) {
    const normalized = input.replace(/[^\d+]/g, '');
    if (normalized.length < 10) {
      throw new BadRequestException('Telefone invÃ¡lido.');
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
        Array.isArray(student.enrollments) && student.enrollments.length > 0
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
      enrollments: student.enrollments ? student.enrollments.map((enr) => ({
        id: enr.id,
        status: enr.status,
        class: enr.schoolClass,
      })) : [],
    }));
  }

  private resolveStudentStatus(courseStatuses: StudentCourseStatus[], hasEnrollments: boolean = false) {
    if (courseStatuses.length === 0 && !hasEnrollments) {
      return {
        statusKey: 'pending_course',
        statusLabel: 'Sem curso',
      };
    }

    if (
      hasEnrollments || 
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
        statusLabel: 'PrÃ©-matrÃ­cula',
      };
    }

    if (
      courseStatuses.every((status) => status === StudentCourseStatus.COMPLETED)
    ) {
      return {
        statusKey: 'completed',
        statusLabel: 'ConcluÃ­do',
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

  private async autoEnrollStudentInEligibleClasses(input: {
    studentId: string;
    courseIds: string[];
    actor?: StudentActor;
  }) {
    if (input.courseIds.length === 0) return;

    const candidates = await this.prisma.schoolClass.findMany({
      where: {
        courseId: { in: input.courseIds },
        autoEnrollNewStudents: true,
        status: { in: ['PLANNING', 'ENROLLMENTS_OPEN', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        courseId: true,
        startDate: true,
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    const firstClassByCourse = new Map<string, string>();
    for (const schoolClass of candidates) {
      if (!firstClassByCourse.has(schoolClass.courseId)) {
        firstClassByCourse.set(schoolClass.courseId, schoolClass.id);
      }
    }

    for (const courseId of input.courseIds) {
      const classId = firstClassByCourse.get(courseId);
      if (!classId) continue;

      try {
        await this.enrollmentsService.create(
          {
            classId,
            studentId: input.studentId,
          },
          {
            actorUserId: input.actor?.sub,
            actorRole: input.actor?.role,
            actorInstitutionId: input.actor?.activeInstitutionId ?? null,
          },
        );
      } catch (error) {
        if (error instanceof NotFoundException) continue;
        if (error instanceof BadRequestException) {
          const message = String(error.message || '').toLowerCase();
          if (
            message.includes('jÃ¡ matriculado') ||
            message.includes('nao hÃ¡ vagas') ||
            message.includes('nÃ£o hÃ¡ vagas')
          ) {
            continue;
          }
        }
        throw error;
      }
    }
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
    const documentRg = row.rg || row.documentorg || row.documentrg;
    const issuingAuthority = row.orgaoexpedidor || row.issuingauthority;
    const phone = row.telefone || row.phone;
    const birthDateRaw = row.datanascimento || row.birthdate;
    const birthCity = row.cidadequenasceu || row.birthcity;
    const maritalStatus = row.estadocivil || row.maritalstatus;
    const address = row.endereco || row.address || row.rua || row.street;
    const zipCode = row.cep || row.zipcode;
    const fatherName = row.nomedopai || row.fathername;
    const motherName = row.nomedamae || row.mothername;
    const graduation = row.graduacao || row.graduation;
    const graduationConclusionYearRaw =
      row.anodeconclusaodagraduacao || row.graduationconclusionyear;
    const companyName = row.empresaondetrabalha || row.companyname;
    const jobTitle = row.cargo || row.jobtitle;

    if (
      !name ||
      !email ||
      !documentCpf ||
      !documentRg ||
      !issuingAuthority ||
      !phone ||
      !birthDateRaw ||
      !birthCity ||
      !maritalStatus ||
      !address ||
      !zipCode ||
      !fatherName ||
      !motherName ||
      !graduation ||
      !graduationConclusionYearRaw ||
      !companyName ||
      !jobTitle
    ) {
      throw new BadRequestException(
        'Campos obrigatÃ³rios no CSV: nome, email, cpf, rg, orgaoExpedidor, telefone, dataNascimento, cidadeQueNasceu, estadoCivil, endereco, cep, nomeDoPai, nomeDaMae, graduacao, anoDeConclusaoDaGraduacao, empresaOndeTrabalha, cargo.',
      );
    }

    const courseIdsRaw = row.courseids || row.cursos || '';
    const courseIds = courseIdsRaw
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);

    const birthDate = this.normalizeBirthDateFromCsv(birthDateRaw);
    const graduationConclusionYear = Number(graduationConclusionYearRaw);
    if (!Number.isInteger(graduationConclusionYear)) {
      throw new BadRequestException('Ano de conclusÃ£o da graduaÃ§Ã£o invÃ¡lido no CSV.');
    }

    return {
      name,
      email,
      password,
      documentCpf,
      documentRg,
      issuingAuthority,
      phone,
      birthDate,
      birthCity,
      maritalStatus,
      address,
      fatherName,
      motherName,
      graduation,
      graduationConclusionYear,
      companyName,
      jobTitle,
      zipCode,
      street: address,
      streetNumber: row.numero || row.streetnumber || undefined,
      complement: row.complemento || row.complement || undefined,
      neighborhood: row.bairro || row.neighborhood || undefined,
      city: row.cidade || row.city || undefined,
      state: row.estado || row.state || undefined,
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

    throw new BadRequestException('Data de nascimento invÃ¡lida no CSV.');
  }
}

