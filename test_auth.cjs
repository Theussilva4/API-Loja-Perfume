const jwt = require('jsonwebtoken');
const axios = require('axios');

async function run() {
  const token = jwt.sign({ codusur: 1, nome: "Admin" }, "SEGREDO");
  
  try {
    const res = await axios.put('http://localhost:3001/api/usuario/15', { ativo: 'N' }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(res.data);
  } catch (e) {
    console.log(e.response?.data);
  }
}
run();
