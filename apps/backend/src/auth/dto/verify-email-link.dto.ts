import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailLinkDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}
