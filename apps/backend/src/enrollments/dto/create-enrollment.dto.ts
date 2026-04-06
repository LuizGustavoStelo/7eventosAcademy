import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateEnrollmentDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentOptionId?: string;
}
