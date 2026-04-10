import { IsArray, IsUUID } from 'class-validator';

export class UpsertMemberRolesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}

