import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export const FINANCIAL_PROVIDERS = [
  'manual',
  'sicoob',
  'asaas',
  'stripe',
] as const;

export type FinancialProvider = (typeof FINANCIAL_PROVIDERS)[number];

export class UpsertAccountFinancialConfigDto {
  @IsString()
  @IsIn(FINANCIAL_PROVIDERS)
  provider!: FinancialProvider;

  @IsOptional()
  @IsString()
  @IsIn(['sandbox', 'production'])
  environment?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  sicoobClientId?: string;

  @IsOptional()
  @IsString()
  sicoobTokenUrl?: string;

  @IsOptional()
  @IsString()
  sicoobBaseUrlCobrancaBancaria?: string;

  @IsOptional()
  @IsString()
  sicoobBaseUrlCobrancaBancariaPagamentos?: string;

  @IsOptional()
  @IsString()
  sicoobBaseUrlPixPagamentos?: string;

  @IsOptional()
  @IsString()
  sicoobBaseUrlPixRecebimentos?: string;

  @IsOptional()
  @IsString()
  sicoobBaseUrlSpbTransferencias?: string;

  @IsOptional()
  @IsString()
  sicoobSandboxBaseUrlCobrancaBancaria?: string;

  @IsOptional()
  @IsString()
  sicoobSandboxBaseUrlCobrancaBancariaPagamentos?: string;

  @IsOptional()
  @IsString()
  sicoobSandboxBaseUrlPixPagamentos?: string;

  @IsOptional()
  @IsString()
  sicoobSandboxBaseUrlPixRecebimentos?: string;

  @IsOptional()
  @IsString()
  sicoobSandboxBaseUrlSpbTransferencias?: string;

  @IsOptional()
  @IsString()
  sicoobWebhookUrl?: string;

  @IsOptional()
  @IsString()
  sicoobNumeroCliente?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sicoobScopes?: string[];

  @IsOptional()
  @IsString()
  sicoobCertificatePem?: string;

  @IsOptional()
  @IsString()
  sicoobPrivateKeyPem?: string;

  @IsOptional()
  @IsString()
  sicoobCertificatePfxBase64?: string;

  @IsOptional()
  @IsString()
  sicoobCertificatePfxPassphrase?: string;

  @IsOptional()
  @IsString()
  genericApiKey?: string;
}
