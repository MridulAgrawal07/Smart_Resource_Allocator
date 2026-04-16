const express = require('express');
const { listOpenIncidents, assistantQuery } = require('../controllers/incidents.controller');

const router = express.Router();

router.get('/', listOpenIncidents);
router.post('/assistant', assistantQuery);

module.exports = router;
