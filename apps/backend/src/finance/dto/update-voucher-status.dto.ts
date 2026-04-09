import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class UpdateVoucherStatusDto {
  @Type(() => Boolean)
  @IsBoolean()
  active!: boolean;
}
