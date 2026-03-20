import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  CourseModalityDto,
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
  workloadHours?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  coordinator?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

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
  installmentMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  installmentValue?: number;
}
