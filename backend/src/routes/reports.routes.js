const express = require('express');
const upload = require('../middleware/upload');
const { ingestReport } = require('../controllers/reports.controller');

const router = express.Router();

router.post('/ingest', upload.single('image'), ingestReport);

module.exports = router;
