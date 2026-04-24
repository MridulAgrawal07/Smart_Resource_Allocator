const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const reportsRoutes = require('./routes/reports.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const { router: volunteersRoutes, getMatches, confirmAssignment } = require('./routes/volunteers.routes');
const { run: seedCity } = require('./scripts/seedCity');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sra-backend' });
});

app.use('/api/reports', reportsRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/volunteers', volunteersRoutes);

// Matching + assignment endpoints live on the incident path, powered by the volunteer pipeline
app.get('/api/incidents/:id/matches', getMatches);
app.post('/api/incidents/:id/confirm-assignment', confirmAssignment);

// Admin: full city seed — clears all data and populates with Jaipur test data
app.post('/api/admin/seed-all', async (req, res, next) => {
  try {
    const result = await seedCity();
    res.json({ message: 'City seeded successfully', ...result });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use(errorHandler);

module.exports = app;
