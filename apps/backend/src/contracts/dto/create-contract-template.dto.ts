import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateContractTemplateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  draftTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240000)
  draftHtmlContent!: string;

  @IsOptional()
  @IsBoolean()
  autoSendEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendAllCourses?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  autoSendCourseIds?: string[];
}
