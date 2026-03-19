import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('deve retornar status ok', () => {
      const health = appController.health();

      expect(health.status).toBe('ok');
      expect(health.service).toBe('7eventos-academy-api');
      expect(typeof health.timestamp).toBe('string');
    });
  });
});
