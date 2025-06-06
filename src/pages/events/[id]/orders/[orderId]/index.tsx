'use client';

import NextError from 'next/error';
import { useRouter } from 'next/router';
import OrderConfirmation from '~/components/order-confirmation/order-confirmation';

import type { NextPageWithLayout } from '~/pages/_app';
import { trpc } from '~/utils/trpc';

const OrderViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.orderId as string;
  const eventId = useRouter().query.id as string;
  const {
    data: order,
    status,
    error,
  } = trpc.order.byId.useQuery({ id, eventId }, { enabled: !!id });

  if (error) {
    return (
      <NextError
        title={error.message}
        statusCode={error.data?.httpStatus ?? 500}
      />
    );
  }

  if (status !== 'success') {
    return <div>Loading...</div>;
  }

  if (!order) {
    return <NextError title={'Order not found'} statusCode={404} />;
  }

  return <OrderConfirmation order={order} />;
};

export default OrderViewPage;
