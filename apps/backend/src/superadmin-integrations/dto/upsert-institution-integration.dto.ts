import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const INTEGRATION_ENVIRONMENTS = ['production', 'sandbox'] as const;

export class UpsertInstitutionIntegrationDto {
  @IsOptional()
  @IsString()
  @IsIn(INTEGRATION_ENVIRONMENTS)
  environment?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  kobayashiBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kobayashiClientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kobayashiClientSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  kobayashiToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  kobayashiAuthorizationBearer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  kobayashiGrantType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  kobayashiScopes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kobayashiDefaultGcssid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kobayashiDefaultIdentificacaoVendedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kobayashiDefaultOfertaCursoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rdStationBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rdStationApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rdStationConversionIdentifier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  rdStationCourseFieldKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  rdStationAgeFieldKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  rdStationAddressFieldKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  rdStationEnrollmentIdFieldKey?: string;
}
