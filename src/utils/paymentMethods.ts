import type { PaymentMethod } from '~/generated/prisma/client';

// how organisers can record a manual order (order.createManualOrder)
export const MANUAL_PAYMENT_METHODS = [
  'CASH',
  'CARD_IN_PERSON',
  'BANK_TRANSFER',
  'COMP',
] as const satisfies readonly PaymentMethod[];

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PAYPAL: 'PayPal',
  CASH: 'Cash',
  CARD_IN_PERSON: 'Card (in person)',
  BANK_TRANSFER: 'Bank transfer',
  COMP: 'Comp',
};
