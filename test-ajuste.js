import fetch from 'node-fetch';

async function testEntrada() {
  try {
    const payload = {
      filialDestino: 1,
      origem: "AJUSTE",
      itens: [
        { codproduto: 1, quantidade: 5 },
        { codproduto: 2, quantidade: 3 }
      ]
    };

    const res = await fetch("http://localhost:3000/api/estoque/entradas", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log(res.status);
    console.log(await res.text());
  } catch (error) {
    console.error(error);
  }
}

testEntrada();
