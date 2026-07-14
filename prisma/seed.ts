import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@base-negocio.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin123!ChangeMe';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    console.log(`Admin ya existe: ${adminEmail}`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.$runCommandRaw({
    insert: 'User',
    documents: [
      {
        email: adminEmail,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        isBlocked: false,
        failedLoginAttempts: 0,
        loginBlockedUntil: null,
        banned_until: null,
        lastConnectionAt: null,
        createdAt: { $date: new Date().toISOString() },
        updatedAt: { $date: new Date().toISOString() },
      },
    ],
  });

  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    throw new Error('No se pudo crear el admin');
  }

  console.log('Admin creado:');
  console.log(`  Email: ${admin.email}`);
  console.log(`  Role: ${admin.role}`);
  console.log(`  ID: ${admin.id}`);
  console.log('\nCambia la contraseña después del primer login.');
}

main()
  .catch((error) => {
    console.error('Seed falló:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
