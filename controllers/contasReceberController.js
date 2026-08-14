import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Lista contas a receber com filtros
export const listarContas = async (req, res) => {
  try {
    const { codcliente, codfilial, status, dataInicio, dataFim } = req.query;

    const where = {};
    if (codcliente) where.codcliente = parseInt(codcliente);
    if (codfilial) where.codfilial = parseInt(codfilial);
    if (status) where.status = status;

    if (dataInicio && dataFim) {
      where.data_emissao = {
        gte: new Date(dataInicio + "T00:00:00.000Z"),
        lte: new Date(dataFim + "T23:59:59.999Z")
      };
    }

    const contas = await prisma.mscontas_receber.findMany({
      where,
      include: {
        mscliente: true,
        pagamentos: {
          include: {
            msusuario: {
              select: { nome: true }
            }
          }
        }
      },
      orderBy: { data_vencimento: 'asc' }
    });

    res.json(contas);
  } catch (error) {
    console.error("Erro ao listar contas a receber:", error);
    res.status(500).json({ error: "Erro interno" });
  }
};

// Cria conta avulsa (ex: dívidas antigas, fiados)
export const criarConta = async (req, res) => {
  try {
    const { codcliente, codfilial, valor_total, data_vencimento, observacoes } = req.body;

    const novaConta = await prisma.mscontas_receber.create({
      data: {
        codcliente: parseInt(codcliente),
        codfilial: parseInt(codfilial),
        valor_total: parseFloat(valor_total),
        data_vencimento: data_vencimento ? new Date(data_vencimento) : null,
        observacoes,
        status: "PENDENTE"
      }
    });

    res.status(201).json(novaConta);
  } catch (error) {
    console.error("Erro ao criar conta:", error);
    res.status(500).json({ error: "Erro interno ao criar conta" });
  }
};

// Baixar/Receber o pagamento de uma conta
export const receberConta = async (req, res) => {
  try {
    const { id } = req.params;
    const { valor_pago, codusur, codcaixa } = req.body; // codusur é obrigatório para registrar no caixa aberto
    const valor = parseFloat(valor_pago);

    // Usa transação para garantir que a baixa da conta e a entrada no caixa ocorram juntas
    const result = await prisma.$transaction(async (tx) => {
      // 1. Busca a conta atual
      const conta = await tx.mscontas_receber.findUnique({ where: { id: parseInt(id) } });
      if (!conta) throw new Error("Conta não encontrada");

      // 2. Calcula novo valor pago e status
      const totalJaPago = parseFloat(conta.valor_pago) || 0;
      const novoTotalPago = totalJaPago + valor;
      let novoStatus = conta.status;

      if (novoTotalPago >= parseFloat(conta.valor_total)) {
        novoStatus = "PAGO";
      } else if (novoTotalPago > 0) {
        novoStatus = "PARCIAL";
      }

      // 3. Atualiza a conta
      const contaAtualizada = await tx.mscontas_receber.update({
        where: { id: parseInt(id) },
        data: {
          valor_pago: novoTotalPago,
          status: novoStatus
        }
      });

      // 4. Cria o registro de pagamento histórico
      const pagamento = await tx.mscontas_receber_pagamento.create({
        data: {
          codconta: parseInt(id),
          valor_pago: valor,
          codusur: codusur ? parseInt(codusur) : null
        }
      });

      // 5. Gera a entrada no caixa se tivermos um codusur
      if (codusur) {
        // Encontra o caixa aberto deste usuário
        const sessaoAberta = await tx.mscaixa_sessao.findFirst({
          where: {
            codusur_abertura: parseInt(codusur),
            status: 'ABERTA'
          }
        });

        if (sessaoAberta) {
          await tx.mscaixa_movimento.create({
            data: {
              codsessao: sessaoAberta.codsessao,
              codusur: parseInt(codusur),
              tipo: "ENTRADA",
              categoria: "RECEBIMENTO_CONTA",
              valor: valor,
              codplano_pagamento: 1, // Assumindo 1 = Dinheiro por enquanto, o ideal é o frontend enviar
              observacao: `Recebimento Ref. Crediário Conta #${conta.id}`
            }
          });
        }
      }

      return { conta: contaAtualizada, pagamento };
    });

    res.json(result);
  } catch (error) {
    console.error("Erro ao receber conta:", error);
    res.status(500).json({ error: error.message || "Erro interno" });
  }
};
