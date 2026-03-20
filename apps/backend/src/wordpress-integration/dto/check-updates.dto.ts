import { IsOptional, IsString, MinLength } from 'class-validator';

export class CheckUpdatesDto {
  @IsString()
  @MinLength(16)
  activationToken!: string;

  @IsString()
  @MinLength(3)
  domain!: string;

  @IsString()
  @MinLength(3)
  pluginVersion!: string;

  @IsOptional()
  @IsString()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  wordpressVersion?: string;

  @IsOptional()
  @IsString()
  phpVersion?: string;
}
