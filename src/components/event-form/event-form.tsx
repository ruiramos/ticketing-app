import { EventExtras, Variant } from '~/generated/prisma/client';
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
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { trpc } from '~/utils/trpc';
import { Checkbox } from '../ui/checkbox';
import { LAST_FEW_STOCK_WARNING, EVENT_MAX_TICKETS } from '~/utils/contants';
import { Button } from '../ui/button';
import { useEffect, useMemo } from 'react'; // Added useEffect and useMemo

const EventForm = ({ event, setOrderResult }: EventFormProps) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [extrasState, setExtrasState] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | undefined>();
  const [isPurchaseDisabled, setIsPurchaseDisabled] = useState<boolean>(true);

  const typeId = useId(); // For radio group label or select label
  const quantityId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const selectTriggerRef = useRef<HTMLButtonElement>(null); // Keep for select, radio won't need it for border
  const createOrderMutation = trpc.order.createOrder.useMutation();
  const captureOrderMutation = trpc.order.captureOrder.useMutation();

  const selectedVariant = useMemo(() => {
    return event.variants.find((v) => v.id === selectedVariantId) ?? null;
  }, [selectedVariantId, event.variants]);

  const maxTicketsPerOrder = EVENT_MAX_TICKETS;
  const currentVariantStock = selectedVariant?.stock ?? 0;
  const maxQuantityForSelectedVariant = Math.min(
    currentVariantStock,
    maxTicketsPerOrder,
  );

  useEffect(() => {
    if (selectedVariant) {
      setError(undefined); // Clear previous errors on variant change
      if (selectTriggerRef.current) {
        // Clear red border from select if used
        selectTriggerRef.current.style.borderColor = '';
      }

      if (selectedVariant.stock === 0) {
        setQuantity(0);
        setIsPurchaseDisabled(true);
      } else {
        setIsPurchaseDisabled(false);
        if (quantity > maxQuantityForSelectedVariant) {
          setQuantity(maxQuantityForSelectedVariant);
        } else if (quantity === 0 && maxQuantityForSelectedVariant > 0) {
          setQuantity(1);
        }
      }
    } else {
      setQuantity(1);
      setIsPurchaseDisabled(true);
    }
  }, [selectedVariantId]); // Re-evaluate when selectedVariantId changes

  const handleQuantityInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const numValue = Number(e.target.value);
    if (selectedVariant && selectedVariant.stock > 0) {
      const boundedQuantity = Math.max(
        1,
        Math.min(numValue, maxQuantityForSelectedVariant),
      );
      setQuantity(boundedQuantity);
    } else {
      setQuantity(0); // Or handle as error, but effectively disabled
    }
  };

  const decreaseQuantity = () => {
    setQuantity((q) => Math.max(1, q - 1));
  };

  const increaseQuantity = () => {
    // Ensure quantity doesn't exceed stock or general max
    setQuantity((q) => Math.min(maxQuantityForSelectedVariant, q + 1));
  };

  const getVariantLabel = (variant: Variant) => {
    let label = `${variant.title} - £${variant.price.toFixed(2)}`;
    if (variant.stock === 0) {
      label += ' (Sold out)';
    } else if (variant.stock <= LAST_FEW_STOCK_WARNING) {
      label += ` (Last few! Stock: ${variant.stock})`;
    } else {
      label += ` (Stock: ${variant.stock})`;
    }
    return label;
  };

  const handleFormSubmit: FormEventHandler = (e) => {
    e.preventDefault();
  };

  const price = useMemo(() => {
    if (!selectedVariant || quantity === 0) return null;

    return (
      selectedVariant.price * quantity +
      Object.keys(extrasState).reduce((acc, key) => {
        if (!extrasState[key]) return acc;
        const extraPrice = event.eventExtras.find((ex) => ex.id === key);
        return acc + (extraPrice?.price ?? 0);
      }, 0)
    );
  }, [selectedVariant, quantity, extrasState, event.eventExtras]);

  return (
    <form
      method="get" // Should probably be method="dialog" or removed if not submitting traditionally
      ref={formRef}
      className="flex flex-col gap-4 md:min-w-80" // Adjusted min width for form
      onSubmit={handleFormSubmit}
    >
      {error && ( // Simplified error display
        <div className="border-red-600 border-2 rounded p-4 w-full text-sm text-red-900">
          {error}
        </div>
      )}
      <div>
        <Label htmlFor={typeId} className="block mb-1">
          Ticket type
        </Label>
        {event.variants.length <= 3 ? (
          <RadioGroup
            value={selectedVariantId ?? undefined}
            onValueChange={(id) => {
              setSelectedVariantId(id);
            }}
            className="space-y-2"
          >
            {event.variants.map((variant) => (
              <div key={variant.id} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={variant.id}
                  id={`variant-${variant.id}`}
                  disabled={variant.stock === 0}
                />
                <Label
                  htmlFor={`variant-${variant.id}`}
                  className={`font-normal ${
                    variant.stock === 0 ? 'text-gray-400 line-through' : ''
                  } ${selectedVariantId === variant.id ? 'font-semibold' : ''}`}
                >
                  {getVariantLabel(variant)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        ) : (
          <Select
            value={selectedVariantId ?? undefined}
            required
            onValueChange={(id) => {
              setSelectedVariantId(id);
            }}
          >
            <SelectTrigger
              id={typeId}
              ref={selectTriggerRef} // Still useful for focusing or other interactions
              className={'border invalid:border-red-500'} // Validity styling might need rethinking with custom logic
            >
              <SelectValue placeholder="Choose a ticket type" />
            </SelectTrigger>
            <SelectContent>
              {event.variants.map((variant) => (
                <SelectItem
                  key={variant.id}
                  value={variant.id}
                  disabled={variant.stock === 0}
                >
                  {getVariantLabel(variant)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="">
        <Label htmlFor={quantityId}>Quantity</Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={'outline'}
            onClick={decreaseQuantity}
            disabled={
              isPurchaseDisabled || quantity <= 1 || currentVariantStock === 0
            }
          >
            -
          </Button>
          <Input
            id={quantityId}
            placeholder="Qty"
            type="number"
            value={quantity}
            max={maxQuantityForSelectedVariant}
            min={currentVariantStock > 0 ? 1 : 0} // Min is 0 if sold out, else 1
            className="invalid:border-red-500 text-center w-16" // Made input smaller
            onChange={handleQuantityInputChange}
            disabled={isPurchaseDisabled || currentVariantStock === 0}
            readOnly={isPurchaseDisabled || currentVariantStock === 0} // Make it truly uneditable
          />
          <Button
            type="button"
            variant={'outline'}
            onClick={increaseQuantity}
            disabled={
              isPurchaseDisabled ||
              quantity >= maxQuantityForSelectedVariant ||
              currentVariantStock === 0
            }
          >
            +
          </Button>
        </div>
      </div>
      {event.eventExtras.length > 0 && (
        <div>
          <Label className="block font-medium text-sm mb-2">Add-ons</Label>
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
                disabled={isPurchaseDisabled || currentVariantStock === 0}
              />
            </div>
          ))}
        </div>
      )}
      <div className="bg-gray-100 p-4 rounded">
        <p className="text-sm text-gray-500">Total</p>
        <p className="text-xl font-bold">£{(price ?? 0).toFixed(2)}</p>
      </div>
      <ErrorBoundary
        fallbackRender={({ error }) => (
          <div className="border-red-600 border-2 rounded p-4 w-full text-sm text-red-900">
            <p className="font-semibold mb-2">An unexpected error occurred:</p>
            <p>
              {error.message ||
                'Please refresh and try again, or contact support if the issue persists.'}
            </p>
          </div>
        )}
      >
        <PayPalButton
          disabled={
            isPurchaseDisabled ||
            quantity === 0 ||
            createOrderMutation.isPending ||
            captureOrderMutation.isPending
          }
          onClick={async (_data, actions) => {
            // Custom validation before PayPal modal opens
            if (!selectedVariantId) {
              setError('Please select a ticket type.');
              if (selectTriggerRef.current && event.variants.length > 3) {
                // Highlight select if used
                selectTriggerRef.current.focus();
                selectTriggerRef.current.style.borderColor = 'red';
              }
              return actions.reject();
            }
            if (
              quantity === 0 &&
              selectedVariant &&
              selectedVariant.stock > 0
            ) {
              setError('Please select a quantity greater than 0.');
              return actions.reject();
            }
            if (
              quantity === 0 &&
              selectedVariant &&
              selectedVariant.stock === 0
            ) {
              setError('This ticket type is sold out.');
              return actions.reject();
            }
            if (quantity > maxQuantityForSelectedVariant) {
              setError(
                `You can only select up to ${maxQuantityForSelectedVariant} tickets for this type.`,
              );
              return actions.reject();
            }
            setError(undefined); // Clear error if validation passes
            return actions.resolve();
          }}
          createOrder={async () => {
            // This check is somewhat redundant if onClick validation is solid, but good as a safeguard
            if (!selectedVariant || !price || quantity === 0) {
              setError(
                'Cannot create order. Please check your selection and ensure the quantity is valid.',
              );
              throw new Error('Invalid selection for order creation');
            }
            // setError(undefined); // Already called earlier on variant change or successful validation pass
            try {
              const order = await createOrderMutation.mutateAsync({
                id: event.id,
                variantId: selectedVariant.id, // selectedVariant is guaranteed here by checks
                quantity,
                extras: extrasState,
              });
              if (!order.id) {
                // This case should ideally not happen if backend is robust
                throw new Error('Order ID was not returned from the server.');
              }
              return order.id;
            } catch (err: any) {
              console.error('Order creation failed:', err);
              // More user-friendly error based on potential issues
              if (
                err.message &&
                (err.message.includes('stock') ||
                  err.message.includes('variant'))
              ) {
                setError(
                  'There was an issue preparing your order. The selected ticket may have recently sold out or changed. Please refresh and try again.',
                );
              } else if (
                err.message === 'Order ID was not returned from the server.'
              ) {
                setError(
                  'Failed to initiate the order with our server. Please try again shortly.',
                );
              } else {
                setError(
                  'There was an issue preparing your order. Please double-check your selections and try again. If the problem persists, contact support.',
                );
              }
              throw err;
            }
          }}
          onApprove={async (data) => {
            try {
              const order = await captureOrderMutation.mutateAsync({
                id: data.orderID,
              });
              setOrderResult(order);
            } catch (err: any) {
              console.error('Order capture failed:', err);
              setError(
                'There was a problem finalizing your purchase. Please try again. If you continue to experience issues, please contact support.',
              );
            }
          }}
        />
        {(createOrderMutation.isPending || captureOrderMutation.isPending) && (
          <p className="text-sm text-yellow-700 mt-2 text-center animate-pulse">
            {createOrderMutation.isPending
              ? 'Preparing your order...'
              : 'Finalizing your purchase...'}
          </p>
        )}
      </ErrorBoundary>
    </form>
  );
};

type EventExtraProps = EventExtras & {
  value: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string | null; // Added from EventExtras type
};

const EventExtra: React.FC<EventExtraProps> = ({
  title,
  price,
  currency,
  id,
  onChange,
  value,
  disabled,
  description, // Destructure description
}) => {
  const labelId = `extra-label-${id}`;
  const descId = description ? `extra-desc-${id}` : undefined;

  return (
    <div className="flex items-start gap-2 my-2">
      {' '}
      {/* Increased gap slightly, items-start for alignment */}
      <Checkbox
        id={`extra-${id}`}
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={descId} // Link to description if it exists
        className="mt-0.5" // Adjust checkbox position slightly if label/desc is taller
      />
      <div className="grid gap-0.5">
        {' '}
        {/* Use grid for tight spacing between label and desc */}
        <Label
          htmlFor={`extra-${id}`}
          id={labelId}
          className={`font-light text-sm ${disabled ? 'text-gray-400' : ''}`}
        >
          {title}{' '}
          {price && price > 0 ? (
            <span className="text-gray-400">
              (+{currency} {price.toFixed(2)})
            </span>
          ) : null}
        </Label>
        {description && (
          <p
            id={descId}
            className={`text-xs text-muted-foreground ${disabled ? 'text-gray-400' : ''}`}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

export default EventForm;
