const express = require('express');
const { seedVolunteers, getMatches, confirmAssignment, listVolunteers } = require('../controllers/volunteers.controller');

const router = express.Router();

router.get('/', listVolunteers);
router.post('/seed', seedVolunteers);

module.exports = { router, getMatches, confirmAssignment };
