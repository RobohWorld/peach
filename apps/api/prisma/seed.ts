
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const gifts = [
    { name: 'Rose', coinPrice: 10, emoji: '🌹' },
    { name: 'Peach', coinPrice: 50, emoji: '🍑' },
    { name: 'Heart Balloon', coinPrice: 200, emoji: '🎈' },
    { name: 'Sports Car', coinPrice: 1000, emoji: '🏎️' },
  ];

  for (const g of gifts) {
    await prisma.gift.upsert({
      where: { name: g.name },
      update: {
        coinPrice: g.coinPrice,
        emoji: g.emoji,
      },
      create: g,
    });
  }

  console.log('Seeded gifts');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
