import { IsString, MinLength } from 'class-validator';

export class ValidateLicenseDto {
  @IsString()
  @MinLength(16)
  activationToken!: string;

  @IsString()
  @MinLength(3)
  domain!: string;

  @IsString()
  siteUrl!: string;
}
