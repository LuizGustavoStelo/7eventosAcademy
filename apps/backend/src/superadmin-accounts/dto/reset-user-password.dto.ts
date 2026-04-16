import { IsString, Matches, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
  password!: string;
}
