import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CourseModalityDto,
  CoursePaymentOptionDto,
  CoursePaymentModelDto,
  CourseStatusDto,
} from './create-course.dto';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workloadHours?: number | null;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  coordinator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kobayashiOfertaCursoId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  enrollmentFee?: number | null;

  @IsOptional()
  @IsEnum(CourseModalityDto)
  modality?: CourseModalityDto;

  @IsOptional()
  @IsEnum(CourseStatusDto)
  status?: CourseStatusDto;

  @IsOptional()
  @IsEnum(CoursePaymentModelDto)
  paymentModel?: CoursePaymentModelDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentMonths?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  installmentValue?: number | null;

  @IsOptional()
  @IsISO8601()
  installmentStartDate?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoursePaymentOptionDto)
  paymentOptions?: CoursePaymentOptionDto[];
}
