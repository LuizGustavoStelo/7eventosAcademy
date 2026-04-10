import { IsArray, IsUUID } from 'class-validator';

export class UpsertRolePermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}

