import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const lotes = await prisma.msestoque_lote.findMany();
  console.log(JSON.stringify(lotes, null, 2));
}
main();
