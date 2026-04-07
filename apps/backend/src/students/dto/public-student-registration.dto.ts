import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class PublicStudentRegistrationDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  documentCpf!: string;

  @IsString()
  documentRg!: string;

  @IsString()
  issuingAuthority!: string;

  @IsString()
  phone!: string;

  @IsDateString()
  birthDate!: string;

  @IsString()
  birthCity!: string;

  @IsString()
  maritalStatus!: string;

  @IsString()
  address!: string;

  @IsString()
  fatherName!: string;

  @IsString()
  motherName!: string;

  @IsString()
  graduation!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  graduationConclusionYear!: number;

  @IsString()
  companyName!: string;

  @IsString()
  jobTitle!: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  streetNumber?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Type(() => String)
  courseIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  selectedPaymentOptionId?: string;
}
