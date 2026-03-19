import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { readFileSync } from 'fs';

@Injectable()
export class SecretsService {
  private readonly algorithm = 'aes-256-gcm';
  private key?: Buffer;

  encrypt(plainText: string): string {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [ivBase64Url, authTagBase64Url, encryptedBase64Url] =
      payload.split('.');
    if (!ivBase64Url || !authTagBase64Url || !encryptedBase64Url) {
      throw new Error('Payload de segredo inválido');
    }

    const iv = Buffer.from(ivBase64Url, 'base64url');
    const authTag = Buffer.from(authTagBase64Url, 'base64url');
    const encrypted = Buffer.from(encryptedBase64Url, 'base64url');

    const decipher = createDecipheriv(this.algorithm, this.getKey(), iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return plain.toString('utf8');
  }

  private loadMasterKey(): Buffer {
    const keyFile = process.env.SECRETS_MASTER_KEY_FILE;
    if (!keyFile) {
      throw new Error(
        'SECRETS_MASTER_KEY_FILE não definido. Configure o arquivo de segredo mestre.',
      );
    }

    const raw = readFileSync(keyFile, 'utf8').trim();
    if (!raw) {
      throw new Error('Arquivo de segredo mestre está vazio.');
    }

    return createHash('sha256').update(raw, 'utf8').digest();
  }

  private getKey(): Buffer {
    if (!this.key) {
      this.key = this.loadMasterKey();
    }
    return this.key;
  }
}
