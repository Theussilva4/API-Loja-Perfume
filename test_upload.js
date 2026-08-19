async function testUpload() {
  const form = new FormData();
  form.append('descricao', 'TESTE MULTIPART');
  form.append('codcategoria', '1');
  form.append('ativo', 'S');
  
  try {
    const res = await fetch('http://localhost:3001/api/produtos', {
      method: 'POST',
      body: form
    });
    const text = await res.text();
    console.log('STATUS:', res.status, text);
  } catch (err) {
    console.log('ERROR:', err);
  }
}

testUpload();
