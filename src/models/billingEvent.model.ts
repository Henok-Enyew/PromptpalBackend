import { Schema, model } from 'mongoose';

/**
 * Webhook deliveries already applied, keyed by a hash of the raw body, so a
 * redelivered event is acknowledged without being applied twice.
 */
const billingEventSchema = new Schema(
  {
    digest: { type: String, required: true, unique: true },
    eventName: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// Lemon Squeezy retries for a few days at most; keep a month.
billingEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const BillingEvent = model('BillingEvent', billingEventSchema);
export default BillingEvent;
