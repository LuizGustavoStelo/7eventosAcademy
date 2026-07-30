import { EnrollmentsService } from './enrollments.service';

describe('EnrollmentsService pre-enrollment commercial selection', () => {
  it('creates separate card requests for enrollment fee and course start with voucher applied', async () => {
    const creditCardPaymentRequest = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      updateMany: jest.fn(),
    };
    const tx = {
      studentCourse: {
        findFirst: jest.fn().mockResolvedValue({ id: 'student-course-1' }),
        update: jest.fn(),
      },
      enrollment: {
        count: jest.fn().mockResolvedValue(0),
      },
      creditCardPaymentRequest,
    };
    const prisma = {
      course: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'course-1',
          institutionId: 'institution-1',
          ownerAdminId: 'admin-1',
          paymentModel: 'INSTALLMENTS',
          price: 9720,
          enrollmentFee: 450,
          enrollmentPaymentOptions: [
            {
              id: 'enrollment-card-3',
              title: 'Cartão de crédito em até 3x',
              method: 'CREDIT_CARD',
              installmentCount: 3,
              active: true,
            },
          ],
          paymentOptions: [
            {
              id: 'course-card-18',
              title: 'Até 18 parcelas no cartão de crédito',
              method: 'CREDIT_CARD',
              type: 'INSTALLMENTS',
              collectionMode: 'MANUAL_LINK',
              totalAmount: 9720,
              installmentCount: 18,
              installmentAmount: 540,
              installmentStartMode: 'COURSE_START',
              active: true,
            },
          ],
          installmentMonths: 18,
          installmentValue: 540,
        }),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const financeService = {
      resolveVoucherValueBaseForCourse: jest.fn().mockResolvedValue('REGULAR'),
      applyVoucherOnPaymentOption: jest
        .fn()
        .mockImplementation(({ paymentOption }) => ({
          ...paymentOption,
          totalAmount: 4860,
          installmentAmount: 270,
          appliedVoucher: {
            id: 'voucher-1',
            code: 'METADE',
            title: 'Desconto de 50%',
            discountType: 'PERCENT',
            discountValue: 50,
            appliesTo: 'TOTAL',
            appliesToEnrollmentFee: false,
            installmentScope: 'ALL',
            discountLabel: '50% de desconto',
          },
        })),
    };
    const service = new EnrollmentsService(
      prisma as never,
      {} as never,
      financeService as never,
      {} as never,
    );

    await service.prepareStudentCourseCommercialSelection({
      studentId: 'student-1',
      courseId: 'course-1',
      institutionId: 'institution-1',
      paymentOptionId: 'course-card-18',
      enrollmentPaymentOptionId: 'enrollment-card-3',
      voucherCode: 'METADE',
    });

    expect(tx.studentCourse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selectedPaymentOptionId: 'course-card-18',
          selectedEnrollmentPaymentOptionId: 'enrollment-card-3',
        }),
      }),
    );
    expect(creditCardPaymentRequest.create).toHaveBeenCalledTimes(2);

    const enrollmentFeeRequest =
      creditCardPaymentRequest.create.mock.calls[0][0].data;
    expect(enrollmentFeeRequest).toEqual(
      expect.objectContaining({
        kind: 'ENROLLMENT_FEE',
        installmentCount: 3,
        status: 'WAITING_CONTRACT_SIGNATURE',
      }),
    );
    expect(Number(enrollmentFeeRequest.amount)).toBe(450);
    expect(Number(enrollmentFeeRequest.installmentAmount)).toBe(150);

    const courseRequest = creditCardPaymentRequest.create.mock.calls[1][0].data;
    expect(courseRequest).toEqual(
      expect.objectContaining({
        kind: 'COURSE_PAYMENT',
        installmentCount: 18,
        status: 'WAITING_CONTRACT_SIGNATURE',
      }),
    );
    expect(Number(courseRequest.amount)).toBe(4860);
    expect(Number(courseRequest.installmentAmount)).toBe(270);
  });

  it('uses the promotional condition as the base for a promotional voucher', async () => {
    const tx = {
      enrollment: {
        count: jest.fn().mockResolvedValue(0),
      },
      studentCourse: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const applyVoucherOnPaymentOption = jest
      .fn()
      .mockImplementation(({ paymentOption }) => paymentOption);
    const financeService = {
      resolveVoucherValueBaseForCourse: jest
        .fn()
        .mockResolvedValue('PROMOTIONAL'),
      applyVoucherOnPaymentOption,
    };
    const service = new EnrollmentsService(
      {} as never,
      {} as never,
      financeService as never,
      {} as never,
    );

    await (
      service as unknown as {
        resolveEnrollmentPaymentOption: (input: Record<string, unknown>) => Promise<unknown>;
      }
    ).resolveEnrollmentPaymentOption({
      tx,
      institutionId: 'institution-1',
      courseId: 'course-1',
      requestedPaymentOptionId: 'boleto-18',
      requestedVoucherCode: 'PROMO50',
      course: {
        paymentModel: 'INSTALLMENTS',
        price: 15208.38,
        installmentMonths: 18,
        installmentValue: 844.91,
        paymentOptions: [
          {
            id: 'boleto-18',
            title: '18 parcelas no boleto',
            method: 'BANK_SLIP',
            type: 'INSTALLMENTS',
            collectionMode: 'INSTALLMENT_CHARGES',
            totalAmount: 15208.38,
            installmentCount: 18,
            installmentAmount: 844.91,
            isPromotional: true,
            promotionalSlots: 20,
            promotionalTotalAmount: 10656,
            promotionalInstallmentAmount: 592,
            active: true,
          },
        ],
      },
    });

    expect(applyVoucherOnPaymentOption).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentOption: expect.objectContaining({
          id: 'boleto-18',
          totalAmount: 10656,
          installmentAmount: 592,
          promotionalApplied: true,
        }),
      }),
    );
  });

  it('uses the full standard price without stacking commercial discounts', async () => {
    const applyVoucherOnPaymentOption = jest
      .fn()
      .mockImplementation(({ paymentOption }) => paymentOption);
    const financeService = {
      resolveVoucherValueBaseForCourse: jest.fn().mockResolvedValue('REGULAR'),
      applyVoucherOnPaymentOption,
    };
    const service = new EnrollmentsService(
      {} as never,
      {} as never,
      financeService as never,
      {} as never,
    );

    await (
      service as unknown as {
        resolveEnrollmentPaymentOption: (input: Record<string, unknown>) => Promise<unknown>;
      }
    ).resolveEnrollmentPaymentOption({
      tx: {},
      institutionId: 'institution-1',
      courseId: 'course-1',
      requestedPaymentOptionId: 'boleto-12',
      requestedVoucherCode: 'PADRAO50',
      course: {
        paymentModel: 'INSTALLMENTS',
        price: 13824,
        installmentMonths: 12,
        installmentValue: 1152,
        paymentOptions: [
          {
            id: 'boleto-12',
            title: '12 parcelas no boleto',
            method: 'BANK_SLIP',
            type: 'INSTALLMENTS',
            collectionMode: 'INSTALLMENT_CHARGES',
            totalAmount: 13824,
            installmentCount: 12,
            installmentAmount: 1152,
            discountEnabled: true,
            discountTotalAmount: 13404,
            discountInstallmentAmount: 1117,
            discountDeadlineDay: 7,
            active: true,
          },
        ],
      },
    });

    expect(applyVoucherOnPaymentOption).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentOption: expect.objectContaining({
          totalAmount: 13824,
          installmentAmount: 1152,
          promotionalApplied: false,
          discountEnabled: false,
          discountTotalAmount: null,
          discountInstallmentAmount: null,
          discountDeadlineDay: null,
        }),
      }),
    );
  });

  it('activates a course-start card request when the class begins', async () => {
    const activatedRequest = {
      id: 'request-course-1',
      monthlyChargeId: 'charge-course-1',
      enrollmentId: 'enrollment-1',
      ownerAdminId: 'admin-1',
      amount: 4860,
      enrollment: {
        selectedPaymentOption: {
          id: 'course-card-18',
          method: 'CREDIT_CARD',
          collectionMode: 'MANUAL_LINK',
          installmentStartMode: 'COURSE_START',
        },
      },
    };
    const tx = {
      creditCardPaymentRequest: {
        findMany: jest.fn().mockResolvedValue([activatedRequest]),
        update: jest.fn(),
      },
      monthlyCharge: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new EnrollmentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.activateCourseStartPaymentsForClass('class-1');

    expect(tx.monthlyCharge.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'charge-course-1',
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      data: {
        dueDate: expect.any(Date),
        status: 'PENDING',
      },
    });
    expect(tx.creditCardPaymentRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-course-1' },
      data: {
        monthlyChargeId: 'charge-course-1',
        status: 'REQUESTED',
        requestedAt: expect.any(Date),
      },
    });
  });

  it('creates only the first boleto installment while the course has not started', () => {
    const service = new EnrollmentsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const enrollmentCreatedAt = new Date('2026-07-17T09:00:00-04:00');

    const charges = (
      service as unknown as {
        buildInstallmentCharges: (input: Record<string, unknown>) => Array<{
          dueDate: Date;
          amount: number;
          status: string;
          installmentNumber?: number;
          installmentTotal?: number;
          awaitingCourseStart?: boolean;
        }>;
      }
    ).buildInstallmentCharges({
      enrollmentCreatedAt,
      classStartDate: null,
      classStatus: 'ENROLLMENTS_OPEN',
      paymentModel: 'INSTALLMENTS',
      installmentMonths: 18,
      installmentValue: null,
      selectedPaymentOption: {
        id: 'boleto-18',
        method: 'BANK_SLIP',
        type: 'INSTALLMENTS',
        collectionMode: 'INSTALLMENT_CHARGES',
        installmentStartMode: 'COURSE_START',
        installmentCount: 18,
        installmentAmount: 592,
        dueDay: 10,
      },
    });

    expect(charges).toEqual([
      expect.objectContaining({
        dueDate: enrollmentCreatedAt,
        amount: 592,
        status: 'PENDING',
        installmentNumber: 1,
        installmentTotal: 18,
        awaitingCourseStart: true,
      }),
    ]);
  });

  it('sets the first boleto due date only when the class begins', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T09:00:00-04:00'));
    try {
      const tx = {
        monthlyCharge: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'charge-boleto-1',
              enrollment: {
                selectedPaymentOption: {
                  id: 'boleto-18',
                  method: 'BANK_SLIP',
                  type: 'INSTALLMENTS',
                  collectionMode: 'INSTALLMENT_CHARGES',
                  installmentStartMode: 'COURSE_START',
                  dueDay: 10,
                },
              },
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        creditCardPaymentRequest: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const prisma = {
        $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      };
      const service = new EnrollmentsService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await service.activateCourseStartPaymentsForClass('class-1');

      const update = tx.monthlyCharge.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({
        id: 'charge-boleto-1',
        awaitingCourseStart: true,
        status: { in: ['PENDING', 'OVERDUE'] },
      });
      expect(update.data).toEqual({
        dueDate: expect.any(Date),
        status: 'PENDING',
        awaitingCourseStart: false,
      });
      expect(update.data.dueDate.getMonth()).toBe(7);
      expect(update.data.dueDate.getDate()).toBe(10);
    } finally {
      jest.useRealTimers();
    }
  });
});
