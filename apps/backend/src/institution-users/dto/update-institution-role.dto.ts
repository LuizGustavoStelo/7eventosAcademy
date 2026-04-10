import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateInstitutionRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name?: string;
}

