import express from 'express';

// Unauthenticated liveness check. The app's NetInfo reachability test calls this, so the app
// treats itself as "online" only when GroupThat itself is reachable (not just a captive portal).
const router = express.Router();
router.get('/', (_req, res) => res.sendStatus(204));

export default router;
