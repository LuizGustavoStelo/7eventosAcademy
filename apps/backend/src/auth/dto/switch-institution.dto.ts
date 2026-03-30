import { IsUUID } from 'class-validator';

export class SwitchInstitutionDto {
  @IsUUID('4')
  institutionId!: string;
}
