import { useState } from 'react';
import { Order } from '@paypal/paypal-server-sdk';
import { type RouterOutput } from '~/utils/trpc';
import EventForm from '../event-form/event-form';
import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { cn } from '~/lib/utils';
import { useRouter } from 'next/router';

type EventByIdOutput = RouterOutput['event']['byId'];

const EventItem = ({ event }: { event: EventByIdOutput }) => {
  const [orderResult, setOrderResult] = useState<Order>();
  const router = useRouter();
  // embed can be "true", "false", true, false, or undefined in query
  const embed = router.query.embed === 'true' || 'embed' in router.query;

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
    <div className="bg-white lg:p-8 p-4 rounded shadow-md lg:mt-8 mt-4 flex flex-col md:flex-row gap-10">
      {/* Left Column: Event Details */}
      <div className="md:w-1/2 space-y-4">
        <h1 className="text-2xl lg:text-4xl font-bold">{event.title}</h1>

        <div className="text-gray-700 flex gap-1.5 flex-col items-start text-xs lg:text-sm">
          {startsAtDate && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-gray-500" />
              <span>{startsAtDate}</span>
            </div>
          )}
          {startsAtTime && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
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
              <CalendarDays className="w-4 h-4 text-gray-500" />
              <span>
                Ends: {endsAtDate} {endsAtTime && `at ${endsAtTime}`}
              </span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span>{event.location}</span>
            </div>
          )}
        </div>

        <p
          className={cn(
            'lg:text-sm text-gray-600 whitespace-pre-wrap',
            embed ? 'text-[13px]' : 'text-sm',
          )}
        >
          {event.text}
        </p>
      </div>

      {/* Right Column: Form or Order Confirmation */}
      <div className="md:w-1/2">
        {orderResult ? (
          <OrderConfirmation order={orderResult} />
        ) : (
          <EventForm event={event} _setOrderResult={setOrderResult} />
        )}
      </div>
    </div>
  );
};

const OrderConfirmation = ({ order }: { order: Order }) => {
  // const { data } = trpc.order.byId.useQuery({ id: order.id!, eventId: '' });

  switch (order.status as string | undefined) {
    case 'COMPLETED':
      return (
        <>
          <p>Thank you, your order is now confirmed!</p>

          <hr className="my-8" />
          {/* <div className="text-sm">
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
          </div> */}
        </>
      );
    default:
      return <p>{order.status}</p>;
  }
};

export default EventItem;
