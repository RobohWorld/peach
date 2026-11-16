import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

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
      update: { coinPrice: g.coinPrice, emoji: g.emoji },
      create: g,
    });
  }
  console.log('Seeded gifts');
}
main().finally(() => prisma.$disconnect());
