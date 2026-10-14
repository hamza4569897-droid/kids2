/**
 * Little Stars — عالم الصغار
 * Production Full-Stack Server with Automated 24-Hour Discovery & Sync Engine
 */

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeSyncForSource, executeSyncAllActiveSources, getSyncRuns } from './src/lib/sync/syncEngine.ts';
import { getTrustedSources } from './src/lib/storage.ts';
import { isSupabaseConfigured, supabase } from './src/lib/supabase.ts';
import {
  analyzeContentGaps,
  fillContentGaps,
  getGapTargetThreshold,
  setGapTargetThreshold,
} from './src/lib/sync/gapAnalyzer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CRON_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 Hours exact interval

// Internal state for the 24h server scheduler
let isSyncInProgress = false;
let lastSyncRunTimestamp: string | null = new Date().toISOString();
let nextScheduledSyncTimestamp: string = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
let lastSyncSummary: any = null;

app.use(express.json());

// ----------------------------------------------------------------------------
// 1. Health & Server Schedule Status API
// ----------------------------------------------------------------------------
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    isSyncInProgress,
    lastSyncRunTimestamp,
    nextScheduledSyncTimestamp,
  });
});

app.get('/api/sync/status', async (req: Request, res: Response) => {
  try {
    const sources = await getTrustedSources();
    const activeSources = sources.filter((s) => s.is_active);
    const runs = await getSyncRuns();
    const latestRun = runs.length > 0 ? runs[0] : null;

    res.json({
      success: true,
      isSyncInProgress,
      lastSyncRunTimestamp,
      nextScheduledSyncTimestamp,
      intervalHours: 24,
      activeSourcesCount: activeSources.length,
      totalSourcesCount: sources.length,
      latestRun,
      lastSyncSummary,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 2. Authentication Helper for Admin Endpoints
// ----------------------------------------------------------------------------
async function verifyAdminAuthorization(req: Request): Promise<{ authorized: boolean; email?: string; error?: string }> {
  // Allow internal cron calls with secret header or localhost
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret && cronSecret === (process.env.CRON_SECRET || 'little-stars-daily-cron-secret-2026')) {
    return { authorized: true, email: 'system_cron_daemon' };
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    // If Supabase is not configured yet in the dev environment, allow authenticated local admin session
    if (!isSupabaseConfigured()) {
      return { authorized: true, email: 'admin@littlestars.local' };
    }
    return { authorized: false, error: 'Authorization header is required' };
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !user) {
        return { authorized: false, error: 'Invalid authentication token' };
      }

      // Check admin_allowlist
      const { data: allowlistRecord } = await supabase
        .from('admin_allowlist')
        .select('id, is_active')
        .eq('email', user.email)
        .eq('is_active', true)
        .single();

      if (!allowlistRecord) {
        return { authorized: false, error: 'Forbidden: User is not in admin allowlist' };
      }

      return { authorized: true, email: user.email };
    } catch (e: any) {
      return { authorized: false, error: e.message };
    }
  }

  return { authorized: false, error: 'Unauthorized: Valid admin credentials required' };
}

// ----------------------------------------------------------------------------
// 3. Server-Side Execution Endpoint: Sync One or All Active Sources
// ----------------------------------------------------------------------------
app.post('/api/sync/run', async (req: Request, res: Response) => {
  const auth = await verifyAdminAuthorization(req);
  if (!auth.authorized) {
    return res.status(403).json({ success: false, error: auth.error || 'Unauthorized' });
  }

  if (isSyncInProgress) {
    return res.status(409).json({
      success: false,
      error: 'عملية مزامنة أخرى قيد التشغيل حالياً على الخادم. يرجى الانتظار حتى تكتمل.',
    });
  }

  const { source_id } = req.body || {};
  isSyncInProgress = true;

  try {
    if (source_id) {
      const result = await executeSyncForSource(source_id, auth.email);
      lastSyncRunTimestamp = new Date().toISOString();
      lastSyncSummary = result;
      isSyncInProgress = false;
      return res.json({ success: true, result });
    } else {
      const results = await executeSyncAllActiveSources(auth.email);
      lastSyncRunTimestamp = new Date().toISOString();
      lastSyncSummary = {
        totalSources: results.length,
        results,
      };
      isSyncInProgress = false;
      return res.json({ success: true, results });
    }
  } catch (err: any) {
    isSyncInProgress = false;
    return res.status(500).json({ success: false, error: err.message || 'فشلت المزامنة' });
  }
});

// ----------------------------------------------------------------------------
// 3.5 Content Gap Analyzer API Endpoints
// ----------------------------------------------------------------------------
app.get('/api/gap-analysis', async (req: Request, res: Response) => {
  try {
    const thresholdParam = req.query.threshold ? parseInt(req.query.threshold as string, 10) : undefined;
    const report = await analyzeContentGaps(thresholdParam);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gap-analysis/threshold', async (req: Request, res: Response) => {
  const auth = await verifyAdminAuthorization(req);
  if (!auth.authorized) {
    return res.status(403).json({ success: false, error: auth.error || 'Unauthorized' });
  }

  const { threshold } = req.body || {};
  if (!threshold || isNaN(threshold) || threshold <= 0) {
    return res.status(400).json({ success: false, error: 'Target threshold must be a positive integer.' });
  }

  setGapTargetThreshold(threshold);
  res.json({ success: true, threshold: getGapTargetThreshold() });
});

app.post('/api/gap-analysis/fill', async (req: Request, res: Response) => {
  const auth = await verifyAdminAuthorization(req);
  if (!auth.authorized) {
    return res.status(403).json({ success: false, error: auth.error || 'Unauthorized' });
  }

  if (isSyncInProgress) {
    return res.status(409).json({
      success: false,
      error: 'عملية مزامنة أو سد فجوات أخرى قيد التشغيل حالياً على الخادم. يرجى الانتظار حتى تكتمل.',
    });
  }

  isSyncInProgress = true;
  try {
    const { targetAgeBracketId, targetCategoryId, specificSourceIds, targetThreshold } = req.body || {};
    const result = await fillContentGaps({
      targetAgeBracketId,
      targetCategoryId,
      specificSourceIds,
      targetThreshold,
      adminEmail: auth.email,
    });

    lastSyncRunTimestamp = new Date().toISOString();
    lastSyncSummary = result;
    isSyncInProgress = false;

    res.json({ success: true, result });
  } catch (err: any) {
    isSyncInProgress = false;
    res.status(500).json({ success: false, error: err.message || 'فشلت عملية سد الفجوات.' });
  }
});

// Trigger 24h cron execution manually from admin or external scheduler
app.post('/api/sync/trigger-24h', async (req: Request, res: Response) => {
  const auth = await verifyAdminAuthorization(req);
  if (!auth.authorized) {
    return res.status(403).json({ success: false, error: auth.error || 'Unauthorized' });
  }

  const outcome = await runDailyScheduledSync('admin_trigger');
  res.json({ success: outcome.success, summary: outcome });
});

// ----------------------------------------------------------------------------
// 4. Automated 24-Hour Server Scheduler Daemon with Gap Analyzer Integration
// ----------------------------------------------------------------------------
async function runDailyScheduledSync(caller: string = 'cron_scheduler') {
  if (isSyncInProgress) {
    console.log(`[24h Scheduler] Skipped sync: Another cycle is currently active.`);
    return { success: false, message: 'Sync already in progress' };
  }

  isSyncInProgress = true;
  const startedAt = new Date().toISOString();
  console.log(`[24h Scheduler] Starting automated 24-hour Content Gap Analysis & Sync cycle at ${startedAt} (Trigger: ${caller})...`);

  try {
    // Intelligently analyze gaps and fill them from verified partner sources
    const result = await fillContentGaps({
      adminEmail: `daemon_cron_${caller}`,
    });

    const completedAt = new Date().toISOString();
    lastSyncRunTimestamp = completedAt;
    nextScheduledSyncTimestamp = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
    lastSyncSummary = result;

    console.log(`[24h Scheduler] Automated gap sync completed successfully at ${completedAt}:`, {
      itemsFound: result.itemsFound,
      itemsImported: result.itemsImported,
      improvedGapsCount: result.improvedGapsCount,
      remainingDeficienciesCount: result.remainingDeficiencies.length,
    });
    isSyncInProgress = false;
    return { success: true, summary: lastSyncSummary };
  } catch (err: any) {
    isSyncInProgress = false;
    console.error(`[24h Scheduler] Automated sync failed:`, err);
    return { success: false, error: err.message };
  }
}

// Start recurring 24-hour interval timer
setInterval(() => {
  runDailyScheduledSync('recurring_24h_timer');
}, CRON_INTERVAL_MS);

// ----------------------------------------------------------------------------
// 5. Mount Vite or Serve Static Assets
// ----------------------------------------------------------------------------
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(` Little Stars server running on http://0.0.0.0:${PORT}`);
    console.log(` 24-hour automated sync daemon initialized. Next run scheduled for: ${nextScheduledSyncTimestamp}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
