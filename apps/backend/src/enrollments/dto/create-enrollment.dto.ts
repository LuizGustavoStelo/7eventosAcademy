import { IsUUID } from 'class-validator';

export class CreateEnrollmentDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  studentId!: string;
}
