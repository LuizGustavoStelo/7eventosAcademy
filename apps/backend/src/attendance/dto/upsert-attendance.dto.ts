import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AttendanceItemDto {
  @IsString()
  @MinLength(1)
  studentId!: string;

  @IsBoolean()
  present!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpsertAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  items!: AttendanceItemDto[];
}
