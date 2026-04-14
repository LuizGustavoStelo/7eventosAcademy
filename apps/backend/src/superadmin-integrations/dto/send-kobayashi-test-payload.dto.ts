import {
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class SendProviderTestPayloadDto {
  @IsOptional()
  @IsString()
  enrollmentId?: string;

  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  payload?: Record<string, unknown>;
}
