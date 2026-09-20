import multer from 'multer';
import { AppError } from '../utils/error.util.js';
import {
  MAX_ROOM_IMAGE_FILES,
  MAX_ROOM_IMAGE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from '../utils/image-signature.util.js';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_ROOM_IMAGE_SIZE_BYTES,
    files: MAX_ROOM_IMAGE_FILES,
  },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(mime) || mime === 'image/jpg') {
      cb(null, true);
    } else {
      cb(new AppError('VALIDATION_ERROR', 'Chỉ chấp nhận các định dạng ảnh JPEG, PNG, WebP', 400));
    }
  },
});

export const uploadRoomImagesMiddleware = upload.array('images', MAX_ROOM_IMAGE_FILES);
