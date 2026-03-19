import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './database/prisma.module';
import { SecretsModule } from './security/secrets/secrets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SecretsModule,
    PrismaModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
