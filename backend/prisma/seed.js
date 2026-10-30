const path = require('path');
// Variables set on the command line win over backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { v4: uuidv4 } = require('uuid');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required for seeding');
}

const connectionString = process.env.DATABASE_URL;

// Admin credentials come from the environment; without a password a random one is
// generated and printed once, so no fixed admin password lives in the repository
const SEED_ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@obsera.local').toLowerCase();
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
const generatedPassword = !process.env.SEED_ADMIN_PASSWORD;

// Sample credentials an attacker "tried"; they are data, not real passwords
const SEED_TEST_PASSWORDS = ['TestPass123!', 'DevTest456!'];

async function main() {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('🌱 Seeding database...');

    // Create the admin user; an existing account keeps its password
    const existingAdmin = await prisma.users.findUnique({ where: { email: SEED_ADMIN_EMAIL } });
    if (existingAdmin) {
      console.log('✅ Admin user already exists, password unchanged:', existingAdmin.email);
    } else {
      const adminUser = await prisma.users.create({
        data: {
          user_id: uuidv4(),
          email: SEED_ADMIN_EMAIL,
          password_hash: await bcryptjs.hash(SEED_ADMIN_PASSWORD, 10),
          display_name: 'Administrator System',
          is_active: true,
        },
      });
      console.log('✅ Admin user created:', adminUser.email);
      if (generatedPassword) {
        console.log('🔑 Generated admin password (shown once, store it now):', SEED_ADMIN_PASSWORD);
      }
    }

    // Sample attacker; upsert so the seed can run more than once (source_ip is unique)
    const attacker = await prisma.attackers.upsert({
      where: { source_ip: '192.168.1.100' },
      update: {},
      create: { attacker_id: uuidv4(), source_ip: '192.168.1.100' },
    });
    const attackerId = attacker.attacker_id;

    console.log('✅ Sample attacker ready:', attacker.source_ip);

    // Sample attack logs, only on the first run
    if (await prisma.attackLogs.count({ where: { attacker_id: attackerId } })) {
      console.log('✅ Sample attack logs already present, none added');
      console.log('🎉 Database seeded successfully!');
      return;
    }

    const logs = await prisma.attackLogs.createMany({
      data: [
        {
          log_id: uuidv4(),
          access_time: new Date(),
          attacker_id: attackerId,
          username_attempt: 'root',
          password_attempt: SEED_TEST_PASSWORDS[0],
          attempt_number: 1,
          status: 'blocked',
          reviewed_by: null,
        },
        {
          log_id: uuidv4(),
          access_time: new Date(Date.now() - 60000),
          attacker_id: attackerId,
          username_attempt: 'admin',
          password_attempt: SEED_TEST_PASSWORDS[1],
          attempt_number: 2,
          status: 'blocked',
          reviewed_by: null,
        },
      ],
    });

    console.log(`✅ ${logs.count} attack logs created`);
    console.log('🎉 Database seeded successfully!');
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
