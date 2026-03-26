import { IsIn, IsString } from 'class-validator';

export class UpdateClassStatusDto {
  @IsString()
  @IsIn(['planning', 'enrollments_open', 'in_progress', 'closed'])
  status!: string;
}
