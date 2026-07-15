import { ClassesService } from './classes.service';

describe('ClassesService course-start payments', () => {
  it('activates waiting payments when the class enters in progress', async () => {
    const prisma = {
      schoolClass: {
        findFirst: jest.fn().mockResolvedValue({ id: 'class-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'class-1',
          status: 'IN_PROGRESS',
        }),
      },
    };
    const enrollmentsService = {
      activateCourseStartPaymentsForClass: jest.fn().mockResolvedValue({
        activatedCount: 1,
      }),
    };
    const service = new ClassesService(
      prisma as never,
      enrollmentsService as never,
    );

    await service.updateStatus('class-1', 'in_progress', {
      sub: 'admin-1',
      role: 'admin',
      activeInstitutionId: 'institution-1',
    });

    expect(prisma.schoolClass.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'class-1' },
        data: { status: 'IN_PROGRESS' },
      }),
    );
    expect(
      enrollmentsService.activateCourseStartPaymentsForClass,
    ).toHaveBeenCalledWith('class-1');
  });
});
