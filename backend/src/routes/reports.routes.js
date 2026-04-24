const express = require('express');
const upload = require('../middleware/upload');
const { ingestReport, getPendingReports, approveReport, rejectReport } = require('../controllers/reports.controller');

const router = express.Router();

router.post('/ingest', upload.single('image'), ingestReport);
router.get('/pending', getPendingReports);
router.post('/:id/approve', approveReport);
router.post('/:id/reject', rejectReport);

module.exports = router;
