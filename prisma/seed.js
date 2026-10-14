import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = '12345678';

function requireSafeToSeed() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_SEED !== 'true'
  ) {
    console.error(
      'Refusing to seed: NODE_ENV is production. Set ALLOW_SEED=true if you really intend to run this.',
    );
    process.exit(1);
  }
}

async function deleteQuestionsRows() {
  await prisma.$executeRawUnsafe(`
DO $seed$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename::text AS t
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'questions%'
  LOOP
    EXECUTE format('DELETE FROM %I.%I', 'public', r.t);
  END LOOP;
END $seed$;
  `);
}

async function assertDatabaseMatchesPrisma() {
  const rows = await prisma.$queryRaw`
    SELECT tablename::text AS t
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename IN ('users', 'Item', 'items')
  `;
  const names = new Set(rows.map((r) => r.t));
  if (!names.has('users')) {
    console.error(
      'Missing table `users`. Create the schema first, for example: pnpm exec prisma migrate dev',
    );
    process.exit(1);
  }
  if (names.has('items') && !names.has('Item')) {
    console.error(
      'This database still has the legacy `items` table, but the Prisma schema expects `Item`. ' +
        'Back up any data you need, then align the schema (for example: pnpm exec prisma db push --accept-data-loss), ' +
        'or reset with migrations on a fresh database.',
    );
    process.exit(1);
  }
  if (!names.has('Item')) {
    console.error(
      'Missing table `Item`. Apply migrations or push the schema: pnpm exec prisma migrate dev',
    );
    process.exit(1);
  }
}

async function wipeAppData() {
  await prisma.notification.deleteMany();
  await prisma.notificationEvent.deleteMany();
  await prisma.tasks.deleteMany();
  await deleteQuestionsRows();
  await prisma.item.deleteMany();
  await prisma.mail.deleteMany();
  await prisma.subscriptionEvent.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
  await prisma.services.deleteMany();
  await prisma.general_Settings.deleteMany();
  await prisma.temp.deleteMany();
}

async function hash(password) {
  return bcrypt.hash(password, 10);
}

