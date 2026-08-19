import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const produtoCondition = { codproduto: 1 };
  
  try {
    const pedidos = await prisma.mspedido.findMany({
      where: {
        status: { not: "CANCELADO" }
      },
      include: {
        mspedido_item: {
          where: Object.keys(produtoCondition).length > 0 ? { msproduto: produtoCondition } : undefined,
          include: {
            msproduto: {
              include: { mstabela_preco: { where: { ativo: "S" } } }
            }
          }
        }
      },
      take: 2
    });
    console.log("Success, found", pedidos.length);
  } catch(e) {
    console.error("Prisma error:", e.message);
  }
}
run();
