import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getConfiguracoes = async (req, res) => {
  try {
    let config = await prisma.msconfiguracao_empresa.findFirst();
    if (!config) {
      config = await prisma.msconfiguracao_empresa.create({
        data: {
          margem_alvo: 0,
          margem_minima: 0,
          cadastro_rapido_cliente: true,
          venda_sem_estoque: true,
          exigir_fornecedor: true,
          venda_qualquer_fornecedor: true,
          venda_sem_preco: false
        }
      });
    }
    return res.status(200).json(config);
  } catch (error) {
    console.error("Erro ao buscar configuraÃ§Ãµes:", error);
    return res.status(500).json({ error: "Erro ao buscar configuraÃ§Ãµes" });
  }
};

export const updateConfiguracoes = async (req, res) => {
  try {
    const data = req.body;
    let config = await prisma.msconfiguracao_empresa.findFirst();
    
    if (config) {
      config = await prisma.msconfiguracao_empresa.update({
        where: { id: config.id },
        data: {
          nome_loja: data.nome_loja,
          telefone_loja: data.telefone_loja,
          chave_pix: data.chave_pix,
          endereco_loja: data.endereco_loja,
          instagram_loja: data.instagram_loja,
          facebook_loja: data.facebook_loja,
          cadastro_rapido_cliente: data.cadastro_rapido_cliente,
          venda_sem_estoque: data.venda_sem_estoque,
          exigir_fornecedor: data.exigir_fornecedor,
          venda_qualquer_fornecedor: data.venda_qualquer_fornecedor,
          venda_sem_preco: data.venda_sem_preco,
          atualizacao_custo_compra: data.atualizacao_custo_compra,
          modo_cobranca_cartao: data.modo_cobranca_cartao,
          perguntar_vencimento_crediario: data.perguntar_vencimento_crediario,
          margem_alvo: data.margem_alvo ?? config.margem_alvo,
          margem_minima: data.margem_minima ?? config.margem_minima,
        }
      });
    } else {
      config = await prisma.msconfiguracao_empresa.create({
        data: {
          ...data,
          margem_alvo: data.margem_alvo ?? 0,
          margem_minima: data.margem_minima ?? 0
        }
      });
    }
    
    return res.status(200).json(config);
  } catch (error) {
    console.error("Erro ao atualizar configuraÃ§Ãµes:", error);
    return res.status(500).json({ error: "Erro ao atualizar configuraÃ§Ãµes" });
  }
};
