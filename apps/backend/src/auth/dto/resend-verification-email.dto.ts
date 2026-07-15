import { IsEmail } from 'class-validator';

export class ResendVerificationEmailDto {
  @IsEmail()
  email!: string;
}
