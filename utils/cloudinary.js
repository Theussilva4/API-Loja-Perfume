import { v2 as cloudinary } from 'cloudinary';

export const uploadImageToCloudinary = (buffer, folder = 'erp/produtos') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    stream.end(buffer);
  });
};

export const deleteImageFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (result) resolve(result);
      else reject(error);
    });
  });
};
