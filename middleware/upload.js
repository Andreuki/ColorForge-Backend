const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fileType = require('file-type');

// Asegurar que ./uploads existe antes de que multer intente escribir en ella
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Sanear el nombre: reemplazar espacios y eliminar caracteres especiales
    const sanitized = file.originalname
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9.\-_]/g, '');
    cb(null, `${Date.now()}-${sanitized}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan JPEG, PNG y WebP.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

/**
 * Verifica el tipo MIME real de un fichero usando magic bytes.
 * Lanza un error si el tipo no está permitido.
 * @param {string} filePath ruta absoluta al fichero en disco
 * @param {string[]} allowedMimes array de MIME types permitidos
 */
const verifyFileMagicBytes = async (filePath, allowedMimes) => {
  const type = await fileType.fromFile(filePath);
  if (!type || !allowedMimes.includes(type.mime)) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const error = new Error('Tipo de archivo no permitido (verificación de contenido)');
    error.status = 400;
    throw error;
  }
  return type;
};

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user._id}-${Date.now()}${ext}`);
  }
});

const avatarFileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: avatarFileFilter
}).single('avatar');

const postStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'posts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `post-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const uploadPostImages = multer({
  storage: postStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpeg, png and webp images are allowed'), false);
  }
}).array('images', 10);

const uploadPostImage = multer({
  storage: postStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpeg, png and webp images are allowed'), false);
  }
}).single('image');

const challengeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'challenges');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `challenge-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const uploadChallengeCover = multer({
  storage: challengeStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpeg, png and webp images are allowed'), false);
  }
}).single('image');

module.exports = upload;
module.exports.uploadAvatar = uploadAvatar;
module.exports.uploadPostImages = uploadPostImages;
module.exports.uploadPostImage = uploadPostImage;
module.exports.uploadChallengeCover = uploadChallengeCover;
module.exports.verifyFileMagicBytes = verifyFileMagicBytes;
