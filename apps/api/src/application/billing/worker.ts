import { SubscriptionBillingEngine } from './renewal-engine.js';

export class SubscriptionRenewalWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly intervalMs = 5000,
    private readonly engine = new SubscriptionBillingEngine()
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processOnce().catch(() => undefined);
    }, this.intervalMs);
    void this.processOnce().catch(() => undefined);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.engine.processDueSubscriptions(25, new Date());
      if (rows.length > 0) {
        console.log(JSON.stringify({ level: 'info', message: 'subscription renewals processed', count: rows.length }));
      }
    } finally {
      this.running = false;
    }
  }
}
