import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;

function normalizeColorValue(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTextValue(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class UpsertAccountBrandingDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  resetToDefault?: boolean;

  @IsOptional()
  @Transform(({ value }) => normalizeTextValue(value))
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  primaryColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  primaryStrongColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  secondaryColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  secondaryStrongColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  backgroundColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  surfaceColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  surfaceSoftColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  borderColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  textColor?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeColorValue(value))
  @Matches(HEX_COLOR_PATTERN)
  mutedColor?: string;
}
