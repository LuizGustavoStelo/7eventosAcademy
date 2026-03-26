import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateImpersonationSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(180)
  durationMinutes?: number;
}
