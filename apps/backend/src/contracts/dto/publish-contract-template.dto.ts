import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PublishContractTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240000)
  htmlContent?: string;

  @IsOptional()
  @IsObject()
  placeholdersJson?: Record<string, unknown>;
}

