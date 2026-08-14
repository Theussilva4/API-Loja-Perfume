import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";

const prisma = new PrismaClient();

// Função auxiliar para gerar numero CMP-XXXXXX
const generateCompraCode = async () => {
  const lastCompra = await prisma.mscompra.findFirst({
    orderBy: { codcompra: 'desc' }
  });
  const nextId = lastCompra ? lastCompra.codcompra + 1 : 1;
  return `CMP-${nextId.toString().padStart(6, '0')}`;
};

export const importarXml = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo XML enviado." });
    }

    const xmlData = req.file.buffer.toString("utf8");

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const parsedData = parser.parse(xmlData);

    // Navegar até a tag principal (nfeproc -> NFe -> infNFe)
    const nfe = parsedData.nfeProc?.NFe?.infNFe || parsedData.NFe?.infNFe;
    if (!nfe) {
      return res.status(400).json({ error: "XML inválido. Não é uma NF-e reconhecida." });
    }

    const emitente = nfe.emit;
    if (!emitente) {
      return res.status(400).json({ error: "Dados do emitente não encontrados no XML." });
    }

    const cnpjEmitente = emitente.CNPJ ? emitente.CNPJ.toString() : "";
    const nomeEmitente = emitente.xNome || "FORNECEDOR XML";

    // 1. Procurar ou criar fornecedor
    let fornecedor = await prisma.msfornecedor.findFirst({
      where: {
        OR: [
          { cnpj: cnpjEmitente },
          { nome: nomeEmitente }
        ]
      }
    });

    if (!fornecedor) {
      fornecedor = await prisma.msfornecedor.create({
        data: {
          nome: nomeEmitente,
          cnpj: cnpjEmitente,
          cidade: emitente.enderEmit?.xMun || null,
          telefone: emitente.enderEmit?.fone ? emitente.enderEmit.fone.toString() : null
        }
      });
    }

    // 2. Verificar se a nota já foi importada e não está cancelada
    const dataEmissao = nfe.ide?.dhEmi ? new Date(nfe.ide.dhEmi) : new Date();
    const numeroNFe = nfe.ide?.nNF || "";
    const valorTotalNF = nfe.total?.ICMSTot?.vNF || 0;

    if (numeroNFe) {
      const notaExistente = await prisma.mscompra.findFirst({
        where: {
          numero_documento: numeroNFe.toString(),
          codfornecedor: fornecedor.codfornecedor,
          status: {
            not: "CANCELADA"
          }
        }
      });

      if (notaExistente) {
        return res.status(400).json({ error: `A nota fiscal ${numeroNFe} já foi importada anteriormente e encontra-se no status ${notaExistente.status}. Cancele-a antes de importar novamente.` });
      }
    }

    const codigoCompra = await generateCompraCode();

    const compra = await prisma.mscompra.create({
      data: {
        codfornecedor: fornecedor.codfornecedor,
        data_compra: dataEmissao,
        numero_documento: numeroNFe.toString(),
        valor_total: parseFloat(valorTotalNF),
        status: "EM_CONFERENCIA",
        codfilial: 1,
        ativo: "S",
        codigo_compra: codigoCompra
      }
    });

    // 3. Processar Produtos
    let det = nfe.det;
    if (!Array.isArray(det)) {
      det = [det];
    }

    const resultadosProdutos = {
      existentes: 0,
      novos: 0
    };

    const compraItems = [];

    for (const item of det) {
      const prod = item.prod;
      const cEAN = prod.cEAN !== "SEM GTIN" && prod.cEAN ? prod.cEAN : null;
      const xProd = prod.xProd || "Produto Desconhecido";
      const qCom = parseFloat(prod.qCom || 1);
      const vUnCom = parseFloat(prod.vUnCom || 0);
      const vProd = parseFloat(prod.vProd || 0);
      
      let eanNumber = cEAN ? Number(cEAN) : null;
      if (isNaN(eanNumber)) eanNumber = null;

      let produtoDb = null;

      // Tenta achar pelo EAN
      if (eanNumber) {
        produtoDb = await prisma.msproduto.findFirst({
          where: { codigo_barras: eanNumber }
        });
      }

      if (produtoDb) {
        resultadosProdutos.existentes++;
      } else {
        // Criar pré-cadastro
        produtoDb = await prisma.msproduto.create({
          data: {
            descricao: xProd,
            codigo_barras: eanNumber,
            ativo: "R", // "R" = Revisão Pendente
            codcategoria: 1, // Fixando categoria padrão
            codmarca: 1 // Fixando marca padrão
          }
        });

        // Criar tabela de preco para o produto
        await prisma.mstabela_preco.create({
          data: {
            codproduto: produtoDb.codproduto,
            preco_custo: vUnCom,
            preco_venda: vUnCom * 2, // Sugestão
          }
        });
        
        // Criar saldo 0 no msestoque
        const filiais = await prisma.msfilial.findMany();
        for (const f of filiais) {
          await prisma.msestoque.create({
            data: {
              codproduto: produtoDb.codproduto,
              codfilial: f.codfilial,
              quantidade: 0
            }
          });
        }
        
        resultadosProdutos.novos++;
      }

      compraItems.push({
        codcompra: compra.codcompra,
        codproduto: produtoDb.codproduto,
        quantidade: qCom,
        custo_unitario: vUnCom,
        valor_total: vProd,
        lote: null,
        validade: null
      });
    }

    if (compraItems.length > 0) {
      await prisma.mscompra_item.createMany({
        data: compraItems
      });
    }

    return res.status(200).json({
      message: "XML importado com sucesso!",
      compraId: compra.codcompra,
      resumo: {
        fornecedor: nomeEmitente,
        totalItens: det.length,
        produtosExistentes: resultadosProdutos.existentes,
        produtosPreCadastrados: resultadosProdutos.novos
      }
    });

  } catch (error) {
    console.error("Erro ao importar XML:", error);
    return res.status(500).json({ error: "Erro interno ao processar o XML." });
  }
};

