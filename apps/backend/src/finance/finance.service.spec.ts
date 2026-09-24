import { FinanceService } from './finance.service';

describe('FinanceService pre-enrollment card approval', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('records enrollment fee payment without requiring a monthly charge', async () => {
    const tx = {
      paymentTransaction: { create: jest.fn() },
      monthlyCharge: { update: jest.fn() },
      studentCourse: { update: jest.fn() },
      creditCardPaymentRequest: { update: jest.fn() },
    };
    const prisma = {
      creditCardPaymentRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'request-1',
          monthlyChargeId: null,
          studentCourseId: 'student-course-1',
          kind: 'ENROLLMENT_FEE',
          status: 'REQUESTED',
          amount: 450,
          monthlyCharge: null,
          studentCourse: { id: 'student-course-1' },
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new FinanceService(prisma as never, {} as never);

    await service.approveCreditCardPaymentRequest('request-1', {
      sub: 'admin-1',
      role: 'admin',
      activeInstitutionId: 'institution-1',
    });

    expect(tx.paymentTransaction.create).not.toHaveBeenCalled();
    expect(tx.monthlyCharge.update).not.toHaveBeenCalled();
    expect(tx.studentCourse.update).toHaveBeenCalledWith({
      where: { id: 'student-course-1' },
      data: { enrollmentFeePaidAt: expect.any(Date) },
    });
    expect(tx.creditCardPaymentRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedByUserId: 'admin-1',
        }),
      }),
    );
  });

  it('returns only active card requests in the administrative queue', async () => {
    const prisma = {
      creditCardPaymentRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new FinanceService(prisma as never, {} as never);

    await service.listCreditCardPaymentRequests({
      sub: 'admin-1',
      role: 'admin',
      activeInstitutionId: 'institution-1',
    });

    expect(prisma.creditCardPaymentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          institutionId: 'institution-1',
          status: { notIn: ['APPROVED', 'CANCELED'] },
        }),
      }),
    );
  });

  it('returns approved pre-enrollment payments in the financial history', async () => {
    const prisma = {
      creditCardPaymentRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new FinanceService(prisma as never, {} as never);

    await service.listCreditCardPaymentRequestHistory({
      sub: 'admin-1',
      role: 'admin',
      activeInstitutionId: 'institution-1',
    });

    expect(prisma.creditCardPaymentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institutionId: 'institution-1',
          status: 'APPROVED',
          monthlyChargeId: null,
        },
        orderBy: [{ approvedAt: 'desc' }, { requestedAt: 'desc' }],
      }),
    );
  });

  it('creates only the next course-start installment after the current one is paid', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T12:00:00-04:00'));
    const tx = {
      monthlyCharge: {
        findUnique: jest.fn().mockResolvedValue({
          enrollmentId: 'enrollment-1',
          ownerAdminId: 'admin-1',
          dueDate: new Date('2026-08-10T09:00:00-04:00'),
          amount: 592,
          kind: 'COURSE_PAYMENT',
          status: 'PAID',
          installmentNumber: 1,
          installmentTotal: 18,
          awaitingCourseStart: false,
          enrollment: {
            selectedPaymentOption: {
              type: 'INSTALLMENTS',
              method: 'BANK_SLIP',
              collectionMode: 'INSTALLMENT_CHARGES',
              installmentStartMode: 'COURSE_START',
              installmentCount: 18,
              installmentAmount: 592,
              dueDay: 10,
            },
            schoolClass: { status: 'IN_PROGRESS' },
          },
        }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      monthlyCharge: {
        findFirst: jest.fn().mockResolvedValue({ id: 'charge-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'charge-1',
          amount: 592,
          status: 'PAID',
          enrollment: {},
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      creditCardPaymentRequest: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new FinanceService(prisma as never, {} as never);

    await service.updateChargeStatus(
      'charge-1',
      { status: 'paid' },
      {
        sub: 'admin-1',
        role: 'admin',
        activeInstitutionId: 'institution-1',
      },
    );

    expect(tx.monthlyCharge.createMany).toHaveBeenCalledTimes(1);
    const created = tx.monthlyCharge.createMany.mock.calls[0][0].data[0];
    expect(created).toEqual(
      expect.objectContaining({
        enrollmentId: 'enrollment-1',
        amount: 592,
        status: 'PENDING',
        installmentNumber: 2,
        installmentTotal: 18,
        awaitingCourseStart: false,
      }),
    );
    expect(created.dueDate.getMonth()).toBe(8);
    expect(created.dueDate.getDate()).toBe(10);
  });

  it('rejects payment approval while the charge awaits contract signature', async () => {
    const prisma = {
      monthlyCharge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'charge-1',
          awaitingContractSignature: true,
        }),
        update: jest.fn(),
      },
    };
    const service = new FinanceService(prisma as never, {} as never);

    await expect(
      service.updateChargeStatus(
        'charge-1',
        { status: 'paid' },
        {
          sub: 'admin-1',
          role: 'admin',
          activeInstitutionId: 'institution-1',
        },
      ),
    ).rejects.toThrow(
      'A cobrança só pode ser aprovada após a assinatura dos contratos obrigatórios.',
    );
    expect(prisma.monthlyCharge.update).not.toHaveBeenCalled();
  });
});

