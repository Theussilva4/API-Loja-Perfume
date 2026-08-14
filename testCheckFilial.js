import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const c = await prisma.msestoque.count({where: {codfilial: 2}});
  console.log('Estoque:', c);
  const m = await prisma.msmov_estoque.count({where: {codfilial: 2}});
  console.log('Movs:', m);
}
main().finally(() => prisma.$disconnect());
