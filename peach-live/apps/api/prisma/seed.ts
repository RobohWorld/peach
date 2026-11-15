import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const gifts = [
    { name: 'Rose', coinPrice: 10 },
    { name: 'Peach', coinPrice: 50 },
    { name: 'Heart Balloon', coinPrice: 200 },
    { name: 'Sports Car', coinPrice: 1000 },
  ];
  for (const g of gifts) {
    await prisma.gift.upsert({ where: { name: g.name }, update: {}, create: g });
  }
  console.log('Seeded gifts');
}
main().finally(() => prisma.$disconnect());
