import { useState } from 'react';

import { Order } from '@paypal/paypal-server-sdk';
import { trpc, type RouterOutput } from '~/utils/trpc';
import EventForm from '../event-form/event-form';

type EventByIdOutput = RouterOutput['event']['byId'];

const EventItem = ({ event }: { event: EventByIdOutput }) => {
  const [orderResult, setOrderResult] = useState<Order>();

  return (
    <div className="">
      <h1 className="text-2xl lg:text-4xl font-bold mt-2 mb-2">
        {event.title}
      </h1>
      <p className="text-sm lg:text-md mb-8 text-gray-500">{event.text}</p>
      {orderResult ? (
        <OrderConfirmation order={orderResult} />
      ) : (
        <EventForm event={event} setOrderResult={setOrderResult} />
      )}
    </div>
  );
};

const OrderConfirmation = ({ order }: { order: Order }) => {
  const { data } = trpc.order.byId.useQuery({ id: order.id! });

  switch (order.status as string | undefined) {
    case 'COMPLETED':
      return (
        <>
          <p>Thank you, your order is now confirmed!</p>

          <hr className="my-8" />
          <div className="text-sm">
            <p>
              <span className="font-semibold">Order ID:</span> {data?.id}
            </p>
            <p>
              <span className="font-semibold">Items:</span>
            </p>
            <ul className="list-disc pl-4">
              {data?.purchaseUnits?.[0].items?.map((item, i) => (
                <li key={i}>
                  {i === 0
                    ? `Ticket for ${item.name} (x${item.quantity})`
                    : item.name}
                </li>
              ))}
            </ul>
            <p>
              <span className="font-semibold">Total:</span> £
              {data?.purchaseUnits?.[0].amount?.value}
            </p>
          </div>
        </>
      );
    default:
      return <p>{order.status}</p>;
  }
};

export default EventItem;
