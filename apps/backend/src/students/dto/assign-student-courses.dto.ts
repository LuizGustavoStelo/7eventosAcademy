import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class AssignStudentCoursesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @Type(() => String)
  courseIds!: string[];
}
