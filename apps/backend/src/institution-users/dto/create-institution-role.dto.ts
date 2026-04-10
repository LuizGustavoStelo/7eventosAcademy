import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateInstitutionRoleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsIn(['category', 'template'])
  roleType?: 'category' | 'template';

  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}

