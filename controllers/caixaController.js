import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 1. Listar caixas físicos/lógicos
export const listarCaixas = async (req, res) => {
    try {
        const { codfilial, todos } = req.query;
        let where = todos ? {} : { ativo: true };
        if (codfilial) {
            where.codfilial = parseInt(codfilial);
        }
        const caixas = await prisma.mscaixa.findMany({
            where,
            orderBy: { nome: 'asc' }
        });
        res.json(caixas);
    } catch (error) {
        console.error('Erro ao listar caixas:', error);
        res.status(500).json({ message: 'Erro ao listar caixas', error: error.message });
    }
};

export const criarCaixa = async (req, res) => {
    try {
        const { nome, codfilial } = req.body;
        if (!nome || !codfilial) {
            return res.status(400).json({ error: 'Nome e filial são obrigatórios' });
        }
        const novoCaixa = await prisma.mscaixa.create({
            data: {
                nome,
                codfilial: Number(codfilial)
            }
        });
        res.status(201).json(novoCaixa);
    } catch (error) {
        console.error('Erro ao criar caixa:', error);
        res.status(500).json({ error: 'Erro ao criar caixa', detalhe: error.message });
    }
};

export const editarCaixa = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, codfilial, ativo } = req.body;
        const caixa = await prisma.mscaixa.update({
            where: { codcaixa: Number(id) },
            data: {
                nome: nome !== undefined ? nome : undefined,
                codfilial: codfilial !== undefined ? Number(codfilial) : undefined,
                ativo: ativo !== undefined ? Boolean(ativo) : undefined
            }
        });
        res.json(caixa);
    } catch (error) {
        console.error('Erro ao editar caixa:', error);
        res.status(500).json({ error: 'Erro ao editar caixa', detalhe: error.message });
    }
};

// 2. Status do Caixa atual do usuário (Verifica se ele tem sessão aberta)
export const statusCaixa = async (req, res) => {
    try {
        const codusur = req.usuario.id; // assumindo que middleware de auth insere user
        
        const sessao = await prisma.mscaixa_sessao.findFirst({
            where: {
                status: 'ABERTO'
            },
            include: {
                caixa: true
            }
        });

        if (!sessao) {
            return res.json({ status: 'FECHADO', sessao: null });
        }

        res.json({ status: 'ABERTO', sessao });
    } catch (error) {
        console.error('Erro ao buscar status do caixa:', error);
        res.status(500).json({ message: 'Erro interno', error: error.message });
    }
};

// 3. Abrir Caixa (Sessão)
export const abrirCaixa = async (req, res) => {
    try {
        const codusur = req.usuario.id;
        const { codcaixa, valor_abertura } = req.body;

        if (!codcaixa) return res.status(400).json({ message: 'Caixa é obrigatório.' });

        // Verifica se já existe algum caixa aberto na loja
        const sessaoAtiva = await prisma.mscaixa_sessao.findFirst({
            where: { status: 'ABERTO' }
        });

        if (sessaoAtiva) {
            return res.status(400).json({ message: 'Já existe um caixa aberto na loja.' });
        }

        // Verifica se o caixa escolhido já está aberto por outra pessoa
        const caixaOcupado = await prisma.mscaixa_sessao.findFirst({
            where: { codcaixa: parseInt(codcaixa), status: 'ABERTO' }
        });

        if (caixaOcupado) {
            return res.status(400).json({ message: 'Este caixa já está aberto por outro operador.' });
        }

        // Abre o caixa usando transaction para inserir o primeiro movimento de ABERTURA (Fundo de Troco)
        // Para o fundo de troco, precisaremos de um plano de pagamento que represente DINHEIRO.
        // Vamos buscar o plano Dinheiro.
        const planoDinheiro = await prisma.mSPLANOPAGAMENTO.findFirst({
            where: { tipo_pagamento: 'A_VISTA', DESCRICAO: { contains: 'DINHEIRO' } }
        });
        
        const codPlanoDinheiro = planoDinheiro ? planoDinheiro.CODPLPAG : 1; // Fallback para 1

        const novaSessao = await prisma.$transaction(async (tx) => {
            const sessao = await tx.mscaixa_sessao.create({
                data: {
                    codcaixa: parseInt(codcaixa),
                    codusur_abertura: codusur,
                    valor_abertura: parseFloat(valor_abertura) || 0,
                    status: 'ABERTO'
                }
            });

            // Lança o suprimento inicial
            if (valor_abertura && parseFloat(valor_abertura) > 0) {
                await tx.mscaixa_movimento.create({
                    data: {
                        codsessao: sessao.codsessao,
                        codusur: codusur,
                        tipo: 'ENTRADA',
                        categoria: 'SUPRIMENTO', // Abertura / Troco
                        valor: parseFloat(valor_abertura),
                        codplano_pagamento: codPlanoDinheiro,
                        observacao: 'Abertura de Caixa (Fundo de Troco)'
                    }
                });
            }

            return sessao;
        });

        res.json({ message: 'Caixa aberto com sucesso', sessao: novaSessao });
    } catch (error) {
        console.error('Erro ao abrir caixa:', error);
        res.status(500).json({ message: 'Erro interno', error: error.message });
    }
};

