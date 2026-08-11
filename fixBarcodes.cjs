const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixBarcodes() {
    console.log('Resolvendo códigos de barras duplicados...');
    
    // Busca todos os produtos com código de barras preenchido
    const produtos = await prisma.msproduto.findMany({
        where: { codigo_barras: { not: null } },
        select: { codproduto: true, codigo_barras: true }
    });
    
    const codigosVistos = new Set();
    const paraAtualizar = [];
    
    for (const p of produtos) {
        const codigo = p.codigo_barras.toString();
        if (codigosVistos.has(codigo)) {
            paraAtualizar.push(p.codproduto);
        } else {
            codigosVistos.add(codigo);
        }
    }
    
    console.log(`Encontrados ${paraAtualizar.length} produtos com código de barras duplicado.`);
    
    for (const cod of paraAtualizar) {
        await prisma.$executeRawUnsafe(`UPDATE msproduto SET codigo_barras = NULL WHERE codproduto = ${cod}`);
    }
    
    console.log('Duplicados resolvidos (setados como NULL).');
    await prisma.$disconnect();
}
fixBarcodes().catch(console.error);
