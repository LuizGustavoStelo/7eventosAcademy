import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SignContractInstanceDto {
  @IsBoolean()
  acceptTerms!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  acceptedTermsText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  acceptedTermsVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  signerTimezone?: string;
}

