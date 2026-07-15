import {
  escapeHtml,
  renderAcademyMailShell,
  type MailTemplate,
} from './academy-mail-template.helper';

export type AccountVerificationAudience = 'aluno' | 'professor';

type BuildAccountVerificationEmailParams = {
  recipientName: string;
  verificationLink: string;
  expiresInMinutes: number;
  audience: AccountVerificationAudience;
};

export function buildAccountVerificationEmail(
  params: BuildAccountVerificationEmailParams,
): MailTemplate {
  const safeName = escapeHtml(params.recipientName || 'usuário');
  const safeVerificationLink = escapeHtml(params.verificationLink);
  const safeAudience = params.audience === 'professor' ? 'professor(a)' : 'aluno(a)';

  const subject = 'Confirme seu e-mail na 7Eventos Academy';

  const text = [
    `Olá, ${params.recipientName}!`,
    '',
    `Recebemos o cadastro da sua conta de ${safeAudience} na 7Eventos Academy.`,
    'Para confirmar seu e-mail e habilitar seu acesso, abra o link abaixo:',
    '',
    params.verificationLink,
    '',
    `Validade do link: ${params.expiresInMinutes} minutos.`,
    '',
    'Se você não solicitou este cadastro, ignore esta mensagem.',
    '',
    'Equipe 7Eventos Academy',
  ].join('\n');

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1f2937;">Olá, <strong>${safeName}</strong>!</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
      Recebemos o cadastro da sua conta de <strong>${safeAudience}</strong> na plataforma.
      Para habilitar seu acesso, confirme que este endereço de e-mail pertence a você.
    </p>
    <div style="margin:0 0 20px;text-align:center;">
      <a href="${safeVerificationLink}" style="display:inline-block;border-radius:10px;background:#f25c05;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;line-height:1.2;">
        Confirmar meu e-mail
      </a>
    </div>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6b7280;">
      Este link expira em <strong>${params.expiresInMinutes} minutos</strong> e só pode ser usado uma vez.
    </p>
    <p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">
      Se o botão não funcionar, abra este endereço:<br /><a href="${safeVerificationLink}" style="color:#c2410c;">${safeVerificationLink}</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
      Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.
    </p>
  `.trim();

  const html = renderAcademyMailShell({
    subject,
    headerTitle: 'Confirmação de e-mail',
    bodyHtml,
  });

  return {
    subject,
    text,
    html,
  };
}
