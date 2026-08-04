import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.msproduto.findMany({ 
  where: { imagem_url: { not: null } }, 
  select: { codproduto: true, imagem_url: true } 
}).then(console.log).finally(() => prisma.$disconnect());
