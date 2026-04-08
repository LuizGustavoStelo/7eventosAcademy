import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '../auth/types/app-role.type';
import { PrismaService } from '../database/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { SecretsService } from '../security/secrets/secrets.service';
import { PayStudentChargeDto } from './dto/pay-student-charge.dto';

type StudentBrandingPalette = {
  primaryColor: string;
  primaryStrongColor: string;
  secondaryColor: string;
  secondaryStrongColor: string;
  backgroundColor: string;
  surfaceColor: string;
  surfaceSoftColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

type EnrollmentPaymentMethod = 'PIX' | 'BANK_SLIP' | 'CREDIT_CARD';
type FinancialProvider = 'manual' | 'sicoob' | 'asaas' | 'stripe';

type GenericSettings = {
  apiKey?: string;
};

type SicoobBaseUrls = {
  cobrancaBancaria?: string;
  cobrancaBancariaPagamentos?: string;
  pixPagamentos?: string;
  pixRecebimentos?: string;
  spbTransferencias?: string;
};

type SicoobSettings = {
  clientId?: string;
  tokenUrl?: string;
  baseUrls?: SicoobBaseUrls;
  sandboxBaseUrls?: SicoobBaseUrls;
  webhookUrl?: string;
  numeroCliente?: string;
  scopes?: string[];
  certificatePem?: string;
  privateKeyPem?: string;
  pixKey?: string;
  boletoModalidade?: number;
  boletoNumeroContaCorrente?: number;
  boletoNumeroContratoCobranca?: number;
};

type FinancialSettings = {
  sicoob?: SicoobSettings;
  generic?: GenericSettings;
};

type ResolvedSicoobConfig = {
  clientId: string;
  tokenUrl: string;
  numeroCliente: string;
  certPem: string;
  keyPem: string;
  pixKey: string | null;
  boletoModalidade: number;
  boletoNumeroContaCorrente: number;
  boletoNumeroContratoCobranca: string;
  cobrancaBancariaBaseUrl: string;
  pixRecebimentosBaseUrl: string;
};

type StudentChargePaymentResponse = {
  chargeId: string;
  provider: FinancialProvider;
  method: EnrollmentPaymentMethod;
  checkoutUrl: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pixCopyPaste: string | null;
  pixQrCodeImage: string | null;
  message: string;
};

type AsaasCustomerLookupResponse = {
  data?: Array<{ id?: string }>;
};

type AsaasPaymentResponse = {
  id?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
};

type AsaasPixQrCodeResponse = {
  payload?: string;
  encodedImage?: string;
};

type AsaasIdentificationFieldResponse = {
  identificationField?: string;
  nossoNumero?: string;
  barCode?: string;
};

type StripeCheckoutSessionResponse = {
  id?: string;
  url?: string | null;
  payment_status?: string;
  status?: string;
};

type WebhookProcessingResult = {
  success: true;
  ignored?: boolean;
  message: string;
};

type StudentChargePaymentContext = {
  id: string;
  amount: Prisma.Decimal;
  dueDate: Date;
  status: string;
  externalChargeId: string | null;
  ownerAdminId: string | null;
  enrollment: {
    id: string;
    selectedPaymentOption: Prisma.JsonValue | null;
    schoolClass: {
      name: string;
      course: {
        name: string;
        ownerAdminId: string;
      };
    };
    student: {
      name: string;
      email: string;
      studentProfile: {
        documentCpf: string | null;
        phone: string | null;
        zipCode: string | null;
        street: string | null;
        streetNumber: string | null;
        neighborhood: string | null;
        city: string | null;
        state: string | null;
        complement: string | null;
      } | null;
    };
  };
};

const DEFAULT_STUDENT_LOGO_URL = '/Logo-IPESK.png';
const DEFAULT_SICOOB_TOKEN_URL =
  'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';
const DEFAULT_SICOOB_BASE_URLS: Required<SicoobBaseUrls> = {
  cobrancaBancaria: 'https://api.sicoob.com.br/cobranca-bancaria/v3',
  cobrancaBancariaPagamentos: 'https://api.sicoob.com.br/pagamentos/v3',
  pixPagamentos: 'https://api.sicoob.com.br/pix-pagamentos/v2',
  pixRecebimentos: 'https://api.sicoob.com.br/pix/api/v2',
  spbTransferencias: 'https://api.sicoob.com.br/spb/v2',
};
const DEFAULT_SICOOB_SANDBOX_BASE_URLS: Required<SicoobBaseUrls> = {
  cobrancaBancaria:
    'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3',
  cobrancaBancariaPagamentos:
    'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria-pagamentos/v3',
  pixPagamentos:
    'https://sandbox.sicoob.com.br/sicoob/sandbox/pix-pagamentos/v2',
  pixRecebimentos: 'https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2',
  spbTransferencias: 'https://sandbox.sicoob.com.br/sicoob/sandbox/spb/v2',
};
const DEFAULT_STUDENT_PALETTE: StudentBrandingPalette = {
  primaryColor: '#139395',
  primaryStrongColor: '#0f7f81',
  secondaryColor: '#283e6e',
  secondaryStrongColor: '#1f3158',
  backgroundColor: '#eff3f4',
  surfaceColor: '#ffffff',
  surfaceSoftColor: '#f6f8f9',
  borderColor: '#d9e2e7',
  textColor: '#243650',
  mutedColor: '#5f7087',
};
const STUDENT_PALETTE_KEYS: Array<keyof StudentBrandingPalette> = [
  'primaryColor',
  'primaryStrongColor',
  'secondaryColor',
  'secondaryStrongColor',
  'backgroundColor',
  'surfaceColor',
  'surfaceSoftColor',
  'borderColor',
  'textColor',
  'mutedColor',
];

@Injectable()
export class MisService {
  private readonly logger = new Logger(MisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly financeService: FinanceService,
  ) {}

  async getAlunoMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        institution: {
          select: {
            id: true,
            name: true,
            slug: true,
            brandingLogoUrl: true,
            brandingPalette: true,
            updatedAt: true,
          },
        },
        enrollments: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            institution: {
              select: {
                id: true,
                name: true,
                slug: true,
                brandingLogoUrl: true,
                brandingPalette: true,
                updatedAt: true,
              },
            },
          },
        },
        studentProfile: {
          select: {
            documentCpf: true,
            phone: true,
            birthDate: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const institution = user.enrollments[0]?.institution ?? user.institution ?? null;
    const branding = this.resolveStudentBranding(institution);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      studentProfile: user.studentProfile,
      institution: institution
        ? {
            id: institution.id,
            name: institution.name,
            slug: institution.slug,
          }
        : null,
      branding,
    };
  }

  async getAlunoMatriculas(userId: string) {
    const enrollments = await this.fetchActiveEnrollments(userId);
    return this.mapMatriculas(enrollments);
  }

  async getAlunoMateriais(userId: string) {
    const classIds = await this.fetchActiveClassIds(userId);
    if (classIds.length === 0) {
      return [];
    }

    return this.fetchMateriaisByClassIds(classIds);
  }

  async getAlunoAvisos(userId: string) {
    const classIds = await this.fetchActiveClassIds(userId);
    if (classIds.length === 0) {
      return [];
    }

    return this.fetchAvisosByClassIds(classIds, userId);
  }

  async getAlunoCobrancas(userId: string) {
    return this.fetchCobrancasByStudentId(userId);
  }

  async payAlunoCobranca(
    userId: string,
    chargeId: string,
    input: PayStudentChargeDto,
  ): Promise<StudentChargePaymentResponse> {
    const charge = await this.findChargeForStudentPayment(userId, chargeId);
    if (!charge) {
      throw new NotFoundException('Cobrança não encontrada.');
    }

    if (charge.status === 'PAID') {
      throw new BadRequestException('Esta cobrança já foi quitada.');
    }

    if (charge.status === 'CANCELED') {
      throw new BadRequestException(
        'Esta cobrança foi cancelada e não pode ser paga.',
      );
    }

    const method = this.resolveEnrollmentPaymentMethod(
      charge.enrollment.selectedPaymentOption,
    );
    const ownerAdminId =
      charge.ownerAdminId || charge.enrollment.schoolClass.course.ownerAdminId;

    if (!ownerAdminId) {
      return this.buildManualPaymentResponse(charge.id, method);
    }

    const config = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId: ownerAdminId },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    const provider = this.normalizeFinancialProvider(config?.provider);
    const settings = this.decryptFinancialSettings(config?.encryptedSettings);
    this.logger.log(
      `[checkout] charge=${charge.id} provider=${provider} method=${method} ownerAdmin=${ownerAdminId || 'none'}`,
    );

    if (!config?.isActive || provider === 'manual') {
      return this.buildManualPaymentResponse(charge.id, method);
    }

    if (provider === 'sicoob') {
      return this.createSicoobPayment({
        charge,
        method,
        provider,
        environment: config.environment,
        settings,
      });
    }

    const apiKey = settings.generic?.apiKey?.trim() || '';
    if (!apiKey) {
      return this.buildManualPaymentResponse(
        charge.id,
        method,
        'Pagamento automático não está habilitado para esta conta.',
        provider,
      );
    }

    if (provider === 'asaas') {
      return this.createAsaasPayment({
        apiKey,
        charge,
        method,
        environment: config.environment,
        provider,
      });
    }

    if (provider === 'stripe') {
      return this.createStripePayment({
        apiKey,
        charge,
        method,
        returnUrl: input.returnUrl,
        provider,
      });
    }

    return this.buildManualPaymentResponse(
      charge.id,
      method,
      'O provedor configurado ainda não possui checkout automático nesta área.',
      provider,
    );
  }

  async handlePaymentWebhook(
    providerRaw: string,
    payload: unknown,
    headers: Record<string, unknown>,
  ): Promise<WebhookProcessingResult> {
    const provider = this.normalizeFinancialProvider(providerRaw);
    if (provider === 'manual') {
      return {
        success: true,
        ignored: true,
        message: `Webhook ignorado para provedor "${provider}".`,
      };
    }

    const configuredSecret = String(
      process.env.PAYMENT_WEBHOOK_SECRET || '',
    ).trim();
    if (configuredSecret) {
      const providedSecret = this.extractWebhookSecret(headers);
      if (!providedSecret || providedSecret !== configuredSecret) {
        throw new BadRequestException('Webhook não autorizado.');
      }
    }

    if (provider === 'sicoob') {
      return this.handleSicoobWebhook(payload);
    }

    if (provider === 'asaas') {
      return this.handleAsaasWebhook(payload);
    }

    if (provider === 'stripe') {
      return this.handleStripeWebhook(payload);
    }

    return {
      success: true,
      ignored: true,
      message: 'Provedor sem integração de webhook nesta versão.',
    };
  }

  async getAlunoAgenda(userId: string) {
    const classIds = await this.fetchActiveClassIds(userId);
    if (classIds.length === 0) return [];
    return this.fetchAgendaByClassIds(classIds);
  }

  async getAlunoDashboard(userId: string) {
    const [me, enrollments, cobrancas] = await Promise.all([
      this.getAlunoMe(userId),
      this.fetchActiveEnrollments(userId),
      this.getAlunoCobrancas(userId),
    ]);

    const matriculas = this.mapMatriculas(enrollments);
    const classIds = this.uniqueClassIds(enrollments.map((en) => en.classId));

    if (classIds.length === 0) {
      return { me, matriculas, materiais: [], avisos: [], cobrancas, agenda: [] };
    }

    const [materiais, avisos, agenda] = await Promise.all([
      this.fetchMateriaisByClassIds(classIds),
      this.fetchAvisosByClassIds(classIds, userId),
      this.fetchAgendaByClassIds(classIds),
    ]);

    return { me, matriculas, materiais, avisos, cobrancas, agenda };
  }

  private async fetchActiveEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      select: {
        id: true,
        status: true,
        classId: true,
        schoolClass: {
          select: {
            name: true,
            startDate: true,
            endDate: true,
            course: {
              select: {
                name: true,
                modality: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private mapMatriculas(enrollments: Awaited<ReturnType<MisService['fetchActiveEnrollments']>>) {
    return enrollments.map((en) => ({
      enrollmentId: en.id,
      status: en.status,
      className: en.schoolClass.name,
      courseName: en.schoolClass.course.name,
      modality: en.schoolClass.course.modality,
      startDate: en.schoolClass.startDate,
      endDate: en.schoolClass.endDate,
    }));
  }

  private async fetchActiveClassIds(userId: string) {
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      select: { classId: true },
    });
    return this.uniqueClassIds(activeEnrollments.map((e) => e.classId));
  }

  private async fetchMateriaisByClassIds(classIds: string[]) {
    const materials = await this.prisma.studyMaterial.findMany({
      where: { classId: { in: classIds } },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        fileUrl: true,
        externalUrl: true,
        publishedAt: true,
        schoolClass: { select: { name: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    return materials.map((mat) => ({
      id: mat.id,
      title: mat.title,
      description: mat.description,
      kind: mat.kind,
      fileUrl: mat.fileUrl,
      externalUrl: mat.externalUrl,
      className: mat.schoolClass.name,
      publishedAt: mat.publishedAt,
    }));
  }

  private async fetchAvisosByClassIds(classIds: string[], viewerUserId?: string) {
    const now = new Date();
    const notices = await this.prisma.classNotice.findMany({
      where: {
        classId: { in: classIds },
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        title: true,
        body: true,
        priority: true,
        publishedAt: true,
        schoolClass: { select: { name: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    if (viewerUserId && notices.length > 0) {
      await this.prisma.classNoticeView.createMany({
        data: notices.map((notice) => ({
          noticeId: notice.id,
          userId: viewerUserId,
        })),
        skipDuplicates: true,
      });
    }

    return notices.map((notice) => ({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      priority: notice.priority,
      className: notice.schoolClass.name,
      publishedAt: notice.publishedAt,
    }));
  }

  private async fetchAgendaByClassIds(classIds: string[]) {
    const keys = classIds.map((classId) => `agenda-class:${classId}`);
    if (keys.length === 0) return [];

    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: keys,
        },
      },
      select: {
        value: true,
      },
    });

    const events: Array<{
      id: string;
      type: string;
      title: string;
      classId: string | null;
      className: string;
      teacher: string;
      datetime: string;
      provider: string | null;
    }> = [];

    rows.forEach((row) => {
      try {
        const parsed = JSON.parse(row.value) as {
          events?: Array<{
            id?: string;
            type?: string;
            title?: string;
            classId?: string | null;
            className?: string;
            teacher?: string;
            datetime?: string;
            provider?: string | null;
          }>;
        };
        if (!Array.isArray(parsed.events)) return;
        parsed.events.forEach((eventItem) => {
          if (!eventItem?.datetime) return;
          events.push({
            id: String(eventItem.id ?? `${Date.now()}-${Math.random()}`),
            type: eventItem.type === 'live' ? 'live' : 'class',
            title: String(eventItem.title ?? 'Evento'),
            classId: eventItem.classId ?? null,
            className: String(eventItem.className ?? 'Turma'),
            teacher: String(eventItem.teacher ?? 'Professor(a)'),
            datetime: String(eventItem.datetime),
            provider: eventItem.provider ?? null,
          });
        });
      } catch {
        // ignora payload inválido de configuração
      }
    });

    return events
      .sort((a, b) => {
        const first = new Date(a.datetime).getTime();
        const second = new Date(b.datetime).getTime();
        return first - second;
      })
      .slice(0, 120);
  }

  private async fetchCobrancasByStudentId(userId: string) {
    const charges = await this.prisma.monthlyCharge.findMany({
      where: {
        enrollment: {
          studentId: userId,
        },
      },
      select: {
        id: true,
        enrollmentId: true,
        dueDate: true,
        amount: true,
        status: true,
        externalChargeId: true,
        createdAt: true,
        enrollment: {
          select: {
            createdAt: true,
            selectedPaymentOption: true,
            schoolClass: {
              select: {
                name: true,
                course: {
                  select: {
                    name: true,
                    enrollmentFee: true,
                  },
                },
              },
            },
          },
        },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            provider: true,
            status: true,
            amount: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 30,
    });
    const descriptionByChargeId = this.buildStudentChargeDescriptionMap(charges);

    return charges.map((charge) => ({
      id: charge.id,
      enrollmentId: charge.enrollmentId,
      dueDate: charge.dueDate,
      amount: Number(charge.amount),
      status: charge.status,
      description:
        descriptionByChargeId.get(charge.id) ??
        this.buildStudentChargeDefaultDescription(
          charge.enrollment.selectedPaymentOption,
        ),
      paymentMethod: this.resolveEnrollmentPaymentMethod(
        charge.enrollment.selectedPaymentOption,
      ),
      paymentOptionTitle: this.resolveEnrollmentPaymentOptionTitle(
        charge.enrollment.selectedPaymentOption,
      ),
      canPay: charge.status === 'PENDING' || charge.status === 'OVERDUE',
      externalChargeId: charge.externalChargeId,
      className: charge.enrollment.schoolClass.name,
      courseName: charge.enrollment.schoolClass.course.name,
      lastTransaction: charge.paymentTransactions[0]
        ? {
            id: charge.paymentTransactions[0].id,
            provider: charge.paymentTransactions[0].provider,
            status: charge.paymentTransactions[0].status,
            amount: Number(charge.paymentTransactions[0].amount),
            paidAt: charge.paymentTransactions[0].paidAt,
            createdAt: charge.paymentTransactions[0].createdAt,
          }
        : null,
    }));
  }

  private buildStudentChargeDescriptionMap(
    charges: Array<{
      id: string;
      enrollmentId: string;
      amount: Prisma.Decimal;
      dueDate: Date;
      createdAt: Date;
      enrollment: {
        createdAt: Date;
        selectedPaymentOption: Prisma.JsonValue | null;
        schoolClass: {
          course: {
            enrollmentFee: Prisma.Decimal | null;
          };
        };
      };
    }>,
  ) {
    const descriptionById = new Map<string, string>();
    const byEnrollment = new Map<string, typeof charges>();

    for (const charge of charges) {
      const list = byEnrollment.get(charge.enrollmentId) ?? [];
      list.push(charge);
      byEnrollment.set(charge.enrollmentId, list);
    }

    byEnrollment.forEach((items) => {
      const ordered = [...items].sort(
        (a, b) =>
          a.dueDate.getTime() - b.dueDate.getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const first = ordered[0];
      if (!first) return;

      const enrollmentFee = this.toMoneyValue(
        Number(first.enrollment.schoolClass.course.enrollmentFee ?? 0),
      );

      const enrollmentFeeCharge =
        enrollmentFee > 0
          ? ordered.find((item) => {
              const amount = this.toMoneyValue(Number(item.amount));
              if (amount !== enrollmentFee) return false;
              const dueDay = new Date(
                item.dueDate.getFullYear(),
                item.dueDate.getMonth(),
                item.dueDate.getDate(),
              ).getTime();
              const enrollmentDay = new Date(
                first.enrollment.createdAt.getFullYear(),
                first.enrollment.createdAt.getMonth(),
                first.enrollment.createdAt.getDate(),
              ).getTime();
              return dueDay === enrollmentDay;
            }) ?? null
          : null;

      if (enrollmentFeeCharge) {
        descriptionById.set(enrollmentFeeCharge.id, 'Matrícula');
      }

      const selectedOption = this.parseStudentSelectedPaymentOption(
        first.enrollment.selectedPaymentOption,
      );
      const remaining = ordered.filter(
        (item) => !enrollmentFeeCharge || item.id !== enrollmentFeeCharge.id,
      );
      if (remaining.length === 0) return;

      if (selectedOption.type === 'CASH') {
        remaining.forEach((item) => {
          descriptionById.set(item.id, 'Valor do curso');
        });
        return;
      }

      const totalInstallments =
        selectedOption.installmentCount > 0
          ? selectedOption.installmentCount
          : remaining.length;

      remaining.forEach((item, index) => {
        if (totalInstallments <= 1) {
          descriptionById.set(item.id, 'Mensalidade 1/1');
          return;
        }
        const currentInstallment = Math.min(index + 1, totalInstallments);
        descriptionById.set(
          item.id,
          `Mensalidade ${currentInstallment}/${totalInstallments}`,
        );
      });
    });

    return descriptionById;
  }

  private parseStudentSelectedPaymentOption(
    raw: Prisma.JsonValue | null | undefined,
  ): {
    type: 'CASH' | 'INSTALLMENTS';
    installmentCount: number;
  } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { type: 'INSTALLMENTS', installmentCount: 0 };
    }

    const record = raw as Record<string, unknown>;
    const type =
      String(record.type || '').toUpperCase() === 'INSTALLMENTS'
        ? 'INSTALLMENTS'
        : 'CASH';
    const installmentCount = Number(record.installmentCount ?? 0);

    return {
      type,
      installmentCount:
        Number.isFinite(installmentCount) && installmentCount > 0
          ? installmentCount
          : 0,
    };
  }

  private buildStudentChargeDefaultDescription(
    raw: Prisma.JsonValue | null | undefined,
  ) {
    const selectedOption = this.parseStudentSelectedPaymentOption(raw);
    if (selectedOption.type === 'CASH') return 'Valor do curso';
    if (selectedOption.installmentCount > 0) {
      return `Mensalidade 1/${selectedOption.installmentCount}`;
    }
    return 'Cobrança';
  }

  private async handleAsaasWebhook(
    payload: unknown,
  ): Promise<WebhookProcessingResult> {
    const externalPaymentId = this.extractAsaasPaymentId(payload);
    if (!externalPaymentId) {
      return {
        success: true,
        ignored: true,
        message: 'Evento Asaas sem payment.id.',
      };
    }

    const charge = await this.findChargeByExternalChargeId(externalPaymentId);
    if (!charge) {
      return {
        success: true,
        ignored: true,
        message: 'Nenhuma cobrança local vinculada ao pagamento recebido.',
      };
    }

    const ownerAdminId =
      charge.ownerAdminId || charge.enrollment.schoolClass.course.ownerAdminId;
    if (!ownerAdminId) {
      return {
        success: true,
        ignored: true,
        message: 'Cobrança sem conta administradora vinculada.',
      };
    }

    const gatewayConfig = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId: ownerAdminId },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    if (!gatewayConfig?.isActive) {
      return {
        success: true,
        ignored: true,
        message: 'Gateway financeiro inativo para a conta desta cobrança.',
      };
    }

    if (this.normalizeFinancialProvider(gatewayConfig.provider) !== 'asaas') {
      return {
        success: true,
        ignored: true,
        message: 'Conta não está configurada com provedor Asaas.',
      };
    }

    const settings = this.decryptFinancialSettings(gatewayConfig.encryptedSettings);
    const apiKey = settings.generic?.apiKey?.trim() || '';
    if (!apiKey) {
      return {
        success: true,
        ignored: true,
        message: 'API key do Asaas não configurada na conta.',
      };
    }

    const asaasBaseUrl = this.resolveAsaasBaseUrl(gatewayConfig.environment);
    const providerPayment = await this.tryGetAsaasPayment({
      baseUrl: asaasBaseUrl,
      apiKey,
      paymentId: externalPaymentId,
    });

    const payloadStatus = this.extractAsaasPaymentStatus(payload);
    const providerStatus = String((providerPayment as Record<string, unknown>)?.status || '')
      .trim()
      .toUpperCase();
    const resolvedStatus = providerStatus || payloadStatus;
    const resolution = this.mapAsaasStatusToResolution(resolvedStatus);

    if (!resolution) {
      return {
        success: true,
        ignored: true,
        message: `Status Asaas sem ação mapeada: ${resolvedStatus || 'desconhecido'}.`,
      };
    }

    const paidAt = this.extractAsaasPaidAt(
      providerPayment as Record<string, unknown> | null,
      payload,
    );
    await this.applyGatewayChargeResolution({
      chargeId: charge.id,
      currentChargeStatus: charge.status,
      provider: 'asaas',
      externalReference: externalPaymentId,
      amount: Number(charge.amount),
      chargeStatus: resolution.chargeStatus,
      transactionStatus: resolution.transactionStatus,
      paidAt,
    });

    return {
      success: true,
      message: `Webhook Asaas processado para cobrança ${charge.id}.`,
    };
  }

  private async handleStripeWebhook(
    payload: unknown,
  ): Promise<WebhookProcessingResult> {
    const sessionIdFromPayload = this.extractStripeSessionId(payload);
    const chargeIdFromPayload = this.extractStripeChargeId(payload);

    let charge = sessionIdFromPayload
      ? await this.findChargeByExternalChargeId(sessionIdFromPayload)
      : null;
    if (!charge && chargeIdFromPayload) {
      charge = await this.findChargeById(chargeIdFromPayload);
    }

    if (!charge) {
      return {
        success: true,
        ignored: true,
        message: 'Nenhuma cobrança local vinculada ao evento Stripe.',
      };
    }

    const ownerAdminId =
      charge.ownerAdminId || charge.enrollment.schoolClass.course.ownerAdminId;
    if (!ownerAdminId) {
      return {
        success: true,
        ignored: true,
        message: 'Cobrança sem conta administradora vinculada.',
      };
    }

    const gatewayConfig = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId: ownerAdminId },
      select: {
        provider: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    if (!gatewayConfig?.isActive) {
      return {
        success: true,
        ignored: true,
        message: 'Gateway financeiro inativo para a conta desta cobrança.',
      };
    }

    if (this.normalizeFinancialProvider(gatewayConfig.provider) !== 'stripe') {
      return {
        success: true,
        ignored: true,
        message: 'Conta não está configurada com provedor Stripe.',
      };
    }

    const settings = this.decryptFinancialSettings(gatewayConfig.encryptedSettings);
    const apiKey = settings.generic?.apiKey?.trim() || '';
    if (!apiKey) {
      return {
        success: true,
        ignored: true,
        message: 'API key do Stripe não configurada na conta.',
      };
    }

    const sessionId = sessionIdFromPayload || charge.externalChargeId || '';
    if (!sessionId) {
      return {
        success: true,
        ignored: true,
        message: 'Evento Stripe sem checkout session vinculada.',
      };
    }

    const session = await this.stripeRequest<StripeCheckoutSessionResponse>({
      apiKey,
      path: `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      method: 'GET',
    });

    const resolution = this.mapStripeSessionToResolution(session);
    if (!resolution) {
      return {
        success: true,
        ignored: true,
        message: 'Evento Stripe sem ação mapeada para cobrança.',
      };
    }

    await this.applyGatewayChargeResolution({
      chargeId: charge.id,
      currentChargeStatus: charge.status,
      provider: 'stripe',
      externalReference: sessionId,
      amount: Number(charge.amount),
      chargeStatus: resolution.chargeStatus,
      transactionStatus: resolution.transactionStatus,
      paidAt: resolution.transactionStatus === 'success' ? new Date() : null,
    });

    return {
      success: true,
      message: `Webhook Stripe processado para cobrança ${charge.id}.`,
    };
  }

  private async handleSicoobWebhook(
    payload: unknown,
  ): Promise<WebhookProcessingResult> {
    const references = this.extractSicoobWebhookReferences(payload);
    if (
      references.externalChargeIds.length === 0 &&
      references.chargeIds.length === 0
    ) {
      return {
        success: true,
        ignored: true,
        message: 'Evento Sicoob sem identificador de cobrança.',
      };
    }

    let charge: Awaited<ReturnType<MisService['findChargeById']>> = null;
    let matchedReference = '';

    for (const externalId of references.externalChargeIds) {
      const found = await this.findChargeByExternalChargeId(externalId);
      if (found) {
        charge = found;
        matchedReference = externalId;
        break;
      }
    }

    if (!charge) {
      for (const chargeId of references.chargeIds) {
        const found = await this.findChargeById(chargeId);
        if (found) {
          charge = found;
          matchedReference = chargeId;
          break;
        }
      }
    }

    if (!charge) {
      return {
        success: true,
        ignored: true,
        message: 'Nenhuma cobrança local vinculada ao webhook Sicoob.',
      };
    }

    const ownerAdminId =
      charge.ownerAdminId || charge.enrollment.schoolClass.course.ownerAdminId;
    if (!ownerAdminId) {
      return {
        success: true,
        ignored: true,
        message: 'Cobrança sem conta administradora vinculada.',
      };
    }

    const gatewayConfig = await this.prisma.accountFinancialConfig.findUnique({
      where: { userId: ownerAdminId },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        encryptedSettings: true,
      },
    });

    if (!gatewayConfig?.isActive) {
      return {
        success: true,
        ignored: true,
        message: 'Gateway financeiro inativo para a conta desta cobrança.',
      };
    }

    if (this.normalizeFinancialProvider(gatewayConfig.provider) !== 'sicoob') {
      return {
        success: true,
        ignored: true,
        message: 'Conta não está configurada com provedor Sicoob.',
      };
    }

    const settings = this.decryptFinancialSettings(gatewayConfig.encryptedSettings);
    const sicoobConfig = this.resolveSicoobConfig(
      settings,
      gatewayConfig.environment,
    );
    if (!sicoobConfig) {
      return {
        success: true,
        ignored: true,
        message: 'Configuração Sicoob incompleta para reconciliação automática.',
      };
    }

    const resolution = await this.resolveSicoobWebhookStatus({
      charge,
      payload,
      config: sicoobConfig,
    });
    if (!resolution) {
      return {
        success: true,
        ignored: true,
        message: 'Status Sicoob sem ação mapeada para automação.',
      };
    }

    const externalReference =
      resolution.externalReference ||
      this.extractSicoobExternalId(charge.externalChargeId, 'sicoob-pix:') ||
      this.extractSicoobExternalId(charge.externalChargeId, 'sicoob-boleto:') ||
      matchedReference ||
      charge.id;

    await this.applyGatewayChargeResolution({
      chargeId: charge.id,
      currentChargeStatus: charge.status,
      provider: 'sicoob',
      externalReference,
      amount: Number(charge.amount),
      chargeStatus: resolution.chargeStatus,
      transactionStatus: resolution.transactionStatus,
      paidAt: resolution.paidAt,
    });

    return {
      success: true,
      message: `Webhook Sicoob processado para cobrança ${charge.id}.`,
    };
  }

  private extractSicoobWebhookReferences(payload: unknown): {
    externalChargeIds: string[];
    chargeIds: string[];
  } {
    const externalChargeIds = new Set<string>();
    const chargeIds = new Set<string>();

    const txid = this.extractFirstValueAsString(payload, [
      'txid',
      'txId',
      'pixTxid',
      'idTransacao',
      'idCobrancaPix',
    ]);
    if (txid) {
      externalChargeIds.add(`sicoob-pix:${txid}`);
    }

    const nossoNumeroRaw = this.extractFirstValueAsString(payload, [
      'nossoNumero',
      'nosso_numero',
      'numeroNossoNumero',
      'numeroTitulo',
      'numeroTituloCliente',
    ]);
    const nossoNumeroDigits = String(nossoNumeroRaw || '').replace(/\D/g, '');
    if (nossoNumeroDigits) {
      externalChargeIds.add(`sicoob-boleto:${nossoNumeroDigits}`);
    } else if (nossoNumeroRaw) {
      externalChargeIds.add(`sicoob-boleto:${nossoNumeroRaw}`);
    }

    const externalReferenceRaw = this.extractFirstValueAsString(payload, [
      'externalChargeId',
      'externalReference',
      'referenciaExterna',
      'chargeReference',
      'chargeId',
      'monthlyChargeId',
    ]);
    if (externalReferenceRaw) {
      const normalizedReference = externalReferenceRaw.trim();
      if (
        normalizedReference.toLowerCase().startsWith('sicoob-pix:') ||
        normalizedReference.toLowerCase().startsWith('sicoob-boleto:')
      ) {
        externalChargeIds.add(normalizedReference);
      }

      if (/^[0-9a-f-]{36}$/i.test(normalizedReference)) {
        chargeIds.add(normalizedReference);
      }
    }

    return {
      externalChargeIds: Array.from(externalChargeIds),
      chargeIds: Array.from(chargeIds),
    };
  }

  private async resolveSicoobWebhookStatus(input: {
    charge: Awaited<ReturnType<MisService['findChargeById']>>;
    payload: unknown;
    config: ResolvedSicoobConfig;
  }): Promise<{
    chargeStatus: 'pending' | 'paid' | 'overdue' | 'canceled';
    transactionStatus: 'pending' | 'success' | 'failed' | 'refunded' | null;
    paidAt: Date | null;
    externalReference: string;
  } | null> {
    const externalChargeId = String(input.charge?.externalChargeId || '').trim();
    const pixTxid = this.extractSicoobExternalId(externalChargeId, 'sicoob-pix:');
    const boletoNossoNumero = this.extractSicoobExternalId(
      externalChargeId,
      'sicoob-boleto:',
    );

    let providerPayload: unknown = null;
    let externalReference = '';

    if (pixTxid) {
      externalReference = pixTxid;
      providerPayload = await this.tryGetSicoobPixCharge({
        config: input.config,
        txid: pixTxid,
      });
    } else if (boletoNossoNumero) {
      externalReference = boletoNossoNumero;
      providerPayload = await this.tryGetSicoobBoletoCharge({
        config: input.config,
        nossoNumero: boletoNossoNumero,
      });
    }

    const providerStatus = this.extractSicoobStatus(providerPayload);
    const payloadStatus = this.extractSicoobStatus(input.payload);
    const resolution = this.mapSicoobStatusToResolution(
      providerStatus || payloadStatus,
      input.payload,
    );
    if (!resolution) {
      return null;
    }

    const paidAt = this.extractSicoobPaidAt(providerPayload, input.payload);
    return {
      chargeStatus: resolution.chargeStatus,
      transactionStatus: resolution.transactionStatus,
      paidAt,
      externalReference,
    };
  }

  private async tryGetSicoobPixCharge(input: {
    config: ResolvedSicoobConfig;
    txid: string;
  }): Promise<Record<string, unknown> | null> {
    if (!input.txid.trim()) return null;

    try {
      const accessToken = await this.requestSicoobAccessToken({
        config: input.config,
        scope: 'cob.read pix.read',
      });
      return await this.sicoobJsonRequest<Record<string, unknown>>({
        url: `${input.config.pixRecebimentosBaseUrl}/cob/${encodeURIComponent(input.txid)}`,
        method: 'GET',
        config: input.config,
        accessToken,
        scope: 'cob.read pix.read',
      });
    } catch {
      return null;
    }
  }

  private async tryGetSicoobBoletoCharge(input: {
    config: ResolvedSicoobConfig;
    nossoNumero: string;
  }): Promise<Record<string, unknown> | null> {
    if (!input.nossoNumero.trim()) return null;

    try {
      const accessToken = await this.requestSicoobAccessToken({
        config: input.config,
        scope: 'boletos_consulta',
      });

      const numeroContratoCliente = this.resolveSicoobNumeroContratoCobranca(
        input.config,
      );
      const consultaUrl = new URL(`${input.config.cobrancaBancariaBaseUrl}/boletos`);
      consultaUrl.searchParams.set(
        'numeroContrato',
        String(numeroContratoCliente),
      );
      consultaUrl.searchParams.set(
        'modalidade',
        String(input.config.boletoModalidade),
      );
      consultaUrl.searchParams.set('nossoNumero', String(input.nossoNumero));

      try {
        const queried = await this.sicoobJsonRequest<unknown>({
          url: consultaUrl.toString(),
          method: 'GET',
          config: input.config,
          accessToken,
          scope: 'boletos_consulta',
          appendClientIdHeader: true,
        });
        const parsedQuery = this.extractObjectPayload(queried);
        if (parsedQuery) return parsedQuery;
      } catch {
        // Fallback para segunda via quando a consulta principal não estiver disponível.
      }

      const segundaViaUrl = new URL(
        `${input.config.cobrancaBancariaBaseUrl}/boletos/segunda-via`,
      );
      segundaViaUrl.searchParams.set(
        'numeroContrato',
        String(numeroContratoCliente),
      );
      segundaViaUrl.searchParams.set(
        'modalidade',
        String(input.config.boletoModalidade),
      );
      segundaViaUrl.searchParams.set('nossoNumero', String(input.nossoNumero));
      segundaViaUrl.searchParams.set('gerarPdf', 'false');

      const segundaVia = await this.sicoobJsonRequest<unknown>({
        url: segundaViaUrl.toString(),
        method: 'GET',
        config: input.config,
        accessToken,
        scope: 'boletos_consulta',
        appendClientIdHeader: true,
      });

      return this.extractObjectPayload(segundaVia);
    } catch {
      return null;
    }
  }

  private extractObjectPayload(payload: unknown): Record<string, unknown> | null {
    if (!payload) return null;

    if (Array.isArray(payload)) {
      const firstObject = payload.find(
        (item) => item && typeof item === 'object' && !Array.isArray(item),
      );
      return firstObject ? (firstObject as Record<string, unknown>) : null;
    }

    if (typeof payload !== 'object') return null;
    const directObject = payload as Record<string, unknown>;

    const prioritizedKeys = ['data', 'resultado', 'result', 'boleto'];
    for (const key of prioritizedKeys) {
      const value = directObject[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        const firstObject = value.find(
          (item) => item && typeof item === 'object' && !Array.isArray(item),
        );
        if (firstObject) return firstObject as Record<string, unknown>;
        continue;
      }
      if (typeof value === 'object') {
        return value as Record<string, unknown>;
      }
    }

    const arrayKeys = ['boletos', 'items', 'content', 'lista'];
    for (const key of arrayKeys) {
      const value = directObject[key];
      if (!Array.isArray(value)) continue;
      const firstObject = value.find(
        (item) => item && typeof item === 'object' && !Array.isArray(item),
      );
      if (firstObject) return firstObject as Record<string, unknown>;
    }

    return directObject;
  }

  private extractSicoobStatus(payload: unknown): string {
    return (
      this.extractFirstValueAsString(payload, [
        'status',
        'situacao',
        'situacaoTitulo',
        'situacaoCobranca',
        'statusTitulo',
        'statusCobranca',
        'statusPagamento',
        'estado',
      ]) || ''
    );
  }

  private mapSicoobStatusToResolution(
    status: string,
    payload: unknown,
  ): {
    chargeStatus: 'pending' | 'paid' | 'overdue' | 'canceled';
    transactionStatus: 'pending' | 'success' | 'failed' | 'refunded' | null;
  } | null {
    const normalizedStatus = this.normalizeStatusToken(status);
    const normalizedEvent = this.normalizeStatusToken(
      this.extractFirstValueAsString(payload, [
        'evento',
        'event',
        'tipoEvento',
        'tipo',
      ]) || '',
    );
    const token = normalizedStatus || normalizedEvent;
    if (!token) return null;

    if (
      token.includes('CONCLUID') ||
      token.includes('LIQUIDAD') ||
      token.includes('PAGO') ||
      token.includes('RECEBID')
    ) {
      return {
        chargeStatus: 'paid',
        transactionStatus: 'success',
      };
    }

    if (token.includes('DEVOLVID') || token.includes('ESTORN')) {
      return {
        chargeStatus: 'canceled',
        transactionStatus: 'refunded',
      };
    }

    if (
      token.includes('CANCEL') ||
      token.includes('REMOVID') ||
      token.includes('BAIXAD') ||
      token.includes('REJEIT')
    ) {
      return {
        chargeStatus: 'canceled',
        transactionStatus: 'failed',
      };
    }

    if (
      token.includes('VENCID') ||
      token.includes('ATRAS') ||
      token.includes('INADIMPL')
    ) {
      return {
        chargeStatus: 'overdue',
        transactionStatus: 'failed',
      };
    }

    if (
      token.includes('ATIVA') ||
      token.includes('ABERTO') ||
      token.includes('PENDEN') ||
      token.includes('REGISTR') ||
      token.includes('CRIAD') ||
      token.includes('GERAD')
    ) {
      return {
        chargeStatus: 'pending',
        transactionStatus: 'pending',
      };
    }

    return null;
  }

  private normalizeStatusToken(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  private extractSicoobPaidAt(
    providerPayload: unknown,
    eventPayload: unknown,
  ): Date | null {
    const keys = [
      'dataPagamento',
      'dataLiquidacao',
      'dataHoraPagamento',
      'dataHoraLiquidacao',
      'horario',
      'horarioPagamento',
      'horarioLiquidacao',
      'liquidadoEm',
      'paidAt',
    ];

    const providerValue = this.extractFirstValueAsString(providerPayload, keys);
    const parsedProviderDate = this.parseProviderDate(providerValue);
    if (parsedProviderDate) return parsedProviderDate;

    const eventValue = this.extractFirstValueAsString(eventPayload, keys);
    return this.parseProviderDate(eventValue);
  }

  private parseProviderDate(value: string | null | undefined): Date | null {
    const normalized = String(value || '').trim();
    if (!normalized) return null;

    const dateTimePtBr = normalized.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (dateTimePtBr) {
      const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = dateTimePtBr;
      const parsed = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh),
        Number(min),
        Number(ss),
      );
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private async applyGatewayChargeResolution(input: {
    chargeId: string;
    currentChargeStatus: string;
    provider: FinancialProvider;
    externalReference: string;
    amount: number;
    chargeStatus: 'pending' | 'paid' | 'overdue' | 'canceled';
    transactionStatus: 'pending' | 'success' | 'failed' | 'refunded' | null;
    paidAt: Date | null;
  }) {
    const current = String(input.currentChargeStatus || '')
      .trim()
      .toUpperCase();

    if (
      current === 'PAID' &&
      (input.chargeStatus === 'pending' || input.chargeStatus === 'overdue')
    ) {
      return;
    }

    if (
      current === 'CANCELED' &&
      (input.chargeStatus === 'pending' || input.chargeStatus === 'overdue')
    ) {
      return;
    }

    if (input.transactionStatus === 'success') {
      const txExternalId = `${input.provider}:${input.externalReference}:success`;
      const existingSuccess = await this.prisma.paymentTransaction.findUnique({
        where: { externalTransactionId: txExternalId },
        select: { id: true },
      });

      if (!existingSuccess) {
        await this.financeService.createTransaction(
          {
            monthlyChargeId: input.chargeId,
            provider: input.provider,
            amount: Number(input.amount),
            status: 'success',
            externalTransactionId: txExternalId,
            paidAt: input.paidAt ? input.paidAt.toISOString() : undefined,
          },
          this.buildWebhookSystemUser(),
        );
      } else if (current !== 'PAID') {
        await this.financeService.updateChargeStatus(
          input.chargeId,
          { status: 'paid' },
          this.buildWebhookSystemUser(),
        );
      }
      return;
    }

    if (input.chargeStatus === 'pending' && current !== 'PENDING') {
      await this.financeService.updateChargeStatus(
        input.chargeId,
        { status: 'pending' },
        this.buildWebhookSystemUser(),
      );
    }

    if (input.chargeStatus === 'overdue' && current !== 'OVERDUE') {
      await this.financeService.updateChargeStatus(
        input.chargeId,
        { status: 'overdue' },
        this.buildWebhookSystemUser(),
      );
    }

    if (input.chargeStatus === 'canceled' && current !== 'CANCELED') {
      await this.financeService.updateChargeStatus(
        input.chargeId,
        { status: 'canceled' },
        this.buildWebhookSystemUser(),
      );
    }

    if (input.transactionStatus) {
      const txExternalId = `${input.provider}:${input.externalReference}:${input.transactionStatus}`;
      const existingTransaction = await this.prisma.paymentTransaction.findUnique({
        where: { externalTransactionId: txExternalId },
        select: { id: true },
      });

      if (!existingTransaction) {
        await this.prisma.paymentTransaction.create({
          data: {
            monthlyChargeId: input.chargeId,
            provider: input.provider,
            amount: Number(input.amount),
            status: this.mapTransactionStatusToPrisma(input.transactionStatus),
            externalTransactionId: txExternalId,
            paidAt:
              input.transactionStatus === 'refunded' && input.paidAt
                ? input.paidAt
                : null,
          },
        });
      }
    }
  }

  private mapAsaasStatusToResolution(status: string): {
    chargeStatus: 'pending' | 'paid' | 'overdue' | 'canceled';
    transactionStatus: 'pending' | 'success' | 'failed' | 'refunded' | null;
  } | null {
    const normalized = String(status || '')
      .trim()
      .toUpperCase();

    if (
      normalized === 'RECEIVED' ||
      normalized === 'CONFIRMED' ||
      normalized === 'RECEIVED_IN_CASH'
    ) {
      return {
        chargeStatus: 'paid',
        transactionStatus: 'success',
      };
    }

    if (normalized === 'OVERDUE') {
      return {
        chargeStatus: 'overdue',
        transactionStatus: 'failed',
      };
    }

    if (normalized === 'PENDING' || normalized === 'AWAITING_RISK_ANALYSIS') {
      return {
        chargeStatus: 'pending',
        transactionStatus: 'pending',
      };
    }

    if (
      normalized === 'REFUNDED' ||
      normalized.startsWith('CHARGEBACK_') ||
      normalized === 'DELETED'
    ) {
      return {
        chargeStatus: 'canceled',
        transactionStatus: normalized === 'REFUNDED' ? 'refunded' : 'failed',
      };
    }

    return null;
  }

  private mapStripeSessionToResolution(session: StripeCheckoutSessionResponse): {
    chargeStatus: 'pending' | 'paid' | 'overdue' | 'canceled';
    transactionStatus: 'pending' | 'success' | 'failed' | 'refunded' | null;
  } | null {
    const paymentStatus = String(session.payment_status || '')
      .trim()
      .toLowerCase();
    const sessionStatus = String(session.status || '')
      .trim()
      .toLowerCase();

    if (paymentStatus === 'paid') {
      return {
        chargeStatus: 'paid',
        transactionStatus: 'success',
      };
    }

    if (sessionStatus === 'expired') {
      return {
        chargeStatus: 'canceled',
        transactionStatus: 'failed',
      };
    }

    if (sessionStatus === 'open' || paymentStatus === 'unpaid') {
      return {
        chargeStatus: 'pending',
        transactionStatus: 'pending',
      };
    }

    return null;
  }

  private extractAsaasPaymentId(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;

    if (typeof root.paymentId === 'string' && root.paymentId.trim()) {
      return root.paymentId.trim();
    }

    const paymentObject = root.payment;
    if (paymentObject && typeof paymentObject === 'object') {
      const paymentId = String(
        (paymentObject as Record<string, unknown>).id || '',
      ).trim();
      if (paymentId) return paymentId;
    }

    const directId = String(root.id || '').trim();
    if (directId.startsWith('pay_') || directId.startsWith('pay')) {
      return directId;
    }

    return '';
  }

  private extractAsaasPaymentStatus(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;
    const paymentObject = root.payment;
    if (paymentObject && typeof paymentObject === 'object') {
      const paymentStatus = String(
        (paymentObject as Record<string, unknown>).status || '',
      )
        .trim()
        .toUpperCase();
      if (paymentStatus) return paymentStatus;
    }
    return '';
  }

  private extractAsaasPaidAt(
    paymentPayload: Record<string, unknown> | null,
    eventPayload: unknown,
  ): Date | null {
    const parseDateSafe = (value: unknown): Date | null => {
      const parsed = new Date(String(value || '').trim());
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed;
    };

    const paymentDate =
      paymentPayload?.paymentDate ||
      paymentPayload?.clientPaymentDate ||
      paymentPayload?.confirmedDate;
    const fromProvider = parseDateSafe(paymentDate);
    if (fromProvider) return fromProvider;

    if (eventPayload && typeof eventPayload === 'object') {
      const root = eventPayload as Record<string, unknown>;
      const paymentObject = root.payment;
      if (paymentObject && typeof paymentObject === 'object') {
        const localDate =
          (paymentObject as Record<string, unknown>).paymentDate ||
          (paymentObject as Record<string, unknown>).clientPaymentDate ||
          (paymentObject as Record<string, unknown>).confirmedDate;
        const fromEvent = parseDateSafe(localDate);
        if (fromEvent) return fromEvent;
      }
    }

    return null;
  }

  private extractStripeSessionId(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;

    const dataObject =
      root.data && typeof root.data === 'object'
        ? (root.data as Record<string, unknown>).object
        : null;
    if (dataObject && typeof dataObject === 'object') {
      const id = String((dataObject as Record<string, unknown>).id || '').trim();
      if (id.startsWith('cs_')) return id;
    }

    const directId = String(root.id || '').trim();
    if (directId.startsWith('cs_')) return directId;
    return '';
  }

  private extractStripeChargeId(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;
    const dataObject =
      root.data && typeof root.data === 'object'
        ? (root.data as Record<string, unknown>).object
        : null;
    if (!dataObject || typeof dataObject !== 'object') return '';

    const metadata = (dataObject as Record<string, unknown>).metadata;
    if (!metadata || typeof metadata !== 'object') return '';

    const value = String((metadata as Record<string, unknown>).chargeId || '').trim();
    if (/^[0-9a-f-]{36}$/i.test(value)) {
      return value;
    }
    return '';
  }

  private extractWebhookSecret(headers: Record<string, unknown>): string {
    const byHeader =
      this.readHeader(headers, 'x-webhook-token') ||
      this.readHeader(headers, 'asaas-access-token') ||
      this.readHeader(headers, 'x-sicoob-token') ||
      this.readHeader(headers, 'x-api-key');
    if (byHeader) return byHeader;

    const authorization = this.readHeader(headers, 'authorization');
    if (!authorization) return '';
    const [type, token] = authorization.split(' ');
    if (String(type || '').trim().toLowerCase() !== 'bearer') return '';
    return String(token || '').trim();
  }

  private readHeader(headers: Record<string, unknown>, name: string): string {
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers || {})) {
      if (key.toLowerCase() !== target) continue;
      if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === 'string');
        return String(first || '').trim();
      }
      return String(value || '').trim();
    }
    return '';
  }

  private buildWebhookSystemUser(): JwtPayload {
    return {
      sub: 'webhook-system',
      email: 'webhook-system@internal.local',
      role: 'superadmin',
    };
  }

  private mapTransactionStatusToPrisma(
    status: 'pending' | 'success' | 'failed' | 'refunded',
  ) {
    if (status === 'pending') return 'PENDING' as const;
    if (status === 'success') return 'SUCCESS' as const;
    if (status === 'failed') return 'FAILED' as const;
    return 'REFUNDED' as const;
  }

  private async findChargeByExternalChargeId(externalChargeId: string) {
    const normalized = String(externalChargeId || '').trim();
    if (!normalized) return null;

    return this.prisma.monthlyCharge.findUnique({
      where: { externalChargeId: normalized },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        status: true,
        externalChargeId: true,
        ownerAdminId: true,
        enrollment: {
          select: {
            id: true,
            selectedPaymentOption: true,
            schoolClass: {
              select: {
                name: true,
                course: {
                  select: {
                    name: true,
                    ownerAdminId: true,
                  },
                },
              },
            },
            student: {
              select: {
                name: true,
                email: true,
                studentProfile: {
                  select: {
                    documentCpf: true,
                    phone: true,
                    zipCode: true,
                    street: true,
                    streetNumber: true,
                    neighborhood: true,
                    city: true,
                    state: true,
                    complement: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private async findChargeById(chargeId: string) {
    const normalized = String(chargeId || '').trim();
    if (!normalized) return null;

    return this.prisma.monthlyCharge.findUnique({
      where: { id: normalized },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        status: true,
        externalChargeId: true,
        ownerAdminId: true,
        enrollment: {
          select: {
            id: true,
            selectedPaymentOption: true,
            schoolClass: {
              select: {
                name: true,
                course: {
                  select: {
                    name: true,
                    ownerAdminId: true,
                  },
                },
              },
            },
            student: {
              select: {
                name: true,
                email: true,
                studentProfile: {
                  select: {
                    documentCpf: true,
                    phone: true,
                    zipCode: true,
                    street: true,
                    streetNumber: true,
                    neighborhood: true,
                    city: true,
                    state: true,
                    complement: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private async findChargeForStudentPayment(
    userId: string,
    chargeId: string,
  ): Promise<StudentChargePaymentContext | null> {
    return this.prisma.monthlyCharge.findFirst({
      where: {
        id: chargeId,
        enrollment: {
          studentId: userId,
        },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        status: true,
        externalChargeId: true,
        ownerAdminId: true,
        enrollment: {
          select: {
            id: true,
            selectedPaymentOption: true,
            schoolClass: {
              select: {
                name: true,
                course: {
                  select: {
                    name: true,
                    ownerAdminId: true,
                  },
                },
              },
            },
            student: {
              select: {
                name: true,
                email: true,
                studentProfile: {
                  select: {
                    documentCpf: true,
                    phone: true,
                    zipCode: true,
                    street: true,
                    streetNumber: true,
                    neighborhood: true,
                    city: true,
                    state: true,
                    complement: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private async createSicoobPayment(input: {
    charge: StudentChargePaymentContext;
    method: EnrollmentPaymentMethod;
    provider: FinancialProvider;
    environment: string;
    settings: FinancialSettings;
  }): Promise<StudentChargePaymentResponse> {
    const config = this.resolveSicoobConfig(input.settings, input.environment);
    if (!config) {
      return this.buildManualPaymentResponse(
        input.charge.id,
        input.method,
        'Configuração do Sicoob incompleta. Revise certificado, chave e dados da conta no financeiro.',
        input.provider,
      );
    }

    if (input.method === 'CREDIT_CARD') {
      return this.buildManualPaymentResponse(
        input.charge.id,
        input.method,
        'Cartão de crédito não está disponível via Sicoob neste fluxo. Use Pix, boleto ou cobrança manual.',
        input.provider,
      );
    }

    if (input.method === 'PIX') {
      if (!config.pixKey) {
        return this.buildManualPaymentResponse(
          input.charge.id,
          input.method,
          'Para Pix no Sicoob, configure a chave Pix da conta no financeiro.',
          input.provider,
        );
      }
      return this.createSicoobPixPayment({
        charge: input.charge,
        provider: input.provider,
        config,
      });
    }

    return this.createSicoobBankSlipPayment({
      charge: input.charge,
      provider: input.provider,
      config,
    });
  }

  private async createSicoobPixPayment(input: {
    charge: StudentChargePaymentContext;
    provider: FinancialProvider;
    config: ResolvedSicoobConfig;
  }): Promise<StudentChargePaymentResponse> {
    const existingTxid = this.extractSicoobExternalId(
      input.charge.externalChargeId,
      'sicoob-pix:',
    );
    const txid = existingTxid || this.buildSicoobTxid(input.charge.id);
    const scope = 'cob.write cob.read pix.write pix.read';
    const accessToken = await this.requestSicoobAccessToken({
      config: input.config,
      scope,
    });

    const profile = input.charge.enrollment.student.studentProfile;
    const cpfCnpj = this.onlyDigits(profile?.documentCpf);
    const devedor: Record<string, string> = {};
    if (cpfCnpj.length === 11) devedor.cpf = cpfCnpj;
    if (cpfCnpj.length === 14) devedor.cnpj = cpfCnpj;
    const studentName = String(input.charge.enrollment.student.name || '').trim();
    if (studentName) {
      devedor.nome = studentName.slice(0, 200);
    }

    const pixPayload: Record<string, unknown> = {
      calendario: { expiracao: 86_400 },
      valor: {
        original: this.formatAmountForGateway(Number(input.charge.amount)),
      },
      chave: input.config.pixKey,
      solicitacaoPagador: `${input.charge.enrollment.schoolClass.course.name} - ${input.charge.enrollment.schoolClass.name}`.slice(
        0,
        140,
      ),
    };
    if (Object.keys(devedor).length > 0) {
      pixPayload.devedor = devedor;
    }

    await this.sicoobJsonRequest<Record<string, unknown>>({
      url: `${input.config.pixRecebimentosBaseUrl}/cob/${encodeURIComponent(txid)}`,
      method: 'PUT',
      config: input.config,
      accessToken,
      scope,
      body: pixPayload,
    });

    const qrCodeResponse = await this.sicoobJsonRequest<Record<string, unknown>>({
      url: `${input.config.pixRecebimentosBaseUrl}/cob/${encodeURIComponent(txid)}/qrcode`,
      method: 'GET',
      config: input.config,
      accessToken,
      scope: 'cob.read pix.read',
    });

    const externalChargeId = `sicoob-pix:${txid}`;
    if (externalChargeId !== input.charge.externalChargeId) {
      await this.prisma.monthlyCharge.update({
        where: { id: input.charge.id },
        data: { externalChargeId },
      });
    }

    await this.ensurePendingTransactionRecord({
      chargeId: input.charge.id,
      provider: input.provider,
      amount: Number(input.charge.amount),
      externalTransactionId: externalChargeId,
    });

    const pixCopyPaste = this.extractFirstValueAsString(qrCodeResponse, [
      'qrcode',
      'qrCode',
      'payload',
      'emv',
    ]);
    const pixQrCodeImage = this.extractFirstValueAsString(qrCodeResponse, [
      'imagemQrcode',
      'imagemQrCode',
      'imagemQrcodeBase64',
      'qrcodeBase64',
      'encodedImage',
      'image',
    ]);

    return {
      chargeId: input.charge.id,
      provider: input.provider,
      method: 'PIX',
      checkoutUrl: null,
      invoiceUrl: null,
      bankSlipUrl: null,
      pixCopyPaste,
      pixQrCodeImage,
      message: pixCopyPaste
        ? 'Cobrança Pix gerada com sucesso.'
        : 'Cobrança Pix criada. Consulte os detalhes no financeiro para finalizar o pagamento.',
    };
  }

  private async createSicoobBankSlipPayment(input: {
    charge: StudentChargePaymentContext;
    provider: FinancialProvider;
    config: ResolvedSicoobConfig;
  }): Promise<StudentChargePaymentResponse> {
    const profile = input.charge.enrollment.student.studentProfile;
    const cpfCnpj = this.onlyDigits(profile?.documentCpf);
    if (!cpfCnpj || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      return this.buildManualPaymentResponse(
        input.charge.id,
        'BANK_SLIP',
        'Para emitir boleto no Sicoob, o aluno precisa ter CPF/CNPJ válido no cadastro.',
        input.provider,
      );
    }

    if (!profile?.street || !profile.neighborhood || !profile.city || !profile.state) {
      return this.buildManualPaymentResponse(
        input.charge.id,
        'BANK_SLIP',
        'Para emitir boleto no Sicoob, complete endereço (rua, bairro, cidade e UF) no cadastro do aluno.',
        input.provider,
      );
    }

    const existingNossoNumero = this.extractSicoobExternalId(
      input.charge.externalChargeId,
      'sicoob-boleto:',
    );
    const accessToken = await this.requestSicoobAccessToken({
      config: input.config,
      scope: 'boletos_inclusao boletos_consulta boletos_alteracao',
    });

    const today = this.toYyyyMmDd(new Date());
    const dueDate = this.toYyyyMmDd(input.charge.dueDate);
    const studentName = String(input.charge.enrollment.student.name || '').trim();
    const email = String(input.charge.enrollment.student.email || '').trim().toLowerCase();
    const numeroContratoCliente = this.resolveSicoobNumeroContratoCobranca(
      input.config,
    );
    const numeroContratoClienteAsNumber =
      this.parsePositiveInteger(numeroContratoCliente, null) ?? undefined;
    this.logger.log(
      `[sicoob-boleto] emit charge=${input.charge.id} cliente=${numeroContratoCliente} contrato=${numeroContratoCliente} modalidade=${input.config.boletoModalidade} conta=${input.config.boletoNumeroContaCorrente} nossoNumero=${existingNossoNumero || 'novo'}`,
    );

    const boletoPayload: Record<string, unknown> = {
      numeroCliente: numeroContratoClienteAsNumber ?? numeroContratoCliente,
      codigoModalidade: input.config.boletoModalidade,
      numeroContaCorrente: input.config.boletoNumeroContaCorrente,
      codigoEspecieDocumento: 'DM',
      dataEmissao: today,
      seuNumero: input.charge.id.slice(0, 20),
      identificacaoBoletoEmpresa: input.charge.id.slice(0, 20),
      identificacaoEmissaoBoleto: 1,
      identificacaoDistribuicaoBoleto: 1,
      valor: Number(input.charge.amount),
      dataVencimento: dueDate,
      dataLimitePagamento: dueDate,
      tipoDesconto: 0,
      tipoMulta: 0,
      tipoJurosMora: 0,
      numeroParcela: 1,
      aceite: false,
      codigoNegativacao: 0,
      numeroDiasNegativacao: 0,
      codigoProtesto: 0,
      numeroDiasProtesto: 0,
      pagador: {
        numeroCpfCnpj: cpfCnpj,
        nome: studentName.slice(0, 100),
        endereco: String(profile.street || '').slice(0, 120),
        bairro: String(profile.neighborhood || '').slice(0, 60),
        cidade: String(profile.city || '').slice(0, 60),
        cep: this.onlyDigits(profile.zipCode).slice(0, 8),
        uf: String(profile.state || '').slice(0, 2).toUpperCase(),
        email: email || undefined,
      },
      gerarPdf: false,
      codigoCadastrarPIX: 1,
    };
    if (existingNossoNumero) {
      boletoPayload.nossoNumero = Number(existingNossoNumero);
    }

    const inclusionUrlDefault = `${input.config.cobrancaBancariaBaseUrl}/boletos`;
    const inclusionUrlByContract = this.buildSicoobBoletosInclusionUrl(
      input.config,
      numeroContratoCliente,
    );
    const inclusionUrlLegacy = this.buildSicoobBoletosInclusionLegacyUrl(
      input.config,
      numeroContratoCliente,
    );
    const emitBankSlip = async (url: string) =>
      this.sicoobJsonRequest<Record<string, unknown>>({
        url,
        method: 'POST',
        config: input.config,
        accessToken,
        scope: 'boletos_inclusao',
        body: boletoPayload,
        appendClientIdHeader: true,
      });

    let emitted: Record<string, unknown>;
    try {
      emitted = await emitBankSlip(inclusionUrlDefault);
    } catch (error) {
      const message = String((error as Error)?.message || '').toLowerCase();
      const normalizedMessage = message
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const contractClientMismatch =
        normalizedMessage.includes('numero do contrato') &&
        normalizedMessage.includes('numero do cliente');
      this.logger.warn(
        `[sicoob-boleto] emit failed charge=${input.charge.id} mismatch=${contractClientMismatch} message=${String(
          (error as Error)?.message || '',
        )}`,
      );
      if (!contractClientMismatch) {
        throw error;
      }
      delete boletoPayload.nossoNumero;
      boletoPayload.numeroCliente =
        numeroContratoClienteAsNumber ?? numeroContratoCliente;
      this.logger.warn(
        `[sicoob-boleto] retry without nossoNumero charge=${input.charge.id} cliente=${numeroContratoCliente} strategy=contract-query`,
      );
      try {
        emitted = await emitBankSlip(inclusionUrlByContract);
      } catch (retryError) {
        this.logger.warn(
          `[sicoob-boleto] retry failed charge=${input.charge.id} strategy=contract-query message=${String(
            (retryError as Error)?.message || '',
          )}`,
        );
        this.logger.warn(
          `[sicoob-boleto] retry without nossoNumero charge=${input.charge.id} cliente=${numeroContratoCliente} strategy=legacy-query`,
        );
        emitted = await emitBankSlip(inclusionUrlLegacy);
      }
    }
    const parsedNossoNumero =
      this.extractFirstValueAsString(emitted, [
        'nossoNumero',
        'nosso_numero',
        'numeroNossoNumero',
        'numeroTitulo',
      ]) || existingNossoNumero;
    this.logger.log(
      `[sicoob-boleto] emit success charge=${input.charge.id} nossoNumero=${parsedNossoNumero || 'n/a'}`,
    );
    let bankSlipUrl = this.extractFirstValueAsString(emitted, [
      'urlPdfBoleto',
      'urlBoleto',
      'linkBoleto',
      'boletoUrl',
      'url',
    ]);
    const linhaDigitavel = this.extractFirstValueAsString(emitted, [
      'linhaDigitavel',
      'linha',
    ]);

    if (!bankSlipUrl && parsedNossoNumero) {
      const segundaViaUrl = new URL(
        `${input.config.cobrancaBancariaBaseUrl}/boletos/segunda-via`,
      );
      segundaViaUrl.searchParams.set(
        'numeroContrato',
        String(numeroContratoCliente),
      );
      segundaViaUrl.searchParams.set(
        'modalidade',
        String(input.config.boletoModalidade),
      );
      segundaViaUrl.searchParams.set('nossoNumero', String(parsedNossoNumero));
      segundaViaUrl.searchParams.set('gerarPdf', 'false');

      try {
        const segundaVia = await this.sicoobJsonRequest<Record<string, unknown>>({
          url: segundaViaUrl.toString(),
          method: 'GET',
          config: input.config,
          accessToken,
          scope: 'boletos_consulta',
          appendClientIdHeader: true,
        });

        bankSlipUrl = this.extractFirstValueAsString(segundaVia, [
          'urlPdfBoleto',
          'urlBoleto',
          'linkBoleto',
          'boletoUrl',
          'url',
        ]);
      } catch {
        // Se a segunda via falhar, mantém a cobrança válida e retorna mensagem/linha digitável.
      }
    }

    const externalChargeId = parsedNossoNumero
      ? `sicoob-boleto:${parsedNossoNumero}`
      : null;
    if (externalChargeId && externalChargeId !== input.charge.externalChargeId) {
      await this.prisma.monthlyCharge.update({
        where: { id: input.charge.id },
        data: { externalChargeId },
      });
    }

    await this.ensurePendingTransactionRecord({
      chargeId: input.charge.id,
      provider: input.provider,
      amount: Number(input.charge.amount),
      externalTransactionId: externalChargeId,
    });

    return {
      chargeId: input.charge.id,
      provider: input.provider,
      method: 'BANK_SLIP',
      checkoutUrl: bankSlipUrl,
      invoiceUrl: bankSlipUrl,
      bankSlipUrl,
      pixCopyPaste: null,
      pixQrCodeImage: null,
      message: bankSlipUrl
        ? 'Boleto gerado com sucesso.'
        : linhaDigitavel
          ? `Boleto emitido. Linha digitável: ${linhaDigitavel}`
          : 'Boleto emitido com sucesso.',
    };
  }

  private resolveSicoobConfig(
    settings: FinancialSettings,
    environment: string | null | undefined,
  ): ResolvedSicoobConfig | null {
    const sicoob = settings.sicoob;
    if (!sicoob) {
      return null;
    }

    const isProduction =
      String(environment || '')
        .trim()
        .toLowerCase() === 'production';
    const defaultBaseUrls = isProduction
      ? DEFAULT_SICOOB_BASE_URLS
      : DEFAULT_SICOOB_SANDBOX_BASE_URLS;
    const selectedBaseUrls = this.resolveSicoobBaseUrls(
      isProduction ? sicoob.baseUrls : sicoob.sandboxBaseUrls,
      defaultBaseUrls,
    );

    const clientId = String(sicoob.clientId || '').trim();
    const tokenUrl = this.normalizeBaseUrl(
      String(sicoob.tokenUrl || DEFAULT_SICOOB_TOKEN_URL).trim(),
    );
    const numeroCliente = this.parsePositiveIntegerString(
      sicoob.numeroCliente,
      null,
    );
    const certPem = this.normalizePem(sicoob.certificatePem);
    const keyPem = this.normalizePem(sicoob.privateKeyPem);

    if (!clientId || !tokenUrl || !numeroCliente || !certPem || !keyPem) {
      return null;
    }

    const pixKey =
      String(sicoob.pixKey || '').trim() ||
      String(process.env.SICOOB_PIX_KEY || '').trim() ||
      null;
    const boletoModalidade =
      this.parsePositiveInteger(
        sicoob.boletoModalidade,
        this.parsePositiveInteger(process.env.SICOOB_BOLETO_MODALIDADE, 1),
      ) ?? 1;
    const boletoNumeroContaCorrente =
      this.parsePositiveInteger(
        sicoob.boletoNumeroContaCorrente,
        this.parsePositiveInteger(
          process.env.SICOOB_BOLETO_NUMERO_CONTA_CORRENTE,
          this.parsePositiveInteger(numeroCliente, 1),
        ),
      ) ?? this.parsePositiveInteger(numeroCliente, 1)!;
    return {
      clientId,
      tokenUrl,
      numeroCliente,
      certPem,
      keyPem,
      pixKey,
      boletoModalidade,
      boletoNumeroContaCorrente,
      boletoNumeroContratoCobranca: numeroCliente,
      cobrancaBancariaBaseUrl: selectedBaseUrls.cobrancaBancaria,
      pixRecebimentosBaseUrl: selectedBaseUrls.pixRecebimentos,
    };
  }

  private resolveSicoobNumeroContratoCobranca(
    config: ResolvedSicoobConfig,
  ): string {
    return config.numeroCliente;
  }

  private resolveSicoobBaseUrls(
    baseUrls: SicoobBaseUrls | undefined,
    defaults: Required<SicoobBaseUrls>,
  ): Required<SicoobBaseUrls> {
    return {
      cobrancaBancaria: this.normalizeBaseUrl(
        baseUrls?.cobrancaBancaria || defaults.cobrancaBancaria,
      ),
      cobrancaBancariaPagamentos: this.normalizeBaseUrl(
        baseUrls?.cobrancaBancariaPagamentos ||
          defaults.cobrancaBancariaPagamentos,
      ),
      pixPagamentos: this.normalizeBaseUrl(
        baseUrls?.pixPagamentos || defaults.pixPagamentos,
      ),
      pixRecebimentos: this.normalizeBaseUrl(
        baseUrls?.pixRecebimentos || defaults.pixRecebimentos,
      ),
      spbTransferencias: this.normalizeBaseUrl(
        baseUrls?.spbTransferencias || defaults.spbTransferencias,
      ),
    };
  }

  private normalizeBaseUrl(value: string | null | undefined): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
  }

  private safeUrlForLog(value: string): string {
    try {
      const parsed = new URL(value);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return value;
    }
  }

  private buildSicoobBoletosInclusionUrl(
    config: ResolvedSicoobConfig,
    numeroContratoCliente: string,
  ): string {
    const url = new URL(`${config.cobrancaBancariaBaseUrl}/boletos`);
    url.searchParams.set('numeroContrato', numeroContratoCliente);
    url.searchParams.set('modalidade', String(config.boletoModalidade));
    return url.toString();
  }

  private buildSicoobBoletosInclusionLegacyUrl(
    config: ResolvedSicoobConfig,
    numeroContratoCliente: string,
  ): string {
    const url = new URL(`${config.cobrancaBancariaBaseUrl}/boletos`);
    url.searchParams.set('numeroCliente', numeroContratoCliente);
    url.searchParams.set('codigoModalidade', String(config.boletoModalidade));
    return url.toString();
  }

  private normalizePem(value: string | null | undefined): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/\\n/g, '\n');
  }

  private parsePositiveInteger(
    value: unknown,
    fallback: number | null,
  ): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    const raw = String(value ?? '').trim();
    if (!raw) return fallback;

    const digitsOnly = raw.replace(/\D/g, '');
    const candidate = digitsOnly || raw;
    const parsed = Number(candidate);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private parsePositiveIntegerString(
    value: unknown,
    fallback: string | null,
  ): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    const digitsOnly = raw.replace(/\D/g, '');
    if (!digitsOnly) return fallback;
    if (!/^[0-9]+$/.test(digitsOnly)) return fallback;
    if (/^0+$/.test(digitsOnly)) return fallback;
    return digitsOnly;
  }

  private extractSicoobExternalId(
    externalChargeId: string | null | undefined,
    prefix: string,
  ): string | null {
    const normalized = String(externalChargeId || '').trim();
    if (!normalized) return null;

    const lowerNormalized = normalized.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();
    if (!lowerNormalized.startsWith(lowerPrefix)) return null;

    const value = normalized.slice(prefix.length).trim();
    return value || null;
  }

  private buildSicoobTxid(seed: string): string {
    const base = String(seed || '').replace(/[^a-zA-Z0-9]/g, '');
    const suffix = randomUUID().replace(/-/g, '');
    const merged = `${base}${suffix}`;
    if (merged.length >= 26) {
      return merged.slice(0, 35);
    }
    return merged.padEnd(26, '0').slice(0, 35);
  }

  private buildSicoobNossoNumero(seed: string): string {
    const digits = String(seed || '').replace(/\D/g, '');
    const entropy = `${Date.now()}${randomUUID().replace(/\D/g, '')}`;
    const merged = `${digits}${entropy}`.replace(/\D/g, '');
    const result = merged.slice(-10);
    return result.padStart(10, '0');
  }

  private formatAmountForGateway(value: number): string {
    const amount = Number.isFinite(value) ? value : 0;
    return Math.max(0, amount).toFixed(2);
  }

  private async requestSicoobAccessToken(input: {
    config: ResolvedSicoobConfig;
    scope?: string;
  }): Promise<string> {
    const scope = String(input.scope || '').trim();
    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', input.config.clientId);
    if (scope) {
      body.set('scope', scope);
    }

    const response = await this.sicoobRawRequest({
      url: input.config.tokenUrl,
      method: 'POST',
      config: input.config,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestException(
        this.extractSicoobGatewayErrorMessage(
          response.payload,
          'Falha ao autenticar no Sicoob.',
        ),
      );
    }

    const accessToken = this.extractFirstValueAsString(response.payload, [
      'access_token',
    ]);
    if (!accessToken) {
      throw new BadRequestException(
        'Sicoob não retornou token de acesso. Revise o Client ID, escopos e certificado.',
      );
    }

    return accessToken;
  }

  private async sicoobJsonRequest<T>(input: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    config: ResolvedSicoobConfig;
    accessToken: string;
    scope?: string;
    body?: unknown;
    appendClientIdHeader?: boolean;
  }): Promise<T> {
    const includeClientIdHeader = input.appendClientIdHeader ?? true;
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${input.accessToken}`,
    };
    if (includeClientIdHeader) {
      headers.client_id = input.config.clientId;
    }
    if (input.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const response = await this.sicoobRawRequest({
      url: input.url,
      method: input.method,
      config: input.config,
      headers,
      body:
        input.body === undefined ? undefined : JSON.stringify(input.body),
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const gatewayMessage = this.extractSicoobGatewayErrorMessage(
        response.payload,
        'Falha ao comunicar com a API do Sicoob.',
      );
      this.logger.warn(
        `[sicoob-http] ${input.method} ${this.safeUrlForLog(input.url)} status=${response.statusCode} message=${gatewayMessage}`,
      );
      throw new BadRequestException(
        gatewayMessage,
      );
    }

    return (response.payload ?? {}) as T;
  }

  private async sicoobRawRequest(input: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    config: ResolvedSicoobConfig;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{
    statusCode: number;
    payload: unknown;
  }> {
    const parsedUrl = new URL(input.url);
    const bodyBuffer = input.body ? Buffer.from(input.body, 'utf8') : null;
    const headers: Record<string, string | number> = {
      ...input.headers,
    };
    if (bodyBuffer) {
      headers['content-length'] = bodyBuffer.length;
    }

    const result = await new Promise<{
      statusCode: number;
      bodyText: string;
    }>((resolve, reject) => {
      const request = httpsRequest(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || undefined,
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: input.method,
          headers,
          cert: input.config.certPem,
          key: input.config.keyPem,
          timeout: 30_000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => {
            if (Buffer.isBuffer(chunk)) {
              chunks.push(chunk);
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              bodyText: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      request.on('timeout', () => {
        request.destroy(new Error('Tempo esgotado ao comunicar com o Sicoob.'));
      });
      request.on('error', (error) => {
        reject(error);
      });

      if (bodyBuffer) {
        request.write(bodyBuffer);
      }
      request.end();
    }).catch((error: unknown) => {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Falha de rede ao comunicar com o Sicoob.',
      );
    });

    let payload: unknown = null;
    try {
      payload = result.bodyText ? (JSON.parse(result.bodyText) as unknown) : null;
    } catch {
      payload = result.bodyText || null;
    }

    return {
      statusCode: result.statusCode,
      payload,
    };
  }

  private extractFirstValueAsString(
    payload: unknown,
    keys: string[],
  ): string | null {
    if (!payload || !keys.length) return null;

    const normalizedKeys = keys.map((key) => key.toLowerCase());
    const queue: unknown[] = [payload];
    const visited = new Set<unknown>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') {
        continue;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (Array.isArray(current)) {
        for (const item of current) {
          queue.push(item);
        }
        continue;
      }

      const objectValue = current as Record<string, unknown>;
      for (const [field, value] of Object.entries(objectValue)) {
        if (normalizedKeys.includes(field.toLowerCase())) {
          const stringValue = this.normalizeUnknownToString(value);
          if (stringValue) {
            return stringValue;
          }
        }
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return null;
  }

  private normalizeUnknownToString(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return null;
  }

  private extractSicoobGatewayErrorMessage(
    payload: unknown,
    fallback: string,
  ): string {
    const genericMessage = this.extractGatewayErrorMessage(payload, '').trim();
    if (genericMessage) {
      return genericMessage;
    }

    if (!payload || typeof payload !== 'object') {
      return fallback;
    }

    const objectPayload = payload as Record<string, unknown>;
    const directMessage = this.extractFirstValueAsString(objectPayload, [
      'mensagem',
      'message',
      'detail',
      'detalhe',
      'error_description',
      'erro',
      'error',
    ]);
    if (directMessage) {
      return directMessage;
    }

    const collectionFields = ['erros', 'errors', 'messages'];
    for (const field of collectionFields) {
      const candidate = objectPayload[field];
      if (!Array.isArray(candidate)) continue;
      for (const item of candidate) {
        if (!item || typeof item !== 'object') continue;
        const value = this.extractFirstValueAsString(item, [
          'mensagem',
          'message',
          'detail',
          'descricao',
          'description',
        ]);
        if (value) {
          return value;
        }
      }
    }

    return fallback;
  }

  private async createAsaasPayment(input: {
    apiKey: string;
    charge: StudentChargePaymentContext;
    method: EnrollmentPaymentMethod;
    provider: FinancialProvider;
    environment: string;
  }): Promise<StudentChargePaymentResponse> {
    const baseUrl = this.resolveAsaasBaseUrl(input.environment);
    const customerId = await this.findOrCreateAsaasCustomer({
      baseUrl,
      apiKey: input.apiKey,
      student: input.charge.enrollment.student,
    });

    let payment: AsaasPaymentResponse | null = null;
    const existingExternalChargeId = input.charge.externalChargeId?.trim() || '';
    if (existingExternalChargeId) {
      payment = await this.tryGetAsaasPayment({
        baseUrl,
        apiKey: input.apiKey,
        paymentId: existingExternalChargeId,
      });
    }

    if (!payment?.id) {
      const paymentPayload = {
        customer: customerId,
        billingType: this.mapMethodToAsaasBillingType(input.method),
        value: Number(input.charge.amount),
        dueDate: this.toYyyyMmDd(input.charge.dueDate),
        description: `${input.charge.enrollment.schoolClass.course.name} • ${input.charge.enrollment.schoolClass.name}`,
        externalReference: input.charge.id,
      };
      payment = await this.asaasRequest<AsaasPaymentResponse>({
        baseUrl,
        apiKey: input.apiKey,
        path: '/payments',
        method: 'POST',
        body: paymentPayload,
      });
    }

    const externalChargeId = payment.id?.trim() || null;
    if (externalChargeId && externalChargeId !== input.charge.externalChargeId) {
      await this.prisma.monthlyCharge.update({
        where: { id: input.charge.id },
        data: {
          externalChargeId,
        },
      });
    }

    const transactionReference = externalChargeId
      ? `asaas:${externalChargeId}`
      : null;
    await this.ensurePendingTransactionRecord({
      chargeId: input.charge.id,
      provider: input.provider,
      amount: Number(input.charge.amount),
      externalTransactionId: transactionReference,
    });

    let pixCopyPaste: string | null = null;
    let pixQrCodeImage: string | null = null;
    if (externalChargeId && input.method === 'PIX') {
      const pixData = await this.tryGetAsaasPixQrCode({
        baseUrl,
        apiKey: input.apiKey,
        paymentId: externalChargeId,
      });
      pixCopyPaste = pixData?.payload?.trim() || null;
      pixQrCodeImage = pixData?.encodedImage?.trim() || null;
    }

    let bankSlipUrl = payment.bankSlipUrl?.trim() || null;
    if (externalChargeId && input.method === 'BANK_SLIP') {
      const boletoData = await this.tryGetAsaasIdentificationField({
        baseUrl,
        apiKey: input.apiKey,
        paymentId: externalChargeId,
      });
      if (boletoData?.identificationField && !bankSlipUrl) {
        bankSlipUrl = payment.invoiceUrl?.trim() || null;
      }
    }

    const invoiceUrl = payment.invoiceUrl?.trim() || null;
    const checkoutUrl = invoiceUrl || bankSlipUrl;

    return {
      chargeId: input.charge.id,
      provider: input.provider,
      method: input.method,
      checkoutUrl,
      invoiceUrl,
      bankSlipUrl,
      pixCopyPaste,
      pixQrCodeImage,
      message: checkoutUrl
        ? 'Pagamento gerado com sucesso.'
        : 'Cobrança preparada. Se precisar, solicite o link ao financeiro.',
    };
  }

  private async createStripePayment(input: {
    apiKey: string;
    charge: StudentChargePaymentContext;
    method: EnrollmentPaymentMethod;
    returnUrl?: string;
    provider: FinancialProvider;
  }): Promise<StudentChargePaymentResponse> {
    const methodType = this.mapMethodToStripePaymentMethod(input.method);
    const amountCents = Math.max(
      1,
      Math.round(Number(input.charge.amount || 0) * 100),
    );
    const normalizedReturnUrl = this.normalizeReturnUrl(input.returnUrl);
    const successUrl = normalizedReturnUrl;
    const cancelUrl = normalizedReturnUrl;
    const studentEmail = input.charge.enrollment.student.email?.trim() || '';
    const productName = `${input.charge.enrollment.schoolClass.course.name} - ${input.charge.enrollment.schoolClass.name}`;

    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('success_url', successUrl);
    body.set('cancel_url', cancelUrl);
    body.set('payment_method_types[0]', methodType);
    body.set('line_items[0][quantity]', '1');
    body.set('line_items[0][price_data][currency]', 'brl');
    body.set('line_items[0][price_data][unit_amount]', String(amountCents));
    body.set('line_items[0][price_data][product_data][name]', productName);
    body.set('metadata[chargeId]', input.charge.id);
    body.set('metadata[enrollmentId]', input.charge.enrollment.id);
    if (studentEmail) {
      body.set('customer_email', studentEmail);
    }

    const session = await this.stripeRequest<StripeCheckoutSessionResponse>({
      apiKey: input.apiKey,
      path: '/checkout/sessions',
      method: 'POST',
      body,
    });

    const externalChargeId = session.id?.trim() || null;
    if (!externalChargeId) {
      throw new BadRequestException(
        'Não foi possível criar a sessão de pagamento no provedor.',
      );
    }

    await this.prisma.monthlyCharge.update({
      where: { id: input.charge.id },
      data: {
        externalChargeId,
      },
    });

    await this.ensurePendingTransactionRecord({
      chargeId: input.charge.id,
      provider: input.provider,
      amount: Number(input.charge.amount),
      externalTransactionId: `stripe:${externalChargeId}`,
    });

    return {
      chargeId: input.charge.id,
      provider: input.provider,
      method: input.method,
      checkoutUrl: session.url?.trim() || null,
      invoiceUrl: null,
      bankSlipUrl: null,
      pixCopyPaste: null,
      pixQrCodeImage: null,
      message: session.url
        ? 'Checkout criado com sucesso.'
        : 'Sessão criada, mas sem URL de redirecionamento.',
    };
  }

  private async findOrCreateAsaasCustomer(input: {
    baseUrl: string;
    apiKey: string;
    student: StudentChargePaymentContext['enrollment']['student'];
  }) {
    const cpfCnpj = this.onlyDigits(input.student.studentProfile?.documentCpf);
    const email = String(input.student.email || '').trim().toLowerCase();

    if (cpfCnpj || email) {
      const lookup = await this.asaasRequest<AsaasCustomerLookupResponse>({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        path: '/customers',
        query: {
          limit: '1',
          cpfCnpj: cpfCnpj || undefined,
          email: email || undefined,
        },
      });

      const existingCustomerId =
        lookup.data?.find(
          (item) => typeof item.id === 'string' && item.id.trim() !== '',
        )?.id ?? null;
      if (existingCustomerId) {
        return existingCustomerId;
      }
    }

    const phoneDigits = this.onlyDigits(input.student.studentProfile?.phone);
    const zipCode = this.onlyDigits(input.student.studentProfile?.zipCode);
    const customerPayload: Record<string, unknown> = {
      name: input.student.name,
      email: email || undefined,
      cpfCnpj: cpfCnpj || undefined,
      phone: phoneDigits || undefined,
      mobilePhone: phoneDigits || undefined,
      postalCode: zipCode || undefined,
      address: input.student.studentProfile?.street || undefined,
      addressNumber: input.student.studentProfile?.streetNumber || undefined,
      province: input.student.studentProfile?.neighborhood || undefined,
      complement: input.student.studentProfile?.complement || undefined,
    };

    const createdCustomer = await this.asaasRequest<{ id?: string }>({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      path: '/customers',
      method: 'POST',
      body: customerPayload,
    });

    const customerId = createdCustomer.id?.trim() || '';
    if (!customerId) {
      throw new BadRequestException(
        'Falha ao criar cliente no gateway de pagamento.',
      );
    }
    return customerId;
  }

  private async tryGetAsaasPayment(input: {
    baseUrl: string;
    apiKey: string;
    paymentId: string;
  }) {
    try {
      return await this.asaasRequest<AsaasPaymentResponse>({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        path: `/payments/${encodeURIComponent(input.paymentId)}`,
      });
    } catch {
      return null;
    }
  }

  private async tryGetAsaasPixQrCode(input: {
    baseUrl: string;
    apiKey: string;
    paymentId: string;
  }) {
    try {
      return await this.asaasRequest<AsaasPixQrCodeResponse>({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        path: `/payments/${encodeURIComponent(input.paymentId)}/pixQrCode`,
      });
    } catch {
      return null;
    }
  }

  private async tryGetAsaasIdentificationField(input: {
    baseUrl: string;
    apiKey: string;
    paymentId: string;
  }) {
    try {
      return await this.asaasRequest<AsaasIdentificationFieldResponse>({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        path: `/payments/${encodeURIComponent(input.paymentId)}/identificationField`,
      });
    } catch {
      return null;
    }
  }

  private async asaasRequest<T>(input: {
    baseUrl: string;
    apiKey: string;
    path: string;
    method?: 'GET' | 'POST';
    body?: unknown;
    query?: Record<string, string | undefined>;
  }): Promise<T> {
    const url = new URL(`${input.baseUrl}${input.path}`);
    if (input.query) {
      Object.entries(input.query).forEach(([key, value]) => {
        if (value && value.trim()) {
          url.searchParams.set(key, value.trim());
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: input.method ?? 'GET',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        access_token: input.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new BadRequestException(
        this.extractGatewayErrorMessage(
          payload,
          'Falha ao comunicar com o gateway Asaas.',
        ),
      );
    }

    return (payload ?? {}) as T;
  }

  private async stripeRequest<T>(input: {
    apiKey: string;
    path: string;
    method: 'POST' | 'GET';
    body?: URLSearchParams;
  }): Promise<T> {
    const url = `https://api.stripe.com/v1${input.path}`;
    const response = await fetch(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: input.body,
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new BadRequestException(
        this.extractGatewayErrorMessage(
          payload,
          'Falha ao comunicar com o gateway Stripe.',
        ),
      );
    }

    return (payload ?? {}) as T;
  }

  private async ensurePendingTransactionRecord(input: {
    chargeId: string;
    provider: FinancialProvider;
    amount: number;
    externalTransactionId: string | null;
  }) {
    if (input.externalTransactionId) {
      const existingByExternal =
        await this.prisma.paymentTransaction.findUnique({
          where: { externalTransactionId: input.externalTransactionId },
          select: { id: true },
        });
      if (existingByExternal) {
        return existingByExternal;
      }
    }

    const existingPending = await this.prisma.paymentTransaction.findFirst({
      where: {
        monthlyChargeId: input.chargeId,
        provider: input.provider,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existingPending) {
      return existingPending;
    }

    return this.prisma.paymentTransaction.create({
      data: {
        monthlyChargeId: input.chargeId,
        provider: input.provider,
        amount: Number(input.amount),
        status: 'PENDING',
        externalTransactionId: input.externalTransactionId,
      },
      select: { id: true },
    });
  }

  private normalizeFinancialProvider(value?: string | null): FinancialProvider {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (
      normalized === 'manual' ||
      normalized === 'sicoob' ||
      normalized === 'asaas' ||
      normalized === 'stripe'
    ) {
      return normalized;
    }
    return 'manual';
  }

  private decryptFinancialSettings(payload?: string | null): FinancialSettings {
    if (!payload) {
      return {};
    }

    try {
      const decrypted = this.secrets.decrypt(payload);
      return JSON.parse(decrypted) as FinancialSettings;
    } catch {
      return {};
    }
  }

  private resolveAsaasBaseUrl(environment?: string | null) {
    const normalized = String(environment || '')
      .trim()
      .toLowerCase();
    if (normalized === 'production') {
      return 'https://api.asaas.com/v3';
    }
    return 'https://api-sandbox.asaas.com/v3';
  }

  private mapMethodToAsaasBillingType(method: EnrollmentPaymentMethod) {
    if (method === 'BANK_SLIP') return 'BOLETO';
    if (method === 'CREDIT_CARD') return 'CREDIT_CARD';
    return 'PIX';
  }

  private mapMethodToStripePaymentMethod(method: EnrollmentPaymentMethod) {
    if (method === 'BANK_SLIP') return 'boleto';
    if (method === 'CREDIT_CARD') return 'card';
    return 'pix';
  }

  private resolveEnrollmentPaymentMethod(
    raw: Prisma.JsonValue | null | undefined,
  ): EnrollmentPaymentMethod {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'PIX';
    const method = String((raw as Record<string, unknown>).method || '')
      .trim()
      .toUpperCase();
    if (method === 'BANK_SLIP') return 'BANK_SLIP';
    if (method === 'CREDIT_CARD') return 'CREDIT_CARD';
    return 'PIX';
  }

  private resolveEnrollmentPaymentOptionTitle(
    raw: Prisma.JsonValue | null | undefined,
  ): string | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const title = String((raw as Record<string, unknown>).title || '').trim();
    return title || null;
  }

  private buildManualPaymentResponse(
    chargeId: string,
    method: EnrollmentPaymentMethod,
    message = 'Pagamento disponível no modo manual. Solicite instruções ao financeiro.',
    provider: FinancialProvider = 'manual',
  ): StudentChargePaymentResponse {
    return {
      chargeId,
      provider,
      method,
      checkoutUrl: null,
      invoiceUrl: null,
      bankSlipUrl: null,
      pixCopyPaste: null,
      pixQrCodeImage: null,
      message,
    };
  }

  private normalizeReturnUrl(value?: string): string {
    const fallback = 'https://ipesk.com.br/area-do-aluno/';
    if (!value || !value.trim()) return fallback;

    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return fallback;
      }
      return parsed.toString();
    } catch {
      return fallback;
    }
  }

  private toYyyyMmDd(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private onlyDigits(value: string | null | undefined): string {
    return String(value || '').replace(/\D/g, '');
  }

  private toMoneyValue(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Number(Math.max(0, numeric).toFixed(2));
  }

  private extractGatewayErrorMessage(
    payload: unknown,
    fallback: string,
  ): string {
    if (!payload || typeof payload !== 'object') {
      return fallback;
    }

    const objectPayload = payload as Record<string, unknown>;
    const directMessage = objectPayload.message;
    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage.trim();
    }

    const asaasErrors = objectPayload.errors;
    if (Array.isArray(asaasErrors)) {
      for (const errorItem of asaasErrors) {
        if (!errorItem || typeof errorItem !== 'object') continue;
        const description = String(
          (errorItem as Record<string, unknown>).description || '',
        ).trim();
        if (description) return description;
      }
    }

    const stripeError = objectPayload.error;
    if (stripeError && typeof stripeError === 'object') {
      const stripeMessage = String(
        (stripeError as Record<string, unknown>).message || '',
      ).trim();
      if (stripeMessage) return stripeMessage;
    }

    return fallback;
  }

  private resolveStudentBranding(
    institution:
      | {
          brandingLogoUrl: string | null;
          brandingPalette: Prisma.JsonValue | null;
        }
      | null
      | undefined,
  ) {
    const palette = this.resolveStudentPalette(institution?.brandingPalette);
    const logoUrl =
      institution?.brandingLogoUrl?.trim() || DEFAULT_STUDENT_LOGO_URL;
    const isCustomLogo =
      Boolean(institution?.brandingLogoUrl) &&
      institution?.brandingLogoUrl !== DEFAULT_STUDENT_LOGO_URL;
    const isCustomPalette = STUDENT_PALETTE_KEYS.some(
      (key) =>
        palette[key].toLowerCase() !== DEFAULT_STUDENT_PALETTE[key].toLowerCase(),
    );

    return {
      logoUrl,
      palette,
      isCustom: isCustomLogo || isCustomPalette,
    };
  }

  private resolveStudentPalette(rawPalette?: Prisma.JsonValue | null) {
    const palette = { ...DEFAULT_STUDENT_PALETTE };
    if (!rawPalette || typeof rawPalette !== 'object' || Array.isArray(rawPalette)) {
      return palette;
    }

    const rawMap = rawPalette as Record<string, unknown>;
    for (const key of STUDENT_PALETTE_KEYS) {
      const value = rawMap[key];
      if (typeof value !== 'string') {
        continue;
      }

      const normalized = value.trim().toLowerCase();
      if (/^#([0-9a-f]{6})$/i.test(normalized)) {
        palette[key] = normalized;
      }
    }

    return palette;
  }

  private uniqueClassIds(classIds: string[]) {
    return Array.from(new Set(classIds));
  }
}

