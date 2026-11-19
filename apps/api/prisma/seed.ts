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
  // Starter catalog: 8 gifts from 10 to 5,000 coins.
  // Keeps the existing names (Rose, Peach, Heart Balloon, Sports Car); upsert by name.
  // Note: Sports Car moves from 1,000 to 2,500 coins.
  const gifts = [
    { name: 'Rose', coinPrice: 10, emoji: '🌹' },
    { name: 'Peach', coinPrice: 50, emoji: '🍑' },
    { name: 'Coffee', coinPrice: 100, emoji: '☕' },
    { name: 'Heart Balloon', coinPrice: 200, emoji: '🎈' },
    { name: 'Teddy Bear', coinPrice: 500, emoji: '🧸' },
    { name: 'Crown', coinPrice: 1000, emoji: '👑' },
    { name: 'Sports Car', coinPrice: 2500, emoji: '🏎️' },
    { name: 'Castle', coinPrice: 5000, emoji: '🏰' },
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

  console.log(`Seeded ${gifts.length} gifts`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
