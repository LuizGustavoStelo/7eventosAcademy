import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PayStudentChargeDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  returnUrl?: string;
}
