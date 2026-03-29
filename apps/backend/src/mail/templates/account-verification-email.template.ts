export type AccountVerificationAudience = 'aluno' | 'professor';

type BuildAccountVerificationEmailParams = {
  recipientName: string;
  verificationCode: string;
  expiresInMinutes: number;
  audience: AccountVerificationAudience;
};

type MailTemplate = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAccountVerificationEmail(
  params: BuildAccountVerificationEmailParams,
): MailTemplate {
  const safeName = escapeHtml(params.recipientName || 'usuário');
  const safeCode = escapeHtml(params.verificationCode);
  const safeAudience = params.audience === 'professor' ? 'professor(a)' : 'aluno(a)';

  const subject = 'Confirme seu e-mail na 7Eventos Academy';

  const text = [
    `Olá, ${params.recipientName}!`,
    '',
    `Recebemos o cadastro da sua conta de ${safeAudience} na 7Eventos Academy.`,
    'Para confirmar seu e-mail e habilitar seu acesso, use o código abaixo:',
    '',
    params.verificationCode,
    '',
    `Validade do código: ${params.expiresInMinutes} minutos.`,
    '',
    'Se você não solicitou este cadastro, ignore esta mensagem.',
    '',
    'Equipe 7Eventos Academy',
  ].join('\n');

  const html = `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f6f1ea;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #f0e4d7;border-radius:18px;overflow:hidden;">
      <tr>
        <td style="padding:0;">
          <div style="background:linear-gradient(135deg,#f25c05 0%,#ff8a2a 55%,#f59f45 100%);padding:28px 28px 22px;">
            <div style="font-size:12px;letter-spacing:1px;font-weight:700;color:#fff6ed;text-transform:uppercase;">7Eventos Academy</div>
            <h1 style="margin:10px 0 0;font-size:28px;line-height:1.1;color:#ffffff;font-family:'Trebuchet MS',Arial,sans-serif;">Confirmação de e-mail</h1>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 28px 12px;">
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1f2937;">Olá, <strong>${safeName}</strong>!</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
            Recebemos o cadastro da sua conta de <strong>${safeAudience}</strong> na plataforma.
            Para habilitar seu acesso, confirme seu e-mail com o código abaixo:
          </p>
          <div style="margin:0 auto 18px;max-width:320px;background:#fff7f0;border:1px dashed #f59e0b;border-radius:14px;padding:16px 14px;text-align:center;">
            <div style="font-size:12px;color:#9a3412;text-transform:uppercase;letter-spacing:1.6px;font-weight:700;">Código de confirmação</div>
            <div style="margin-top:8px;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;color:#b45309;font-family:'Trebuchet MS',Arial,sans-serif;">${safeCode}</div>
          </div>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6b7280;">
            Este código expira em <strong>${params.expiresInMinutes} minutos</strong>.
          </p>
          <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6b7280;">
            Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <div style="border-top:1px solid #f1f5f9;padding-top:14px;font-size:12px;line-height:1.6;color:#6b7280;">
            Equipe 7Eventos Academy<br />
            Este é um e-mail automático, não responda esta mensagem.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

  return {
    subject,
    text,
    html,
  };
}
