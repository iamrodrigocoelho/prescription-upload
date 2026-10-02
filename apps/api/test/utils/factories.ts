import { randomBytes } from 'node:crypto';
import type { Role } from '@receita/shared';
import { generateSecret } from 'otplib';
import { CryptoService } from '../../src/infra/crypto/crypto.service.js';
import { hashPassword } from '../../src/infra/crypto/password-hasher.js';
import type { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { generateStoreSlug } from '../../src/modules/stores/store-slug.js';

export const TEST_PASSWORD = 'senha-de-teste-forte-42';

let passwordHashCache: Promise<string> | undefined;
function defaultPasswordHash(): Promise<string> {
  passwordHashCache ??= hashPassword(TEST_PASSWORD);
  return passwordHashCache;
}

let storeCounter = 0;

export async function createStore(
  prisma: PrismaService,
  overrides: Partial<{ storeNumber: string; storeName: string; active: boolean }> = {},
) {
  storeCounter += 1;
  const number = overrides.storeNumber ?? String(900 + storeCounter);
  return prisma.store.create({
    data: {
      storeNumber: number,
      storeName: overrides.storeName ?? `Loja Teste ${number}`,
      active: overrides.active ?? true,
      publicSlug: generateStoreSlug(),
    },
  });
}

export interface CreateUserOptions {
  role?: Role;
  email?: string;
  name?: string;
  active?: boolean;
  totpRequired?: boolean;
  /** Ativa 2FA com um segredo conhecido (retornado em `totpSecret`). */
  withTotp?: boolean;
  storeIds?: string[];
  password?: string | null;
}

export async function createUser(
  prisma: PrismaService,
  crypto: CryptoService,
  options: CreateUserOptions = {},
) {
  const totpSecret = options.withTotp ? generateSecret() : undefined;
  const user = await prisma.user.create({
    data: {
      name: options.name ?? 'Usuária Teste',
      email: options.email ?? `user-${randomBytes(4).toString('hex')}@teste.local`,
      role: options.role ?? 'STORE_COLLABORATOR',
      active: options.active ?? true,
      totpRequired: options.totpRequired ?? false,
      totpEnabled: Boolean(totpSecret),
      totpSecretEncrypted: totpSecret ? crypto.encryptTotpSecret(totpSecret) : null,
      passwordHash:
        options.password === null
          ? null
          : options.password
            ? await hashPassword(options.password)
            : await defaultPasswordHash(),
      storeAccess: options.storeIds
        ? { create: options.storeIds.map((storeId) => ({ storeId })) }
        : undefined,
    },
  });
  return { user, totpSecret };
}

export interface CreateSubmissionOptions {
  storeId: string;
  cpf?: string;
  operationalStatus?:
    'RECEIVED' | 'IN_REVIEW' | 'IN_SERVICE' | 'FINISHED' | 'CANCELLED' | 'NOT_SERVED';
  identificationStatus?: 'NOT_IDENTIFIED' | 'IDENTIFIED_PERSONALIZED_LINK' | 'IDENTIFIED_MANUAL';
  sourceChannel?: 'GENERIC' | 'STORE_LINK' | 'PERSONALIZED_LINK';
  createdAt?: Date;
  firstViewedAt?: Date | null;
  patient?: { externalId: string; label: string };
  files?: {
    storageKey?: string;
    mimeType?: string;
    malwareScanStatus?: 'PENDING' | 'NOT_SCANNED' | 'CLEAN' | 'INFECTED';
  }[];
}

/** Receita criada direto no banco (sem passar pelo upload público). */
export async function createSubmission(
  prisma: PrismaService,
  crypto: CryptoService,
  options: CreateSubmissionOptions,
) {
  return prisma.prescriptionSubmission.create({
    data: {
      storeId: options.storeId,
      cpfEncrypted: options.cpf ? crypto.encryptCpf(options.cpf) : null,
      cpfHashForLookup: options.cpf ? crypto.cpfLookupHash(options.cpf) : null,
      operationalStatus: options.operationalStatus ?? 'RECEIVED',
      identificationStatus:
        options.identificationStatus ??
        (options.patient ? 'IDENTIFIED_PERSONALIZED_LINK' : 'NOT_IDENTIFIED'),
      sourceChannel: options.sourceChannel ?? 'STORE_LINK',
      patientExternalId: options.patient?.externalId ?? null,
      patientDisplayLabel: options.patient?.label ?? null,
      firstViewedAt: options.firstViewedAt ?? null,
      retentionUntil: new Date(Date.now() + 365 * 86_400_000),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      files: {
        create: (options.files ?? [{}]).map((file, index) => ({
          storageKey: file.storageKey ?? `test/${randomBytes(8).toString('hex')}-${index}`,
          originalFilename: `receita-${index + 1}.jpg`,
          mimeType: file.mimeType ?? 'image/jpeg',
          sizeBytes: 1234,
          checksum: 'a'.repeat(64),
          malwareScanStatus: file.malwareScanStatus ?? 'NOT_SCANNED',
        })),
      },
      statusHistory: {
        create: { fromStatus: null, toStatus: options.operationalStatus ?? 'RECEIVED' },
      },
    },
    include: { files: true },
  });
}
