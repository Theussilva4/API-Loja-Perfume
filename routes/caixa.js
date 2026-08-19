import express from 'express';
import { listarCaixas, criarCaixa, editarCaixa, statusCaixa, abrirCaixa, fecharCaixa, movimentoManual, extratoSessao, listarSessoesFechadas, relatorioFechamento } from '../controllers/caixaController.js';
import { checkRole } from '../middlewares/rbacMiddleware.js';

const router = express.Router();

router.get('/listar', listarCaixas);
router.post('/', checkRole(["ADMIN", "GERENTE"]), criarCaixa);
router.put('/:id', checkRole(["ADMIN", "GERENTE"]), editarCaixa);
router.get('/status', statusCaixa);
router.post('/abrir', abrirCaixa);
router.post('/fechar', fecharCaixa);
router.post('/movimento', checkRole(["ADMIN", "GERENTE"]), movimentoManual);
router.get('/:codsessao/extrato', checkRole(["ADMIN", "GERENTE"]), extratoSessao);
router.get('/sessoes/fechadas', checkRole(["ADMIN", "GERENTE"]), listarSessoesFechadas);
router.get('/:codsessao/relatorio', checkRole(["ADMIN", "GERENTE"]), relatorioFechamento);

export default router;
