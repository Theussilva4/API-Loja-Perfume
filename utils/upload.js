import multer from 'multer';

// Opcional: Para não salvar arquivos no disco temporariamente, vamos usar o storage em memória.
// Assim, o multer disponibiliza req.file.buffer e nós fazemos o upload direto pro Cloudinary via stream.
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
      cb(new Error('Formato de arquivo inválido. Use JPG, PNG ou WEBP.'));
    }
  }
});

export default upload;
