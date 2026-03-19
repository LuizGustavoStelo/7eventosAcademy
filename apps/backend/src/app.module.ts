import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { SecretsModule } from './security/secrets/secrets.module';

@Module({
  imports: [SecretsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
