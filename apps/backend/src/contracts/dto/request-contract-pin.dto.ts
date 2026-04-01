import { IsIn, IsOptional, IsString } from 'class-validator';

export class RequestContractPinDto {
  @IsOptional()
  @IsString()
  @IsIn(['email'])
  channel?: 'email';
}

