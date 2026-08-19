import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const lastOrder = await prisma.mspedido.findFirst({
    orderBy: { numpedido: 'desc' },
    include: {
      mspedido_pagamento: true,
      mscontas_receber: true,
      mscaixa_movimento: true
    }
  });
  console.log(JSON.stringify(lastOrder, null, 2));
  
  const planos = await prisma.mSPLANOPAGAMENTO.findMany();
  console.log("Planos:", planos.map(p => ({ id: p.CODPLPAG, tipo: p.tipo_pagamento })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
