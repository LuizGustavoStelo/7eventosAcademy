import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVoucherDto {
  @IsUUID()
  courseId!: string;

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

  @IsIn(['TOTAL', 'INSTALLMENT'])
  appliesTo!: 'TOTAL' | 'INSTALLMENT';

  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  allowedPaymentOptionIds!: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}
