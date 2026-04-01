import { IsString, Length } from 'class-validator';

export class VerifyContractPinDto {
  @IsString()
  @Length(6, 6)
  pin!: string;
}

