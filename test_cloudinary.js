import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: 'urr4kbeg',
  api_key: '846483818444413',
  api_secret: 'pUd0nAvGLRyTrI2kPfrlDu0x8UU',
});

const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

console.log('Testing cloudinary stream...');

const stream = cloudinary.uploader.upload_stream(
  { folder: 'erp/test' },
  (error, result) => {
    if (result) console.log('Success:', result.secure_url);
    else console.error('Error:', error);
  }
);
stream.end(buffer);
