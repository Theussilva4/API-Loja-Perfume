import { z } from "zod";

const itemVendaSchema = z.object({
  produtoId: z.number({ required_error: "produtoId Ã© obrigatÃ³rio" }).int().positive("produtoId deve ser positivo"),
  quantidade: z.number({ required_error: "quantidade Ã© obrigatÃ³ria" }).int().positive("quantidade deve ser maior que zero"),
  descontoPercentual: z.number().min(0, "descontoPercentual nÃ£o pode ser negativo").max(100, "descontoPercentual nÃ£o pode ser maior que 100").optional(),
  descontoReais: z.number().min(0, "descontoReais nÃ£o pode ser negativo").optional(),
}).refine(data => !(data.descontoPercentual !== undefined && data.descontoReais !== undefined), {
  message: "ForneÃ§a descontoPercentual OU descontoReais, nunca os dois juntos."
});

const kitVendaSchema = z.object({
  kitId: z.number({ required_error: "kitId Ã© obrigatÃ³rio" }).int().positive(),
  quantidade: z.number({ required_error: "quantidade Ã© obrigatÃ³ria" }).int().positive("quantidade do kit deve ser maior que zero"),
});

const pagamentoSchema = z.object({
  codplano_pagamento: z.number().int().positive(),
  valor: z.number().positive("O valor do pagamento deve ser maior que zero"),
  bandeira: z.string().optional().nullable(),
  parcelas: z.number().int().positive().optional().nullable(),
  acrescimo_percentual: z.number().min(0).optional().nullable(),
  valor_acrescimo: z.number().min(0).optional().nullable(),
  valor_parcela: z.number().min(0).optional().nullable(),
  modo_cobranca: z.string().optional().nullable(),
  vencimento: z.string().optional().nullable()
});

export const vendaSchema = z.object({
  codcliente: z.number({ required_error: "codcliente Ã© obrigatÃ³rio" }).int().positive(),
  codusur_criou: z.number().int().positive().optional().nullable(),
  codvendedor: z.number().int().positive().optional().nullable(),
  codfilial: z.number().int().positive().optional().nullable(),
  
  valor_frete: z.number().min(0, "Frete nÃ£o pode ser negativo").optional().nullable(),
  observacoes: z.string().optional().nullable(),
  status: z.enum(["EM_ABERTO", "FINALIZADO", "EM_DIGITACAO", "CANCELADO", "FINALIZADA"]).optional(),
  
  produtos: z.array(itemVendaSchema).optional().default([]),
  kits: z.array(kitVendaSchema).optional().default([]),
  pagamentos: z.array(pagamentoSchema).optional().default([]),

  // Fallbacks do sistema legado que devemos aceitar mas ignorar (apenas p/ evitar que a tipagem barre)
  itens: z.any().optional(),
  formaPagamento: z.any().optional(),
  parcelas: z.any().optional(),
  desconto: z.any().optional(),
  subtotal: z.any().optional(),
  valor_total: z.any().optional(),

}).refine(data => data.produtos.length > 0 || data.kits.length > 0, {
  message: "O pedido precisa ter pelo menos um produto ou kit."
});