async function main() {
  requireSafeToSeed();
  await assertDatabaseMatchesPrisma();

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  const userPassword = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;

  console.info('Seeding: clearing existing application data…');
  await wipeAppData();

  const [adminPassHash, userPassHash] = await Promise.all([
    hash(adminPassword),
    hash(userPassword),
  ]);

  console.info('Seeding: general settings & services…');
  await prisma.general_Settings.create({
    data: {
      description: 'Maintenance Genie demo / local defaults',
      contact_email: 'support@maintenance-genie.local',
      contact_phone: '+1-555-0100',
      timezone: 'America/New_York',
    },
  });

  const serviceMonthly = await prisma.services.create({
    data: {
      name: 'Premium — monthly',
      description: 'Monthly plan, billed through Google Play',
      price: 5.0,
      features: ['Unlimited items', 'Email reminders', 'OCR receipts'],
      plan: 'Monthly',
      rc_product_id: 'maintenance_genie_premium:mg-monthly',
    },
  });

  const serviceYear = await prisma.services.create({
    data: {
      name: 'Premium — yearly',
      description: 'Annual plan with best value',
      price: 50.0,
      features: ['Unlimited items', 'Priority support', 'OCR receipts'],
      plan: 'Yearly',
      rc_product_id: 'maintenance_genie_premium:mg-annual',
    },
  });

  console.info('Seeding: users…');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@maintenance-genie.local',
      name: 'Demo Admin',
      password: adminPassHash,
      type: 'ADMIN',
      role: 'premium',
      status: 'active',
      country: 'US',
      city: 'Boston',
      phone_number: '+1-555-0101',
      bio: 'Local admin account for development',
    },
  });

  const user = await prisma.user.create({
    data: {
      email: 'user@maintenance-genie.local',
      name: 'Demo User',
      password: userPassHash,
      type: 'USER',
      role: 'normal',
      status: 'active',
      country: 'US',
      city: 'Seattle',
      phone_number: '+1-555-0102',
      is_subscribed: false,
    },
  });

  const premiumUser = await prisma.user.create({
    data: {
      email: 'premium@maintenance-genie.local',
      name: 'Demo Premium',
      password: userPassHash,
      type: 'USER',
      role: 'premium',
      status: 'active',
      country: 'CA',
      city: 'Toronto',
      is_subscribed: true,
    },
  });

  const now = new Date();
  const inOneYear = new Date(now);
  inOneYear.setFullYear(inOneYear.getFullYear() + 1);

  console.info('Seeding: subscriptions & events…');
  const subPremium = await prisma.subscription.create({
    data: {
      user_id: premiumUser.id,
      username: premiumUser.name,
      service_id: serviceYear.id,
      price: serviceYear.price,
      plan: 'Yearly',
      start_date: now,
      end_date: inOneYear,
      status: 'Active',
      rc_original_transaction_id: `GPA.seed-${premiumUser.id.slice(0, 8)}`,
      product_id: serviceYear.rc_product_id,
      store: 'PLAY_STORE',
      environment: 'SANDBOX',
      will_renew: true,
      last_event_at: now,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      rc_event_id: `seed-event-${premiumUser.id.slice(0, 8)}`,
      type: 'INITIAL_PURCHASE',
      user_id: premiumUser.id,
      subscription_id: subPremium.id,
      product_id: serviceYear.rc_product_id,
      store: 'PLAY_STORE',
      environment: 'SANDBOX',
      price: serviceYear.price,
      currency: 'USD',
      event_timestamp: now,
      payload: { seeded: true },
    },
  });

  console.info('Seeding: items, tasks & questions…');
  const car = await prisma.item.create({
    data: {
      user_id: user.id,
      name: 'Family SUV',
      brand: 'Toyota',
      model: 'RAV4',
      year_of_the_model: '2022',
      category: 'Vehicle',
      purchase_date: new Date('2022-03-15'),
      total_mileage: 18500,
      service_intervals: ['Oil change — 5000 mi', 'Tire rotation — 7500 mi'],
      forum_suggestions: ['Check cabin filter annually'],
    },
  });

  const washer = await prisma.item.create({
    data: {
      user_id: user.id,
      name: 'Washer / dryer',
      brand: 'LG',
      model: 'WM4000',
      category: 'Appliance',
      service_intervals: ['Clean filter — 6 months'],
      forum_suggestions: [],
    },
  });

  await prisma.tasks.create({
    data: {
      item_id: car.id,
      user_id: user.id,
      item_name: car.name,
      upcoming_task: 'Oil change',
      description: 'Synthetic oil, OEM filter',
      status: 'Due',
      last_date: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      maintenance_history: ['2024-06-01 — Oil change at Main St Garage'],
      shop_suggestions: { shops: ['Main St Garage', 'Quick Lube North'] },
    },
  });

  await prisma.tasks.create({
    data: {
      item_id: car.id,
      user_id: user.id,
      item_name: car.name,
      upcoming_task: 'Tire rotation',
      description: 'Rotate and balance',
      status: 'Due',
      maintenance_history: [],
    },
  });

  await prisma.tasks.create({
    data: {
      item_id: washer.id,
      user_id: user.id,
      item_name: washer.name,
      upcoming_task: 'Clean drain pump filter',
      status: 'Completed',
      last_date: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      maintenance_history: ['Completed at home'],
    },
  });

  await prisma.questions.create({
    data: {
      itemId: car.id,
      question: [
        'What oil weight does the manual recommend?',
        'Any known issues with this model year?',
      ],
    },
  });

  console.info('Seeding: notifications & mail…');
  const eventWelcome = await prisma.notificationEvent.create({
    data: {
      type: 'welcome',
      text: 'Welcome to Maintenance Genie — your items are ready.',
      status: 1,
    },
  });

  await prisma.notification.create({
    data: {
      sender_id: admin.id,
      receiver_id: user.id,
      notification_event_id: eventWelcome.id,
      status: 1,
    },
  });

  await prisma.notification.create({
    data: {
      sender_id: user.id,
      receiver_id: admin.id,
      notification_event_id: eventWelcome.id,
      entity_id: car.id,
      read_at: null,
      status: 1,
    },
  });

  await prisma.mail.create({
    data: {
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
      subject: 'Question about tire maintenance',
      message: 'Should I rotate tires before or after winter?',
      token: `mail_seed_${user.id.slice(0, 10)}`,
      status: 'Pending',
    },
  });

  console.info('Done. Demo accounts:');
  console.info(
    `  Admin: admin@maintenance-genie.local / (SEED_ADMIN_PASSWORD or ${DEFAULT_PASSWORD})`,
  );
  console.info(
    `  User:  user@maintenance-genie.local / (SEED_USER_PASSWORD or ${DEFAULT_PASSWORD})`,
  );
  console.info(
    `  Premium user: premium@maintenance-genie.local / same password as User when SEED_USER_PASSWORD unset`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });