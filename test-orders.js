import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const latestOrder = await prisma.mspedido.findFirst({
    orderBy: { data_pedido: 'desc' }
  });
  console.log("Latest Order:");
  console.log(latestOrder);
  
  try {
      const relatorio = await fetch('http://localhost:3001/api/relatorios/faturamento-produto?dataInicial=2026-07-01&dataFinal=2026-08-31');
      console.log("API Status:", relatorio.status);
      const data = await relatorio.json();
      console.log(data);
  } catch(e) {
      console.error("Fetch falhou", e);
  }
}
run();
