import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  buildAccountVerificationEmail,
  type AccountVerificationAudience,
} from './templates/account-verification-email.template';

type SendAccountVerificationEmailParams = {
  to: string;
  recipientName: string;
  verificationCode: string;
  expiresInMinutes: number;
  audience: AccountVerificationAudience;
};

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendAccountVerificationEmail(
    params: SendAccountVerificationEmailParams,
  ): Promise<void> {
    const template = buildAccountVerificationEmail({
      recipientName: params.recipientName,
      verificationCode: params.verificationCode,
      expiresInMinutes: params.expiresInMinutes,
      audience: params.audience,
    });

    try {
      await this.getTransporter().sendMail({
        from: this.resolveSenderAddress(),
        to: params.to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao enviar e-mail de confirmação para ${params.to}: ${this.formatMailError(error)}`,
      );
      throw new InternalServerErrorException(
        'Não foi possível enviar o e-mail de confirmação no momento.',
      );
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const portRaw = this.configService.get<string>('SMTP_PORT')?.trim();
    const secureRaw = this.configService
      .get<string>('SMTP_SECURE')
      ?.trim()
      .toLowerCase();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();

    const port = Number(portRaw);
    const secure =
      secureRaw === undefined || secureRaw === null || secureRaw === ''
        ? port === 465
        : secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes';

    if (!host || !Number.isFinite(port) || !user || !pass) {
      this.logger.error(
        `Configuração SMTP incompleta. host=${Boolean(host)} port=${Number.isFinite(port)} user=${Boolean(user)} pass=${Boolean(pass)}`,
      );
      throw new InternalServerErrorException(
        'Configuração SMTP incompleta para envio de e-mail.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  private resolveSenderAddress(): string {
    const customFrom = this.configService.get<string>('SMTP_FROM')?.trim();
    if (customFrom) {
      return customFrom;
    }

    const user = this.configService.get<string>('SMTP_USER')?.trim();
    if (user) {
      return `7Eventos Academy <${user}>`;
    }

    return '7Eventos Academy <no-reply@academy.local>';
  }

  private formatMailError(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return 'erro desconhecido';
    }

    const mailError = error as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      responseCode?: unknown;
      command?: unknown;
      response?: unknown;
    };

    const parts = [
      `name=${String(mailError.name ?? 'Error')}`,
      `message=${String(mailError.message ?? 'sem mensagem')}`,
    ];

    if (mailError.code !== undefined) {
      parts.push(`code=${String(mailError.code)}`);
    }

    if (mailError.responseCode !== undefined) {
      parts.push(`responseCode=${String(mailError.responseCode)}`);
    }

    if (mailError.command !== undefined) {
      parts.push(`command=${String(mailError.command)}`);
    }

    if (mailError.response !== undefined) {
      parts.push(`response=${String(mailError.response)}`);
    }

    return parts.join(' | ');
  }
}
