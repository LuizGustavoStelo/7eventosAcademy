import { IsString, MaxLength } from 'class-validator';

export class ValidatePublicVoucherDto {
  @IsString()
  @MaxLength(40)
  code!: string;
}
