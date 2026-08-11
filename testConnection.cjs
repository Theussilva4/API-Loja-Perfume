const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$connect();
        console.log('? Conexão com o banco de dados estabelecida com sucesso!');
        
        // Verifica se a tabela mscaixa existe
        const caixas = await prisma.mscaixa.count();
        console.log('? Tabelas do Caixa estão presentes! Total de caixas:', caixas);
        
    } catch (e) {
        console.error('? Erro ao conectar no banco:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
