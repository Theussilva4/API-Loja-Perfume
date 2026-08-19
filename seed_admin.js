import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminLogin = 'admin';
  const adminPassword = '123'; // Senha que o usuÃ¡rio pode testar
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.msusuario.upsert({
    where: { login: adminLogin },
    update: {
      senha_hash: hashedPassword,
    },
    create: {
      nome: 'Administrador',
      login: adminLogin,
      senha_hash: hashedPassword,
      tipo_usuario: 'ADMIN',
      ativo: 'S',
      senha_alterada: true
    },
  });

  console.log('UsuÃ¡rio admin criado/atualizado com sucesso!', admin);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
