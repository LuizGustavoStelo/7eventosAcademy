import {
  escapeHtml,
  renderAcademyMailShell,
  type MailTemplate,
} from './academy-mail-template.helper';

type BuildContractInvitationEmailParams = {
  recipientName: string;
  templateTitle: string;
  signingLink: string;
  expiresAtIso: string;
};

type BuildContractPinEmailParams = {
  recipientName: string;
  templateTitle: string;
  pinCode: string;
  expiresInMinutes: number;
};

export function buildContractInvitationEmail(
  params: BuildContractInvitationEmailParams,
): MailTemplate {
  const expiresAt = new Date(params.expiresAtIso);
  const expiresAtLabel = Number.isNaN(expiresAt.getTime())
    ? params.expiresAtIso
    : new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(expiresAt);

  const safeRecipientName = escapeHtml(params.recipientName || 'usuário');
  const safeTemplateTitle = escapeHtml(params.templateTitle || 'Contrato');
  const safeSigningLink = escapeHtml(params.signingLink);
  const safeExpiresAtLabel = escapeHtml(expiresAtLabel);

  const subject = `Contrato disponível para assinatura: ${params.templateTitle}`;

  const text = [
    `Olá, ${params.recipientName || 'usuário'}!`,
    '',
    'Um contrato foi disponibilizado para você na 7Eventos Academy.',
    `Contrato: ${params.templateTitle}`,
    `Link para revisar e assinar: ${params.signingLink}`,
    `Validade do link: ${expiresAtLabel}.`,
    '',
    'Se você não reconhece este envio, desconsidere esta mensagem.',
    '',
    'Equipe 7Eventos Academy',
  ].join('\n');

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1f2937;">Olá, <strong>${safeRecipientName}</strong>!</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">
      Um contrato foi disponibilizado para você. Revise o documento e, se estiver de acordo,
      conclua a assinatura eletrônica.
    </p>

    <div style="margin:0 0 18px;background:#fff7f0;border:1px solid #fed7aa;border-radius:14px;padding:14px 16px;">
      <div style="font-size:12px;color:#9a3412;text-transform:uppercase;letter-spacing:1.4px;font-weight:700;">Contrato</div>
      <div style="margin-top:6px;font-size:16px;line-height:1.5;color:#1f2937;font-weight:700;">${safeTemplateTitle}</div>
      <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#6b7280;">Validade do link: <strong>${safeExpiresAtLabel}</strong></div>
    </div>

    <div style="margin:0 0 18px;text-align:center;">
      <a href="${safeSigningLink}" style="display:inline-block;padding:12px 18px;background:#b45309;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">
        Revisar e assinar contrato
      </a>
    </div>

    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
      Se você não reconhece este envio, pode ignorar este e-mail com segurança.
    </p>
  `.trim();

  const html = renderAcademyMailShell({
    subject,
    headerTitle: 'Contrato para assinatura',
    headerSubtitle: 'Ação necessária para concluir sua assinatura eletrônica.',
    bodyHtml,
  });

  return { subject, text, html };
}

export function buildContractPinEmail(
  params: BuildContractPinEmailParams,
): MailTemplate {
  const safeRecipientName = escapeHtml(params.recipientName || 'usuário');
  const safeTemplateTitle = escapeHtml(params.templateTitle || 'Contrato');
  const safePinCode = escapeHtml(params.pinCode);

  const subject = `Código de assinatura do contrato: ${params.templateTitle}`;

  const text = [
    `Olá, ${params.recipientName || 'usuário'}!`,
    '',
    `Recebemos uma solicitação para assinar o contrato "${params.templateTitle}".`,
    'Use o código abaixo para confirmar a assinatura:',
    '',
    params.pinCode,
    '',
    `Validade do código: ${params.expiresInMinutes} minutos.`,
    'Não compartilhe este código com terceiros.',
    '',
    'Equipe 7Eventos Academy',
  ].join('\n');

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1f2937;">Olá, <strong>${safeRecipientName}</strong>!</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">
      Para concluir a assinatura eletrônica do contrato abaixo, informe este código na plataforma:
    </p>

    <div style="margin:0 auto 18px;max-width:320px;background:#fff7f0;border:1px dashed #f59e0b;border-radius:14px;padding:16px 14px;text-align:center;">
      <div style="font-size:12px;color:#9a3412;text-transform:uppercase;letter-spacing:1.6px;font-weight:700;">Código de assinatura</div>
      <div style="margin-top:8px;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;color:#b45309;font-family:'Trebuchet MS',Arial,sans-serif;">${safePinCode}</div>
    </div>

    <div style="margin:0 0 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Contrato</div>
      <div style="margin-top:4px;font-size:14px;line-height:1.6;color:#1f2937;font-weight:700;">${safeTemplateTitle}</div>
    </div>

    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6b7280;">
      Este código expira em <strong>${params.expiresInMinutes} minutos</strong>.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#991b1b;">
      Não compartilhe este código com terceiros.
    </p>
  `.trim();

  const html = renderAcademyMailShell({
    subject,
    headerTitle: 'Confirmação por código',
    headerSubtitle: 'Use este código para validar sua assinatura eletrônica.',
    bodyHtml,
  });

  return { subject, text, html };
}