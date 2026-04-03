import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum CourseStatusDto {
  ACTIVE = 'ACTIVE',
  DRAFT = 'DRAFT',
  INACTIVE = 'INACTIVE',
}

export enum CourseModalityDto {
  PRESENTIAL = 'PRESENTIAL',
  HYBRID = 'HYBRID',
  EAD = 'EAD',
}

export enum CoursePaymentModelDto {
  CASH = 'CASH',
  INSTALLMENTS = 'INSTALLMENTS',
}

export class CreateCourseDto {
  @IsString()
  name!: string;

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
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  enrollmentFee?: number;

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

  @IsOptional()
  @IsISO8601()
  installmentStartDate?: string;
}
