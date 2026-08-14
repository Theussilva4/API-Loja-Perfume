const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const plan = await prisma.mSPLANOPAGAMENTO.create({
    data: {
      DESCRICAO: 'Crediário',
      tipo_pagamento: 'CREDIARIO',
      ATIVO: 'S',
      tem_acrescimo: false,
      max_parcelas: 12
    }
  });
  console.log('Plano criado com sucesso:', plan);
}
run().catch(console.error).finally(() => prisma.$disconnect());
