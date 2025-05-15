'use client';

import {
  PayPalButtons,
  PayPalButtonsComponentProps,
  PayPalScriptProvider,
  ReactPayPalScriptOptions,
} from '@paypal/react-paypal-js';
import { FunctionComponent } from 'react';

const PayPalButton: FunctionComponent<PayPalButtonsComponentProps> = (
  props,
) => {
  const initialOptions: ReactPayPalScriptOptions = {
    clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
    currency: 'GBP',
    components: 'buttons,applepay',
    // Add other options as needed
  };

  return (
    <PayPalScriptProvider options={initialOptions}>
      <PayPalButtons {...props} />
    </PayPalScriptProvider>
  );
};
export default PayPalButton;
