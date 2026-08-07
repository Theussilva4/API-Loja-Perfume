import jwt from 'jsonwebtoken';

async function run() {
  const token = jwt.sign({ codusur: 1, nome: "Admin" }, "SEGREDO");
  
  try {
    const res = await fetch('http://localhost:3001/api/usuario/15', {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ativo: 'N' })
    });
    const data = await res.json();
    console.log(data);
  } catch (e) {
    console.log(e.message);
  }
}
run();
