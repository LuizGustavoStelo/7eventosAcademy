import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

type FinancialSettings = {
  generic?: GenericSettings;
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
        complement: string | null;
      } | null;
    };
  };
};

const DEFAULT_STUDENT_LOGO_URL = '/Logo-IPESK.png';
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

    if (!config?.isActive || provider === 'manual') {
      return this.buildManualPaymentResponse(charge.id, method);
    }

    if (provider === 'sicoob') {
      return this.buildManualPaymentResponse(
        charge.id,
        method,
        'Pagamento online para Sicoob ainda não está habilitado nesta tela. Use o fluxo financeiro manual.',
        provider,
      );
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
    if (provider === 'manual' || provider === 'sicoob') {
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
            selectedPaymentOption: true,
            schoolClass: {
              select: {
                name: true,
                course: {
                  select: {
                    name: true,
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

    return charges.map((charge) => ({
      id: charge.id,
      enrollmentId: charge.enrollmentId,
      dueDate: charge.dueDate,
      amount: Number(charge.amount),
      status: charge.status,
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
      this.readHeader(headers, 'asaas-access-token');
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

