import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function run() {
  const configs = await prisma.msconfiguracao.findMany();
  console.log(configs);
}
run().finally(() => prisma.$disconnect());