export const finalizarConferencia = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { itens, codfilial } = req.body; // itens = [{ codproduto, quantidade, lote, validade, cEAN (novo) }]

    if (!uuid || !itens) {
      return res.status(400).json({ error: "Dados incompletos para finalização." });
    }

    const filialId = codfilial || 1;

    // Buscar compra
    const compra = await prisma.mscompra.findFirst({
      where: { uuid }
    });

    if (!compra) return res.status(404).json({ error: "Compra não encontrada." });

    if (compra.status !== "EM_CONFERENCIA") {
      return res.status(400).json({ error: "A compra já foi processada anteriormente." });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of itens) {
        // Atualizar produto se enviaram cEAN
        if (item.cEAN) {
          const eanNumber = Number(item.cEAN);
          if (!isNaN(eanNumber)) {
            await tx.msproduto.update({
              where: { codproduto: item.codproduto },
              data: { 
                codigo_barras: eanNumber
              }
            });
          }
        }

        // Atualizar item da compra
        await tx.mscompra_item.updateMany({
          where: { 
            codcompra: compra.codcompra,
            codproduto: item.codproduto
          },
          data: {
            quantidade: item.quantidade,
            lote: item.lote || null,
            validade: item.validade ? new Date(item.validade) : null
          }
        });

        // Adicionar lote ao msestoque_lote se tiver lote e validade
        if (item.lote && item.validade) {
          await tx.msestoque_lote.create({
            data: {
              codproduto: item.codproduto,
              codfilial: filialId,
              lote: item.lote,
              validade: new Date(item.validade),
              quantidade: item.quantidade,
              quantidade_restante: item.quantidade,
              custo_unitario: item.custo_unitario || 0,
            }
          });
        }

        // Atualizar msestoque (somar quantidade)
        const estoqueAtual = await tx.msestoque.findUnique({
          where: {
            codproduto_codfilial: {
              codproduto: item.codproduto,
              codfilial: filialId
            }
          }
        });

        if (estoqueAtual) {
          await tx.msestoque.update({
            where: {
              codproduto_codfilial: {
                codproduto: item.codproduto,
                codfilial: filialId
              }
            },
            data: {
              quantidade: { increment: item.quantidade },
              atualizado_em: new Date()
            }
          });
        } else {
          await tx.msestoque.create({
            data: {
              codproduto: item.codproduto,
              codfilial: filialId,
              quantidade: item.quantidade
            }
          });
        }
      }

      // Finaliza a compra
      await tx.mscompra.update({
        where: { codcompra: compra.codcompra },
        data: { status: "CONCLUIDA" }
      });
    });

    return res.status(200).json({ message: "Conferência finalizada com sucesso! Estoque atualizado." });

  } catch (error) {
    console.error("Erro na conferência:", error);
    return res.status(500).json({ error: "Erro ao finalizar a conferência." });
  }
};
