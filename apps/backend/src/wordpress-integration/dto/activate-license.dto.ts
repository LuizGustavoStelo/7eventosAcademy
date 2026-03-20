import { IsOptional, IsString, MinLength } from 'class-validator';

export class ActivateLicenseDto {
  @IsString()
  @MinLength(8)
  licenseKey!: string;

  @IsString()
  @MinLength(3)
  domain!: string;

  @IsOptional()
  @IsString()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  pluginVersion?: string;
}
