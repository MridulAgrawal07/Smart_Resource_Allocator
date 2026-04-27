const express = require('express');
const { seedVolunteers, getMatches, confirmAssignment, listVolunteers, geoCheckin, completeTask } = require('../controllers/volunteers.controller');

const router = express.Router();

router.get('/', listVolunteers);
router.post('/seed', seedVolunteers);
router.post('/checkin', geoCheckin);
router.post('/complete-task', completeTask);

module.exports = { router, getMatches, confirmAssignment };
