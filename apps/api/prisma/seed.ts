/**
 * Seed de DESENVOLVIMENTO. Idempotente (upserts). Recusa-se a rodar em produção.
 * Credenciais vêm exclusivamente de variáveis de ambiente (SEED_*).
 */
import { createPgAdapter } from '../src/infra/prisma/pg-adapter.js';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/infra/crypto/password-hasher.js';
import { generateStoreSlug } from '../src/modules/stores/store-slug.js';

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`Defina ${name} no .env (mínimo de ${minLength} caracteres).`);
  }
  return value;
}

const STORES = [
  {
    storeNumber: '101',
    storeName: 'Venancio Copacabana',
    neighborhood: 'Copacabana',
    city: 'Rio de Janeiro',
    state: 'RJ',
    active: true,
  },
  {
    storeNumber: '102',
    storeName: 'Venancio Tijuca',
    neighborhood: 'Tijuca',
    city: 'Rio de Janeiro',
    state: 'RJ',
    active: true,
  },
  {
    storeNumber: '103',
    storeName: 'Venancio Barra',
    neighborhood: 'Barra da Tijuca',
    city: 'Rio de Janeiro',
    state: 'RJ',
    active: true,
  },
  {
    storeNumber: '104',
    storeName: 'Venancio Niterói Icaraí',
    neighborhood: 'Icaraí',
    city: 'Niterói',
    state: 'RJ',
    active: true,
  },
  {
    storeNumber: '199',
    storeName: 'Venancio Loja Desativada',
    neighborhood: 'Centro',
    city: 'Rio de Janeiro',
    state: 'RJ',
    active: false,
  },
] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O seed de desenvolvimento não pode rodar em produção.');
  }

  const prisma = new PrismaClient({
    adapter: createPgAdapter(requireEnv('DATABASE_URL')),
  });

  try {
    const adminEmail = requireEnv('SEED_ADMIN_EMAIL').toLowerCase();
    const adminPassword = requireEnv('SEED_ADMIN_PASSWORD', 12);
    const demoPassword = requireEnv('SEED_DEMO_PASSWORD', 12);
    const adminTotpRequired = process.env.SEED_ADMIN_TOTP_REQUIRED === 'true';

    const stores = new Map<string, string>();
    for (const store of STORES) {
      const saved = await prisma.store.upsert({
        where: { storeNumber: store.storeNumber },
        update: { ...store },
        create: { ...store, publicSlug: generateStoreSlug() },
      });
      stores.set(store.storeNumber, saved.id);
    }

    const now = new Date();
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: Role.ADMIN, active: true, totpRequired: adminTotpRequired },
      create: {
        name: process.env.SEED_ADMIN_NAME ?? 'Administrador',
        email: adminEmail,
        role: Role.ADMIN,
        totpRequired: adminTotpRequired,
        passwordHash: await hashPassword(adminPassword),
        passwordChangedAt: now,
      },
    });

    const demoHash = await hashPassword(demoPassword);
    const demoUsers = [
      {
        email: 'gestor@receita.local',
        name: 'Gestora Demo',
        role: Role.MANAGER,
        stores: ['101', '102'],
      },
      {
        email: 'colaborador@receita.local',
        name: 'Colaborador Demo',
        role: Role.STORE_COLLABORATOR,
        stores: ['101'],
      },
    ];

    for (const demo of demoUsers) {
      const user = await prisma.user.upsert({
        where: { email: demo.email },
        update: { role: demo.role, active: true },
        create: {
          name: demo.name,
          email: demo.email,
          role: demo.role,
          passwordHash: demoHash,
          passwordChangedAt: now,
        },
      });
      await prisma.userStoreAccess.deleteMany({ where: { userId: user.id } });
      await prisma.userStoreAccess.createMany({
        data: demo.stores.map((number) => ({
          userId: user.id,
          storeId: stores.get(number) ?? '',
          createdByUserId: admin.id,
        })),
      });
    }

    // Nenhuma senha é impressa: elas estão no .env de quem rodou o seed.
    process.stdout.write(
      [
        'Seed concluído:',
        `  - ${STORES.length} lojas (1 inativa)`,
        `  - admin: ${adminEmail} (2FA obrigatório: ${adminTotpRequired ? 'sim' : 'não'})`,
        '  - gestor@receita.local (lojas 101 e 102)',
        '  - colaborador@receita.local (loja 101)',
        '',
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
