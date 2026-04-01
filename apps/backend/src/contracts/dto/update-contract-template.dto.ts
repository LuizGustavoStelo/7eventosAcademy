import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateContractTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  draftTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240000)
  draftHtmlContent?: string;
}

