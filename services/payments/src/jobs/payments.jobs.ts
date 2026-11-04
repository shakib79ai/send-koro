import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TOKENS } from '../tokens';
import { SettlementService } from '../payments/settlement.service';
import { SubscriptionsService } from '../payments/subscriptions.service';

@Injectable()
export class PaymentsJobs {
  private readonly log = new Logger('PaymentsJobs');
  constructor(
    @Inject(TOKENS.subscriptions) private readonly subs: SubscriptionsService,
    @Inject(TOKENS.settlement) private readonly settlement: SettlementService,
  ) {}

  /** Hourly: lock the tier for restaurants renewing in the next 24 hours (each renews on its own sign-up day). */
  @Cron('5 * * * *')
  async renewalTiers() {
    const res = await this.subs.runRestaurantTierJob();
    if (res.length) this.log.log(`Tier job: ${res.length} restaurants, ${res.filter((r) => r.changed).length} price changes`);
  }

  /** Every 15 minutes: pay driver transfers that were owed (balance became available, onboarding finished). */
  @Cron('*/15 * * * *')
  async retryDriverTransfers() {
    const res = await this.settlement.retryOwed();
    if (res.length) this.log.log(`Driver transfer retry: ${res.length} attempted`);
  }
}
