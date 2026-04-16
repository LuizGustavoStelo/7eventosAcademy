import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractInstanceStatus,
  InstitutionMemberStatus,
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
import { SuperadminIntegrationsService } from '../superadmin-integrations/superadmin-integrations.service';
import { CreateContractTemplateDto } from './dto/create-contract-template.dto';
import { PublishContractTemplateDto } from './dto/publish-contract-template.dto';
import { RequestContractPinDto } from './dto/request-contract-pin.dto';
import { SendContractInstanceDto } from './dto/send-contract-instance.dto';
import { SignContractInstanceDto } from './dto/sign-contract-instance.dto';
import { SignInstitutionTemplateDto } from './dto/sign-institution-template.dto';
import { UpdateContractTemplateDto } from './dto/update-contract-template.dto';

type ContractActor = Pick<
  JwtPayload,
  'sub' | 'role' | 'activeInstitutionId' | 'activePermissionCodes'
>;

type ContractRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
};

type ContractDownloadPayload = {
  instanceId: string;
  signatureCode: string;
  title: string;
  status: ContractInstanceStatus;
  pdfBuffer: Buffer;
};

type ContractSendContext = {
  publicOrigin?: string | null;
};

type AutoSendContractInput = {
  institutionId: string;
  studentId: string;
  enrollmentId: string;
  courseId?: string | null;
  classId?: string | null;
  createdByUserId: string;
  publicOrigin?: string | null;
};

type ContractInstallmentLine = {
  number: number;
  dueDateLabel: string;
  amountValue: number;
  amountLabel: string;
  statusLabel: string;
  discountLabel?: string | null;
  detailsLabel?: string | null;
};

type ContractSelectedPaymentOption = {
  id: string | null;
  title: string | null;
  method: string | null;
  type: 'CASH' | 'INSTALLMENTS';
  totalAmount: number;
  installmentCount: number | null;
  installmentAmount: number;
  dueDay: number | null;
  installmentStartDate: string | null;
  note: string | null;
  discountEnabled: boolean;
  discountTotalAmount: number | null;
  discountInstallmentAmount: number | null;
  discountDeadlineDay: number | null;
  discountRequiresActiveCrf: boolean;
  discountAppliesTo: 'INSTALLMENT' | 'TOTAL' | null;
  appliedVoucher: {
    code: string;
    title: string | null;
    discountType: 'PERCENT' | 'FIXED';
    discountValue: number;
    appliesTo: 'TOTAL' | 'INSTALLMENT';
    installmentScope: 'ALL' | 'SINGLE';
    discountLabel: string;
    targetLabel: string | null;
    discountedInstallments: number | null;
    discountedInstallmentAmount: number | null;
    regularInstallmentAmount: number | null;
  } | null;
};

const DEFAULT_SIGNING_TOKEN_HOURS = 72;
const MAX_SIGNING_TOKEN_HOURS = 168;
const DEFAULT_PIN_TTL_MINUTES = 10;
const PIN_RESEND_COOLDOWN_SECONDS = 60;
const MAX_PIN_ATTEMPTS = 5;
const PIN_BLOCK_MINUTES = 15;
const DEFAULT_SIGNATURE_TERMS_VERSION = 'v1';
const DEFAULT_SIGNATURE_TERMS_TEXT =
  'Declaro que li e aceito os termos da assinatura eletrônica.';
const CONTRACT_PAGE_BREAK_MARKER =
  '<div data-contract-page-break="true" style="page-break-after: always;"></div>';
