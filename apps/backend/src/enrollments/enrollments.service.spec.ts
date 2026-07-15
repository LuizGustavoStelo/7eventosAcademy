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
        status: 'REQUESTED',
      }),
    );
    expect(Number(enrollmentFeeRequest.amount)).toBe(450);
    expect(Number(enrollmentFeeRequest.installmentAmount)).toBe(150);

    const courseRequest = creditCardPaymentRequest.create.mock.calls[1][0].data;
    expect(courseRequest).toEqual(
      expect.objectContaining({
        kind: 'COURSE_PAYMENT',
        installmentCount: 18,
        status: 'WAITING_COURSE_START',
      }),
    );
    expect(Number(courseRequest.amount)).toBe(4860);
    expect(Number(courseRequest.installmentAmount)).toBe(270);
  });
});
