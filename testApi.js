import axios from "axios";

async function testApi() {
  try {
    const res = await axios.get("http://localhost/api/dashboard?dataInicial=2026-07-28&dataFinal=2026-07-28");
    console.log("Venda do mes (filtrada para o dia 28):", res.data.vendaMes);
    
    const res2 = await axios.get("http://localhost/api/dashboard?dataInicial=2026-07-01&dataFinal=2026-07-31");
    console.log("Venda do mes (mes todo):", res2.data.vendaMes);
  } catch (error) {
    console.error("API error", error.message);
  }
}
testApi();
