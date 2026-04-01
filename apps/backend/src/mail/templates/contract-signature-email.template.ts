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
) {
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

  const subject = `Contrato disponível para assinatura: ${params.templateTitle}`;
  const text = [
    `Olá, ${params.recipientName}.`,
    '',
    `Você recebeu um contrato para assinatura: ${params.templateTitle}.`,
    `Acesse o link para revisar e assinar: ${params.signingLink}`,
    `Validade do link: ${expiresAtLabel}.`,
    '',
    'Se você não reconhece este envio, desconsidere este e-mail.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Contrato disponível para assinatura</h2>
      <p>Olá, <strong>${escapeHtml(params.recipientName)}</strong>.</p>
      <p>Você recebeu um contrato para assinatura:</p>
      <p style="margin: 12px 0;"><strong>${escapeHtml(params.templateTitle)}</strong></p>
      <p>
        <a href="${escapeHtml(params.signingLink)}" style="display: inline-block; padding: 10px 14px; background: #0f766e; color: #fff; text-decoration: none; border-radius: 8px;">
          Revisar e assinar
        </a>
      </p>
      <p style="margin-top: 12px;">Validade do link: <strong>${escapeHtml(expiresAtLabel)}</strong>.</p>
      <p style="color: #6b7280;">Se você não reconhece este envio, desconsidere este e-mail.</p>
    </div>
  `;

  return { subject, text, html };
}

export function buildContractPinEmail(params: BuildContractPinEmailParams) {
  const subject = `Código de assinatura do contrato: ${params.templateTitle}`;
  const text = [
    `Olá, ${params.recipientName}.`,
    '',
    `Seu código de confirmação para assinatura do contrato "${params.templateTitle}" é: ${params.pinCode}`,
    `Validade: ${params.expiresInMinutes} minutos.`,
    '',
    'Não compartilhe este código com terceiros.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Código de confirmação</h2>
      <p>Olá, <strong>${escapeHtml(params.recipientName)}</strong>.</p>
      <p>Use o código abaixo para concluir a assinatura do contrato:</p>
      <p style="margin: 16px 0; font-size: 28px; font-weight: 700; letter-spacing: 6px;">${escapeHtml(params.pinCode)}</p>
      <p>Contrato: <strong>${escapeHtml(params.templateTitle)}</strong></p>
      <p>Validade: <strong>${params.expiresInMinutes} minutos</strong>.</p>
      <p style="color: #b91c1c;">Não compartilhe este código com terceiros.</p>
    </div>
  `;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

