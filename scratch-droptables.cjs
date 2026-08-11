const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRawUnsafe('SHOW TABLES');
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
    
    for (const row of tables) {
      const tableName = Object.values(row)[0];
      console.log('Dropping table ' + tableName);
      await prisma.$executeRawUnsafe(`DROP TABLE \`${tableName}\``);
    }
    
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    console.log('Todas as tabelas foram apagadas. Banco limpo!');
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
