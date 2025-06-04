import { useState } from 'react';
import { Order } from '@paypal/paypal-server-sdk';
import { trpc, type RouterOutput } from '~/utils/trpc';
import EventForm from '../event-form/event-form';
import { CalendarDays, Clock, MapPin } from 'lucide-react';

type EventByIdOutput = RouterOutput['event']['byId'];

const EventItem = ({ event }: { event: EventByIdOutput }) => {
  const [orderResult, setOrderResult] = useState<Order>();

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date | null | undefined) => {
    if (!date) return null;
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const startsAtDate = formatDate(event.startsAt);
  const startsAtTime = formatTime(event.startsAt);
  const endsAtDate = formatDate(event.endsAt);
  const endsAtTime = formatTime(event.endsAt);

  return (
    <div className="flex flex-col md:flex-row gap-10">
      {/* Left Column: Event Details */}
      <div className="md:w-1/2 space-y-4">
        <h1 className="text-2xl lg:text-4xl font-bold">{event.title}</h1>

        <div className="text-gray-700 flex gap-2 flex-col items-start text-sm">
          {startsAtDate && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-gray-500" />
              <span>{startsAtDate}</span>
            </div>
          )}
          {startsAtTime && (
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              <span>
                {startsAtTime}
                {endsAtTime &&
                  endsAtDate === startsAtDate &&
                  ` - ${endsAtTime}`}
              </span>
            </div>
          )}
          {endsAtDate && endsAtDate !== startsAtDate && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-gray-500" />
              <span>
                Ends: {endsAtDate} {endsAtTime && `at ${endsAtTime}`}
              </span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-gray-500" />
              <span>{event.location}</span>
            </div>
          )}
        </div>

        <p className="text-sm lg:text-base text-gray-600 whitespace-pre-wrap">
          {event.text}
        </p>
      </div>

      {/* Right Column: Form or Order Confirmation */}
      <div className="md:w-1/2">
        {orderResult ? (
          <OrderConfirmation order={orderResult} />
        ) : (
          <EventForm event={event} setOrderResult={setOrderResult} />
        )}
      </div>
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