// 4. Fechamento Cego
export const fecharCaixa = async (req, res) => {
    try {
        const codusur = req.usuario.id;
        const { codsessao, valor_informado, motivo_diferenca } = req.body;

        const sessao = await prisma.mscaixa_sessao.findUnique({
            where: { codsessao: parseInt(codsessao) },
            include: { movimentos: true }
        });

        if (!sessao || sessao.status === 'FECHADO') {
            return res.status(400).json({ message: 'Sessão inválida ou já fechada.' });
        }

        // Calcula saldo esperado em DINHEIRO
        // Vamos considerar que movimentos físicos (dinheiro) são os que vamos aferir no fechamento cego
        // Precisa achar os planos de dinheiro
        const planosDinheiro = await prisma.mSPLANOPAGAMENTO.findMany({
            where: { tipo_pagamento: 'A_VISTA', DESCRICAO: { contains: 'DINHEIRO' } }
        });
        const codsDinheiro = planosDinheiro.map(p => p.CODPLPAG);

        let saldoEsperadoDinheiro = 0;

        for (const mov of sessao.movimentos) {
            // Conta apenas o que é dinheiro físico
            if (codsDinheiro.includes(mov.codplano_pagamento)) {
                if (mov.tipo === 'ENTRADA') saldoEsperadoDinheiro += parseFloat(mov.valor);
                if (mov.tipo === 'SAIDA') saldoEsperadoDinheiro -= parseFloat(mov.valor);
            }
        }

        const diferenca = parseFloat(valor_informado) - saldoEsperadoDinheiro;

        // Se houver diferença e não tem motivo, bloqueia
        if (diferenca !== 0 && !motivo_diferenca) {
            return res.status(400).json({ 
                message: 'Existe uma diferença de caixa. O motivo é obrigatório.',
                diferenca: diferenca 
            });
        }

        const sessaoFechada = await prisma.mscaixa_sessao.update({
            where: { codsessao: parseInt(codsessao) },
            data: {
                status: 'FECHADO',
                codusur_fechamento: codusur,
                data_fechamento: new Date(),
                valor_fechamento: parseFloat(valor_informado),
                diferenca: diferenca,
                motivo_diferenca: diferenca !== 0 ? motivo_diferenca : null
            }
        });

        res.json({ 
            message: 'Caixa fechado com sucesso.', 
            saldo_esperado: saldoEsperadoDinheiro,
            diferenca: diferenca,
            sessao: sessaoFechada 
        });
    } catch (error) {
        console.error('Erro ao fechar caixa:', error);
        res.status(500).json({ message: 'Erro interno', error: error.message });
    }
};

