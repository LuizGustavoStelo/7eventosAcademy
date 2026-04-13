import { IsNotEmptyObject, IsObject } from 'class-validator';

export class SendKobayashiTestPayloadDto {
  @IsObject()
  @IsNotEmptyObject()
  payload!: Record<string, unknown>;
}
