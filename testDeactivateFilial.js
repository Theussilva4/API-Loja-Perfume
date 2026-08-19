import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.msfilial.update({where: {codfilial: 2}, data: {ativo: 'N'}});
  console.log('Updated');
}
main().finally(() => prisma.$disconnect());
