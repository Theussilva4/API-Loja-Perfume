async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/comercial/definir/649', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        preco_custo: 10,
        preco_venda: 25,
        preco_cartao: 32,
        desconto_maximo: 0
      })
    });
    const data = await res.json();
    console.log("Success:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
