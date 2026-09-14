import { Prisma } from '@prisma/client';
import { SuperadminIntegrationsService } from './superadmin-integrations.service';

describe('SuperadminIntegrationsService KOBAYASHI safeguards', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tests credentials without sending enrollment or personal data', async () => {
    const prisma = {
      institution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'institution-1',
          name: 'Instituição de teste',
          slug: 'instituicao-teste',
          status: 'ACTIVE',
        }),
      },
      institutionIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          environment: 'production',
          isActive: false,
          encryptedSettings: 'encrypted-settings',
        }),
      },
    };
    const secrets = {
      decrypt: jest.fn().mockReturnValue(
        JSON.stringify({
          kobayashi: {
            baseUrl: 'https://kobayashi.example',
            clientId: 'client-id',
            token: 'configured-token',
            grantType: 'client_credentials',
            scopes: ['b2b.parceiro'],
            defaultGcssid: 'gcssid-1',
          },
        }),
      ),
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'matricula obrigatoria' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const service = new SuperadminIntegrationsService(
      prisma as never,
      secrets as never,
    );

    const result = await service.testProviderCredentials(
      'institution-1',
      'kobayashi',
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        reachable: true,
        credentialsAccepted: true,
        integrationActive: false,
        sentEnrollmentData: false,
        configuredCredentialStatusCode: 400,
        invalidControlStatusCode: 401,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, request] of fetchMock.mock.calls) {
      const body = JSON.parse(String(request?.body || '{}')) as Record<
        string,
        unknown
      >;
      expect(body).not.toHaveProperty('matricula');
      expect(JSON.stringify(body)).not.toContain('CPF');
      expect(JSON.stringify(body)).not.toContain('eMail');
    }
  });

  it('returns the existing dispatch when the contract idempotency key is duplicated', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.2',
      },
    );
    const prisma = {
      institutionIntegrationDispatchLog: {
        create: jest.fn().mockRejectedValue(duplicateError),
        findUnique: jest.fn().mockResolvedValue({
          id: 'dispatch-1',
          status: 'success',
        }),
      },
    };
    const service = new SuperadminIntegrationsService(
      prisma as never,
      {} as never,
    );

    const reservation = await (
      service as unknown as {
        reserveAutomaticDispatch: (
          input: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      }
    ).reserveAutomaticDispatch({
      idempotencyKey: 'kobayashi:contract:contract-1',
      institutionId: 'institution-1',
      integrationId: 'integration-1',
      provider: 'kobayashi',
      studentName: 'Aluno',
      contractInstanceId: 'contract-1',
    });

    expect(reservation).toEqual({
      reserved: false,
      logId: 'dispatch-1',
      status: 'success',
    });
    expect(
      prisma.institutionIntegrationDispatchLog.findUnique,
    ).toHaveBeenCalledWith({
      where: { idempotencyKey: 'kobayashi:contract:contract-1' },
      select: { id: true, status: true },
    });
  });
});
