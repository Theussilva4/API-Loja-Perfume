import express from 'express';
import multer from 'multer';
import FormData from 'form-data';

const upload = multer({
  fileFilter: (req, file, cb) => {
    cb(new Error('Formato invalido'));
  }
});

const app = express();
app.post('/api', upload.single('imagem'), (req, res) => res.send('ok'));
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ status: err.status || 500, message: err.message });
});

const server = app.listen(3002, async () => {
  const form = new FormData();
  form.append('imagem', 'hello', { filename: 'test.txt', contentType: 'text/plain' });
  const res = await fetch('http://localhost:3002/api', { method: 'POST', body: form });
  console.log('Status:', res.status, await res.text());
  server.close();
});