// 5. Movimentação Manual (Sangria / Suprimento)
export const movimentoManual = async (req, res) => {
    try {
        const codusur = req.usuario.id;
        const { codsessao, tipo, categoria, valor, observacao, codplano_pagamento } = req.body;

        if (!valor || valor <= 0) return res.status(400).json({ message: 'Valor inválido.' });
        if (!observacao) return res.status(400).json({ message: 'Observação é obrigatória para operações manuais.' });

        const movimento = await prisma.mscaixa_movimento.create({
            data: {
                codsessao: parseInt(codsessao),
                codusur: codusur,
                tipo: tipo, // ENTRADA ou SAIDA
                categoria: categoria, // SANGRIA, SUPRIMENTO, DESPESA
                valor: parseFloat(valor),
                codplano_pagamento: parseInt(codplano_pagamento), // Geralmente Dinheiro (Sangria física)
                observacao: observacao
            }
        });

        // Grava no log de auditoria
        await prisma.ms_log_auditoria.create({
            data: {
                codusuario: codusur,
                nome_usuario: req.usuario.nome || 'Operador',
                acao: 'CRIAR',
                tabela: 'mscaixa_movimento',
                registro_id: movimento.codmovimento.toString(),
                campo: categoria,
                valor_novo: valor.toString(),
                motivo: observacao
            }
        });

        res.json({ message: 'Movimento registrado com sucesso', movimento });
    } catch (error) {
        console.error('Erro ao registrar movimento:', error);
        res.status(500).json({ message: 'Erro interno', error: error.message });
    }
};

// 6. Extrato detalhado da sessão
export const extratoSessao = async (req, res) => {
    try {
        const { codsessao } = req.params;

        const movimentos = await prisma.mscaixa_movimento.findMany({
            where: { codsessao: parseInt(codsessao) },
            include: {
                usuario: { select: { nome: true } },
                plano_pagamento: { select: { DESCRICAO: true } }
            },
            orderBy: { data_movimento: 'asc' }
        });

        res.json(movimentos);
    } catch (error) {
        console.error('Erro ao buscar extrato:', error);
        res.status(500).json({ message: 'Erro interno', error: error.message });
    }
};

export const listarSessoesFechadas = async (req, res) => {
    try {
        const sessoes = await prisma.mscaixa_sessao.findMany({
            where: { status: 'FECHADO' },
            include: {
                caixa: { select: { nome: true } },
                usuario_abertura: { select: { nome: true } },
                usuario_fechamento: { select: { nome: true } }
            },
            orderBy: { data_fechamento: 'desc' },
            take: 100
        });
        res.json(sessoes);
    } catch (error) {
        console.error('Erro ao listar sessoes:', error);
        res.status(500).json({ message: 'Erro interno', error: error.message });
    }
};

export const relatorioFechamento = async (req, res) => {
    try {
        const { codsessao } = req.params;
        const sessao = await prisma.mscaixa_sessao.findUnique({
            where: { codsessao: parseInt(codsessao) },
            include: {
                usuario_abertura: { select: { nome: true } },
                usuario_fechamento: { select: { nome: true } },
                caixa: { select: { nome: true } }
            }
        });

        if (!sessao) return res.status(404).json({ message: 'Sessão não encontrada' });

        const movimentos = await prisma.mscaixa_movimento.findMany({
            where: { codsessao: parseInt(codsessao) },
            include: { plano_pagamento: true }
        });

        const resumo = {
            DINHEIRO: 0,
            PIX: 0,
            CARTAO: 0,
            OUTROS: 0,
            ENTRADAS_TOTAIS: 0,
            SAIDAS_TOTAIS: 0
        };

        movimentos.forEach(mov => {
            const val = parseFloat(mov.valor);
            if (mov.tipo === 'ENTRADA') resumo.ENTRADAS_TOTAIS += val;
            if (mov.tipo === 'SAIDA') resumo.SAIDAS_TOTAIS += val;

            const descricao = mov.plano_pagamento?.DESCRICAO?.toUpperCase() || '';
            const tipoPagamento = mov.plano_pagamento?.tipo_pagamento?.toUpperCase() || '';

            if (descricao.includes('DINHEIRO')) {
                resumo.DINHEIRO += (mov.tipo === 'ENTRADA' ? val : -val);
            } else if (descricao.includes('PIX')) {
                resumo.PIX += (mov.tipo === 'ENTRADA' ? val : -val);
            } else if (tipoPagamento === 'CARTAO' || descricao.includes('CARTAO')) {
                resumo.CARTAO += (mov.tipo === 'ENTRADA' ? val : -val);
            } else {
                resumo.OUTROS += (mov.tipo === 'ENTRADA' ? val : -val);
            }
        });

        res.json({
            sessao,
            resumo
        });
    } catch (error) {
        console.error('Erro no relatorio:', error);
        res.status(500).json({ message: 'Erro interno', error: error.message });
    }
};


