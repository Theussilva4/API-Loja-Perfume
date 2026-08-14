import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const filiais = await prisma.msfilial.findMany();
  console.log(JSON.stringify(filiais, null, 2));
}
main();
