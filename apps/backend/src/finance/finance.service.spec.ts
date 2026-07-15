import { FinanceService } from './finance.service';

describe('FinanceService pre-enrollment card approval', () => {
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
});
