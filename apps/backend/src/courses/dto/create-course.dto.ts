import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
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

export enum CoursePaymentOptionMethodDto {
  PIX = 'PIX',
  BANK_SLIP = 'BANK_SLIP',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum CoursePaymentOptionTypeDto {
  CASH = 'CASH',
  INSTALLMENTS = 'INSTALLMENTS',
}

export enum CoursePaymentDiscountTypeDto {
  FIXED = 'FIXED',
  PERCENT = 'PERCENT',
}

export enum CoursePaymentDiscountAppliesToDto {
  INSTALLMENT = 'INSTALLMENT',
  TOTAL = 'TOTAL',
}

export class CoursePaymentOptionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsEnum(CoursePaymentOptionMethodDto)
  method!: CoursePaymentOptionMethodDto;

  @IsEnum(CoursePaymentOptionTypeDto)
  type!: CoursePaymentOptionTypeDto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  installmentAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPromotional?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  promotionalSlots?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  promotionalTotalAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  promotionalInstallmentAmount?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  discountEnabled?: boolean;

  @IsOptional()
  @IsEnum(CoursePaymentDiscountTypeDto)
  discountType?: CoursePaymentDiscountTypeDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  discountDeadlineDay?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  discountRequiresActiveCrf?: boolean;

  @IsOptional()
  @IsEnum(CoursePaymentDiscountAppliesToDto)
  discountAppliesTo?: CoursePaymentDiscountAppliesToDto;
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoursePaymentOptionDto)
  paymentOptions?: CoursePaymentOptionDto[];
}
