import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateReleaseAdminDto {
  @IsString()
  @Matches(/^v?\d+(\.\d+){1,2}$/, {
    message: 'A versão deve estar no formato x.y ou x.y.z',
  })
  version!: string;

  @IsUrl()
  packageUrl!: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  checksumSha256?: string;

  @IsOptional()
  @IsUrl()
  changelogUrl?: string;

  @IsOptional()
  @IsString()
  minWpVersion?: string;

  @IsOptional()
  @IsString()
  minPhpVersion?: string;

  @Type(() => Boolean)
  @IsBoolean()
  isPublished!: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isMandatory?: boolean;
}
