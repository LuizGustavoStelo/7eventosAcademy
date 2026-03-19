import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretsService } from './secrets.service';

describe('SecretsService', () => {
  it('deve criptografar e descriptografar corretamente', () => {
    const keyPath = join(tmpdir(), `academy-master-key-${Date.now()}.txt`);
    writeFileSync(keyPath, 'chave-super-segura-de-teste', 'utf8');
    process.env.SECRETS_MASTER_KEY_FILE = keyPath;

    const service = new SecretsService();
    const encrypted = service.encrypt('token-secreto-abc123');
    const plain = service.decrypt(encrypted);

    expect(encrypted).not.toBe('token-secreto-abc123');
    expect(plain).toBe('token-secreto-abc123');
  });
});
