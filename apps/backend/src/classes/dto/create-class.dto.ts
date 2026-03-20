import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateClassDto {
  @IsUUID()
  courseId!: string;

  @IsString()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalSeats!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
