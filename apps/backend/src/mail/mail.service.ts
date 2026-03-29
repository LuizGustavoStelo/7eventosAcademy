import {
  Injectable,
  InternalServerErrorException,
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
    } catch {
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
    const secure = secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes';

    if (!host || !Number.isFinite(port) || !user || !pass) {
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
}
