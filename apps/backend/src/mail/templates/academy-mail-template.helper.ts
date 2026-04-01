export type MailTemplate = {
  subject: string;
  text: string;
  html: string;
};

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAcademyMailShell(params: {
  subject: string;
  headerTitle: string;
  headerSubtitle?: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  const safeSubject = escapeHtml(params.subject);
  const safeHeaderTitle = escapeHtml(params.headerTitle);
  const safeHeaderSubtitle = escapeHtml(params.headerSubtitle ?? '');
  const footerHtml =
    params.footerHtml ??
    'Equipe 7Eventos Academy<br />Este é um e-mail automático, não responda esta mensagem.';

  return `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f6f1ea;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #f0e4d7;border-radius:18px;overflow:hidden;">
      <tr>
        <td style="padding:0;">
          <div style="background:linear-gradient(135deg,#f25c05 0%,#ff8a2a 55%,#f59f45 100%);padding:28px 28px 22px;">
            <div style="font-size:12px;letter-spacing:1px;font-weight:700;color:#fff6ed;text-transform:uppercase;">7Eventos Academy</div>
            <h1 style="margin:10px 0 0;font-size:28px;line-height:1.1;color:#ffffff;font-family:'Trebuchet MS',Arial,sans-serif;">${safeHeaderTitle}</h1>
            ${
              params.headerSubtitle
                ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#fff7ed;">${safeHeaderSubtitle}</p>`
                : ''
            }
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 28px 14px;">
          ${params.bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <div style="border-top:1px solid #f1f5f9;padding-top:14px;font-size:12px;line-height:1.6;color:#6b7280;">
            ${footerHtml}
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
}

