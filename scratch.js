import prisma from "./prismaClient.js";
import { alterar } from './services/usuarioService.js';

async function run() {
  try {
    const res = await alterar(15, { ativo: 'N' });
    console.log("Success:", res);
  } catch (e) {
    console.log("Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}
run();
