import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const movs = await prisma.msmov_estoque.findMany({
    where: { codproduto: 31 },
    orderBy: { data_mov: 'asc' },
  });

  console.log('Movimentações do Produto 31:');
  console.table(movs);

  for (const mov of movs) {
    if (mov.origem === 'VENDA' && mov.origem_id) {
      const pedido = await prisma.mspedido.findUnique({
        where: { numpedido: mov.origem_id },
        include: { mscliente: true, msusuario_mspedido_codusur_vendedorTomsusuario: true }
      });
      if (pedido) {
         console.log(`- Venda ${mov.origem_id}: Cliente ${pedido.mscliente?.nome}, Vendedor: ${pedido.msusuario_mspedido_codusur_vendedorTomsusuario?.nome}, Status: ${pedido.status}`);
      }
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
