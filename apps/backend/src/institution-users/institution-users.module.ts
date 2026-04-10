import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { InstitutionUsersController } from './institution-users.controller';
import { InstitutionUsersService } from './institution-users.service';

@Module({
  imports: [PrismaModule],
  controllers: [InstitutionUsersController],
  providers: [InstitutionUsersService],
})
export class InstitutionUsersModule {}

