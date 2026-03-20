import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { WordpressIntegrationController } from './wordpress-integration.controller';
import { WordpressIntegrationService } from './wordpress-integration.service';

@Module({
  imports: [PrismaModule],
  controllers: [WordpressIntegrationController],
  providers: [WordpressIntegrationService],
})
export class WordpressIntegrationModule {}
