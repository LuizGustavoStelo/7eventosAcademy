import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

function normalizeNullableText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

export class UpdateInstitutionContactsDto {
  @IsOptional()
  @Transform(({ value }) => normalizeNullableText(value))
  @IsString()
  @MaxLength(160)
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeNullableText(value))
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9()+\-\s]{8,32}$/)
  supportPhone?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeNullableText(value))
  @IsString()
  @MaxLength(160)
  @IsEmail()
  commercialEmail?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeNullableText(value))
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9()+\-\s]{8,32}$/)
  commercialPhone?: string;
}
