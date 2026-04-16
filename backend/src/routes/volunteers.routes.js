const express = require('express');
const { seedVolunteers, assignVolunteer, listVolunteers } = require('../controllers/volunteers.controller');

const router = express.Router();

router.get('/', listVolunteers);
router.post('/seed', seedVolunteers);

// Assignment lives conceptually on the incident, but uses the volunteer pipeline.
// Mounted at /api/incidents/:id/assign via app.js — see note there.
// We export assignVolunteer separately so it can be wired to the incidents path.

module.exports = { router, assignVolunteer };
