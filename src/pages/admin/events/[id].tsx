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
import { Download, Edit, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';

const EventAdminPage = () => {
  const id = useRouter().query.id as string;
  const [showExpiredOrders, setShowExpiredOrders] = useState(false);
  const { data: event } = trpc.user.getUserEvent.useQuery(
    { eventId: id },
    { enabled: !!id },
  );
  const { data: orders } = trpc.user.getUserEventOrders.useQuery(
    { eventId: id },
    { enabled: !!id },
  );

  if (!event || !orders) return null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Events
          </Link>
        </Button>
      </div>
      
      <div className="flex items-start justify-between">
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
            {event.text}
          </p>
          <p className="text-muted-foreground font-medium text-sm">
            {event.startsAt.toLocaleString()}
            {event.endsAt ? ` - ${event.endsAt.toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button variant={'outline'} asChild>
            <Link href={`/admin/events/edit/${id}`}>
              <Edit className="-ms-1 opacity-60" size={16} />
              <span>Edit Event</span>
            </Link>
          </Button>
          <Button variant={'outline'}>
            <Download className="-ms-1 opacity-60" size={16} />
            <span>Export Orders</span>
          </Button>
        </div>
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
