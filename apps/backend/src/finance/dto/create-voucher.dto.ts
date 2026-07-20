import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsNumber,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVoucherDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allCourses?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsIn(['PERCENT', 'FIXED'])
  discountType!: 'PERCENT' | 'FIXED';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  discountValue!: number;

  @IsOptional()
  @IsIn(['REGULAR', 'PROMOTIONAL'])
  valueBase?: 'REGULAR' | 'PROMOTIONAL';

  @IsIn(['TOTAL', 'INSTALLMENT'])
  appliesTo!: 'TOTAL' | 'INSTALLMENT';

  @IsOptional()
  @IsIn(['ALL', 'SINGLE'])
  installmentScope?: 'ALL' | 'SINGLE';

  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  allowedPaymentOptionIds!: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  appliesToEnrollmentFee?: boolean;
}
