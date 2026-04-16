const multer = require('multer');

const MAX_FILE_SIZE_MB = 10;

function fileFilter(req, file, cb) {
  if (!file) return cb(null, true);
  if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
  cb(new Error('Only image files are allowed'));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter,
});

module.exports = upload;