const CONTRACT_PAGE_BREAK_REGEX =
  /<div[^>]*(data-contract-page-break\s*=\s*["']true["'][^>]*|page-break-after\s*:\s*always[^>]*)><\/div>/gi;

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly superadminIntegrationsService: SuperadminIntegrationsService,
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
      autoSendEnabled: template.autoSendEnabled,
      autoSendAllCourses: template.autoSendAllCourses,
      autoSendCourseIds: this.parseUuidListFromJson(template.autoSendCourseIds),
      latestVersionNumber: template.latestVersionNumber,
      publishedAt: template.publishedAt,
      institutionSignedAt: template.institutionSignedAt,
      institutionSignedByUserId: template.institutionSignedByUserId,
      institutionSignedByName: template.institutionSignedByName,
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
        autoSendEnabled: Boolean(dto.autoSendEnabled),
        autoSendAllCourses:
          dto.autoSendEnabled === true
            ? dto.autoSendAllCourses !== false
            : true,
        autoSendCourseIds:
          dto.autoSendEnabled === true &&
          dto.autoSendAllCourses === false &&
          Array.isArray(dto.autoSendCourseIds)
            ? (dto.autoSendCourseIds as Prisma.InputJsonValue)
            : Prisma.DbNull,
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
      autoSendEnabled: template.autoSendEnabled,
      autoSendAllCourses: template.autoSendAllCourses,
      autoSendCourseIds: this.parseUuidListFromJson(template.autoSendCourseIds),
      latestVersionNumber: template.latestVersionNumber,
      publishedAt: template.publishedAt,
      institutionSignedAt: template.institutionSignedAt,
      institutionSignedByUserId: template.institutionSignedByUserId,
      institutionSignedByName: template.institutionSignedByName,
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
      const hasForbiddenPublishedField =
        dto.name !== undefined ||
        dto.description !== undefined ||
        dto.draftTitle !== undefined ||
        dto.draftHtmlContent !== undefined;
      if (hasForbiddenPublishedField) {
        throw new BadRequestException(
          'Modelo publicado permite apenas alteracoes de envio automatico.',
        );
      }
      const hasAnyAutoSendField =
        dto.autoSendEnabled !== undefined ||
        dto.autoSendAllCourses !== undefined ||
        dto.autoSendCourseIds !== undefined;
      if (!hasAnyAutoSendField) {
        throw new BadRequestException(
          'Informe ao menos uma configuracao de envio automatico.',
        );
      }
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
    if (dto.autoSendEnabled !== undefined) {
      data.autoSendEnabled = Boolean(dto.autoSendEnabled);
    }
    if (dto.autoSendAllCourses !== undefined) {
      data.autoSendAllCourses = Boolean(dto.autoSendAllCourses);
    }
    if (dto.autoSendCourseIds !== undefined) {
      data.autoSendCourseIds = Array.isArray(dto.autoSendCourseIds)
        ? (dto.autoSendCourseIds as Prisma.InputJsonValue)
        : Prisma.DbNull;
    }
    if (dto.autoSendEnabled === false) {
      data.autoSendAllCourses = true;
      data.autoSendCourseIds = Prisma.DbNull;
    }
    if (dto.autoSendEnabled === true && dto.autoSendAllCourses === true) {
      data.autoSendCourseIds = Prisma.DbNull;
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
      autoSendEnabled: updated.autoSendEnabled,
      autoSendAllCourses: updated.autoSendAllCourses,
      autoSendCourseIds: this.parseUuidListFromJson(updated.autoSendCourseIds),
      latestVersionNumber: updated.latestVersionNumber,
      publishedAt: updated.publishedAt,
      institutionSignedAt: updated.institutionSignedAt,
      institutionSignedByUserId: updated.institutionSignedByUserId,
      institutionSignedByName: updated.institutionSignedByName,
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

    if (existing.status === ContractTemplateStatus.PUBLISHED) {
      throw new BadRequestException(
        'Modelo publicado nao permite nova publicacao. Altere apenas o envio automatico.',
      );
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
          institutionSignedAt: null,
          institutionSignedByUserId: null,
          institutionSignedByName: null,
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
      institutionSignedAt: result.template.institutionSignedAt,
      institutionSignedByUserId: result.template.institutionSignedByUserId,
      institutionSignedByName: result.template.institutionSignedByName,
      version: {
        id: result.version.id,
        versionNumber: result.version.versionNumber,
        title: result.version.title,
        contentHash: result.version.contentHash,
      },
    };
  }

  async signInstitutionTemplate(
    templateId: string,
    actor: ContractActor,
    dto: SignInstitutionTemplateDto,
  ) {
    const institutionId = this.requireActiveInstitutionId(actor);
    if (!dto.acceptTerms) {
      throw new BadRequestException(
        'É necessário confirmar os termos para assinar pela instituição.',
      );
    }
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: templateId, institutionId },
      select: {
        id: true,
        status: true,
        latestVersionNumber: true,
        institutionSignedAt: true,
      },
    });

    if (!template) {
      throw new NotFoundException('Modelo de contrato nao encontrado.');
    }

    if (
      template.status !== ContractTemplateStatus.PUBLISHED ||
      template.latestVersionNumber <= 0
    ) {
      throw new BadRequestException(
        'Somente modelos publicados podem receber assinatura institucional.',
      );
    }

    if (template.institutionSignedAt) {
      throw new BadRequestException('A assinatura institucional deste modelo ja foi registrada.');
    }

    const signer = await this.resolveInstitutionSigner(actor.sub, institutionId);

    const signedAt = new Date();
    const signerNameOverride = String(dto.signerName || '').trim();
    const signerName = signerNameOverride || signer.name;
    const signatureData = this.normalizeSignatureDataUrl(dto.signatureData || '');
    if (!signatureData) {
      throw new BadRequestException(
        'Assinatura desenhada da instituição é obrigatória.',
      );
    }
    const signatureImageHash = this.sha256(signatureData);

    return this.prisma.$transaction(async (tx) => {
      const latestVersion = await tx.contractTemplateVersion.findFirst({
        where: {
          institutionId,
          templateId: template.id,
          versionNumber: template.latestVersionNumber,
        },
        select: {
          id: true,
          placeholdersJson: true,
        },
      });
      if (!latestVersion) {
        throw new NotFoundException(
          'Versão publicada do modelo não foi encontrada para assinatura institucional.',
        );
      }

      const currentPlaceholders = this.snapshotToRecord(
        latestVersion.placeholdersJson,
      );
      const updatedPlaceholders = {
        ...currentPlaceholders,
        __institutionSignatureData: signatureData,
        __institutionSignatureImageHash: signatureImageHash,
        __institutionSignatureSignedAt: signedAt.toISOString(),
        __institutionSignatureSignerName: signerName,
      } as Prisma.InputJsonValue;

      await tx.contractTemplateVersion.update({
        where: { id: latestVersion.id },
        data: {
          placeholdersJson: updatedPlaceholders,
        },
      });

      return tx.contractTemplate.update({
        where: { id: template.id },
        data: {
          institutionSignedAt: signedAt,
          institutionSignedByUserId: signer.id,
          institutionSignedByName: signerName,
          updatedByUserId: actor.sub,
        },
        select: {
          id: true,
          status: true,
          latestVersionNumber: true,
          institutionSignedAt: true,
          institutionSignedByUserId: true,
          institutionSignedByName: true,
        },
      });
    });
  }

  async deleteTemplate(templateId: string, actor: ContractActor) {
    const institutionId = this.requireActiveInstitutionId(actor);

    if (!this.isContractDeletionEnabled()) {
      throw new BadRequestException(
        'A exclusão de contratos está desativada nesta instituição.',
      );
    }

    const existing = await this.prisma.contractTemplate.findFirst({
      where: {
        id: templateId,
        institutionId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Modelo de contrato não encontrado.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const deletedInstances = await tx.contractInstance.deleteMany({
        where: {
          institutionId,
          templateId: existing.id,
        },
      });

      await tx.contractTemplate.delete({
        where: { id: existing.id },
      });

      return {
        deletedInstancesCount: deletedInstances.count,
      };
    });

    return {
      success: true,
      deletedId: existing.id,
      deletedName: existing.name,
      deletedStatus: existing.status,
      ...result,
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

    return instances.map((instance) => {
      const institutionSignature = this.readInstitutionSignature(
        instance.snapshotStudentData,
      );
      const institutionSignaturePending =
        instance.status === ContractInstanceStatus.SIGNED &&
        !institutionSignature.signedAt;

      return {
        id: instance.id,
        status: instance.status,
        sentAt: instance.sentAt,
        viewedAt: instance.viewedAt,
        signedAt: instance.signedAt,
        signatureCode: instance.signatureCode,
        institutionSignedAt: institutionSignature.signedAt,
        institutionSignedByName: institutionSignature.signedByName,
        institutionSignaturePending,
        template: instance.template,
        templateVersion: instance.templateVersion,
        student: {
          id: instance.student.id,
          name: instance.student.name,
          emailMasked: this.maskEmail(instance.student.email),
        },
      };
    });
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

    const institutionSignature = this.readInstitutionSignature(
      instance.snapshotStudentData,
    );
    const institutionSignaturePending =
      instance.status === ContractInstanceStatus.SIGNED &&
      !institutionSignature.signedAt;

    return {
      id: instance.id,
      status: instance.status,
      sentAt: instance.sentAt,
      viewedAt: instance.viewedAt,
      signedAt: instance.signedAt,
      signatureCode: instance.signatureCode,
      institutionSignedAt: institutionSignature.signedAt,
      institutionSignedByName: institutionSignature.signedByName,
      institutionSignaturePending,
      snapshotTemplateTitle: instance.snapshotTemplateTitle,
      documentHtml: this.normalizeKnownCorruptedTerms(
        instance.status === ContractInstanceStatus.SIGNED &&
          instance.signedHtmlSnapshot
          ? instance.signedHtmlSnapshot
          : instance.unsignedHtmlSnapshot,
      ),
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
        institutionSignedAt: true,
        institutionSignedByUserId: true,
        institutionSignedByName: true,
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

    if (!template.institutionSignedAt) {
      throw new BadRequestException(
        'A instituicao precisa assinar o modelo publicado antes do envio ao aluno.',
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

    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: {
        legalName: true,
        documentCnpj: true,
        address: true,
        contractCity: true,
        contractForum: true,
      },
    });

    const resolvedCity = institution?.contractCity || String(this.configService.get<string>('CONTRACT_DEFAULT_CITY') || 'Goiânia').trim() || 'Goiânia';
    const resolvedName = institution?.legalName || String(this.configService.get<string>('CONTRACT_PROVIDER_NAME') || 'INSTITUTO PROJEÇÃO').trim() || 'INSTITUTO PROJEÇÃO';
    const resolvedCnpj = institution?.documentCnpj || String(this.configService.get<string>('CONTRACT_PROVIDER_DOCUMENT') || '27.683.733/0001-24').trim() || '27.683.733/0001-24';
    const resolvedAddress = institution?.address || String(this.configService.get<string>('CONTRACT_PROVIDER_ADDRESS') || 'Av. T1, nº 2266, edifício Alpha, Setor Bueno, Goiânia - GO, CEP 74.210-045').trim();
    const resolvedForum = institution?.contractForum || String(this.configService.get<string>('CONTRACT_FORUM') || 'Comarca de Goiânia/GO').trim() || 'Comarca de Goiânia/GO';

    const institutionSignerName =
      String(template.institutionSignedByName || '').trim() ||
      resolvedName;
    const institutionSignedAt = template.institutionSignedAt;
    const institutionSignatureData =
      this.readInstitutionSignatureDataFromTemplateVersion(
        templateVersion.placeholdersJson,
      );

    let courseName = '';
    let className = '';
    let coursePaymentModel = '';
    let courseTotalPrice = 0;
    let courseEnrollmentFee = 0;
    let courseInstallmentMonths = 0;
    let courseInstallmentValue = 0;
    let enrollmentClassStartDate: Date | null = null;
    let enrollmentSelectedPaymentOption: Prisma.JsonValue | null = null;
    if (dto.courseId) {
      const course = await this.prisma.course.findFirst({
        where: { id: dto.courseId, institutionId },
        select: {
          id: true,
          name: true,
          paymentModel: true,
          price: true,
          enrollmentFee: true,
          installmentMonths: true,
          installmentValue: true,
        },
      });
      if (!course) {
        throw new NotFoundException('Curso informado não encontrado.');
      }
      courseName = course.name;
      coursePaymentModel = String(course.paymentModel || '');
      courseTotalPrice = Number(course.price ?? 0);
      courseEnrollmentFee = Number(course.enrollmentFee ?? 0);
      courseInstallmentMonths = Number(course.installmentMonths ?? 0);
      courseInstallmentValue = Number(course.installmentValue ?? 0);
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
        select: {
          id: true,
          selectedPaymentOption: true,
          schoolClass: {
            select: {
              id: true,
              name: true,
              startDate: true,
              course: {
                select: {
                  id: true,
                  name: true,
                  paymentModel: true,
                  price: true,
                  enrollmentFee: true,
                  installmentMonths: true,
                  installmentValue: true,
                },
              },
            },
          },
        },
      });
      if (!enrollment) {
        throw new NotFoundException(
          'Matrícula informada não encontrada para este aluno.',
        );
      }
      if (!className) {
        className = enrollment.schoolClass?.name || className;
      }
      enrollmentClassStartDate = enrollment.schoolClass?.startDate ?? null;
      enrollmentSelectedPaymentOption = enrollment.selectedPaymentOption ?? null;
      if (!courseName) {
        courseName = enrollment.schoolClass?.course?.name || courseName;
      }
      if (!coursePaymentModel) {
        coursePaymentModel = String(
          enrollment.schoolClass?.course?.paymentModel || '',
        );
      }
      if (courseTotalPrice <= 0) {
        courseTotalPrice = Number(enrollment.schoolClass?.course?.price ?? 0);
      }
      if (courseEnrollmentFee <= 0) {
        courseEnrollmentFee = Number(
          enrollment.schoolClass?.course?.enrollmentFee ?? 0,
        );
      }
      if (courseInstallmentMonths <= 0) {
        courseInstallmentMonths = Number(
          enrollment.schoolClass?.course?.installmentMonths ?? 0,
        );
      }
      if (courseInstallmentValue <= 0) {
        courseInstallmentValue = Number(
          enrollment.schoolClass?.course?.installmentValue ?? 0,
        );
      }
    }

    const now = new Date();
    const selectedPaymentOption = this.parseInstallmentOptionFromJson(
      enrollmentSelectedPaymentOption,
    );
    const installments = await this.resolveInstallmentsForContract(
      institutionId,
      dto.enrollmentId ?? null,
      {
        classStartDate: enrollmentClassStartDate,
        selectedPaymentOption,
      },
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
                `Parcela ${item.number} - vencimento ${item.dueDateLabel} - ${item.amountLabel}${
                  item.detailsLabel
                    ? ` - ${item.detailsLabel}`
                    : item.discountLabel
                      ? ` - antecipado: ${item.discountLabel}`
                      : ''
                }`,
            )
            .join('\n')
        : '';
    const installmentsSum = installments.reduce(
      (acc, item) => acc + item.amountValue,
      0,
    );
    const installmentsAverage =
      installments.length > 0 ? installmentsSum / installments.length : 0;
    const selectedOptionInstallmentCount = Number(
      selectedPaymentOption?.installmentCount ?? 0,
    );
    const selectedOptionInstallmentAmount = Number(
      selectedPaymentOption?.installmentAmount ?? 0,
    );
    const selectedOptionTotalAmount = Number(selectedPaymentOption?.totalAmount ?? 0);
    const selectedOptionDiscountTotalAmount = Number(
      selectedPaymentOption?.discountTotalAmount ?? 0,
    );
    const selectedOptionDiscountInstallmentAmount = Number(
      selectedPaymentOption?.discountInstallmentAmount ?? 0,
    );
    const selectedOptionDiscountDeadlineDay = Number(
      selectedPaymentOption?.discountDeadlineDay ?? 0,
    );
    const hideScheduleForCreditCard =
      String(selectedPaymentOption?.method || '')
        .trim()
        .toUpperCase() === 'CREDIT_CARD';
    const financialTotal =
      selectedOptionTotalAmount > 0
        ? selectedOptionTotalAmount
        : installmentsSum > 0
          ? installmentsSum
          : courseTotalPrice > 0
            ? courseTotalPrice
            : 0;
    const paymentMethodLabel =
      selectedPaymentOption?.title?.trim() ||
      this.paymentModelLabelPtBr(coursePaymentModel, installments.length);
    const installmentCountForSummary =
      installments.length ||
      selectedOptionInstallmentCount ||
      courseInstallmentMonths ||
      (selectedPaymentOption?.type === 'CASH' ? 1 : 0);
    const installmentCountForSummaryDisplay = hideScheduleForCreditCard
      ? '-'
      : String(installmentCountForSummary);
    const installmentValueForSummary = (() => {
      if (selectedOptionInstallmentAmount > 0) return selectedOptionInstallmentAmount;
      if (courseInstallmentValue > 0) return courseInstallmentValue;
      if (installmentsAverage > 0) return installmentsAverage;
      if (financialTotal > 0 && installmentCountForSummary > 0) {
        return this.toMoneyValue(financialTotal / installmentCountForSummary);
      }
      return 0;
    })();
    const installmentValueForSummaryDisplay = hideScheduleForCreditCard
      ? '-'
      : this.formatCurrencyPtBr(installmentValueForSummary);

    const formsAndValuesSummaryLines = [
      `Forma de pagamento: ${paymentMethodLabel}`,
      `Valor total: ${this.formatCurrencyPtBr(financialTotal)}`,
      `Taxa de matrícula: ${this.formatCurrencyPtBr(courseEnrollmentFee)}`,
    ];
    if (!hideScheduleForCreditCard) {
      formsAndValuesSummaryLines.push(
        `Quantidade de parcelas: ${installmentCountForSummary}`,
      );
      formsAndValuesSummaryLines.push(
        `Valor da parcela: ${this.formatCurrencyPtBr(installmentValueForSummary)}`,
      );
    }

    if (selectedPaymentOption?.appliedVoucher) {
      const voucher = selectedPaymentOption.appliedVoucher;
      const voucherTargetLabel =
        voucher.targetLabel ||
        (voucher.appliesTo === 'INSTALLMENT'
          ? voucher.installmentScope === 'SINGLE'
            ? 'uma mensalidade'
            : 'todas as mensalidades'
          : 'curso inteiro');
      formsAndValuesSummaryLines.push(
        `Voucher aplicado: ${voucher.discountLabel || voucher.code} (${voucherTargetLabel}).`,
      );
      if (
        voucher.appliesTo === 'INSTALLMENT' &&
        voucher.installmentScope === 'SINGLE' &&
        (voucher.discountedInstallmentAmount ?? 0) > 0 &&
        (voucher.regularInstallmentAmount ?? 0) > 0
      ) {
        formsAndValuesSummaryLines.push(
          `1ª parcela com voucher: ${this.formatCurrencyPtBr(
            Number(voucher.discountedInstallmentAmount ?? 0),
          )} | Demais parcelas: ${this.formatCurrencyPtBr(
            Number(voucher.regularInstallmentAmount ?? 0),
          )}.`,
        );
      }
    }

    if (selectedPaymentOption?.discountEnabled && selectedOptionDiscountTotalAmount > 0) {
      formsAndValuesSummaryLines.push(
        `Valor total com desconto${
          selectedOptionDiscountDeadlineDay > 0
            ? ` até dia ${selectedOptionDiscountDeadlineDay}`
            : ''
        }: ${this.formatCurrencyPtBr(selectedOptionDiscountTotalAmount)}`,
      );
    }

    if (
      selectedPaymentOption?.discountEnabled &&
      selectedOptionDiscountInstallmentAmount > 0
    ) {
      formsAndValuesSummaryLines.push(
        `Parcela com desconto${
          selectedOptionDiscountDeadlineDay > 0
            ? ` até dia ${selectedOptionDiscountDeadlineDay}`
            : ''
        }: ${this.formatCurrencyPtBr(selectedOptionDiscountInstallmentAmount)}`,
      );
    }

    if (selectedPaymentOption?.discountRequiresActiveCrf) {
      formsAndValuesSummaryLines.push('Desconto condicionado a CRF ativo.');
    }

    if (selectedPaymentOption?.note) {
      formsAndValuesSummaryLines.push(`Observação: ${selectedPaymentOption.note}`);
    }

    const formsAndValuesSummary = formsAndValuesSummaryLines.join(' | ');

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
        financial_installments_count: installmentCountForSummaryDisplay,
        financial_installments_text: installmentsText,
        financial_installments_table_html: installmentsTableHtml,
        financial_installments_rows_html: installmentsTableHtml,
        contract_sign_city: resolvedCity,
        contract_issue_date: this.formatDatePtBr(now),
        contract_issue_date_long: this.formatDateLongPtBr(now),
        contract_issue_datetime: this.formatDateTimePtBr(now),
        signed_by_name: institutionSignerName,
        signed_at: this.formatDateTimePtBr(institutionSignedAt),
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
        financeiro_parcelas_total: installmentCountForSummaryDisplay,
        financeiro_parcelas_texto: installmentsText,
        financeiro_parcelas_tabela_html: installmentsTableHtml,
        financeiro_forma_pagamento: paymentMethodLabel,
        financeiro_valor_total: this.formatCurrencyPtBr(financialTotal),
        financeiro_taxa_matricula: this.formatCurrencyPtBr(courseEnrollmentFee),
        financeiro_quantidade_parcelas: installmentCountForSummaryDisplay,
        financeiro_valor_parcela: installmentValueForSummaryDisplay,
        financeiro_formas_valores_resumo: formsAndValuesSummary,
        contrato_cidade_assinatura: resolvedCity,
        contrato_data_emissao: this.formatDatePtBr(now),
        contrato_data_emissao_extenso: this.formatDateLongPtBr(now),
        contrato_datahora_emissao: this.formatDateTimePtBr(now),
        assinado_por_nome: institutionSignerName,
        assinado_em: this.formatDateTimePtBr(institutionSignedAt),
        codigo_assinatura: signatureCode,
        contratada_nome: resolvedName,
        contratada_cnpj: resolvedCnpj,
        contratada_endereco: resolvedAddress,
        contrato_foro: resolvedForum,
      },
    );
    const cleanedUnsignedHtml = this.removeLegacySignatureIdentificationBlock(
      unsignedHtmlSnapshot,
    );
    const institutionSignatureBlock = this.buildInstitutionSignatureBlockHtml({
      signerName: institutionSignerName,
      signedAt: institutionSignedAt,
      signatureCode,
      signatureData: institutionSignatureData,
    });
    const institutionSignedUnsignedHtmlSnapshot = this.appendBlockAsDocumentPage(
      cleanedUnsignedHtml,
      institutionSignatureBlock,
    );
    const unsignedContentHash = this.sha256(institutionSignedUnsignedHtmlSnapshot);
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
            institutionSignature: {
              signedAt: institutionSignedAt.toISOString(),
              signedByUserId: template.institutionSignedByUserId || null,
              signedByName: institutionSignerName,
              signatureData: institutionSignatureData,
            },
          } as Prisma.InputJsonValue,
          unsignedHtmlSnapshot: institutionSignedUnsignedHtmlSnapshot,
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
          institutionSignedAt: institutionSignedAt.toISOString(),
          institutionSignedByName: institutionSignerName,
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

  async signInstitutionInstance(instanceId: string, actor: ContractActor) {
    const institutionId = this.requireActiveInstitutionId(actor);
    const instance = await this.prisma.contractInstance.findFirst({
      where: {
        id: instanceId,
        institutionId,
      },
      select: {
        id: true,
        institutionId: true,
        status: true,
        signatureCode: true,
        signedHtmlSnapshot: true,
        unsignedHtmlSnapshot: true,
        snapshotStudentData: true,
      },
    });

    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    if (
      instance.status === ContractInstanceStatus.ARCHIVED ||
      instance.status === ContractInstanceStatus.CANCELED ||
      instance.status === ContractInstanceStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'A assinatura institucional não pode ser registrada para este status.',
      );
    }

    const institutionSignature = this.readInstitutionSignature(
      instance.snapshotStudentData,
    );
    if (institutionSignature.signedAt) {
      throw new BadRequestException('Assinatura institucional já registrada.');
    }

    const signer = await this.resolveInstitutionSigner(actor.sub, institutionId);

    const now = new Date();
    const isStudentAlreadySigned = instance.status === ContractInstanceStatus.SIGNED;
    const baseHtml = isStudentAlreadySigned
      ? instance.signedHtmlSnapshot || instance.unsignedHtmlSnapshot
      : instance.unsignedHtmlSnapshot;
    const cleanedBaseHtml = this.removeLegacySignatureIdentificationBlock(baseHtml);
    const institutionSignatureBlock = this.buildInstitutionSignatureBlockHtml({
      signerName: signer.name,
      signedAt: now,
      signatureCode: instance.signatureCode,
      signatureData: institutionSignature.signatureData,
    });
    const institutionSignedHtml = this.appendBlockAsDocumentPage(
      cleanedBaseHtml,
      institutionSignatureBlock,
    );
    const institutionSignedContentHash = this.sha256(institutionSignedHtml);
    const institutionSignedPdfBuffer = isStudentAlreadySigned
      ? await this.renderContractPdfBuffer(institutionSignedHtml)
      : null;
    const institutionSignedPdfHash = institutionSignedPdfBuffer
      ? this.sha256(institutionSignedPdfBuffer)
      : this.sha256(`pdf:${institutionSignedHtml}`);

    const snapshotBase = this.snapshotToRecord(instance.snapshotStudentData);
    const snapshotStudentData = {
      ...snapshotBase,
      institutionSignature: {
        signedAt: now.toISOString(),
        signedByUserId: signer.id,
        signedByName: signer.name,
        signatureData: institutionSignature.signatureData,
      },
      ...(institutionSignedPdfBuffer
        ? {
            artifacts: {
              ...(snapshotBase?.artifacts as Record<string, unknown> | undefined),
              signedPdfBase64: institutionSignedPdfBuffer.toString('base64'),
              signedPdfGeneratedAt: now.toISOString(),
            },
          }
        : {}),
    } as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      await tx.contractInstance.update({
        where: { id: instance.id },
        data: {
          snapshotStudentData,
          ...(isStudentAlreadySigned
            ? {
                signedHtmlSnapshot: institutionSignedHtml,
                signedContentHash: institutionSignedContentHash,
                signedPdfHash: institutionSignedPdfHash,
              }
            : {
                unsignedHtmlSnapshot: institutionSignedHtml,
                unsignedContentHash: institutionSignedContentHash,
              }),
        },
      });

      await this.appendAudit(tx, {
        institutionId: instance.institutionId,
        contractInstanceId: instance.id,
        action: 'institution_signed',
        actorType: 'admin',
        actorUserId: actor.sub,
        payload: {
          signedAt: now.toISOString(),
          signedByName: signer.name,
          signatureCode: instance.signatureCode,
          signedContentHash: institutionSignedContentHash,
          signedPdfHash: institutionSignedPdfHash,
          appliedOnStatus: instance.status,
        },
      });
    });

    void this.superadminIntegrationsService
      .dispatchKobayashiForSignedContractInstance(instance.id)
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Falha desconhecida no disparo da integração KOBAYASHI.';
        this.logger.warn(
          `[integration-dispatch] contrato=${instance.id} erro=${message}`,
        );
      });

    return {
      id: instance.id,
      status: instance.status,
      institutionSignedAt: now.toISOString(),
      institutionSignedByName: signer.name,
      institutionSignaturePending: false,
      signedContentHash: institutionSignedContentHash,
      signedPdfHash: institutionSignedPdfHash,
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

    return instances.map((instance) => {
      const institutionSignature = this.readInstitutionSignature(
        instance.snapshotStudentData,
      );
      const institutionSignaturePending =
        instance.status === ContractInstanceStatus.SIGNED &&
        !institutionSignature.signedAt;

      return {
        id: instance.id,
        status: instance.status,
        sentAt: instance.sentAt,
        viewedAt: instance.viewedAt,
        signedAt: instance.signedAt,
        signatureCode: instance.signatureCode,
        institutionSignedAt: institutionSignature.signedAt,
        institutionSignedByName: institutionSignature.signedByName,
        institutionSignaturePending,
        template: instance.template,
        templateVersion: instance.templateVersion,
      };
    });
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

  async getInstanceDownload(
    instanceId: string,
    actor: ContractActor,
  ): Promise<ContractDownloadPayload> {
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
        snapshotStudentData: true,
        unsignedHtmlSnapshot: true,
        signedHtmlSnapshot: true,
      },
    });

    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const htmlContent = this.normalizeKnownCorruptedTerms(
      instance.status === ContractInstanceStatus.SIGNED && instance.signedHtmlSnapshot
        ? instance.signedHtmlSnapshot
        : instance.unsignedHtmlSnapshot,
    );

    const pdfBuffer = await this.renderContractPdfBuffer(htmlContent);

    return {
      instanceId: instance.id,
      signatureCode: instance.signatureCode,
      title: instance.snapshotTemplateTitle,
      status: instance.status,
      pdfBuffer,
    };
  }

  async getMyInstanceDownload(
    instanceId: string,
    actor: ContractActor,
  ): Promise<ContractDownloadPayload> {
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
        snapshotStudentData: true,
        unsignedHtmlSnapshot: true,
        signedHtmlSnapshot: true,
      },
    });

    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const htmlContent = this.normalizeKnownCorruptedTerms(
      instance.status === ContractInstanceStatus.SIGNED && instance.signedHtmlSnapshot
        ? instance.signedHtmlSnapshot
        : instance.unsignedHtmlSnapshot,
    );

    const pdfBuffer = await this.renderContractPdfBuffer(htmlContent);

    return {
      instanceId: instance.id,
      signatureCode: instance.signatureCode,
      title: instance.snapshotTemplateTitle,
      status: instance.status,
      pdfBuffer,
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

    const institutionSignature = this.readInstitutionSignature(
      refreshed.snapshotStudentData,
    );
    const institutionSignaturePending =
      refreshed.status === ContractInstanceStatus.SIGNED &&
      !institutionSignature.signedAt;

    return {
      id: refreshed.id,
      status: refreshed.status,
      sentAt: refreshed.sentAt,
      viewedAt: refreshed.viewedAt,
      signedAt: refreshed.signedAt,
      signatureCode: refreshed.signatureCode,
      institutionSignedAt: institutionSignature.signedAt,
      institutionSignedByName: institutionSignature.signedByName,
      institutionSignaturePending,
      acceptedAt: refreshed.acceptedAt,
      acceptedTermsVersion: refreshed.acceptedTermsVersion,
      template: refreshed.template,
      templateVersion: refreshed.templateVersion,
      documentHtml: this.normalizeKnownCorruptedTerms(
        refreshed.status === ContractInstanceStatus.SIGNED &&
          refreshed.signedHtmlSnapshot
          ? refreshed.signedHtmlSnapshot
          : refreshed.unsignedHtmlSnapshot,
      ),
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
        snapshotStudentData: true,
      },
    });
    if (!instance) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    if (instance.status === ContractInstanceStatus.SIGNED) {
      throw new BadRequestException('Este contrato já foi assinado.');
    }

    const institutionSignature = this.readInstitutionSignature(
      instance.snapshotStudentData,
    );
    if (!institutionSignature.signedAt) {
      throw new BadRequestException(
        'A instituição precisa assinar o contrato antes da assinatura do aluno.',
      );
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
    const institutionSignature = this.readInstitutionSignature(
      instance.snapshotStudentData,
    );
    if (!institutionSignature.signedAt) {
      throw new BadRequestException(
        'A instituição precisa assinar o contrato antes da assinatura do aluno.',
      );
    }

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
    const signedPdfBuffer = await this.renderContractPdfBuffer(signedHtmlSnapshot);
    const signedPdfHash = this.sha256(signedPdfBuffer);
    const signatureImageHash = this.sha256(signatureData);
    const snapshotBase = this.snapshotToRecord(instance.snapshotStudentData);
    const snapshotStudentData = {
      ...snapshotBase,
      artifacts: {
        ...(snapshotBase?.artifacts as Record<string, unknown> | undefined),
        signedPdfBase64: signedPdfBuffer.toString('base64'),
        signedPdfGeneratedAt: now.toISOString(),
      },
    } as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      await tx.contractInstance.update({
        where: { id: instance.id },
        data: {
          status: ContractInstanceStatus.SIGNED,
          signedAt: now,
          signedHtmlSnapshot,
          signedContentHash,
          signedPdfHash,
          snapshotStudentData,
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

      await this.createEnrollmentChargesAfterContractSignature(
        tx,
        instance.enrollmentId,
        now,
      );

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
          {
            institutionId: instance.institutionId,
            contractInstanceId: instance.id,
            artifactType: 'signed_pdf',
            storageProvider: 'db',
            storageKey: `contract-instance/${instance.id}/signed-pdf`,
            mimeType: 'application/pdf',
            sizeBytes: signedPdfBuffer.length,
            sha256: signedPdfHash,
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

    void this.superadminIntegrationsService
      .dispatchKobayashiForSignedContractInstance(instance.id)
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Falha desconhecida no disparo da integração KOBAYASHI.';
        this.logger.warn(
          `[integration-dispatch] contrato=${instance.id} erro=${message}`,
        );
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

  private async createEnrollmentChargesAfterContractSignature(
    tx: Prisma.TransactionClient,
    enrollmentId?: string | null,
    signedAt?: Date,
  ) {
    if (!enrollmentId) return;

    const existingCharges = await tx.monthlyCharge.count({
      where: { enrollmentId },
    });
    if (existingCharges > 0) return;

    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        schoolClass: {
          select: {
            startDate: true,
            course: {
              select: {
                ownerAdminId: true,
                enrollmentFee: true,
                paymentModel: true,
                installmentMonths: true,
                installmentValue: true,
              },
            },
          },
        },
        selectedPaymentOption: true,
      },
    });

    if (!enrollment) return;

    const charges = this.buildChargesForEnrollmentAfterContract({
      classStartDate: enrollment.schoolClass.startDate,
      signedAt: signedAt ?? new Date(),
      enrollmentFee: Number(enrollment.schoolClass.course.enrollmentFee ?? 0),
      paymentModel: enrollment.schoolClass.course.paymentModel,
      installmentMonths: enrollment.schoolClass.course.installmentMonths,
      installmentValue: enrollment.schoolClass.course.installmentValue,
      selectedPaymentOption: enrollment.selectedPaymentOption,
    });

    if (charges.length === 0) return;

    await tx.monthlyCharge.createMany({
      data: charges.map((item) => ({
        enrollmentId: enrollment.id,
        ownerAdminId: enrollment.schoolClass.course.ownerAdminId,
        dueDate: item.dueDate,
        amount: item.amount,
        status: item.status,
      })),
    });
  }

  private buildChargesForEnrollmentAfterContract(input: {
    classStartDate: Date;
    signedAt: Date;
    enrollmentFee: number;
    paymentModel: string;
    installmentMonths: number | null;
    installmentValue: Prisma.Decimal | null;
    selectedPaymentOption: Prisma.JsonValue | null;
  }) {
    const result: Array<{
      dueDate: Date;
      amount: number;
      status: 'PENDING' | 'OVERDUE';
    }> = [];
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const enrollmentFee = Number(input.enrollmentFee || 0);
    if (Number.isFinite(enrollmentFee) && enrollmentFee > 0) {
      const feeDate = new Date(input.signedAt);
      const feeStart = new Date(
        feeDate.getFullYear(),
        feeDate.getMonth(),
        feeDate.getDate(),
      );
      result.push({
        dueDate: feeDate,
        amount: this.toMoneyValue(enrollmentFee),
        status: feeStart < startOfToday ? 'OVERDUE' : 'PENDING',
      });
    }

    const selectedOption = this.parseInstallmentOptionFromJson(
      input.selectedPaymentOption,
    );

    if (selectedOption) {
      if (selectedOption.type !== 'INSTALLMENTS') {
        const totalAmount = Number(selectedOption.totalAmount ?? 0);
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
          return result;
        }
        const dueDate = new Date(input.signedAt);
        const dueDateStart = new Date(
          dueDate.getFullYear(),
          dueDate.getMonth(),
          dueDate.getDate(),
        );
        result.push({
          dueDate,
          amount: this.toMoneyValue(totalAmount),
          status: dueDateStart < startOfToday ? 'OVERDUE' : 'PENDING',
        });
        return result;
      }
      const months = Number(selectedOption.installmentCount ?? 0);
      const value = Number(selectedOption.installmentAmount ?? 0);
      if (
        !Number.isFinite(months) ||
        months <= 0 ||
        !Number.isFinite(value) ||
        value <= 0
      ) {
        return result;
      }
      const scheduledBase = selectedOption.installmentStartDate
        ? new Date(selectedOption.installmentStartDate)
        : null;
      const hasScheduledStart =
        scheduledBase !== null && !Number.isNaN(scheduledBase.getTime());

      if (hasScheduledStart) {
        const firstDueDate = new Date(input.signedAt);
        const dueDateStart = new Date(
          firstDueDate.getFullYear(),
          firstDueDate.getMonth(),
          firstDueDate.getDate(),
        );
        result.push({
          dueDate: firstDueDate,
          amount: this.toMoneyValue(value),
          status: dueDateStart < startOfToday ? 'OVERDUE' : 'PENDING',
        });

        for (let index = 1; index < months; index += 1) {
          const dueDate = this.buildChargeDueDate(
            scheduledBase,
            index - 1,
            selectedOption.dueDay ?? undefined,
          );
          const dueDateStart = new Date(
            dueDate.getFullYear(),
            dueDate.getMonth(),
            dueDate.getDate(),
          );
          result.push({
            dueDate,
            amount: this.toMoneyValue(value),
            status: dueDateStart < startOfToday ? 'OVERDUE' : 'PENDING',
          });
        }
        return result;
      }

      const base = new Date(input.classStartDate);
      if (Number.isNaN(base.getTime())) return result;

      for (let index = 0; index < months; index += 1) {
        const dueDate = this.buildChargeDueDate(
          base,
          index,
          selectedOption.dueDay ?? undefined,
        );
        const dueDateStart = new Date(
          dueDate.getFullYear(),
          dueDate.getMonth(),
          dueDate.getDate(),
        );
        result.push({
          dueDate,
          amount: this.toMoneyValue(value),
          status: dueDateStart < startOfToday ? 'OVERDUE' : 'PENDING',
        });
      }

      return result;
    }

    if (String(input.paymentModel).toUpperCase() !== 'INSTALLMENTS') return result;
    const months = Number(input.installmentMonths ?? 0);
    const value = Number(input.installmentValue?.toNumber?.() ?? 0);
    if (!Number.isFinite(months) || months <= 0 || !Number.isFinite(value) || value <= 0) {
      return result;
    }

    const base = new Date(input.classStartDate);

    for (let index = 0; index < months; index += 1) {
      const dueDate = new Date(base.getTime());
      dueDate.setMonth(dueDate.getMonth() + index);
      const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      result.push({
        dueDate,
        amount: this.toMoneyValue(value),
        status: dueDateStart < startOfToday ? 'OVERDUE' : 'PENDING',
      });
    }

    return result;
  }

  private parseInstallmentOptionFromJson(
    raw: Prisma.JsonValue | null,
  ): ContractSelectedPaymentOption | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const source = raw as Record<string, unknown>;
    const normalizedType = String(source.type || '').toUpperCase();
    if (normalizedType !== 'INSTALLMENTS' && normalizedType !== 'CASH') return null;

    const id = String(source.id || '').trim() || null;
    const title = String(source.title || '').trim() || null;
    const method = String(source.method || '').trim().toUpperCase() || null;
    const totalAmount = this.toMoneyValue(source.totalAmount);
    const installmentCount = this.toPositiveInt(source.installmentCount);
    const installmentAmountFromSource = this.toMoneyValue(source.installmentAmount);
    const installmentAmount =
      installmentAmountFromSource > 0
        ? installmentAmountFromSource
        : normalizedType === 'INSTALLMENTS' &&
            totalAmount > 0 &&
            Number(installmentCount ?? 0) > 0
          ? this.toMoneyValue(totalAmount / Math.max(1, Number(installmentCount ?? 1)))
          : totalAmount;
    const dueDayRaw = this.toPositiveInt(source.dueDay);
    const dueDay =
      dueDayRaw && dueDayRaw > 0 ? Math.min(31, Math.max(1, dueDayRaw)) : null;
    const installmentStartDate = (() => {
      const value = String(source.installmentStartDate || '').trim();
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    })();
    const note = String(source.note || '').trim() || null;
    const discountEnabled = Boolean(source.discountEnabled);
    const discountTotalAmountRaw = this.toMoneyValue(source.discountTotalAmount);
    const discountTotalAmount =
      discountEnabled && discountTotalAmountRaw > 0 ? discountTotalAmountRaw : null;
    const discountInstallmentAmountRaw = this.toMoneyValue(
      source.discountInstallmentAmount,
    );
    const discountInstallmentAmountDerived =
      discountEnabled &&
      normalizedType === 'INSTALLMENTS' &&
      discountTotalAmount &&
      Number(installmentCount ?? 0) > 0
        ? this.toMoneyValue(
            discountTotalAmount / Math.max(1, Number(installmentCount ?? 1)),
          )
        : null;
    const discountInstallmentAmount =
      discountEnabled && discountInstallmentAmountRaw > 0
        ? discountInstallmentAmountRaw
        : discountInstallmentAmountDerived;
    const discountDeadlineDayRaw = this.toPositiveInt(source.discountDeadlineDay);
    const discountDeadlineDay =
      discountEnabled && discountDeadlineDayRaw
        ? Math.min(31, Math.max(1, discountDeadlineDayRaw))
        : null;
    const discountRequiresActiveCrf =
      discountEnabled && Boolean(source.discountRequiresActiveCrf);
    const discountAppliesToRaw = String(source.discountAppliesTo || '')
      .trim()
      .toUpperCase();
    const discountAppliesTo =
      discountAppliesToRaw === 'INSTALLMENT' || discountAppliesToRaw === 'TOTAL'
        ? (discountAppliesToRaw as 'INSTALLMENT' | 'TOTAL')
        : null;
    const voucherRaw =
      source.appliedVoucher &&
      typeof source.appliedVoucher === 'object' &&
      !Array.isArray(source.appliedVoucher)
        ? (source.appliedVoucher as Record<string, unknown>)
        : null;
    const voucherCode = String(voucherRaw?.code || '').trim();
    const voucherDiscountTypeRaw = String(voucherRaw?.discountType || '')
      .trim()
      .toUpperCase();
    const voucherDiscountType: 'PERCENT' | 'FIXED' | null =
      voucherDiscountTypeRaw === 'PERCENT'
        ? 'PERCENT'
        : voucherDiscountTypeRaw === 'FIXED'
          ? 'FIXED'
          : null;
    const voucherDiscountValue = this.toMoneyValue(voucherRaw?.discountValue);
    const voucherAppliesToRaw = String(voucherRaw?.appliesTo || '')
      .trim()
      .toUpperCase();
    const voucherAppliesTo: 'INSTALLMENT' | 'TOTAL' | null =
      voucherAppliesToRaw === 'INSTALLMENT'
        ? 'INSTALLMENT'
        : voucherAppliesToRaw === 'TOTAL'
          ? 'TOTAL'
          : null;
    const voucherInstallmentScopeRaw = String(voucherRaw?.installmentScope || '')
      .trim()
      .toUpperCase();
    const voucherInstallmentScope: 'ALL' | 'SINGLE' =
      voucherInstallmentScopeRaw === 'SINGLE' ? 'SINGLE' : 'ALL';
    const appliedVoucher =
      voucherCode && voucherDiscountType && voucherDiscountValue > 0 && voucherAppliesTo
        ? {
            code: voucherCode,
            title: String(voucherRaw?.title || '').trim() || null,
            discountType: voucherDiscountType,
            discountValue: voucherDiscountValue,
            appliesTo: voucherAppliesTo,
            installmentScope: voucherInstallmentScope,
            discountLabel: String(voucherRaw?.discountLabel || '').trim(),
            targetLabel: String(voucherRaw?.targetLabel || '').trim() || null,
            discountedInstallments: this.toPositiveInt(
              voucherRaw?.discountedInstallments,
            ),
            discountedInstallmentAmount:
              this.toMoneyValue(voucherRaw?.discountedInstallmentAmount) > 0
                ? this.toMoneyValue(voucherRaw?.discountedInstallmentAmount)
                : null,
            regularInstallmentAmount:
              this.toMoneyValue(voucherRaw?.regularInstallmentAmount) > 0
                ? this.toMoneyValue(voucherRaw?.regularInstallmentAmount)
                : null,
          }
        : null;

    return {
      id,
      title,
      method,
      type: normalizedType as 'INSTALLMENTS' | 'CASH',
      totalAmount,
      installmentCount,
      installmentAmount,
      dueDay,
      installmentStartDate,
      note,
      discountEnabled,
      discountTotalAmount,
      discountInstallmentAmount,
      discountDeadlineDay,
      discountRequiresActiveCrf,
      discountAppliesTo,
      appliedVoucher,
    };
  }

  private buildChargeDueDate(baseDate: Date, monthOffset: number, dueDay?: number) {
    const dueDate = new Date(baseDate.getTime());
    dueDate.setMonth(dueDate.getMonth() + monthOffset);

    if (!dueDay) {
      return dueDate;
    }

    const year = dueDate.getFullYear();
    const month = dueDate.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    dueDate.setDate(Math.min(Math.max(1, dueDay), maxDay));
    return dueDate;
  }

  private toMoneyValue(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Number(Math.max(0, numeric).toFixed(2));
  }

  private toPositiveInt(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const integer = Math.trunc(numeric);
    return integer > 0 ? integer : null;
  }

  async sendAutomaticContractsForEnrollment(input: AutoSendContractInput) {
    const templates = await this.prisma.contractTemplate.findMany({
      where: {
        institutionId: input.institutionId,
        status: ContractTemplateStatus.PUBLISHED,
        autoSendEnabled: true,
        latestVersionNumber: { gt: 0 },
        institutionSignedAt: { not: null },
      },
      select: {
        id: true,
        autoSendAllCourses: true,
        autoSendCourseIds: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (templates.length === 0) return;

    for (const template of templates) {
      if (!template.autoSendAllCourses) {
        const templateCourseIds = this.parseUuidListFromJson(
          template.autoSendCourseIds,
        );
        if (
          !input.courseId ||
          templateCourseIds.length === 0 ||
          !templateCourseIds.includes(input.courseId)
        ) {
          continue;
        }
      }

      const alreadySent = await this.prisma.contractInstance.findFirst({
        where: {
          institutionId: input.institutionId,
          templateId: template.id,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
          status: {
            notIn: [ContractInstanceStatus.CANCELED, ContractInstanceStatus.ARCHIVED],
          },
        },
        select: { id: true },
      });
      if (alreadySent) continue;

      try {
        await this.sendInstance(
          {
            templateId: template.id,
            studentId: input.studentId,
            enrollmentId: input.enrollmentId,
            courseId: input.courseId || undefined,
            classId: input.classId || undefined,
            sendEmail: true,
          },
          {
            sub: input.createdByUserId,
            role: 'admin',
            activeInstitutionId: input.institutionId,
            activePermissionCodes: [],
          },
          { publicOrigin: input.publicOrigin ?? null },
        );
      } catch {
        // O envio automático não deve quebrar a matrícula se houver falha.
      }
    }
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

  private async resolveInstitutionSigner(userId: string, institutionId: string) {
    const signer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        institutionId: true,
        institutionMembers: {
          where: {
            institutionId,
            status: InstitutionMemberStatus.ACTIVE,
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    const belongsToInstitution = Boolean(
      signer &&
        (signer.institutionId === institutionId || signer.institutionMembers.length > 0),
    );

    if (!signer || !belongsToInstitution) {
      throw new NotFoundException(
        'Usuário responsável pela assinatura institucional não encontrado.',
      );
    }

    return signer;
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
    fallback?: {
      classStartDate?: Date | null;
      selectedPaymentOption?: ContractSelectedPaymentOption | null;
    },
  ): Promise<ContractInstallmentLine[]> {
    const selectedOption = fallback?.selectedPaymentOption ?? null;
    const hideScheduleForCreditCard =
      String(selectedOption?.method || '')
        .trim()
        .toUpperCase() === 'CREDIT_CARD';
    if (hideScheduleForCreditCard) {
      return [];
    }

    const charges = enrollmentId
      ? await this.prisma.monthlyCharge.findMany({
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
        })
      : [];

    if (charges.length > 0) {
      return charges.map((charge, index) => ({
        number: index + 1,
        dueDateLabel: this.formatDatePtBr(charge.dueDate),
        amountValue: Number(charge.amount ?? 0),
        amountLabel: this.formatCurrencyPtBr(Number(charge.amount)),
        statusLabel: this.chargeStatusLabel(charge.status),
      }));
    }

    if (!selectedOption || selectedOption.type !== 'INSTALLMENTS') {
      return [];
    }

    const months = Number(selectedOption.installmentCount ?? 0);
    if (!Number.isFinite(months) || months <= 0) {
      return [];
    }

    const regularInstallmentAmount = Number(selectedOption.installmentAmount ?? 0);
    if (!Number.isFinite(regularInstallmentAmount) || regularInstallmentAmount <= 0) {
      return [];
    }

    const discountDeadlineDay = Number(selectedOption.discountDeadlineDay ?? 0);
    const hasDeadline = Number.isFinite(discountDeadlineDay) && discountDeadlineDay > 0;
    const discountInstallmentAmount = selectedOption.discountEnabled
      ? Number(
          selectedOption.discountInstallmentAmount ??
            (Number(selectedOption.discountTotalAmount ?? 0) > 0
              ? this.toMoneyValue(
                  Number(selectedOption.discountTotalAmount ?? 0) / Math.max(1, months),
                )
              : 0),
        )
      : 0;
    const hasDiscountInstallment =
      Number.isFinite(discountInstallmentAmount) && discountInstallmentAmount > 0;
    const crfLabel = selectedOption.discountRequiresActiveCrf ? ' (CRF ativo)' : '';
    const voucher = selectedOption.appliedVoucher;
    const hasSingleInstallmentVoucher =
      voucher?.appliesTo === 'INSTALLMENT' &&
      voucher.installmentScope === 'SINGLE' &&
      Number(voucher.discountedInstallmentAmount ?? 0) > 0;

    const baseDate =
      (selectedOption.installmentStartDate &&
      !Number.isNaN(new Date(selectedOption.installmentStartDate).getTime())
        ? new Date(selectedOption.installmentStartDate)
        : null) ||
      (fallback?.classStartDate ? new Date(fallback.classStartDate) : null) ||
      new Date();

    return Array.from({ length: months }).map((_, index) => {
      const dueDate = this.buildChargeDueDate(
        baseDate,
        index,
        selectedOption.dueDay ?? undefined,
      );
      const amountValue = hasSingleInstallmentVoucher && index === 0
        ? this.toMoneyValue(voucher?.discountedInstallmentAmount ?? 0)
        : this.toMoneyValue(regularInstallmentAmount);
      const discountValue = hasDiscountInstallment
        ? this.toMoneyValue(discountInstallmentAmount)
        : 0;
      const discountLabel = hasDiscountInstallment
        ? `${this.formatCurrencyPtBr(discountValue)}${
            hasDeadline ? ` até dia ${discountDeadlineDay}` : ''
          }${crfLabel}`
        : null;
      const detailsLabel = hasDiscountInstallment
        ? `${hasDeadline ? `Até dia ${discountDeadlineDay}` : 'Pagamento antecipado'}: ${this.formatCurrencyPtBr(
            discountValue,
          )}. ${
            hasDeadline ? `Após dia ${discountDeadlineDay}` : 'Valor regular'
          }: ${this.formatCurrencyPtBr(amountValue)}${crfLabel}.`
        : hasSingleInstallmentVoucher && index === 0
          ? `Voucher aplicado nesta parcela: ${voucher?.discountLabel || voucher?.code || ''}.`
          : hasSingleInstallmentVoucher && index > 0
            ? `Parcela regular (voucher aplicado apenas na 1ª mensalidade).`
        : null;

      return {
        number: index + 1,
        dueDateLabel: this.formatDatePtBr(dueDate),
        amountValue,
        amountLabel: this.formatCurrencyPtBr(amountValue),
        statusLabel: 'Prevista',
        discountLabel,
        detailsLabel,
      };
    });
  }

  private chargeStatusLabel(status: string): string {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'PAID') return 'Pago';
    if (normalized === 'OVERDUE') return 'Em atraso';
    if (normalized === 'CANCELED') return 'Cancelado';
    return 'Pendente';
  }

  private paymentModelLabelPtBr(
    paymentModelRaw: string,
    installmentsCount: number,
  ): string {
    const normalized = String(paymentModelRaw || '').trim().toUpperCase();
    if (normalized === 'INSTALLMENTS' || installmentsCount > 1) {
      return 'Parcelado';
    }
    if (normalized === 'CASH') {
      return 'À vista';
    }
    return installmentsCount > 1 ? 'Parcelado' : 'À vista';
  }

  private buildInstallmentsTableHtml(
    installments: ContractInstallmentLine[],
  ): string {
    if (!installments.length) return '';
    const hasDiscount = installments.some((item) => Boolean(item.discountLabel));
    const hasDetails = installments.some((item) => Boolean(item.detailsLabel));
    const rows = installments
      .map(
        (item) =>
          `<tr><td>${this.escapeHtml(String(item.number))}</td><td>${this.escapeHtml(item.dueDateLabel)}</td><td>${this.escapeHtml(item.amountLabel)}</td>${
            hasDiscount
              ? `<td>${this.escapeHtml(item.discountLabel || '-')}</td>`
              : ''
          }<td>${this.escapeHtml(item.statusLabel)}</td>${
            hasDetails ? `<td>${this.escapeHtml(item.detailsLabel || '-')}</td>` : ''
          }</tr>`,
      )
      .join('');

    return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">
      <thead>
        <tr>
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Parcela</th>
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Vencimento</th>
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Valor</th>
          ${
            hasDiscount
              ? '<th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Valor antecipado</th>'
              : ''
          }
          <th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Status</th>
          ${
            hasDetails
              ? '<th style="text-align:left;border:1px solid #d1d5db;padding:6px;">Observações</th>'
              : ''
          }
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }



  private snapshotToRecord(
    snapshot: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      return { ...(snapshot as Record<string, unknown>) };
    }
    return {};
  }

  private readInstitutionSignature(snapshot: Prisma.JsonValue | null): {
    signedAt: string | null;
    signedByName: string | null;
    signatureData: string | null;
  } {
    const base = this.snapshotToRecord(snapshot);
    const rawSignature = base.institutionSignature;
    if (
      !rawSignature ||
      typeof rawSignature !== 'object' ||
      Array.isArray(rawSignature)
    ) {
      return {
        signedAt: null,
        signedByName: null,
        signatureData: null,
      };
    }

    const signature = rawSignature as Record<string, unknown>;
    const signedAtRaw = signature.signedAt;
    const signedByNameRaw = signature.signedByName;
    const signedAt =
      typeof signedAtRaw === 'string' && signedAtRaw.trim()
        ? signedAtRaw.trim()
        : null;
    const signedByName =
      typeof signedByNameRaw === 'string' && signedByNameRaw.trim()
        ? signedByNameRaw.trim()
        : null;
    const signatureDataRaw = signature.signatureData;
    const signatureData =
      typeof signatureDataRaw === 'string'
        ? this.normalizeSignatureDataUrl(signatureDataRaw)
        : null;

    return {
      signedAt,
      signedByName,
      signatureData,
    };
  }

  private readInstitutionSignatureDataFromTemplateVersion(
    placeholdersJson: Prisma.JsonValue | null,
  ): string | null {
    const placeholders = this.snapshotToRecord(placeholdersJson);
    const rawSignatureData = placeholders.__institutionSignatureData;
    if (typeof rawSignatureData !== 'string') return null;
    return this.normalizeSignatureDataUrl(rawSignatureData);
  }

  private buildInstitutionSignatureBlockHtml(params: {
    signerName: string;
    signedAt: Date;
    signatureCode: string;
    signatureData?: string | null;
  }) {
    const signedAtLabel = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(params.signedAt);

    const signatureImageSection = params.signatureData
      ? `
        <div style="margin-top:12px;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;"><strong>Assinatura:</strong></p>
          <img
            alt="Assinatura desenhada da instituição"
            src="${this.escapeHtml(params.signatureData)}"
            style="display:block;max-width:360px;width:100%;height:auto;border:1px solid #e5e7eb;border-radius:6px;background:#fff;"
          />
        </div>
      `
      : '';

    return `
      <section style="display:inline-block;width:48%;box-sizing:border-box;vertical-align:top;margin:0 1%;padding:16px;border:1px solid #d1d5db;border-radius:8px;background:#f8fafc;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;text-align:left;">
        <h4 style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:16px;line-height:1.3;">Assinatura institucional</h4>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;">
          <strong>Assinado por:</strong> ${this.escapeHtml(params.signerName)}
        </p>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;">
          <strong>Data/hora:</strong> ${this.escapeHtml(signedAtLabel)}
        </p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;">
          <strong>Código de assinatura:</strong> ${this.escapeHtml(params.signatureCode)}
        </p>
        ${signatureImageSection}
      </section>
    `;
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

    const cleanedUnsignedHtml = this.removeLegacySignatureIdentificationBlock(
      unsignedHtml,
    );

    const signatureBlock = `
      <section style="display:inline-block;width:48%;box-sizing:border-box;vertical-align:top;margin:0 1%;padding:16px;border:1px solid #d1d5db;border-radius:8px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;text-align:left;">
        <h4 style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:16px;line-height:1.3;">Assinatura eletrônica</h4>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;">
          <strong>Assinado por:</strong> ${this.escapeHtml(params.signerName)}
        </p>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;">
          <strong>Data/hora:</strong> ${this.escapeHtml(signedAtLabel)}
        </p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;">
          <strong>Código de assinatura:</strong> ${this.escapeHtml(params.signatureCode)}
        </p>
        <div style="margin-top:12px;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;"><strong>Assinatura:</strong></p>
          <img
            alt="Assinatura desenhada do signatário"
            src="${this.escapeHtml(params.signatureData)}"
            style="display:block;max-width:360px;width:100%;height:auto;border:1px solid #e5e7eb;border-radius:6px;background:#fff;"
          />
        </div>
      </section>
    `;

    return this.appendBlockAsDocumentPage(cleanedUnsignedHtml, signatureBlock);
  }

  private appendBlockAsDocumentPage(baseHtml: string, blockHtml: string): string {
    const base = String(baseHtml || '').trim();
    const block = String(blockHtml || '').trim();
    if (!block) return base;
    if (!base) return block;

    const wrapperRange = this.findDocumentWrapperRange(base);
    if (!wrapperRange) {
      if (base.includes('<!-- END_SIGNATURES_WRAPPER -->')) {
        return base.replace('<!-- END_SIGNATURES_WRAPPER -->', `\n${block}\n<!-- END_SIGNATURES_WRAPPER -->`);
      }
      return `${base}\n<div data-signatures-wrapper="true" style="text-align:center;margin-top:24px;width:100%;font-size:0;page-break-inside:avoid;">\n${block}\n<!-- END_SIGNATURES_WRAPPER -->\n</div>`.trim();
    }

    const inner = base.slice(wrapperRange.contentStart, wrapperRange.contentEnd);
    let nextInner = '';
    
    if (inner.includes('<!-- END_SIGNATURES_WRAPPER -->')) {
      nextInner = inner.replace('<!-- END_SIGNATURES_WRAPPER -->', `\n${block}\n<!-- END_SIGNATURES_WRAPPER -->`);
    } else {
      const sigWrapper = `<div data-signatures-wrapper="true" style="text-align:center;margin-top:24px;width:100%;font-size:0;page-break-inside:avoid;">\n${block}\n<!-- END_SIGNATURES_WRAPPER -->\n</div>`;
      nextInner = inner.trim() ? `${inner}\n${sigWrapper}` : sigWrapper;
    }

    return `${base.slice(0, wrapperRange.contentStart)}${nextInner}${base.slice(wrapperRange.contentEnd)}`.trim();
  }

  private hasMeaningfulContractHtml(fragment: string): boolean {
    const normalized = String(fragment || '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, '')
      .trim();
    return Boolean(normalized);
  }

  private splitContractPages(fragment: string): string[] {
    const pages = String(fragment || '')
      .replace(CONTRACT_PAGE_BREAK_REGEX, '<!--CONTRACT_PAGE_BREAK-->')
      .split('<!--CONTRACT_PAGE_BREAK-->');

    while (pages.length > 1 && !this.hasMeaningfulContractHtml(pages[pages.length - 1])) {
      pages.pop();
    }
    return pages;
  }

  private findDocumentWrapperRange(html: string): {
    start: number;
    contentStart: number;
    contentEnd: number;
    end: number;
    style: string | null;
  } | null {
    const source = String(html || '');
    if (!source) return null;

    const startRegex =
      /<div\b[^>]*data-contract-document-wrapper\s*=\s*["']true["'][^>]*>/i;
    const startMatch = startRegex.exec(source);
    if (!startMatch || startMatch.index == null) return null;

    const start = startMatch.index;
    const startTag = startMatch[0];
    const contentStart = start + startTag.length;
    const tagRegex = /<\/?div\b[^>]*>/gi;
    tagRegex.lastIndex = contentStart;

    let depth = 1;
    let contentEnd = -1;
    let end = -1;
    let nextTag: RegExpExecArray | null;

    while ((nextTag = tagRegex.exec(source)) !== null) {
      const token = nextTag[0];
      const isClosing = /^<\s*\//.test(token);
      const isSelfClosing = /\/\s*>$/.test(token);

      if (isClosing) depth -= 1;
      else if (!isSelfClosing) depth += 1;

      if (depth === 0) {
        contentEnd = nextTag.index;
        end = tagRegex.lastIndex;
        break;
      }
    }

    if (contentEnd < 0 || end < 0) return null;

    const styleMatch = startTag.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
    const style = styleMatch ? (styleMatch[2] ?? styleMatch[3] ?? '').trim() : null;

    return {
      start,
      contentStart,
      contentEnd,
      end,
      style: style || null,
    };
  }

  private expandEditorWrapperForPdf(html: string): string {
    const source = String(html || '').trim();
    if (!source) return source;

    const wrapperRange = this.findDocumentWrapperRange(source);
    if (!wrapperRange) return source;

    const before = source.slice(0, wrapperRange.start).trim();
    const inner = source.slice(wrapperRange.contentStart, wrapperRange.contentEnd);
    const after = source.slice(wrapperRange.end).trim();

    const pages: string[] = [];
    const pushMeaningfulPages = (fragment: string, force = false) => {
      const split = this.splitContractPages(fragment);
      split.forEach((page) => {
        if (force || this.hasMeaningfulContractHtml(page)) pages.push(page);
      });
    };

    pushMeaningfulPages(before);
    pushMeaningfulPages(inner, true);
    pushMeaningfulPages(after);

    if (!pages.length) return source;

    const originalStyle = wrapperRange.style || 'max-width:794px;width:100%;margin:0 auto;box-sizing:border-box;background:#fff;';

    const bgRegex = /(background(-image|-size|-position|-repeat|-color)?\s*:[^;]+;?)/gi;
    let backgroundStyle = '';
    let contentStyle = originalStyle.replace(bgRegex, (match) => {
      backgroundStyle += match;
      return '';
    });

    const paddingRegex = /padding\s*:\s*([^;]+);?/gi;
    const paddingMatch = contentStyle.match(paddingRegex);
    const paddingValue = paddingMatch ? paddingMatch[1].trim() : '48px';
    contentStyle = contentStyle.replace(paddingRegex, '');

    const heightRegex = /(min-height|height|max-height)\s*:\s*[^;]+;?/gi;
    contentStyle = contentStyle.replace(heightRegex, '');

    const fixedBgHtml = backgroundStyle
      ? `<div style="position:fixed;top:-${paddingValue};left:-${paddingValue};right:-${paddingValue};bottom:-${paddingValue};z-index:-1;${backgroundStyle}"></div>`
      : '';

    const contentHtml = pages.join('\n');
    const flowHtml = `<div style="${contentStyle}">${contentHtml || '<p>&nbsp;</p>'}</div>`;

    const styleBlock = `<style>@page { margin: ${paddingValue}; }</style>`;

    return `${styleBlock}\n${fixedBgHtml}\n${flowHtml}`;
  }

  private removeLegacySignatureIdentificationBlock(html: string): string {
    let normalized = String(html || '').trim();
    if (!normalized) return normalized;

    const decodeHtmlEntities = (value: string): string => {
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
        aacute: 'a',
        agrave: 'a',
        acirc: 'a',
        atilde: 'a',
        auml: 'a',
        eacute: 'e',
        ecirc: 'e',
        iacute: 'i',
        oacute: 'o',
        ocirc: 'o',
        otilde: 'o',
        uacute: 'u',
        ccedil: 'c',
      };

      return String(value || '').replace(
        /&(#x?[0-9a-f]+|[a-zA-Z]+);/g,
        (match: string, entity: string) => {
          const raw = String(entity || '').toLowerCase();
          if (!raw) return match;
          if (raw.startsWith('#x')) {
            const code = Number.parseInt(raw.slice(2), 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
          }
          if (raw.startsWith('#')) {
            const code = Number.parseInt(raw.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
          }
          return named[raw] ?? match;
        },
      );
    };

    const normalizeForMatch = (value: string): string =>
      decodeHtmlEntities(value)
        .replace(/<[^>]*>/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    normalized = normalized.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) => {
      const text = normalizeForMatch(tableHtml);
      const hasAluno =
        text.includes('aluno a contratante beneficiario') ||
        text.includes('aluno contratante beneficiario');
      const hasInstituicao = text.includes('instituicao professor responsavel');
      return hasAluno && hasInstituicao ? '' : tableHtml;
    });

    normalized = normalized.replace(
      /<(p|div|span|td)\b[^>]*>[\s\S]*?<\/\1>/gi,
      (blockHtml: string) => {
        const text = normalizeForMatch(blockHtml);
        return text.includes('codigo de assinatura eletronica') ? '' : blockHtml;
      },
    );

    return normalized;
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

  private normalizeKnownCorruptedTerms(value: string): string {
    return String(value || '')
      .replace(/C\?digo de assinatura/gi, 'Código de assinatura')
      .replace(/Assinatura eletr\?nica/gi, 'Assinatura eletrônica')
      .replace(/institui\?\?o/gi, 'instituição')
      .replace(/signat\?rio/gi, 'signatário');
  }

  private readSignedPdfBase64FromSnapshot(
    snapshot: Prisma.JsonValue | null | undefined,
  ): string | null {
    const record = this.snapshotToRecord(snapshot ?? null);
    const artifacts = this.snapshotToRecord(
      (record?.artifacts as Prisma.JsonValue | null | undefined) ?? null,
    );
    const raw = artifacts?.signedPdfBase64;
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim();
    return normalized || null;
  }

  private async renderContractPdfBuffer(htmlContent: string): Promise<Buffer> {
    const normalizedHtml = String(htmlContent || '').trim();
    if (!normalizedHtml) {
      throw new BadRequestException('Conteúdo do contrato vazio para gerar PDF.');
    }
    const printableHtml = this.expandEditorWrapperForPdf(normalizedHtml);

    let browser:
      | {
          newPage: (options?: unknown) => Promise<{
            setContent: (content: string, options?: unknown) => Promise<void>;
            pdf: (options?: unknown) => Promise<Uint8Array>;
          }>;
          close: () => Promise<void>;
        }
      | null = null;

    try {
      const importPlaywright = new Function(
        'moduleName',
        'return import(moduleName)',
      ) as (moduleName: string) => Promise<{
        chromium: {
          launch: (options?: unknown) => Promise<{
            newPage: (options?: unknown) => Promise<{
              setContent: (content: string, options?: unknown) => Promise<void>;
              pdf: (options?: unknown) => Promise<Uint8Array>;
            }>;
            close: () => Promise<void>;
          }>;
        };
      }>;
      const playwright = await importPlaywright('playwright-core');
      const configuredExecutable = String(
        this.configService.get<string>('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH') ||
          '',
      ).trim();
      const executablePath =
        configuredExecutable ||
        ['/usr/bin/chromium-browser', '/usr/bin/chromium'].find((candidate) => {
          try {
            return require('fs').existsSync(candidate);
          } catch {
            return false;
          }
        });

      browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ...(executablePath ? { executablePath } : {}),
      });
      const page = await browser.newPage({ locale: 'pt-BR' });
      const htmlDocument = /<html[\s>]/i.test(printableHtml)
        ? printableHtml
        : `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; padding: 0; }
  </style>
</head>
<body>${printableHtml}</body>
</html>`;

      await page.setContent(htmlDocument, { waitUntil: 'networkidle' });
      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      return Buffer.from(pdfBytes);
    } catch (error) {
      throw new InternalServerErrorException(
        `Não foi possível gerar o PDF do contrato: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      );
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
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

  private parseUuidListFromJson(raw: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(raw)) return [];
    const ids = raw
      .map((item) => String(item || '').trim())
      .filter((item) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          item,
        ),
      );
    return Array.from(new Set(ids));
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

  private sha256(value: string | Buffer) {
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
