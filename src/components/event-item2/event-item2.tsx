'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Gift,
  Minus,
  Plus,
  Star,
  Lock,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Badge } from '~/components/ui/badge';
import { Separator } from '~/components/ui/separator';
import { RouterOutput, trpc } from '~/utils/trpc';
import { differenceInDays, format } from 'date-fns';
import { LAST_FEW_STOCK_WARNING, EVENT_MAX_TICKETS } from '~/utils/contants';
import { cn } from '~/lib/utils';
import { EventExtras, Variant } from '~/generated/prisma/client';
import EventExtra from '../event-extra/event-extra';
import PayPalButton from '../PayPalButton';
import { Label } from '../ui/label';
import { useRouter } from 'next/navigation';

type EventByIdOutput = RouterOutput['event']['byId'];

export default function EventItem({ event }: { event: EventByIdOutput }) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [extrasState, setExtrasState] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | undefined>();
  const router = useRouter();

  const typeId = useId(); // For radio group label or select label
  const selectTriggerRef = useRef<HTMLButtonElement>(null); // Keep for select, radio won't need it for border
  const createOrderMutation = trpc.order.createOrder.useMutation();
  const captureOrderMutation = trpc.order.captureOrder.useMutation();

  const uniquePrices = new Set(event.variants.map((variant) => variant.price));
  const areAllVariantsSamePrice = uniquePrices.size === 1;

  const selectedVariant = useMemo(() => {
    return event.variants.find((v) => v.id === selectedVariantId) ?? null;
  }, [selectedVariantId, event.variants]);

  useEffect(() => {
    if (selectedVariantId) {
      setError(undefined);
    }
  }, [selectedVariantId]);

  const selectedExtras = useMemo(() => {
    return Object.entries(extrasState)
      .filter(([_, value]) => Boolean(value))
      .map(([id]) => event.eventExtras.find((extra) => extra.id === id))
      .filter(
        (extra): extra is NonNullable<typeof extra> => extra !== undefined,
      );
  }, [extrasState, event.eventExtras]);

  const price = useMemo(() => {
    if (!selectedVariant || quantity === 0) return null;

    return (
      selectedVariant.price * quantity +
      selectedExtras.reduce((acc, extra) => {
        return acc + (extra.price ?? 0);
      }, 0)
    );
  }, [selectedVariant, quantity, selectedExtras]);

  const getVariantLabel = (variant: Variant) => {
    let label = `${variant.title}${areAllVariantsSamePrice ? '' : ` - £${variant.price.toFixed(2)}`}`;
    if (variant.stock === 0) {
      label += ' (Sold out)';
    } else if (variant.stock <= LAST_FEW_STOCK_WARNING) {
      label += ` (Last few!)`;
    }
    return label;
  };

  const isPurchaseDisabled = !selectedVariant;

  return (
    <>
      {/* Header */}
      <div className="lg:mb-8"></div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Event Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero Section */}
          <Card className="overflow-hidden border-purple-200">
            <div className="relative h-40 lg:h-64 bg-gradient-to-r from-purple-500 to-violet-600">
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute bottom-4 left-4 text-white right-1">
                <h1 className="text-3xl lg:text-4xl font-bold mb-2">
                  {event.title}
                </h1>
                <div className="flex items-center gap-4 text-xs lg:text-sm">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {format(event.startsAt, 'dd MMM yyyy')}
                    {event.endsAt &&
                    differenceInDays(event.endsAt, event.startsAt) > 1
                      ? ` - ${format(event.endsAt, 'dd MMM yyyy')}`
                      : ''}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {format(event.startsAt, 'hh:mmaaa')}
                    {event.endsAt &&
                    differenceInDays(event.endsAt, event.startsAt) < 1
                      ? ` - ${format(event.endsAt, 'hh:mmaaa')}`
                      : ''}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {event.location}
                  </div>
                </div>
              </div>
              {/* <Badge className="absolute top-4 right-4 bg-amber-400 text-purple-900 font-medium">
                  Wildlife Experience
                </Badge> */}
            </div>
          </Card>

          {/* Event Description */}
          <Card className="border-purple-200">
            <CardHeader className="pb-3 lg:pb-6">
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" />
                {event.text.split('\n\n')[0].split('\n')[0]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-700 text-sm lg:text-base lg:leading-relaxed whitespace-pre-wrap">
                {event.text.split('\n\n').slice(1, -1).join('\n\n')}
              </p>

              <div className="grid md:grid-cols-1 gap-4">
                {/*
                  <div className="space-y-3">
                    <h4 className="font-semibold text-purple-700">
                      What You'll Experience:
                    </h4>
                    <ul className="space-y-1 text-sm text-gray-600">
                      <li>• Meet and touch amazing animals</li>
                      <li>• Learn about their habitats and behavior</li>
                      <li>• Take home a special memento</li>
                      <li>• Educational and fun for all ages</li>
                    </ul>
                  </div> */}

                <div className="space-y-3">
                  <h4 className="font-semibold text-violet-700">
                    Important Information:
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-600 list-disc pl-6">
                    {event.text
                      .split('\n\n')
                      .slice(-1)[0]
                      .split('\n')
                      .map((txt) => (
                        <li>{txt.slice(2)}</li>
                      ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Booking Panel */}
        <div className="space-y-6">
          <Card className="lg:sticky top-4 border-purple-200">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Book Your Experience
                {areAllVariantsSamePrice ? (
                  <Badge
                    variant="secondary"
                    className="bg-purple-100 text-purple-800"
                  >
                    £{uniquePrices.values().next().value?.toFixed(2)} per person
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && ( // Simplified error display
                <div className="border-red-600 border-2 rounded p-4 w-full text-sm text-red-900">
                  {error}
                </div>
              )}
              {/* Time Slot Selection */}
              <div className="space-y-3">
                <Label htmlFor={typeId}>1. Select a time slot</Label>
                <Select
                  value={selectedVariantId ?? undefined}
                  onValueChange={setSelectedVariantId}
                >
                  <SelectTrigger
                    className="border-purple-200 focus:ring-purple-500"
                    id={typeId}
                  >
                    <SelectValue placeholder="Choose your preferred time" />
                  </SelectTrigger>
                  <SelectContent>
                    {event.variants.map((variant) => (
                      <SelectItem
                        key={variant.id}
                        value={variant.id}
                        disabled={variant.stock === 0}
                        className={
                          !variant.stock ? 'text-gray-400 cursor-no-drop' : ''
                        }
                      >
                        <div className="flex items-center">
                          <span
                            className={cn(
                              'size-1.5 rounded-full bg-emerald-500 inline-block mr-2 ml-1',
                              variant.stock <= LAST_FEW_STOCK_WARNING &&
                                'bg-orange-400',
                              !variant.stock && 'bg-gray-400',
                            )}
                            aria-hidden="true"
                          ></span>
                          {getVariantLabel(variant)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ticket Quantity */}
              <div className="space-y-3">
                <Label>2. Number of tickets</Label>
                <div className="flex items-center justify-between bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-purple-500" />
                    <span className="text-sm">Tickets</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={isPurchaseDisabled || quantity <= 1}
                      className="border-purple-200 hover:bg-purple-50"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span
                      className={cn(
                        'w-8 text-center font-medium',
                        isPurchaseDisabled ? 'text-gray-400' : '',
                      )}
                    >
                      {quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        isPurchaseDisabled || quantity >= EVENT_MAX_TICKETS
                      }
                      onClick={() =>
                        setQuantity(Math.min(quantity + 1, EVENT_MAX_TICKETS))
                      }
                      className="border-purple-200 hover:bg-purple-50"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Add-ons */}
              <div className="space-y-3">
                <label className="text-sm font-medium">
                  3. Optional add-ons
                </label>
                <div className="flex items-center space-x-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
                  {event.eventExtras.map((e) => (
                    <div key={e.id}>
                      <EventExtra
                        {...e}
                        value={extrasState[e.id]}
                        onChange={(value: boolean) => {
                          setExtrasState((prevState) => ({
                            ...prevState,
                            [e.id]: value,
                          }));
                        }}
                        disabled={isPurchaseDisabled}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator className="bg-purple-200" />

              {/* Total */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  {selectedVariant ? (
                    <>
                      <span>
                        Tickets ({quantity}x - {selectedVariant.title})
                      </span>
                      <span>
                        £{(quantity * selectedVariant?.price).toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>Tickets</span>
                      <span>£-</span>
                    </>
                  )}
                </div>
                {selectedExtras?.map((value: EventExtras) => (
                  <div className="flex justify-between text-sm">
                    <span>{value.title}</span>
                    <span>£{value.price?.toFixed(2)}</span>
                  </div>
                ))}
                <Separator className="bg-purple-200" />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>£{price?.toFixed(2) || ' - '}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="space-y-3 block">
              <div className="relative z-10">
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
                      setError('Please select a time slot first.');
                      if (
                        selectTriggerRef.current &&
                        event.variants.length > 3
                      ) {
                        // Highlight select if used
                        selectTriggerRef.current.focus();
                        selectTriggerRef.current.style.borderColor = 'red';
                      }
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
                    try {
                      const order = await createOrderMutation.mutateAsync({
                        id: event.id,
                        variantId: selectedVariant.id, // selectedVariant is guaranteed here by checks
                        quantity,
                        extras: extrasState,
                      });
                      if (!order.id) {
                        // This case should ideally not happen if backend is robust
                        throw new Error(
                          'Order ID was not returned from the server.',
                        );
                      }
                      return order.id;
                    } catch (err: any) {
                      console.error('Order creation failed:', err);
                      // More user-friendly error based on potential issues
                      setError(
                        err.message ||
                          'There was an issue preparing your order. Please double-check your selections and try again. If the problem persists, contact support.',
                      );

                      throw err;
                    }
                  }}
                  onApprove={async (data) => {
                    try {
                      const order = await captureOrderMutation.mutateAsync({
                        id: data.orderID,
                      });

                      router.push(`/events/${event.id}/orders/${order.id}`);
                    } catch (err: any) {
                      console.error('Order capture failed:', err);
                      setError(
                        'There was a problem finalizing your purchase. Please try again. If you continue to experience issues, please contact support.',
                      );
                    }
                  }}
                />
              </div>
            </CardFooter>
          </Card>

          {/* Trust Indicators */}
          <Card className="border-purple-200">
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <div className="flex justify-center items-center gap-2 text-sm text-gray-600">
                  <Gift className="w-4 h-4 text-purple-500" />
                  <span>Instant booking confirmation</span>
                </div>
                <div className="flex justify-center items-center gap-2 text-sm text-gray-600">
                  <Lock className="w-4 h-4 text-purple-500" />
                  <span>Secure payment powered by PayPal</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
