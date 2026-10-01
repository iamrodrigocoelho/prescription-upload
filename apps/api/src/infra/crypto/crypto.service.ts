import { Inject, Injectable } from '@nestjs/common';
import { normalizeCpf } from '@receita/shared';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { decryptField, encryptField, hmacSha256 } from './primitives.js';

const CPF_CONTEXT = 'receita:cpf:v1';
const TOTP_CONTEXT = 'receita:totp:v1';

/** Criptografia de campos sensíveis com chaves vindas do ambiente (PRD §25). */
@Injectable()
export class CryptoService {
  private readonly cpfKey: Buffer;
  private readonly totpKey: Buffer;
  private readonly cpfPepper: string;

  constructor(@Inject(ENV) env: Env) {
    this.cpfKey = Buffer.from(env.CPF_ENCRYPTION_KEY, 'base64');
    this.totpKey = Buffer.from(env.TOTP_ENCRYPTION_KEY, 'base64');
    this.cpfPepper = env.CPF_LOOKUP_PEPPER;
  }

  encryptCpf(cpf: string): string {
    return encryptField(normalizeCpf(cpf), this.cpfKey, CPF_CONTEXT);
  }

  decryptCpf(payload: string): string {
    return decryptField(payload, this.cpfKey, CPF_CONTEXT);
  }

  /** `cpf_hash_for_lookup`: permite busca exata sem descriptografar. */
  cpfLookupHash(cpf: string): string {
    return hmacSha256(normalizeCpf(cpf), this.cpfPepper);
  }

  encryptTotpSecret(secret: string): string {
    return encryptField(secret, this.totpKey, TOTP_CONTEXT);
  }

  decryptTotpSecret(payload: string): string {
    return decryptField(payload, this.totpKey, TOTP_CONTEXT);
  }
}
