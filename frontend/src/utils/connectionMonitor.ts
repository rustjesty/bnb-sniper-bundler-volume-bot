import { Connection } from '@solana/web3.js';
import logger from './logger';

export class ConnectionMonitor {
  private static readonly LATENCY_THRESHOLD = 1000; // ms
  private static readonly ERROR_THRESHOLD = 3;

  private errorCount = 0;
  private lastLatency = 0;

  constructor(private connection: Connection) {}

  async checkHealth(): Promise<{
    isHealthy: boolean;
    latency: number;
    errorCount: number;
  }> {
    try {
      const start = performance.now();
      await this.connection.getSlot();
      this.lastLatency = performance.now() - start;
      
      const isHealthy = this.lastLatency < ConnectionMonitor.LATENCY_THRESHOLD;
      
      if (!isHealthy) {
        this.errorCount++;
      } else {
        this.errorCount = Math.max(0, this.errorCount - 1);
      }

      return {
        isHealthy,
        latency: this.lastLatency,
        errorCount: this.errorCount
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Connection health check error:', error);
      
      return {
        isHealthy: false,
        latency: this.lastLatency,
        errorCount: this.errorCount
      };
    }
  }

  shouldSwitchEndpoint(): boolean {
    return this.errorCount >= ConnectionMonitor.ERROR_THRESHOLD;
  }

  reset(): void {
    this.errorCount = 0;
    this.lastLatency = 0;
  }
}
