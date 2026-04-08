import {
  escapeHtml,
  renderAcademyMailShell,
  type MailTemplate,
} from './academy-mail-template.helper';

type BuildPasswordResetCodeEmailParams = {
  recipientName: string;
  resetCode: string;
  expiresInMinutes: number;
};

export function buildPasswordResetCodeEmail(
  params: BuildPasswordResetCodeEmailParams,
): MailTemplate {
  const safeName = escapeHtml(params.recipientName || 'usuário');
  const safeCode = escapeHtml(params.resetCode);

  const subject = 'Código para redefinir sua senha na 7Eventos Academy';

  const text = [
    `Olá, ${params.recipientName}!`,
    '',
    'Recebemos uma solicitação para redefinir sua senha na 7Eventos Academy.',
    'Use o código abaixo para continuar:',
    '',
    params.resetCode,
    '',
    `Validade do código: ${params.expiresInMinutes} minutos.`,
    '',
    'Se você não solicitou esta ação, ignore este e-mail.',
    '',
    'Equipe 7Eventos Academy',
  ].join('\n');

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1f2937;">Olá, <strong>${safeName}</strong>!</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">
      Recebemos uma solicitação para redefinir sua senha.
      Use o código abaixo para confirmar a troca de senha:
    </p>
    <div style="margin:0 auto 18px;max-width:320px;background:#fff7f0;border:1px dashed #f59e0b;border-radius:14px;padding:16px 14px;text-align:center;">
      <div style="font-size:12px;color:#9a3412;text-transform:uppercase;letter-spacing:1.6px;font-weight:700;">Código de redefinição</div>
      <div style="margin-top:8px;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;color:#b45309;font-family:'Trebuchet MS',Arial,sans-serif;">${safeCode}</div>
    </div>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6b7280;">
      Este código expira em <strong>${params.expiresInMinutes} minutos</strong>.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
      Se você não solicitou esta ação, pode ignorar este e-mail com segurança.
    </p>
  `.trim();

  const html = renderAcademyMailShell({
    subject,
    headerTitle: 'Redefinição de senha',
    bodyHtml,
  });

  return {
    subject,
    text,
    html,
  };
}
