import { listarTabelaPrecos } from './controllers/precificacaoController.js';
import express from 'express';

const req = {};
const res = {
  json: (data) => {
    const tbPrecos = data;
    
    // Simulate frontend mapping
    const produtosRAW = [
      { codproduto: 30, descricao: "HEINZ TOMATO KETCHUP CURRY" },
      { codproduto: 31, descricao: "OTHER" }
    ];

    const produtos = produtosRAW.map((p) => {
      const tb = tbPrecos.find((t) => String(t.codproduto) === String(p.codproduto));
      return {
        ...p,
        preco_calculado: tb?.precificacao?.precoFinal || p.preco_promocao || p.preco_normal || 0,
        tem_preco_tabela: !!(tb?.precificacao?.precoFinal)
      };
    });

    console.log(JSON.stringify(produtos, null, 2));
  },
  status: (code) => ({
    json: (msg) => console.log(code, msg)
  })
};

async function main() {
  await listarTabelaPrecos(req, res);
}

main().catch(console.error);
