import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const duplicates = await prisma.msproduto.groupBy({
    by: ['codigo_barras'],
    _count: { codigo_barras: true },
    having: { codigo_barras: { _count: { gt: 1 } } }
  });
  console.log('Duplicates:', duplicates);
  
  for (const dup of duplicates) {
    if (!dup.codigo_barras) continue;
    
    const items = await prisma.msproduto.findMany({
      where: { codigo_barras: dup.codigo_barras },
      orderBy: { codproduto: 'asc' }
    });
    
    // Keep the first one, nullify the rest
    for (let i = 1; i < items.length; i++) {
      console.log(`Nullifying barcode for duplicate product ID ${items[i].codproduto}`);
      await prisma.msproduto.update({
        where: { codproduto: items[i].codproduto },
        data: { codigo_barras: null }
      });
    }
  }
}

main().finally(() => prisma.$disconnect());
