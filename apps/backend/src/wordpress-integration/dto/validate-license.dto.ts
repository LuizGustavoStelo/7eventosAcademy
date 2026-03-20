import { IsOptional, IsString, MinLength } from 'class-validator';

export class ValidateLicenseDto {
  @IsString()
  @MinLength(16)
  activationToken!: string;

  @IsString()
  @MinLength(3)
  domain!: string;

  @IsOptional()
  @IsString()
  siteUrl?: string;
}
