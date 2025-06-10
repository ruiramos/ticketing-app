import { useRouter } from 'next/router';
import { useState } from 'react';
import { AdminLayout } from '~/components/AdminLayout';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

import { trpc } from '~/utils/trpc';
import {
  Download,
  Edit,
  ArrowLeft,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';

const EventAdminPage = () => {
  const id = useRouter().query.id as string;
  const [showExpiredOrders, setShowExpiredOrders] = useState(false);
  const { data: event, refetch: refetchEvent } =
    trpc.user.getUserEvent.useQuery({ eventId: id }, { enabled: !!id });
  const { data: orders, refetch: refetchOrders } =
    trpc.user.getUserEventOrders.useQuery({ eventId: id }, { enabled: !!id });

  const cancelOrderMutation = trpc.order.cancelOrder.useMutation({
    onSuccess: () => {
      refetchOrders();
      refetchEvent();
    },
  });

  const handleCancelOrder = async (orderId: string) => {
    if (
      confirm(
        'Are you sure you want to cancel this order? This action cannot be undone.',
      )
    ) {
      try {
        await cancelOrderMutation.mutateAsync({ orderId });
      } catch (error) {
        console.error('Failed to cancel order:', error);
        alert('Failed to cancel order. Please try again.');
      }
    }
  };

  if (!event || !orders) return null;

  return (
    <div>
      <div className="flex flex-col gap-2 mb-2">
        <Link href="/admin" className="text-xs flex items-center">
          <ArrowLeft className="w-3 h-3 mr-1 inline" />
          Back to all events
        </Link>
      </div>

      <div className="">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-semibold inline-block">
                {event.title}
              </h1>
              <Badge variant={'outline'}>
                <span
                  className="size-1.5 rounded-full bg-emerald-500 mx-0.5"
                  aria-hidden="true"
                ></span>
                {event.enabled ? 'Live' : 'Disabled'}
              </Badge>
            </div>
            <p className="text-muted-foreground font-medium text-sm">
              {event.startsAt.toLocaleString()}
              {event.endsAt ? ` - ${event.endsAt.toLocaleString()}` : ''}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <Button variant={'link'} asChild size={'sm'}>
              <Link
                href={`/events/${id}`}
                target="_blank"
                className="underline"
              >
                <SquareArrowOutUpRight className="-ms-1 opacity-60" size={16} />
                <span>View Event</span>
              </Link>
            </Button>
            <Button variant={'outline'} asChild size={'sm'}>
              <Link href={`/admin/events/edit/${id}`} className="no-underline">
                <Edit className="-ms-1 opacity-60" size={16} />
                <span>Edit Event</span>
              </Link>
            </Button>
            <Button variant={'outline'} size={'sm'}>
              <Download className="-ms-1 opacity-60" size={16} />
              <span>Export Orders</span>
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground font-medium text-sm whitespace-pre-wrap mt-4">
          {event.text}
        </p>
      </div>

      <h2 className="text-xl font-semibold mt-8 mb-4">Variants</h2>

      <Table className="bg-white">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Stock left</TableHead>
            <TableHead>Confirmed Orders</TableHead>
            <TableHead>Pending Orders</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(event.variants || []).map((variant) => (
            <TableRow key={variant.id}>
              <TableCell className="font-medium">{variant.title}</TableCell>
              <TableCell>
                {variant.currency} {variant.price}
              </TableCell>
              <TableCell>{variant.stock}</TableCell>
              <TableCell>
                {
                  variant.orders.filter((order) => order.status === 'CONFIRMED')
                    .length
                }
              </TableCell>
              <TableCell>
                {
                  variant.orders.filter((order) => order.status === 'RESERVED')
                    .length
                }
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h2 className="text-xl font-semibold mt-8 mb-4">Extras</h2>

      <Table className="bg-white">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Confirmed Orders</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(event.eventExtras || []).map((extra) => (
            <TableRow key={extra.id}>
              <TableCell className="font-medium">{extra.title}</TableCell>
              <TableCell>
                {extra.currency} {extra.price}
              </TableCell>
              <TableCell>
                {orders
                  .filter((order) => order.status === 'CONFIRMED')
                  .reduce((total, order) => {
                    const selectedExtra = (
                      (order.selectedExtras as any[]) || []
                    ).find((sel) => sel.id === extra.id);
                    return total + (selectedExtra?.quantity || 0);
                  }, 0)}
              </TableCell>
              <TableCell>{extra.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between mt-8 mb-4">
        <h2 className="text-xl font-semibold">Orders</h2>
        <div>
          <Checkbox
            id={`show-expired-orders`}
            checked={showExpiredOrders}
            onCheckedChange={(checked) => setShowExpiredOrders(!!checked)}
          />{' '}
          <Label htmlFor={`show-expired-orders`} className="font-normal">
            Show expired orders
          </Label>
        </div>
      </div>

      <Table className="bg-white">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>External ID</TableHead>
            <TableHead>Transaction ID</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Extras</TableHead>
            <TableHead>Grand Total</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Customer name</TableHead>
            <TableHead>Customer email</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders
            .filter((order) => showExpiredOrders || order.status !== 'EXPIRED')
            .map((order) => (
              <TableRow
                key={order.id}
                className={
                  order.status === 'EXPIRED'
                    ? 'bg-gray-100 hover:bg-gray-100 text-gray-500'
                    : order.status === 'RESERVED'
                      ? 'bg-gray-50 hover:bg-gray-100'
                      : order.status === 'CANCELLED'
                        ? 'bg-red-50 hover:bg-red-100'
                        : ''
                }
              >
                <TableCell>{order.createdAt.toLocaleString()}</TableCell>
                <TableCell>{order.status}</TableCell>
                <TableCell>{order.externalId}</TableCell>
                <TableCell>{order.externalTransactionId}</TableCell>
                <TableCell>{order.variant.title}</TableCell>
                <TableCell>{order.quantity}</TableCell>
                <TableCell>
                  {((order.selectedExtras as any[]) || []).map((extra) => (
                    <p>
                      {extra.title} ({extra.quantity})
                    </p>
                  ))}
                </TableCell>
                <TableCell>{order.amount}</TableCell>
                <TableCell>{order.currency}</TableCell>
                <TableCell>
                  {(order.customer as any)?.name?.givenName}{' '}
                  {(order.customer as any)?.name?.surname}
                </TableCell>
                <TableCell>{(order.customer as any)?.emailAddress}</TableCell>
                <TableCell>
                  {order.status === 'CONFIRMED' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancelOrder(order.id)}
                      disabled={cancelOrderMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      {/* <h3 className="mt-4 font-semibold">Variant info</h3>
      {event.variants.map((variant) => {
        return (
          <div className="mb-4">
            <p>Name: {variant.title}</p>
            <p>
              Price: {variant.currency} {variant.price}
            </p>
            <p>Stock left: {variant.stock}</p>
            {variant.orders.length > 0 && (
              <VariantOrderTable orders={variant.orders} />
            )}
          </div>
        );
      })}
      <h3 className="mt-4 font-semibold">Available extras:</h3>
      {event.eventExtras.map((extra) => JSON.stringify(extra))} */}
    </div>
  );
};

EventAdminPage.getLayout = (page: any) => <AdminLayout>{page}</AdminLayout>;
export default EventAdminPage;
