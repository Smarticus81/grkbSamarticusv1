/**
 * Usage routes — tenant-scoped rollups over usage_events + tenant_quotas.
 *
 * - GET /summary  totals + p50/p95 latency + error rate + by-tool + quota
 */

import { Router } from 'express';
import { getDB, schema, eq, gte, desc, sql } from '@regground/core';

const { usageEvents, tenantQuotas, tenants } = schema;

const router: Router = Router();

function requireTenantId(req: Express.Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Missing tenantId on request');
  return tenantId;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

router.get('/summary', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const db = getDB();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const events = await db
      .select({
        toolName: usageEvents.toolName,
        latencyMs: usageEvents.latencyMs,
        status: usageEvents.status,
        occurredAt: usageEvents.occurredAt,
        tokenIn: usageEvents.tokenCountIn,
        tokenOut: usageEvents.tokenCountOut,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.tenantId} = ${tenantId} AND ${usageEvents.occurredAt} >= ${thirtyDaysAgo}`)
      .orderBy(desc(usageEvents.occurredAt))
      .limit(5000);

    const latencies: number[] = [];
    let okCount = 0;
    let errCount = 0;
    let req7d = 0;
    let reqToday = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    const byTool = new Map<string, { count: number; latencies: number[]; errors: number }>();

    for (const e of events) {
      if (typeof e.latencyMs === 'number') latencies.push(e.latencyMs);
      const isErr = e.status !== 'ok' && e.status !== '200' && e.status !== 'success';
      if (isErr) errCount++; else okCount++;
      const occurred = e.occurredAt instanceof Date ? e.occurredAt : new Date(e.occurredAt);
      if (occurred >= sevenDaysAgo) req7d++;
      if (occurred >= startOfDay) reqToday++;
      tokensIn += e.tokenIn ?? 0;
      tokensOut += e.tokenOut ?? 0;

      const bucket = byTool.get(e.toolName) ?? { count: 0, latencies: [], errors: 0 };
      bucket.count++;
      if (typeof e.latencyMs === 'number') bucket.latencies.push(e.latencyMs);
      if (isErr) bucket.errors++;
      byTool.set(e.toolName, bucket);
    }

    latencies.sort((a, b) => a - b);
    const total30d = events.length;
    const errorRate = total30d > 0 ? errCount / total30d : 0;

    // Quota — tenant_quotas keys are uuid; the tenantId in JWT may be a
    // string. Look up by display-name match if uuid lookup fails.
    let quota: {
      monthlyRequestLimit: number;
      currentMonthRequests: number;
      monthlyTokenLimit: number;
      currentMonthTokens: number;
      periodStart: string;
      utilizationPct: number;
    } | null = null;

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
      if (isUuid) {
        const [q] = await db
          .select()
          .from(tenantQuotas)
          .where(eq(tenantQuotas.tenantId, tenantId))
          .orderBy(desc(tenantQuotas.periodStart))
          .limit(1);
        if (q) {
          quota = {
            monthlyRequestLimit: q.monthlyRequestLimit,
            currentMonthRequests: q.currentMonthRequests,
            monthlyTokenLimit: q.monthlyTokenLimit,
            currentMonthTokens: q.currentMonthTokens,
            periodStart: q.periodStart instanceof Date ? q.periodStart.toISOString() : String(q.periodStart),
            utilizationPct: q.monthlyRequestLimit > 0
              ? Math.min(100, Math.round((q.currentMonthRequests / q.monthlyRequestLimit) * 100))
              : 0,
          };
        }
      }
    } catch { /* tenants table may not exist yet — ignore */ }

    // Provide a sane default if no quota row yet (prevents "—" everywhere
    // for a fresh tenant).
    if (!quota) {
      const monthlyLimit = 10_000;
      quota = {
        monthlyRequestLimit: monthlyLimit,
        currentMonthRequests: total30d,
        monthlyTokenLimit: 1_000_000,
        currentMonthTokens: tokensIn + tokensOut,
        periodStart: thirtyDaysAgo.toISOString(),
        utilizationPct: Math.min(100, Math.round((total30d / monthlyLimit) * 100)),
      };
    }
    void tenants;

    res.json({
      windowDays: 30,
      totals: {
        requests30d: total30d,
        requests7d: req7d,
        requestsToday: reqToday,
        ok: okCount,
        errors: errCount,
        errorRate: Number(errorRate.toFixed(4)),
        latencyP50Ms: percentile(latencies, 0.5),
        latencyP95Ms: percentile(latencies, 0.95),
        tokensIn,
        tokensOut,
      },
      byTool: Array.from(byTool.entries())
        .map(([name, b]) => {
          const sorted = b.latencies.slice().sort((a, b) => a - b);
          return {
            toolName: name,
            count: b.count,
            errors: b.errors,
            latencyP50Ms: percentile(sorted, 0.5),
            latencyP95Ms: percentile(sorted, 0.95),
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      quota,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
