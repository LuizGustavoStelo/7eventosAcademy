import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CreateVoucherDto } from './create-voucher.dto';

export class CreateVoucherBatchDto extends CreateVoucherDto {
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(500)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  codePrefix?: string;
}
