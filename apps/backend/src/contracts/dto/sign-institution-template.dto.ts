import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SignInstitutionTemplateDto {
  @IsBoolean()
  acceptTerms!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signerName?: string;
}
