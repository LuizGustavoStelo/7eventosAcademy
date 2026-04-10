import { IsIn } from 'class-validator';

export class UpdateInstitutionMemberStatusDto {
  @IsIn(['active', 'invited', 'suspended'])
  status!: 'active' | 'invited' | 'suspended';
}

