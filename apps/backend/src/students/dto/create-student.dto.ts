import { IsEmail, IsString } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;
}
