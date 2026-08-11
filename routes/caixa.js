import express from 'express';
import { listarCaixas, criarCaixa, editarCaixa, statusCaixa, abrirCaixa, fecharCaixa, movimentoManual, extratoSessao, listarSessoesFechadas, relatorioFechamento } from '../controllers/caixaController.js';
import { auth } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(auth);

router.get('/listar', listarCaixas);
router.post('/', criarCaixa);
router.put('/:id', editarCaixa);
router.get('/status', statusCaixa);
router.post('/abrir', abrirCaixa);
router.post('/fechar', fecharCaixa);
router.post('/movimento', movimentoManual);
router.get('/:codsessao/extrato', extratoSessao);
router.get('/sessoes/fechadas', listarSessoesFechadas);
router.get('/:codsessao/relatorio', relatorioFechamento);

export default router;
