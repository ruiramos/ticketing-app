export const ORDER_CAPTURE_COMPLETE = {
  id: '7YS20366LJ286025B',
  paymentSource: {
    paypal: {
      emailAddress: 'fohped-summer@gmail.com',
      accountId: 'DXD6UM5Y3XVEC',
      accountStatus: 'VERIFIED',
      name: {
        givenName: 'John',
        surname: 'Doe',
      },
      address: {
        countryCode: 'GB',
      },
    },
  },
  payer: {
    emailAddress: 'fohped-summer@gmail.com',
    payerId: 'DXD6UM5Y3XVEC',
    name: {
      givenName: 'John',
      surname: 'Doe',
    },
    address: {
      countryCode: 'GB',
    },
  },
  purchaseUnits: [
    {
      referenceId: '9c5b9bc7-d255-4afc-8a27-4a7629bd8cd7',
      shipping: {
        name: {
          fullName: 'John Doe',
        },
        address: {
          addressLine1: 'Whittaker House',
          addressLine2: '2 Whittaker Avenue',
          adminArea2: 'Richmond',
          adminArea1: 'Surrey',
          postalCode: 'TW9 1EH',
          countryCode: 'GB',
        },
      },
      payments: {
        captures: [
          {
            status: 'COMPLETED',
            id: '0RL65366WG691605D',
            amount: {
              currencyCode: 'GBP',
              value: '10.00',
            },
            sellerProtection: {
              status: 'ELIGIBLE',
              disputeCategories: [
                'ITEM_NOT_RECEIVED',
                'UNAUTHORIZED_TRANSACTION',
              ],
            },
            finalCapture: true,
            sellerReceivableBreakdown: {
              grossAmount: {
                currencyCode: 'GBP',
                value: '10.00',
              },
              paypalFee: {
                currencyCode: 'GBP',
                value: '0.54',
              },
              netAmount: {
                currencyCode: 'GBP',
                value: '9.46',
              },
            },
            links: [
              {
                href: 'https://api.sandbox.paypal.com/v2/payments/captures/0RL65366WG691605D',
                rel: 'self',
                method: 'GET',
              },
              {
                href: 'https://api.sandbox.paypal.com/v2/payments/captures/0RL65366WG691605D/refund',
                rel: 'refund',
                method: 'POST',
              },
              {
                href: 'https://api.sandbox.paypal.com/v2/checkout/orders/7YS20366LJ286025B',
                rel: 'up',
                method: 'GET',
              },
            ],
            createTime: '2025-05-17T12:43:31Z',
            updateTime: '2025-05-17T12:43:31Z',
          },
        ],
      },
    },
  ],
  status: 'COMPLETED',
  links: [
    {
      href: 'https://api.sandbox.paypal.com/v2/checkout/orders/7YS20366LJ286025B',
      rel: 'self',
      method: 'GET',
    },
  ],
};
