import { buildAccountVerificationEmail } from './account-verification-email.template';

describe('buildAccountVerificationEmail', () => {
  it('renders a one-click confirmation link without a numeric code', () => {
    const verificationLink =
      'https://academy.7eventos.com/#emailVerificationToken=token-seguro&emailVerificationEmail=aluno%40example.com';

    const template = buildAccountVerificationEmail({
      recipientName: 'Aluno Teste',
      verificationLink,
      expiresInMinutes: 15,
      audience: 'aluno',
    });

    expect(template.subject).toBe('Confirme seu e-mail na 7Eventos Academy');
    expect(template.text).toContain(verificationLink);
    expect(template.html).toContain('Confirmar meu e-mail');
    expect(template.html).toContain('emailVerificationToken=token-seguro');
    expect(template.html).not.toContain('Código de confirmação');
  });
});
