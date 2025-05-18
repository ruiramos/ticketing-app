'use client';

import NextError from 'next/error';
import { useRouter } from 'next/router';
import EventItem from '~/components/event-item/event-item';

import type { NextPageWithLayout } from '~/pages/_app';
import { trpc } from '~/utils/trpc';

const OrderConfirmationPage: NextPageWithLayout = () => {
  /*
  const router = useRouter();
  const { id, orderId } = router.query;

  const orderQuery = trpc.order.byId.useQuery({ orderId });

  if (orderQuery.error) {
    return (
      <NextError
        title={orderQuery.error.message}
        statusCode={orderQuery.error.data?.httpStatus ?? 500}
      />
    );
  }

  if (orderQuery.status !== 'success') {
    return <div>Loading...</div>;
  }
  const { data } = orderQuery;
  return <pre>{JSON.stringify(data)}</pre>;
  */
  return null;
};

export default OrderConfirmationPage;
