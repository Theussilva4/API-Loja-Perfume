import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function test() {
  try {
    const filialDestino = 1;
    const itens = [{ codproduto: 251, quantidade: 1 }];
    const origem = "AJUSTE";
    const ajusteUuid = crypto.randomUUID();

    await prisma.$transaction(async (tx) => {
      for (const item of itens) {
        const estoque = await tx.msestoque.findUnique({
          where: {
            codproduto_codfilial: {
              codproduto: item.codproduto,
              codfilial: filialDestino
            }
          }
        });

        if (estoque) {
          await tx.msestoque.update({
            where: {
              codproduto_codfilial: { codproduto: item.codproduto, codfilial: filialDestino }
            },
            data: { quantidade: estoque.quantidade + item.quantidade }
          });
        } else {
          await tx.msestoque.create({
            data: { codproduto: item.codproduto, codfilial: filialDestino, quantidade: item.quantidade }
          });
        }

        await tx.msmov_estoque.create({
          data: {
            codproduto: item.codproduto,
            codfilial: filialDestino,
            tipo: "ENTRADA",
            origem: origem || "AJUSTE",
            quantidade: item.quantidade,
            uuid: ajusteUuid
          }
        });
      }
    });
    console.log("Success");
  } catch (error) {
    console.error("Prisma error:", error);
  } finally {
    await prisma.$disconnect();
  }
}
test();
