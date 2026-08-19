import * as precificacaoService from "../services/precificacaoService.js";
import prisma from "../prismaClient.js";

// --- CONFIGURAÃÃES ---

export async function getConfig(req, res) {
  try {
    const config = await precificacaoService.getConfiguracao();
    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar configuraÃ§Ãµes comerciais" });
  }
}

export async function updateConfig(req, res) {
  try {
    const config = await precificacaoService.updateConfiguracao(req.body);
    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar configuraÃ§Ãµes comerciais" });
  }
}

// --- TABELA DE PREÃOS ---

export async function listarTabelaPrecos(req, res) {
  try {
    const produtos = await prisma.msproduto.findMany({
      where: { ativo: "S" },
      select: {
        codproduto: true,
        descricao: true,
        marca: true,
        codcategoria: true,
        codigo_barras: true,
      }
    });

    const categorias = await prisma.mscategoria.findMany();
    const mapCategorias = {};
    categorias.forEach(c => mapCategorias[c.codcategoria] = c.margem_padrao ? Number(c.margem_padrao) : null);

    // Anexar o preÃ§o calculado a cada produto
    const resultado = await Promise.all(produtos.map(async (p) => {
      const calculo = await precificacaoService.calculatePrice(p.codproduto);
      return {
        ...p,
        margem_padrao_categoria: mapCategorias[p.codcategoria],
        precificacao: calculo
      };
    }));

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar tabela de preÃ§os" });
  }
}

export async function getHistoricoPrecos(req, res) {
  const { codproduto } = req.params;
  try {
    const historico = await prisma.mstabela_preco.findMany({
      where: { codproduto: Number(codproduto) },
      orderBy: { created_at: "desc" }
    });
    res.json(historico);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar histÃ³rico" });
  }
}

export async function definirPrecoBase(req, res) {
  const { codproduto } = req.params;
  const { preco_custo, preco_venda, desconto_maximo, preco_cartao, codusur } = req.body;

  try {
    const novoPreco = await precificacaoService.setPrecoBase(codproduto, preco_custo, preco_venda, codusur, desconto_maximo, preco_cartao);
    res.json(novoPreco);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao definir preÃ§o" });
  }
}

// --- MOTOR ---

export async function simularPreco(req, res) {
  const { codproduto } = req.params;
  try {
    const calculo = await precificacaoService.calculatePrice(codproduto);
    res.json(calculo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao simular preÃ§o" });
  }
}

// --- PROMOÃÃES ---

export async function listarPromocoes(req, res) {
  try {
    const promocoes = await prisma.mspromocao.findMany({
      include: {
        itens: {
          include: { msproduto: true }
        }
      },
      orderBy: { data_inicio: "desc" }
    });
    res.json(promocoes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar promoÃ§Ãµes" });
  }
}

export async function criarPromocao(req, res) {
  const { nome, tipo_geral, valor_geral, data_inicio, data_fim, prioridade, itens } = req.body;

  const parseDataInicio = (d) => new Date(d.includes("T") ? d : `${d}T00:00:00.000-03:00`);
  const parseDataFim = (d) => new Date(d.includes("T") ? d : `${d}T23:59:59.999-03:00`);

  try {
    const promocao = await prisma.mspromocao.create({
      data: {
        nome,
        tipo_geral,
        valor_geral,
        data_inicio: parseDataInicio(data_inicio),
        data_fim: parseDataFim(data_fim),
        prioridade: prioridade ? Number(prioridade) : 1,
        itens: {
          create: itens.map((item) => ({
            codproduto: Number(item.codproduto),
            tipo_opcional: item.tipo_opcional || null,
            valor_opcional: item.valor_opcional ? Number(item.valor_opcional) : null
          }))
        }
      },
      include: {
        itens: true
      }
    });
    res.json(promocao);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao criar promoÃ§Ã£o" });
  }
}

export async function deletarPromocao(req, res) {
  const { codpromocao } = req.params;
  try {
    // Apaga itens primeiro
    await prisma.mspromocao_item.deleteMany({
      where: { codpromocao: Number(codpromocao) }
    });
    // Apaga promoÃ§Ã£o
    await prisma.mspromocao.delete({
      where: { codpromocao: Number(codpromocao) }
    });
    res.json({ sucesso: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao deletar promoÃ§Ã£o" });
  }
}

export async function atualizarPromocao(req, res) {
  const { codpromocao } = req.params;
  const { nome, tipo_geral, valor_geral, data_inicio, data_fim, prioridade, itens } = req.body;

  const parseDataInicio = (d) => new Date(d.includes("T") ? d : `${d}T00:00:00.000-03:00`);
  const parseDataFim = (d) => new Date(d.includes("T") ? d : `${d}T23:59:59.999-03:00`);

  try {
    // Primeiro, apaga os itens antigos
    await prisma.mspromocao_item.deleteMany({
      where: { codpromocao: Number(codpromocao) }
    });

    // Atualiza a promoÃ§Ã£o e insere os novos itens
    const promocao = await prisma.mspromocao.update({
      where: { codpromocao: Number(codpromocao) },
      data: {
        nome,
        tipo_geral,
        valor_geral,
        data_inicio: parseDataInicio(data_inicio),
        data_fim: parseDataFim(data_fim),
        prioridade: prioridade ? Number(prioridade) : 1,
        itens: {
          create: itens.map((item) => ({
            codproduto: Number(item.codproduto),
            tipo_opcional: item.tipo_opcional || null,
            valor_opcional: item.valor_opcional ? Number(item.valor_opcional) : null
          }))
        }
      },
      include: {
        itens: true
      }
    });
    res.json(promocao);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar promoÃ§Ã£o" });
  }
}
