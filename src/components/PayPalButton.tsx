'use client';

import {
  PayPalButtons,
  PayPalButtonsComponentProps,
  PayPalScriptProvider,
  ReactPayPalScriptOptions,
} from '@paypal/react-paypal-js';
import { FunctionComponent, useRef } from 'react';
import { trpc } from '~/utils/trpc';

const PayPalButton: FunctionComponent<PayPalButtonsComponentProps> = (
  props,
) => {
  const initialOptions: ReactPayPalScriptOptions = {
    clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
    currency: 'GBP',
    components: ['buttons', 'applepay'],
    commit: true,
    environment: (process.env.NEXT_PUBLIC_PAYPAL_ENV
      ? process.env.NEXT_PUBLIC_PAYPAL_ENV.toLowerCase()
      : 'sandbox') as 'production' | 'sandbox',
    // Add other options as needed
  };

  // Each click reserves tickets. If the buyer closes PayPal or checkout
  // fails, release them now rather than when the reservation expires.
  const lastOrderId = useRef<string | undefined>(undefined);
  const releaseOrder = trpc.order.releaseOrder.useMutation();
  const release = (id: string | undefined, reason: 'cancelled' | 'error') => {
    lastOrderId.current = undefined;
    if (id) releaseOrder.mutate({ id, reason });
  };

  return (
    <PayPalScriptProvider options={initialOptions}>
      <PayPalButtons
        {...props}
        createOrder={
          props.createOrder &&
          (async (data, actions) => {
            lastOrderId.current = undefined;
            const id = await props.createOrder!(data, actions);
            lastOrderId.current = id;
            return id;
          })
        }
        onApprove={
          props.onApprove &&
          ((data, actions) => {
            lastOrderId.current = undefined;
            return props.onApprove!(data, actions);
          })
        }
        onCancel={(data, actions) => {
          release(
            (data.orderID as string | undefined) ?? lastOrderId.current,
            'cancelled',
          );
          return props.onCancel?.(data, actions);
        }}
        onError={(err) => {
          release(lastOrderId.current, 'error');
          return props.onError?.(err);
        }}
      />
    </PayPalScriptProvider>
  );
};
export default PayPalButton;
