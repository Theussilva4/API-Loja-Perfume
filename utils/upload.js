import multer from 'multer';

// Opcional: Para nÃ£o salvar arquivos no disco temporariamente, vamos usar o storage em memÃ³ria.
// Assim, o multer disponibiliza req.file.buffer e nÃ³s fazemos o upload direto pro Cloudinary via stream.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo invÃ¡lido. Use JPG, PNG ou WEBP.'));
    }
  }
});

export default upload;
