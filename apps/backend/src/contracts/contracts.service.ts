import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractInstanceStatus,
  ContractTemplateStatus,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { JwtPayload } from '../auth/types/app-role.type';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateContractTemplateDto } from './dto/create-contract-template.dto';
import { PublishContractTemplateDto } from './dto/publish-contract-template.dto';
import { RequestContractPinDto } from './dto/request-contract-pin.dto';
import { SendContractInstanceDto } from './dto/send-contract-instance.dto';
import { SignContractInstanceDto } from './dto/sign-contract-instance.dto';
import { UpdateContractTemplateDto } from './dto/update-contract-template.dto';

type ContractActor = Pick<
  JwtPayload,
  'sub' | 'role' | 'activeInstitutionId' | 'activePermissionCodes'
>;

type ContractRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
};

type ContractSendContext = {
  publicOrigin?: string | null;
};

const DEFAULT_SIGNING_TOKEN_HOURS = 72;
const MAX_SIGNING_TOKEN_HOURS = 168;
const DEFAULT_PIN_TTL_MINUTES = 10;
const PIN_RESEND_COOLDOWN_SECONDS = 60;
const MAX_PIN_ATTEMPTS = 5;
const PIN_BLOCK_MINUTES = 15;
const DEFAULT_SIGNATURE_TERMS_VERSION = 'v1';
const DEFAULT_SIGNATURE_TERMS_TEXT =
  'Declaro que li e aceito os termos para assinatura eletrônica deste contrato.';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async listTemplates(actor: ContractActor) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const templates = await this.prisma.contractTemplate.findMany({
      where: { institutionId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            title: true,
            publishedAt: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return templates.map((template) => ({
      id: template.id,
      institutionId: template.institutionId,
      name: template.name,
      description: template.description,
      status: template.status,
      draftTitle: template.draftTitle,
      draftHtmlContent: template.draftHtmlContent,
      latestVersionNumber: template.latestVersionNumber,
      publishedAt: template.publishedAt,
      updatedAt: template.updatedAt,
      latestVersion: template.versions[0] ?? null,
    }));
  }

  async createTemplate(dto: CreateContractTemplateDto, actor: ContractActor) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const sanitizedHtml = this.sanitizeContractHtml(dto.draftHtmlContent);

    const template = await this.prisma.contractTemplate.create({
      data: {
        institutionId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: ContractTemplateStatus.DRAFT,
        draftTitle: dto.draftTitle.trim(),
        draftHtmlContent: sanitizedHtml,
        createdByUserId: actor.sub,
        updatedByUserId: actor.sub,
      },
    });

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      status: template.status,
      draftTitle: template.draftTitle,
      latestVersionNumber: template.latestVersionNumber,
      publishedAt: template.publishedAt,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  async updateTemplate(
    templateId: string,
    dto: UpdateContractTemplateDto,
    actor: ContractActor,
  ) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const existing = await this.prisma.contractTemplate.findFirst({
      where: { id: templateId, institutionId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Modelo de contrato não encontrado.');
    }

    if (existing.status === ContractTemplateStatus.PUBLISHED) {
      throw new BadRequestException(
        'Modelos publicados não podem ser alterados diretamente.',
      );
    }

    const data: Prisma.ContractTemplateUpdateInput = {
      updatedByUser: { connect: { id: actor.sub } },
    };

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.draftTitle !== undefined) data.draftTitle = dto.draftTitle.trim();
    if (dto.draftHtmlContent !== undefined) {
      data.draftHtmlContent = this.sanitizeContractHtml(dto.draftHtmlContent);
    }

    const updated = await this.prisma.contractTemplate.update({
      where: { id: templateId },
      data,
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      draftTitle: updated.draftTitle,
      latestVersionNumber: updated.latestVersionNumber,
      publishedAt: updated.publishedAt,
      updatedAt: updated.updatedAt,
    };
  }

  async publishTemplate(
    templateId: string,
    dto: PublishContractTemplateDto,
    actor: ContractActor,
  ) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const existing = await this.prisma.contractTemplate.findFirst({
      where: { id: templateId, institutionId },
      select: {
        id: true,
        status: true,
        latestVersionNumber: true,
        draftTitle: true,
        draftHtmlContent: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Modelo de contrato não encontrado.');
    }

    if (existing.status === ContractTemplateStatus.ARCHIVED) {
      throw new BadRequestException('Modelo arquivado não pode ser publicado.');
    }

    const title = (dto.title ?? existing.draftTitle).trim();
    const htmlContent = this.sanitizeContractHtml(
      dto.htmlContent ?? existing.draftHtmlContent,
    );
    if (!title || !htmlContent) {
      throw new BadRequestException(
        'Título e conteúdo são obrigatórios para publicar.',
      );
    }

    const nextVersion = existing.latestVersionNumber + 1;
    const contentHash = this.sha256(htmlContent);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const version = await tx.contractTemplateVersion.create({
        data: {
          institutionId,
          templateId,
          versionNumber: nextVersion,
          title,
          htmlContent,
          placeholdersJson: dto.placeholdersJson
            ? (dto.placeholdersJson as Prisma.InputJsonValue)
            : Prisma.DbNull,
          contentHash,
          publishedByUserId: actor.sub,
          publishedAt: now,
        },
      });

      const template = await tx.contractTemplate.update({
        where: { id: templateId },
        data: {
          status: ContractTemplateStatus.PUBLISHED,
          latestVersionNumber: nextVersion,
          publishedAt: now,
          draftTitle: title,
          draftHtmlContent: htmlContent,
          updatedByUserId: actor.sub,
        },
      });

      return { template, version };
    });

    return {
      templateId: result.template.id,
      status: result.template.status,
      latestVersionNumber: result.template.latestVersionNumber,
      publishedAt: result.template.publishedAt,
      version: {
        id: result.version.id,
        versionNumber: result.version.versionNumber,
        title: result.version.title,
        contentHash: result.version.contentHash,
      },
    };
  }

  async listInstances(
    actor: ContractActor,
    filters?: {
      status?: string;
      studentId?: string;
      templateId?: string;
    },
  ) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const status = this.parseInstanceStatus(filters?.status);

    const instances = await this.prisma.contractInstance.findMany({
      where: {
        institutionId,
        status: status ?? undefined,
        studentId: filters?.studentId || undefined,
        templateId: filters?.templateId || undefined,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
          },
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return instances.map((instance) => ({
      id: instance.id,
      status: instance.status,
      sentAt: instance.sentAt,
      viewedAt: instance.viewedAt,
      signedAt: instance.signedAt,
      signatureCode: instance.signatureCode,
      template: instance.template,
      templateVersion: instance.templateVersion,
      student: {
        id: instance.student.id,
        name: instance.student.name,
        emailMasked: this.maskEmail(instance.student.email),
      },
    }));
  }

  async getInstanceDetails(instanceId: string, actor: ContractActor) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const includeAudit = new Set(actor.activePermissionCodes ?? []).has(
      'contracts.audit.read',
    );

    const instance = await this.prisma.contractInstance.findFirst({
      where: { id: instanceId, institutionId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
          },
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true,
          },
        },
        auditLogs: includeAudit
          ? {
              orderBy: { createdAt: 'asc' },
            }
          : false,
      },
    });

    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    return {
      id: instance.id,
      status: instance.status,
      sentAt: instance.sentAt,
      viewedAt: instance.viewedAt,
      signedAt: instance.signedAt,
      signatureCode: instance.signatureCode,
      snapshotTemplateTitle: instance.snapshotTemplateTitle,
      documentHtml:
        instance.status === ContractInstanceStatus.SIGNED &&
        instance.signedHtmlSnapshot
          ? instance.signedHtmlSnapshot
          : instance.unsignedHtmlSnapshot,
      student: {
        id: instance.student.id,
        name: instance.student.name,
        emailMasked: this.maskEmail(instance.student.email),
      },
      template: instance.template,
      templateVersion: instance.templateVersion,
      auditLogs: includeAudit ? instance.auditLogs : undefined,
    };
  }

  async sendInstance(
    dto: SendContractInstanceDto,
    actor: ContractActor,
    context?: ContractSendContext,
  ) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const template = await this.prisma.contractTemplate.findFirst({
      where: {
        id: dto.templateId,
        institutionId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        latestVersionNumber: true,
      },
    });
    if (!template) {
      throw new NotFoundException('Modelo de contrato não encontrado.');
    }

    if (
      template.status !== ContractTemplateStatus.PUBLISHED ||
      template.latestVersionNumber <= 0
    ) {
      throw new BadRequestException(
        'O modelo precisa estar publicado antes do envio.',
      );
    }

    const templateVersion = await this.prisma.contractTemplateVersion.findFirst({
      where: {
        institutionId,
        templateId: template.id,
        versionNumber: template.latestVersionNumber,
      },
    });
    if (!templateVersion) {
      throw new NotFoundException(
        'Versão publicada do modelo não foi encontrada.',
      );
    }

    const student = await this.prisma.user.findFirst({
      where: {
        id: dto.studentId,
        role: UserRole.USER,
        institutionId,
      },
      include: {
        studentProfile: {
          select: {
            documentCpf: true,
            documentRg: true,
            issuingAuthority: true,
            phone: true,
            birthDate: true,
            birthCity: true,
            maritalStatus: true,
            fatherName: true,
            motherName: true,
            graduation: true,
            graduationConclusionYear: true,
            companyName: true,
            jobTitle: true,
            zipCode: true,
            street: true,
            streetNumber: true,
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Aluno não encontrado nesta instituição.');
    }

    let courseName = '';
    let className = '';
    if (dto.courseId) {
      const course = await this.prisma.course.findFirst({
        where: { id: dto.courseId, institutionId },
        select: { id: true, name: true },
      });
      if (!course) {
        throw new NotFoundException('Curso informado não encontrado.');
      }
      courseName = course.name;
    }

    if (dto.classId) {
      const schoolClass = await this.prisma.schoolClass.findFirst({
        where: { id: dto.classId, institutionId },
        select: { id: true, name: true },
      });
      if (!schoolClass) {
        throw new NotFoundException('Turma informada não encontrada.');
      }
      className = schoolClass.name;
    }

    if (dto.enrollmentId) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          id: dto.enrollmentId,
          institutionId,
          studentId: dto.studentId,
        },
        select: { id: true },
      });
      if (!enrollment) {
        throw new NotFoundException(
          'Matrícula informada não encontrada para este aluno.',
        );
      }
    }

    const now = new Date();
    const installments = await this.resolveInstallmentsForContract(
      institutionId,
      dto.enrollmentId ?? null,
    );
    const installmentsTableHtml =
      installments.length > 0
        ? this.buildInstallmentsTableHtml(installments)
        : '';
    const installmentsText =
      installments.length > 0
        ? installments
            .map(
              (item) =>
                `Parcela ${item.number} - vencimento ${item.dueDateLabel} - ${item.amountLabel}`,
            )
            .join('\n')
        : '';

    const signatureCode = await this.generateUniqueSignatureCode();
    const unsignedHtmlSnapshot = this.renderTemplate(
      templateVersion.htmlContent,
      {
        student_name: student.name,
        student_email: student.email,
        student_document: student.studentProfile?.documentCpf || '',
        student_cpf: student.studentProfile?.documentCpf || '',
        student_rg: student.studentProfile?.documentRg || '',
        student_issuing_authority: student.studentProfile?.issuingAuthority || '',
        student_phone: student.studentProfile?.phone || '',
        student_birth_date: this.formatDatePtBr(student.studentProfile?.birthDate),
        student_birth_city: student.studentProfile?.birthCity || '',
        student_marital_status: student.studentProfile?.maritalStatus || '',
        student_father_name: student.studentProfile?.fatherName || '',
        student_mother_name: student.studentProfile?.motherName || '',
        student_graduation: student.studentProfile?.graduation || '',
        student_graduation_conclusion_year: student.studentProfile?.graduationConclusionYear
          ? String(student.studentProfile.graduationConclusionYear)
          : '',
        student_company_name: student.studentProfile?.companyName || '',
        student_job_title: student.studentProfile?.jobTitle || '',
        student_zip_code: student.studentProfile?.zipCode || '',
        student_address: student.studentProfile?.street || '',
        student_street_number: student.studentProfile?.streetNumber || '',
        course_name: courseName,
        class_name: className,
        enrollment_id: dto.enrollmentId || '',
        financial_installments_count:
          installments.length > 0 ? String(installments.length) : '0',
        financial_installments_text: installmentsText,
        financial_installments_table_html: installmentsTableHtml,
        financial_installments_rows_html: installmentsTableHtml,
        contract_sign_city: this.resolveContractCity(),
        contract_issue_date: this.formatDatePtBr(now),
        contract_issue_date_long: this.formatDateLongPtBr(now),
        contract_issue_datetime: this.formatDateTimePtBr(now),
        signed_by_name: '',
        signed_at: '',
        signature_code: signatureCode,
        aluno_nome: student.name,
        aluno_email: student.email,
        aluno_documento: student.studentProfile?.documentCpf || '',
        aluno_cpf: student.studentProfile?.documentCpf || '',
        aluno_rg: student.studentProfile?.documentRg || '',
        aluno_orgao_expedidor: student.studentProfile?.issuingAuthority || '',
        aluno_telefone: student.studentProfile?.phone || '',
        aluno_data_nascimento: this.formatDatePtBr(student.studentProfile?.birthDate),
        aluno_cidade_nascimento: student.studentProfile?.birthCity || '',
        aluno_estado_civil: student.studentProfile?.maritalStatus || '',
        aluno_nome_pai: student.studentProfile?.fatherName || '',
        aluno_nome_mae: student.studentProfile?.motherName || '',
        aluno_graduacao: student.studentProfile?.graduation || '',
        aluno_ano_conclusao_graduacao: student.studentProfile?.graduationConclusionYear
          ? String(student.studentProfile.graduationConclusionYear)
          : '',
        aluno_empresa: student.studentProfile?.companyName || '',
        aluno_cargo: student.studentProfile?.jobTitle || '',
        aluno_cep: student.studentProfile?.zipCode || '',
        aluno_endereco: student.studentProfile?.street || '',
        aluno_numero_endereco: student.studentProfile?.streetNumber || '',
        curso_nome: courseName,
        turma_nome: className,
        matricula_id: dto.enrollmentId || '',
        financeiro_parcelas_total:
          installments.length > 0 ? String(installments.length) : '0',
        financeiro_parcelas_texto: installmentsText,
        financeiro_parcelas_tabela_html: installmentsTableHtml,
        contrato_cidade_assinatura: this.resolveContractCity(),
        contrato_data_emissao: this.formatDatePtBr(now),
        contrato_data_emissao_extenso: this.formatDateLongPtBr(now),
        contrato_datahora_emissao: this.formatDateTimePtBr(now),
        assinado_por_nome: '',
        assinado_em: '',
        codigo_assinatura: signatureCode,
      },
    );
    const unsignedContentHash = this.sha256(unsignedHtmlSnapshot);
    const tokenHours = Math.min(
      dto.expiresInHours ?? DEFAULT_SIGNING_TOKEN_HOURS,
      MAX_SIGNING_TOKEN_HOURS,
    );
    const expiresAt = new Date(now.getTime() + tokenHours * 60 * 60 * 1000);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.sha256(rawToken);

    const txResult = await this.prisma.$transaction(async (tx) => {
      const instance = await tx.contractInstance.create({
        data: {
          institutionId,
          templateId: template.id,
          templateVersionId: templateVersion.id,
          studentId: student.id,
          enrollmentId: dto.enrollmentId ?? null,
          courseId: dto.courseId ?? null,
          classId: dto.classId ?? null,
          status: ContractInstanceStatus.SENT,
          sentAt: now,
          snapshotTemplateTitle: templateVersion.title,
          snapshotTemplateHtml: templateVersion.htmlContent,
          snapshotStudentData: {
            name: student.name,
            email: student.email,
            documentCpf: student.studentProfile?.documentCpf || null,
            documentRg: student.studentProfile?.documentRg || null,
            issuingAuthority: student.studentProfile?.issuingAuthority || null,
            phone: student.studentProfile?.phone || null,
            birthDate: student.studentProfile?.birthDate
              ? student.studentProfile.birthDate.toISOString()
              : null,
            birthCity: student.studentProfile?.birthCity || null,
            maritalStatus: student.studentProfile?.maritalStatus || null,
            fatherName: student.studentProfile?.fatherName || null,
            motherName: student.studentProfile?.motherName || null,
            graduation: student.studentProfile?.graduation || null,
            graduationConclusionYear:
              student.studentProfile?.graduationConclusionYear ?? null,
            companyName: student.studentProfile?.companyName || null,
            jobTitle: student.studentProfile?.jobTitle || null,
            zipCode: student.studentProfile?.zipCode || null,
            street: student.studentProfile?.street || null,
            streetNumber: student.studentProfile?.streetNumber || null,
          } as Prisma.InputJsonValue,
          unsignedHtmlSnapshot,
          unsignedContentHash,
          signatureCode,
          createdByUserId: actor.sub,
        },
      });

      const signingToken = await tx.contractSigningToken.create({
        data: {
          institutionId,
          contractInstanceId: instance.id,
          tokenHash,
          expiresAt,
          otpChannel: 'email',
          otpDestination: student.email,
        },
      });

      await this.appendAudit(tx, {
        institutionId,
        contractInstanceId: instance.id,
        contractSigningTokenId: signingToken.id,
        action: 'contract_sent',
        actorType: 'admin',
        actorUserId: actor.sub,
        payload: {
          templateId: template.id,
          templateVersionId: templateVersion.id,
          studentId: student.id,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return {
        instanceId: instance.id,
        sentAt: instance.sentAt,
      };
    });

    const signingLink = this.buildSigningLink(
      rawToken,
      txResult.instanceId,
      context?.publicOrigin,
    );
    let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
    if (dto.sendEmail !== false) {
      try {
        await this.mailService.sendContractInvitationEmail({
          to: student.email,
          recipientName: student.name,
          templateTitle: templateVersion.title,
          signingLink,
          expiresAtIso: expiresAt.toISOString(),
        });
        emailStatus = 'sent';
      } catch {
        emailStatus = 'failed';
      }
    }

    return {
      instanceId: txResult.instanceId,
      sentAt: txResult.sentAt,
      signatureCode,
      tokenExpiresAt: expiresAt.toISOString(),
      signingLink,
      emailStatus,
      student: {
        id: student.id,
        name: student.name,
        emailMasked: this.maskEmail(student.email),
      },
      template: {
        id: template.id,
        name: template.name,
        version: templateVersion.versionNumber,
      },
    };
  }

  async deleteInstance(instanceId: string, actor: ContractActor) {
    const institutionId = this.requireActiveInstitutionId(actor);

    if (!this.isContractDeletionEnabled()) {
      throw new BadRequestException(
        'A exclusão de contratos está desativada nesta instituição.',
      );
    }

    const existing = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        institutionId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    await this.prisma.contractInstance.delete({
      where: { id: existing.id },
    });

    return {
      success: true,
      deletedId: existing.id,
    };
  }

  async listMyInstances(actor: ContractActor) {
    const instances = await this.prisma.contractInstance.findMany({
      where: {
        studentId: actor.sub,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
          },
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true,
          },
        },
      },
      orderBy: [{ sentAt: 'desc' }],
    });

    return instances.map((instance) => ({
      id: instance.id,
      status: instance.status,
      sentAt: instance.sentAt,
      viewedAt: instance.viewedAt,
      signedAt: instance.signedAt,
      signatureCode: instance.signatureCode,
      template: instance.template,
      templateVersion: instance.templateVersion,
    }));
  }

  async resolveSigningToken(rawToken: string) {
    const now = new Date();
    const tokenHash = this.sha256(String(rawToken || '').trim());
    if (!tokenHash) {
      throw new BadRequestException('Token de assinatura inválido.');
    }

    const token = await this.prisma.contractSigningToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: now },
      },
      include: {
        contractInstance: {
          select: {
            id: true,
            status: true,
            studentId: true,
          },
        },
      },
    });

    if (!token) {
      throw new BadRequestException('Token de assinatura inválido ou expirado.');
    }

    return {
      instanceId: token.contractInstance.id,
      status: token.contractInstance.status,
      expiresAt: token.expiresAt.toISOString(),
      usedAt: token.usedAt?.toISOString() ?? null,
      studentId: token.contractInstance.studentId,
    };
  }

  async getInstanceDownload(instanceId: string, actor: ContractActor) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const instance = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        institutionId,
      },
      select: {
        id: true,
        status: true,
        signatureCode: true,
        snapshotTemplateTitle: true,
        unsignedHtmlSnapshot: true,
        signedHtmlSnapshot: true,
      },
    });

    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const htmlContent =
      instance.status === ContractInstanceStatus.SIGNED && instance.signedHtmlSnapshot
        ? instance.signedHtmlSnapshot
        : instance.unsignedHtmlSnapshot;

    return {
      instanceId: instance.id,
      signatureCode: instance.signatureCode,
      title: instance.snapshotTemplateTitle,
      status: instance.status,
      htmlContent,
    };
  }

  async getMyInstanceDownload(instanceId: string, actor: ContractActor) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        studentId: actor.sub,
      },
      select: {
        id: true,
        status: true,
        signatureCode: true,
        snapshotTemplateTitle: true,
        unsignedHtmlSnapshot: true,
        signedHtmlSnapshot: true,
      },
    });

    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const htmlContent =
      instance.status === ContractInstanceStatus.SIGNED && instance.signedHtmlSnapshot
        ? instance.signedHtmlSnapshot
        : instance.unsignedHtmlSnapshot;

    return {
      instanceId: instance.id,
      signatureCode: instance.signatureCode,
      title: instance.snapshotTemplateTitle,
      status: instance.status,
      htmlContent,
    };
  }

  async getMyInstanceById(instanceId: string, actor: ContractActor) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        studentId: actor.sub,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
          },
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true,
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    if (
      instance.status === ContractInstanceStatus.SENT &&
      instance.viewedAt === null
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.contractInstance.update({
          where: { id: instance.id },
          data: {
            status: ContractInstanceStatus.VIEWED,
            viewedAt: new Date(),
          },
        });

        await this.appendAudit(tx, {
          institutionId: instance.institutionId,
          contractInstanceId: instance.id,
          action: 'contract_viewed',
          actorType: 'student',
          actorUserId: actor.sub,
        });
      });
    }

    const refreshed = await this.prisma.contractInstance.findUnique({
      where: { id: instance.id },
      include: {
        template: {
          select: {
            id: true,
            name: true,
          },
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true,
          },
        },
      },
    });

    if (!refreshed) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    return {
      id: refreshed.id,
      status: refreshed.status,
      sentAt: refreshed.sentAt,
      viewedAt: refreshed.viewedAt,
      signedAt: refreshed.signedAt,
      signatureCode: refreshed.signatureCode,
      acceptedAt: refreshed.acceptedAt,
      acceptedTermsVersion: refreshed.acceptedTermsVersion,
      template: refreshed.template,
      templateVersion: refreshed.templateVersion,
      documentHtml:
        refreshed.status === ContractInstanceStatus.SIGNED &&
        refreshed.signedHtmlSnapshot
          ? refreshed.signedHtmlSnapshot
          : refreshed.unsignedHtmlSnapshot,
    };
  }

  async requestMyPin(
    instanceId: string,
    dto: RequestContractPinDto,
    actor: ContractActor,
  ) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        studentId: actor.sub,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    if (instance.status === ContractInstanceStatus.SIGNED) {
      throw new BadRequestException('Este contrato já foi assinado.');
    }
    if (instance.status === ContractInstanceStatus.ARCHIVED) {
      throw new BadRequestException('Este contrato está arquivado.');
    }
    if (instance.status === ContractInstanceStatus.CANCELED) {
      throw new BadRequestException('Este contrato foi cancelado.');
    }

    const channel = dto.channel ?? 'email';
    if (channel !== 'email') {
      throw new BadRequestException('Canal de OTP não suportado.');
    }

    const pinCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const pinHash = await hash(pinCode, 10);
    const now = new Date();
    const pinExpiresAt = new Date(
      now.getTime() + DEFAULT_PIN_TTL_MINUTES * 60 * 1000,
    );

    const token = await this.prisma.$transaction(async (tx) => {
      const activeToken = await tx.contractSigningToken.findFirst({
        where: {
          contractInstanceId: instance.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: [{ createdAt: 'desc' }],
      });

      if (
        activeToken?.pinHash &&
        activeToken.pinExpiresAt &&
        activeToken.pinExpiresAt > now
      ) {
        const elapsedMs = now.getTime() - activeToken.updatedAt.getTime();
        const cooldownMs = PIN_RESEND_COOLDOWN_SECONDS * 1000;
        if (elapsedMs < cooldownMs) {
          const waitSeconds = Math.max(
            1,
            Math.ceil((cooldownMs - elapsedMs) / 1000),
          );
          throw new BadRequestException(
            `Aguarde ${waitSeconds} segundo(s) para solicitar novo PIN.`,
          );
        }
      }

      const currentToken =
        activeToken ??
        (await tx.contractSigningToken.create({
          data: {
            institutionId: instance.institutionId,
            contractInstanceId: instance.id,
            tokenHash: this.sha256(randomBytes(32).toString('base64url')),
            expiresAt: new Date(
              now.getTime() + DEFAULT_SIGNING_TOKEN_HOURS * 60 * 60 * 1000,
            ),
            otpChannel: channel,
            otpDestination: instance.student.email,
          },
        }));

      const updatedToken = await tx.contractSigningToken.update({
        where: { id: currentToken.id },
        data: {
          otpChannel: channel,
          otpDestination: instance.student.email,
          pinHash,
          pinExpiresAt,
          pinAttempts: 0,
          pinLastAttemptAt: null,
          pinBlockedUntil: null,
          verifiedAt: null,
        },
      });

      await this.appendAudit(tx, {
        institutionId: instance.institutionId,
        contractInstanceId: instance.id,
        contractSigningTokenId: updatedToken.id,
        action: 'otp_sent',
        actorType: 'student',
        actorUserId: actor.sub,
        payload: {
          channel,
          destinationMasked: this.maskEmail(instance.student.email),
          pinExpiresAt: pinExpiresAt.toISOString(),
        },
      });

      return updatedToken;
    });

    await this.mailService.sendContractSigningPinEmail({
      to: instance.student.email,
      recipientName: instance.student.name,
      templateTitle: instance.snapshotTemplateTitle,
      pinCode,
      expiresInMinutes: DEFAULT_PIN_TTL_MINUTES,
    });

    return {
      tokenId: token.id,
      channel,
      destinationMasked: this.maskEmail(instance.student.email),
      pinExpiresAt: pinExpiresAt.toISOString(),
    };
  }

  async verifyMyPin(instanceId: string, pin: string, actor: ContractActor) {
    const now = new Date();
    const instance = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        studentId: actor.sub,
      },
      select: {
        id: true,
        institutionId: true,
        status: true,
      },
    });
    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    if (instance.status === ContractInstanceStatus.SIGNED) {
      throw new BadRequestException('Este contrato já foi assinado.');
    }

    const token = await this.prisma.contractSigningToken.findFirst({
      where: {
        contractInstanceId: instance.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (!token) {
      throw new BadRequestException(
        'Token de assinatura inválido ou expirado. Solicite novo código.',
      );
    }

    if (token.pinBlockedUntil && token.pinBlockedUntil > now) {
      throw new BadRequestException(
        'Validação temporariamente bloqueada por tentativas inválidas.',
      );
    }

    if (!token.pinHash || !token.pinExpiresAt || token.pinExpiresAt <= now) {
      throw new BadRequestException('PIN inválido ou expirado.');
    }

    const validPin = await compare(pin, token.pinHash);
    if (!validPin) {
      const attempts = token.pinAttempts + 1;
      const blockedUntil =
        attempts >= MAX_PIN_ATTEMPTS
          ? new Date(now.getTime() + PIN_BLOCK_MINUTES * 60 * 1000)
          : null;

      await this.prisma.$transaction(async (tx) => {
        await tx.contractSigningToken.update({
          where: { id: token.id },
          data: {
            pinAttempts: attempts,
            pinLastAttemptAt: now,
            pinBlockedUntil: blockedUntil,
          },
        });
        await this.appendAudit(tx, {
          institutionId: instance.institutionId,
          contractInstanceId: instance.id,
          contractSigningTokenId: token.id,
          action: 'otp_validation_failed',
          actorType: 'student',
          actorUserId: actor.sub,
          payload: {
            attempts,
            blockedUntil: blockedUntil?.toISOString() ?? null,
          },
        });
      });

      throw new BadRequestException('PIN inválido.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contractSigningToken.update({
        where: { id: token.id },
        data: {
          pinAttempts: 0,
          pinLastAttemptAt: now,
          pinBlockedUntil: null,
          verifiedAt: now,
        },
      });

      if (
        instance.status === ContractInstanceStatus.SENT ||
        instance.status === ContractInstanceStatus.VIEWED
      ) {
        await tx.contractInstance.update({
          where: { id: instance.id },
          data: {
            status: ContractInstanceStatus.PIN_VERIFIED,
          },
        });
      }

      await this.appendAudit(tx, {
        institutionId: instance.institutionId,
        contractInstanceId: instance.id,
        contractSigningTokenId: token.id,
        action: 'otp_validated',
        actorType: 'student',
        actorUserId: actor.sub,
      });
    });

    return {
      verified: true,
      message: 'PIN validado com sucesso.',
    };
  }

  async signMyInstance(
    instanceId: string,
    dto: SignContractInstanceDto,
    actor: ContractActor,
    context: ContractRequestContext,
  ) {
    if (!dto.acceptTerms) {
      throw new BadRequestException(
        'É necessário aceitar os termos antes de assinar.',
      );
    }

    const now = new Date();
    const instance = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        studentId: actor.sub,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    if (instance.status === ContractInstanceStatus.SIGNED) {
      throw new BadRequestException('Este contrato já foi assinado.');
    }

    const token = await this.prisma.contractSigningToken.findFirst({
      where: {
        contractInstanceId: instance.id,
        usedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (!token || !token.verifiedAt || token.expiresAt <= now) {
      throw new BadRequestException(
        'Validação por PIN obrigatória antes da assinatura.',
      );
    }

    const signerName = dto.signerName?.trim() || instance.student.name;
    const signatureData = this.normalizeSignatureDataUrl(dto.signatureData);
    if (!signatureData) {
      throw new BadRequestException('Assinatura desenhada inválida.');
    }
    const acceptedTermsText =
      dto.acceptedTermsText?.trim() || DEFAULT_SIGNATURE_TERMS_TEXT;
    const acceptedTermsVersion =
      dto.acceptedTermsVersion?.trim() || DEFAULT_SIGNATURE_TERMS_VERSION;

    const signedHtmlSnapshot = this.buildSignedHtml(instance.unsignedHtmlSnapshot, {
      signerName,
      signedAt: now,
      signatureCode: instance.signatureCode,
      signatureData,
    });
    const signedContentHash = this.sha256(signedHtmlSnapshot);
    const signedPdfHash = this.sha256(`pdf:${signedHtmlSnapshot}`);
    const signatureImageHash = this.sha256(signatureData);

    await this.prisma.$transaction(async (tx) => {
      await tx.contractInstance.update({
        where: { id: instance.id },
        data: {
          status: ContractInstanceStatus.SIGNED,
          signedAt: now,
          signedHtmlSnapshot,
          signedContentHash,
          signedPdfHash,
          acceptedTermsText,
          acceptedTermsVersion,
          acceptedAt: now,
          signerIp: this.safeTrim(context.ip),
          signerUserAgent: this.safeTrim(context.userAgent),
          signerTimezone: this.safeTrim(dto.signerTimezone),
          signerOtpChannel: token.otpChannel,
          signerOtpDestinationMasked: this.maskEmail(token.otpDestination || ''),
        },
      });

      await tx.contractSigningToken.update({
        where: { id: token.id },
        data: {
          usedAt: now,
        },
      });

      await tx.contractArtifact.createMany({
        data: [
          {
            institutionId: instance.institutionId,
            contractInstanceId: instance.id,
            artifactType: 'unsigned_html',
            storageProvider: 'db',
            storageKey: `contract-instance/${instance.id}/unsigned-html`,
            mimeType: 'text/html',
            sizeBytes: Buffer.byteLength(instance.unsignedHtmlSnapshot, 'utf-8'),
            sha256: instance.unsignedContentHash,
          },
          {
            institutionId: instance.institutionId,
            contractInstanceId: instance.id,
            artifactType: 'signed_html',
            storageProvider: 'db',
            storageKey: `contract-instance/${instance.id}/signed-html`,
            mimeType: 'text/html',
            sizeBytes: Buffer.byteLength(signedHtmlSnapshot, 'utf-8'),
            sha256: signedContentHash,
          },
        ],
        skipDuplicates: true,
      });

      await this.appendAudit(tx, {
        institutionId: instance.institutionId,
        contractInstanceId: instance.id,
        contractSigningTokenId: token.id,
        action: 'contract_signed',
        actorType: 'student',
        actorUserId: actor.sub,
        payload: {
          signedAt: now.toISOString(),
          signerName,
          signatureCode: instance.signatureCode,
          signedContentHash,
          signedPdfHash,
          signatureImageHash,
          termsVersion: acceptedTermsVersion,
        },
      });
    });

    return {
      id: instance.id,
      status: ContractInstanceStatus.SIGNED,
      signedAt: now.toISOString(),
      signatureCode: instance.signatureCode,
      signedContentHash,
      signedPdfHash,
    };
  }

  private requireActiveInstitutionId(actor: ContractActor): string {
    const institutionId = actor.activeInstitutionId ?? null;
    if (!institutionId) {
      throw new BadRequestException(
        'Selecione uma instituição ativa para acessar contratos.',
      );
    }

    return institutionId;
  }

  private isContractDeletionEnabled(): boolean {
    const raw = String(
      this.configService.get<string>('CONTRACTS_ALLOW_DELETE') ?? 'true',
    )
      .trim()
      .toLowerCase();

    if (!raw) return true;
    return !['0', 'false', 'off', 'no', 'n'].includes(raw);
  }

  private parseInstanceStatus(
    status?: string,
  ): ContractInstanceStatus | undefined {
    if (!status) return undefined;
    const normalized = status.trim().toLowerCase();
    const map: Record<string, ContractInstanceStatus> = {
      sent: ContractInstanceStatus.SENT,
      viewed: ContractInstanceStatus.VIEWED,
      pin_verified: ContractInstanceStatus.PIN_VERIFIED,
      signed: ContractInstanceStatus.SIGNED,
      expired: ContractInstanceStatus.EXPIRED,
      archived: ContractInstanceStatus.ARCHIVED,
      canceled: ContractInstanceStatus.CANCELED,
    };
    const mapped = map[normalized];
    if (!mapped) {
      throw new BadRequestException('Status de contrato inválido.');
    }
    return mapped;
  }

  private sanitizeContractHtml(value: string): string {
    const input = String(value ?? '');
    const withoutDangerousTags = input.replace(
      /<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      '',
    );
    const withoutInlineEvents = withoutDangerousTags
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
    const withoutJsUrls = withoutInlineEvents.replace(
      /\s(href|src)\s*=\s*(['"])\s*(javascript:|data:text\/html)[^'"]*\2/gi,
      ' $1="#"',
    );
    return withoutJsUrls.trim();
  }

  private formatDatePtBr(value?: Date | string | null): string {
    if (!value) return '';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR').format(parsed);
  }

  private formatDateTimePtBr(value?: Date | string | null): string {
    if (!value) return '';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }

  private formatDateLongPtBr(value?: Date | string | null): string {
    if (!value) return '';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(parsed);
  }

  private formatCurrencyPtBr(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  private renderTemplate(
    htmlContent: string,
    variables: Record<string, string>,
  ): string {
    const sanitizedHtml = this.sanitizeContractHtml(htmlContent);
    const withRawVariables = sanitizedHtml.replace(
      /\{\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\}/g,
      (_match, key: string) => this.resolveTemplateRawValue(key, variables),
    );
    return withRawVariables.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_match, key: string) => this.escapeHtml(variables[key] ?? ''),
    );
  }

  private resolveTemplateRawValue(
    key: string,
    variables: Record<string, string>,
  ): string {
    const rawHtmlKeys = new Set([
      'financial_installments_table_html',
      'financial_installments_rows_html',
      'financeiro_parcelas_tabela_html',
    ]);
    const value = variables[key] ?? '';
    if (!rawHtmlKeys.has(key)) {
      return this.escapeHtml(value);
    }
    return value;
  }

  private async resolveInstallmentsForContract(
    institutionId: string,
    enrollmentId?: string | null,
  ): Promise<
    Array<{
      number: number;
      dueDateLabel: string;
      amountLabel: string;
      statusLabel: string;
    }>
  > {
    if (!enrollmentId) return [];

    const charges = await this.prisma.monthlyCharge.findMany({
      where: {
        enrollmentId,
        enrollment: {
          institutionId,
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        dueDate: true,
        amount: true,
        status: true,
      },
    });

    return charges.map((charge, index) => ({
      number: index + 1,
      dueDateLabel: this.formatDatePtBr(charge.dueDate),
      amountLabel: this.formatCurrencyPtBr(Number(charge.amount)),
      statusLabel: this.chargeStatusLabel(charge.status),
    }));
  }

  private chargeStatusLabel(status: string): string {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'PAID') return 'Pago';
    if (normalized === 'OVERDUE') return 'Em atraso';
    if (normalized === 'CANCELED') return 'Cancelado';
    return 'Pendente';
  }

  private buildInstallmentsTableHtml(
    installments: Array<{
      number: number;
      dueDateLabel: string;
      amountLabel: string;
      statusLabel: string;
    }>,
  ): string {
    if (!installments.length) return '';
    const rows = installments
      .map(
        (item) =>
          `<tr><td>${this.escapeHtml(String(item.number))}</td><td>${this.escapeHtml(item.dueDateLabel)}</td><td>${this.escapeHtml(item.amountLabel)}</td><td>${this.escapeHtml(item.statusLabel)}</td></tr>`,
      )
      .join('');

    return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">
      <thead>
        <tr>
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Parcela</th>
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Vencimento</th>
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Valor</th>
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  private resolveContractCity(): string {
    const value = String(
      this.configService.get<string>('CONTRACT_DEFAULT_CITY') || 'Goiânia',
    ).trim();
    return value || 'Goiânia';
  }

  private buildSignedHtml(
    unsignedHtml: string,
    params: {
      signerName: string;
      signedAt: Date;
      signatureCode: string;
      signatureData: string;
    },
  ) {
    const signedAtLabel = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(params.signedAt);

    const signatureBlock = `
      <section style="margin-top:24px;padding:16px;border:1px solid #d1d5db;border-radius:8px;">
        <h4 style="margin:0 0 8px;font-family:Arial,sans-serif;">Assinatura eletrônica</h4>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;">
          <strong>Assinado por:</strong> ${this.escapeHtml(params.signerName)}
        </p>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;">
          <strong>Data/hora:</strong> ${this.escapeHtml(signedAtLabel)}
        </p>
        <p style="margin:0;font-family:Arial,sans-serif;">
          <strong>Código de assinatura:</strong> ${this.escapeHtml(params.signatureCode)}
        </p>
        <div style="margin-top:12px;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;"><strong>Assinatura:</strong></p>
          <img
            alt="Assinatura desenhada do signatário"
            src="${this.escapeHtml(params.signatureData)}"
            style="display:block;max-width:360px;width:100%;height:auto;border:1px solid #e5e7eb;border-radius:6px;background:#fff;"
          />
        </div>
      </section>
    `;

    return `${unsignedHtml}\n${signatureBlock}`.trim();
  }

  private normalizeSignatureDataUrl(value: string): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const match = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return null;
    const base64 = match[2] ?? '';
    if (!base64) return null;
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes <= 0 || approxBytes > 600 * 1024) return null;
    return raw;
  }
  private buildSigningLink(
    rawToken: string,
    instanceId: string,
    publicOrigin?: string | null,
  ): string {
    const configuredBase = this.configService
      .get<string>('CONTRACT_SIGNING_PUBLIC_BASE_URL')
      ?.trim();
    if (configuredBase) {
      const normalizedBase = configuredBase.endsWith('/')
        ? configuredBase.slice(0, -1)
        : configuredBase;
      if (
        normalizedBase.includes('{token}') ||
        normalizedBase.includes('{instanceId}')
      ) {
        return normalizedBase
          .replace(/\{token\}/g, encodeURIComponent(rawToken))
          .replace(/\{instanceId\}/g, encodeURIComponent(instanceId));
      }

      const separator = normalizedBase.includes('?') ? '&' : '?';
      return `${normalizedBase}${separator}contractId=${encodeURIComponent(instanceId)}#tab=st-student-contracts`;
    }

    const normalizedOrigin = this.normalizeAbsoluteOrigin(publicOrigin);
    if (normalizedOrigin) {
      return `${normalizedOrigin}/api/contracts/sign/${encodeURIComponent(rawToken)}`;
    }

    return `/api/contracts/sign/${rawToken}`;
  }

  private normalizeAbsoluteOrigin(value?: string | null): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return null;
      }
      return parsed.origin;
    } catch {
      return null;
    }
  }

  private async generateUniqueSignatureCode(): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const raw = randomBytes(6).toString('hex').toUpperCase();
      const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
      const exists = await this.prisma.contractInstance.findUnique({
        where: { signatureCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }

    throw new InternalServerErrorException(
      'Não foi possível gerar código de assinatura único.',
    );
  }

  private async appendAudit(
    tx: Prisma.TransactionClient | PrismaService | PrismaClient,
    input: {
      institutionId: string;
      contractInstanceId: string;
      contractSigningTokenId?: string;
      action: string;
      actorType: string;
      actorUserId?: string;
      payload?: Prisma.InputJsonValue;
    },
  ) {
    const previous = await tx.contractAuditLog.findFirst({
      where: { contractInstanceId: input.contractInstanceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { entryHash: true },
    });
    const createdAt = new Date();
    const previousHash = previous?.entryHash ?? null;
    const entryHash = this.sha256(
      JSON.stringify({
        institutionId: input.institutionId,
        contractInstanceId: input.contractInstanceId,
        contractSigningTokenId: input.contractSigningTokenId ?? null,
        action: input.action,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        payload: input.payload ?? null,
        previousHash,
        createdAt: createdAt.toISOString(),
      }),
    );

    await tx.contractAuditLog.create({
      data: {
        institutionId: input.institutionId,
        contractInstanceId: input.contractInstanceId,
        contractSigningTokenId: input.contractSigningTokenId ?? null,
        action: input.action,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        payload: input.payload ?? Prisma.DbNull,
        previousHash,
        entryHash,
        createdAt,
      },
    });
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeTrim(value: string | null | undefined) {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private maskEmail(value: string): string {
    const email = String(value || '').trim();
    if (!email.includes('@')) return email || '-';

    const [localPart, domainPart] = email.split('@');
    if (!localPart || !domainPart) return email;

    const visibleStart = localPart.slice(0, 2);
    const visibleEnd = localPart.length > 4 ? localPart.slice(-1) : '';
    const hiddenCount = Math.max(
      2,
      localPart.length - (visibleStart.length + visibleEnd.length),
    );
    const hidden = '*'.repeat(hiddenCount);

    return `${visibleStart}${hidden}${visibleEnd}@${domainPart}`;
  }
}