describe('FinanceService voucher batch creation', () => {
  const user = {
    sub: 'admin-1',
    email: 'admin@example.com',
    role: 'admin' as const,
    activeInstitutionId: 'institution-1',
  };

  function createPrismaMock() {
    return {
      course: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'course-1',
            institutionId: 'institution-1',
            paymentModel: 'INSTALLMENTS',
            paymentOptions: [
              {
                id: 'payment-option-1',
                title: '12 parcelas no boleto',
                method: 'BANK_SLIP',
                type: 'INSTALLMENTS',
                active: true,
              },
            ],
            price: 1200,
            installmentMonths: 12,
            installmentValue: 100,
          },
        ]),
      },
      financeVoucher: {
        createMany: jest.fn().mockResolvedValue({ count: 12 }),
      },
    };
  }

  it('creates unique codes with the requested prefix and shared rules', async () => {
    const prisma = createPrismaMock();
    const service = new FinanceService(prisma as never, {} as never);

    const result = await service.createVoucherBatch(
      {
        courseId: 'course-1',
        quantity: 12,
        codePrefix: 'bolsa turma 1',
        title: 'Bolsa turma 1',
        discountType: 'PERCENT',
        discountValue: 50,
        valueBase: 'REGULAR',
        appliesTo: 'INSTALLMENT',
        installmentScope: 'ALL',
        appliesToEnrollmentFee: false,
        maxUses: 1,
        allowedPaymentOptionIds: ['payment-option-1'],
      },
      user,
    );

    expect(result.createdCount).toBe(12);
    expect(result.codePattern).toBe('BOLSA-TURMA-1-XXXXXX');
    expect(result.codes).toHaveLength(12);
    expect(new Set(result.codes).size).toBe(12);
    expect(result.codes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^BOLSA-TURMA-1-[A-HJ-NP-Z2-9]{6}$/),
      ]),
    );

    const createInput = prisma.financeVoucher.createMany.mock.calls[0][0];
    expect(createInput.data).toHaveLength(12);
    expect(createInput.data[0]).toEqual(
      expect.objectContaining({
        institutionId: 'institution-1',
        ownerAdminId: 'admin-1',
        courseId: 'course-1',
        title: 'Bolsa turma 1',
        maxUses: 1,
        usageCount: 0,
        allowedPaymentOptionIds: ['payment-option-1'],
      }),
    );
  });

  it('rejects batches above the operational limit', async () => {
    const prisma = createPrismaMock();
    const service = new FinanceService(prisma as never, {} as never);

    await expect(
      service.createVoucherBatch(
        {
          courseId: 'course-1',
          quantity: 501,
          title: 'Lote inválido',
          discountType: 'PERCENT',
          discountValue: 10,
          appliesTo: 'TOTAL',
          allowedPaymentOptionIds: ['payment-option-1'],
        },
        user,
      ),
    ).rejects.toThrow('A quantidade deve estar entre 2 e 500 vouchers.');

    expect(prisma.course.findMany).not.toHaveBeenCalled();
    expect(prisma.financeVoucher.createMany).not.toHaveBeenCalled();
  });
});
