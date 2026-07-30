import { ContractsService } from './contracts.service';

describe('ContractsService contract-first financial flow', () => {
  const accessGate = (contractLocked: boolean) => ({
    locked: contractLocked,
    contractLocked,
    paymentLocked: false,
    requiredCount: 1,
    availableCount: 1,
    signedCount: contractLocked ? 0 : 1,
    pendingSignatureCount: contractLocked ? 1 : 0,
    missingCount: contractLocked ? 1 : 0,
    enrollments: [
      {
        enrollmentId: 'enrollment-1',
        classId: 'class-1',
        courseId: 'course-1',
        contractLocked,
        paymentLocked: false,
        accessLocked: contractLocked,
        requiredCount: 1,
        availableCount: 1,
        signedCount: contractLocked ? 0 : 1,
      },
    ],
  });

  it('releases the enrollment fee now and keeps the course card request waiting for class start', async () => {
    const tx = {
      monthlyCharge: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      creditCardPaymentRequest: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'request-fee', kind: 'ENROLLMENT_FEE' },
          { id: 'request-course', kind: 'COURSE_PAYMENT' },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      enrollment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enrollment-1',
          studentId: 'student-1',
          selectedPaymentOption: {
            type: 'INSTALLMENTS',
            installmentStartMode: 'COURSE_START',
          },
          schoolClass: { status: 'ENROLLMENTS_OPEN' },
        }),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service, 'getStudentAccessGate')
      .mockResolvedValue(accessGate(false));

    await service.releaseEnrollmentFinancialFlowIfContractsSigned(
      'enrollment-1',
    );

    expect(tx.monthlyCharge.updateMany).toHaveBeenCalledWith({
      where: {
        enrollmentId: 'enrollment-1',
        awaitingContractSignature: true,
      },
      data: { awaitingContractSignature: false },
    });
    expect(tx.creditCardPaymentRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-fee' },
      data: {
        status: 'REQUESTED',
        requestedAt: expect.any(Date),
      },
    });
    expect(tx.creditCardPaymentRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-course' },
      data: {
        status: 'WAITING_COURSE_START',
        requestedAt: undefined,
      },
    });
  });

  it('does not release charges while any required contract remains unsigned', async () => {
    const prisma = {
      enrollment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enrollment-1',
          studentId: 'student-1',
          selectedPaymentOption: {
            type: 'INSTALLMENTS',
            installmentStartMode: 'COURSE_START',
          },
          schoolClass: { status: 'ENROLLMENTS_OPEN' },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service, 'getStudentAccessGate')
      .mockResolvedValue(accessGate(true));

    await expect(
      service.releaseEnrollmentFinancialFlowIfContractsSigned('enrollment-1'),
    ).resolves.toEqual({ released: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not retroactively lock an old class already in progress', async () => {
    const enrollment = {
      id: 'enrollment-1',
      institutionId: 'institution-1',
      classId: 'class-1',
      selectedPaymentOption: {
        type: 'INSTALLMENTS',
        method: 'BANK_SLIP',
      },
      schoolClass: {
        courseId: 'course-1',
        status: 'IN_PROGRESS',
      },
      monthlyCharges: [
        {
          kind: 'COURSE_PAYMENT',
          status: 'PENDING',
          dueDate: new Date('2026-08-10T10:00:00-04:00'),
          installmentNumber: 1,
          awaitingCourseStart: true,
          awaitingContractSignature: false,
        },
      ],
    };
    const prisma = {
      enrollment: {
        findMany: jest.fn().mockResolvedValue([enrollment]),
      },
      contractTemplate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'template-1',
            institutionId: 'institution-1',
            autoSendAllCourses: true,
            autoSendCourseIds: [],
          },
        ]),
      },
      contractInstance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const gate = await service.getStudentAccessGate('student-1');

    expect(gate).toEqual(
      expect.objectContaining({
        locked: false,
        contractLocked: false,
        requiredCount: 0,
      }),
    );
  });

  it('creates only installment 1 while a boleto plan waits for class start', () => {
    const service = new ContractsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const signedAt = new Date('2026-07-30T10:00:00-04:00');

    const charges = (
      service as unknown as {
        buildChargesForEnrollmentAfterContract: (
          input: Record<string, unknown>,
        ) => Array<Record<string, unknown>>;
      }
    ).buildChargesForEnrollmentAfterContract({
      classStartDate: null,
      classStatus: 'ENROLLMENTS_OPEN',
      signedAt,
      enrollmentFee: 0,
      paymentModel: 'INSTALLMENTS',
      installmentMonths: 18,
      installmentValue: null,
      selectedPaymentOption: {
        type: 'INSTALLMENTS',
        method: 'BANK_SLIP',
        collectionMode: 'INSTALLMENT_CHARGES',
        installmentStartMode: 'COURSE_START',
        installmentCount: 18,
        installmentAmount: 592,
        dueDay: 10,
      },
    });

    expect(charges).toEqual([
      expect.objectContaining({
        dueDate: signedAt,
        amount: 592,
        kind: 'COURSE_PAYMENT',
        status: 'PENDING',
        installmentNumber: 1,
        installmentTotal: 18,
        awaitingCourseStart: true,
      }),
    ]);
  });
});
