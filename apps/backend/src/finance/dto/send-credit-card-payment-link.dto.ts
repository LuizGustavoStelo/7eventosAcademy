import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SendCreditCardPaymentLinkDto {
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  paymentLinkUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}
