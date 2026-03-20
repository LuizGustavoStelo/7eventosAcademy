import { IsIn, IsString } from 'class-validator';

export class UpdateChargeStatusDto {
  @IsString()
  @IsIn(['pending', 'paid', 'overdue', 'canceled'])
  status!: string;
}
