'use client';

import { Calendar, Clock, MapPin, Users, Check, Mail } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Separator } from '~/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { differenceInDays, format } from 'date-fns';
import { RouterOutput } from '~/utils/trpc';

type OrderByIdOutput = RouterOutput['order']['byId'];

export default function OrderConfirmation({
  order,
}: {
  order: OrderByIdOutput;
}) {
  if (!order) return;

  const event = order.event;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-violet-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8"></div>

        {/* Success Banner */}
        <div className="bg-gradient-to-r from-purple-600 to-violet-700 rounded-lg p-6 mb-8 text-white flex items-center gap-4">
          <div className="bg-white/20 rounded-full p-2">
            <Check className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Booking Confirmed!</h1>
            <p className="text-purple-100">
              Your tickets have been sent to your email address.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Order Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Details */}
            <Card className="overflow-hidden border-purple-200">
              <div className="relative h-32 bg-gradient-to-r from-purple-500 to-violet-600">
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-4 left-4 text-white">
                  <h1 className="text-2xl font-bold mb-1">{event.title}</h1>
                  <div className="flex items-center gap-4 text-sm">
                    {/*
                    <Badge className="bg-amber-400 text-purple-900 font-medium">
                      Wildlife Experience
                    </Badge>
                      */}
                  </div>
                </div>
              </div>
              <CardContent className="pt-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Date</p>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-purple-500" />
                      <p className="font-medium">
                        {format(event.startsAt, 'dd MMM yyyy')}
                        {event.endsAt &&
                        differenceInDays(event.endsAt, event.startsAt) > 1
                          ? ` - ${format(event.endsAt, 'dd MMM yyyy')}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Time</p>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-purple-500" />
                      <p className="font-medium">
                        {format(event.startsAt, 'hh:mmaaa')}
                        {event.endsAt &&
                        differenceInDays(event.endsAt, event.startsAt) < 1
                          ? ` - ${format(event.endsAt, 'hh:mmaaa')}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Location</p>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-purple-500" />
                      <p className="font-medium">{event.location}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Booking Information */}
            <Card className="border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Booking Information
                  <Badge
                    variant="outline"
                    className="border-purple-300 text-purple-700"
                  >
                    {order?.externalId}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Please save your booking reference for future inquiries
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">
                        Tickets
                      </h3>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-purple-500" />
                        <p className="font-medium">
                          {order.quantity} x {order.variant.title}
                        </p>
                      </div>
                    </div>

                    <div>
                      {(order.selectedExtras as any[]).length ? (
                        <h3 className="text-sm font-medium text-gray-500 mb-1">
                          Add-ons
                        </h3>
                      ) : null}
                      {(order.selectedExtras as any[]).map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-amber-500" />
                          <p className="font-medium">{item.title}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">
                        Payment
                      </h3>
                      <p className="font-medium">{order.}</p>
                      <p className="text-sm text-gray-500">
                        Processed on {order.paymentDate}
                      </p>
                    </div> */}

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">
                        Contact
                      </h3>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-purple-500" />
                        <p className="font-medium">
                          {(order.customer as any).emailAddress}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem
                    value="location-details"
                    className="border-purple-200"
                  >
                    <AccordionTrigger className="text-sm font-medium text-purple-700 hover:text-purple-900 hover:no-underline">
                      Event Details
                    </AccordionTrigger>
                    <AccordionContent>
                      {event.text
                        .split('\n\n')
                        .slice(0, -1)
                        .join('\n\n')
                        .split('\n')
                        .map((txt) => (
                          <p className="text-gray-600 mb-2">{txt}</p>
                        ))}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem
                    value="important-info"
                    className="border-purple-200"
                  >
                    <AccordionTrigger className="text-sm font-medium text-purple-700 hover:text-purple-900 hover:no-underline">
                      Important Information
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-1 text-gray-600 list-disc pl-6">
                        {event.text
                          ?.split('\n\n')
                          ?.at(-1)
                          ?.split('\n')
                          .map((txt) => (
                            <li className="text-gray-600 mb-2">
                              {txt.slice(2)}
                            </li>
                          ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>

          {/* Order Summary */}
          <div className="space-y-6">
            <Card className="sticky top-4 border-purple-200">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      {order.variant.title} ({order.quantity}x)
                    </span>
                    <span>
                      £{(order.quantity * order.variant.price).toFixed(2)}
                    </span>
                  </div>
                  {(order.selectedExtras as any[]).map((addon, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>{addon.title}</span>
                      <span>£{addon.price?.toFixed(2)}</span>
                    </div>
                  ))}
                  <Separator className="bg-purple-200" />
                  <div className="flex justify-between font-semibold">
                    <span>Total Paid</span>
                    <span>£{order.amount?.toFixed(2)}</span>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="w-5 h-5 text-green-500" />
                    <p className="font-medium text-green-700">
                      Payment Successful
                    </p>
                  </div>
                  <p className="text-xs text-gray-600">
                    Your payment was processed successfully. A receipt has been
                    sent to your email.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Need Help */}
            <Card className="border-purple-200">
              <CardHeader>
                <CardTitle className="text-base">Need Help?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  If you have any questions about your booking, please contact
                  us:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-purple-500" />
                    <a
                      href="mailto:help@summerfair.com"
                      className="text-purple-700 hover:underline"
                    >
                      {order.event.organization?.email}
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
