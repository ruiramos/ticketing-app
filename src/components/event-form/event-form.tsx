import { EventExtras, Variant } from '@prisma/client';
import { Order } from '@paypal/paypal-server-sdk';

interface EventFormProps {
  event: {
    id: string;
    title: string;
    text: string;
    variants: Variant[];
    eventExtras: EventExtras[];
  };
  setOrderResult: (order: Order) => void;
}

import { FormEventHandler, useId, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import PayPalButton from '~/components/PayPalButton';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

import { trpc } from '~/utils/trpc';
import { Checkbox } from '../ui/checkbox';
import { LAST_FEW_STOCK_WARNING, EVENT_MAX_TICKETS } from '~/utils/contants';

const EventForm = ({ event, setOrderResult }: EventFormProps) => {
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [extrasState, setExtrasState] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | undefined>();

  const typeId = useId();
  const quantityId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const createOrderMutation = trpc.order.createOrder.useMutation();
  const captureOrderMutation = trpc.order.captureOrder.useMutation();

  const handleFormSubmit: FormEventHandler = (e) => {
    e.preventDefault();
  };

  // TODO maybe centralize this logic?
  const price = !selectedVariant
    ? null
    : selectedVariant.price * quantity +
      Object.keys(extrasState).reduce((acc, key) => {
        if (!extrasState[key]) return acc;
        const extraPrice = event.eventExtras.find((ex) => ex.id === key);
        return acc + (extraPrice?.price ?? 0);
      }, 0);

  return (
    <form
      method="get"
      ref={formRef}
      className="flex flex-col gap-4 lg:w-1/2 max-w-72"
      onSubmit={handleFormSubmit}
    >
      {error ? (
        <div className="border-red-600 border-2 rounded p-4 w-full text-sm">
          <p className="mb-4">Found the following problems:</p>
          <p className="text-red-900">{error}</p>
        </div>
      ) : null}
      <div>
        <Label htmlFor={typeId}>Ticket type</Label>
        <div>
          <Select
            value={selectedVariant?.id}
            required
            onValueChange={(id) => {
              setSelectedVariant(
                event.variants.find((v) => v.id === id) ?? null,
              );
            }}
          >
            <SelectTrigger id={typeId}>
              <SelectValue placeholder="Select your time slot" />
            </SelectTrigger>
            <SelectContent>
              {event.variants.map((variant) => (
                <SelectItem
                  key={variant.id}
                  value={variant.id}
                  disabled={variant.stock === 0}
                  className="data-[disabled]:text-muted-foreground data-[disabled]:cursor-no-drop"
                >
                  <span className={variant.stock === 0 ? 'line-through' : ''}>
                    {variant.title}
                  </span>{' '}
                  {!variant.stock ? <>(Sold out)</> : null}
                  {variant.stock && variant.stock <= LAST_FEW_STOCK_WARNING ? (
                    <>(Last few!)</>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="">
        <Label htmlFor={quantityId}>Quantity</Label>
        <Input
          id={quantityId}
          placeholder="Number of tickets"
          type="number"
          value={quantity}
          max={EVENT_MAX_TICKETS}
          min={1}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </div>
      <div>
        {/*<Label className="text-muted-foreground">Event extras:</Label>*/}
        {event.eventExtras.map((e) => (
          <div key={e.id}>
            <EventExtra
              {...e}
              value={extrasState[e.id]}
              onChange={(value: any) => {
                setExtrasState((prevState) => ({
                  ...prevState,
                  [e.id]: value,
                }));
              }}
            />
          </div>
        ))}
      </div>
      <div className="text-sm bg-gray-100 rounded p-2 flex justify-between">
        <span className="font-semibold">Total:</span>{' '}
        <span className="">£{price ?? '-'}</span>
      </div>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <PayPalButton
          onClick={async (_data, actions) => {
            const form: HTMLFormElement | null = formRef.current;
            if (form?.checkValidity()) {
              return actions.resolve();
            } else {
              form?.reportValidity();
              return actions.reject();
            }
          }}
          createOrder={async () => {
            if (!selectedVariant || price === null) {
              setError('No ticket option selected.');
              throw new Error('No variant selected');
            }

            setError(undefined);

            try {
              const order = await createOrderMutation.mutateAsync({
                id: event.id,
                variantId: selectedVariant.id,
                quantity,
                extras: extrasState,
              });
              if (!order.id) {
                throw new Error('Order could not be created');
              }
              return order.id;
            } catch (error: Error | unknown) {
              console.error('Order creation failed:', error);
              if (error instanceof Error) {
                setError(error.message);
                throw new Error(error.message);
              } else {
                setError('An unknown error occurred');
                throw new Error('An unknown error occurred');
              }
            }
          }}
          onApprove={async (data) => {
            try {
              const order = await captureOrderMutation.mutateAsync({
                id: data.orderID,
              });
              setOrderResult(order);
            } catch {
              setError('Could not complete your purchase. Please try again.');
            }
          }}
        />
      </ErrorBoundary>
    </form>
  );
};

type EventExtraProps = EventExtras & {
  value: any; // TODO
  onChange: any;
};

const EventExtra: React.FC<EventExtraProps> = ({
  title,
  price,
  currency,
  id,
  onChange,
  value,
}) => {
  return (
    <div className="flex align-middle gap-1.5">
      <Checkbox
        id={`extra-${id}`}
        checked={value}
        onCheckedChange={(checked) => onChange(checked)}
      />{' '}
      <Label htmlFor={`extra-${id}`}>
        {title}{' '}
        {price ? (
          <span className="text-gray-300 pl-1">
            (+{currency} {price})
          </span>
        ) : null}
      </Label>
    </div>
  );
};

export default EventForm;
