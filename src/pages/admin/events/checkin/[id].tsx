import { useRouter } from 'next/router';
import { useState, useMemo } from 'react';
import { AdminLayout } from '~/components/AdminLayout';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { trpc } from '~/utils/trpc';
import {
  ArrowLeft,
  Search,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { cx } from 'class-variance-authority';

const CheckinPage = () => {
  const id = useRouter().query.id as string;
  const [search, setSearch] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');

  const { data: event } = trpc.user.getUserEvent.useQuery(
    { eventId: id },
    { enabled: !!id },
  );

  const { data: orders = [], refetch: refetchOrders } =
    trpc.order.getOrdersForCheckin.useQuery(
      {
        eventId: id,
        search: search.trim() || undefined,
        variantId: selectedVariant || undefined,
      },
      {
        enabled: !!id,
        refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
      },
    );

  const toggleCheckinMutation = trpc.order.toggleCheckin.useMutation({
    onSuccess: () => {
      refetchOrders();
    },
  });

  const handleToggleCheckin = async (orderId: string) => {
    try {
      await toggleCheckinMutation.mutateAsync({ orderId });
    } catch (error) {
      console.error('Failed to toggle check-in:', error);
      alert('Failed to update check-in status. Please try again.');
    }
  };

  const stats = useMemo(() => {
    const checkedInCount = orders.filter((order) => order.checkedIn).length;
    const totalTickets = orders.reduce(
      (sum, order) => sum + (order.checkedIn ? order.quantity : 0),
      0,
    );
    const totalExpected = orders.reduce(
      (sum, order) => sum + order.quantity,
      0,
    );

    return {
      checkedInOrders: checkedInCount,
      totalOrders: orders.length,
      checkedInTickets: totalTickets,
      totalExpected,
      checkedInPercentage:
        orders.length > 0
          ? Math.round((checkedInCount / orders.length) * 100)
          : 0,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.sort((a, b) => {
      // Sort by checked-in status (unchecked first), then by creation date
      if (a.checkedIn !== b.checkedIn) {
        return a.checkedIn ? 1 : -1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders]);

  if (!event) return null;

  return (
    <div>
      <div className="flex flex-col gap-2 mb-4">
        <Link
          href={`/admin/events/${id}`}
          className="text-xs flex items-center"
        >
          <ArrowLeft className="w-3 h-3 mr-1 inline" />
          Back to event details
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start mb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-semibold inline-block">
              Check-in: {event.title}
            </h1>
            <Badge variant={'outline'}>
              <UserCheck className="w-3 h-3 mr-1" />
              Door Check-in
            </Badge>
          </div>
          <p className="text-muted-foreground font-medium text-sm">
            {event.startsAt.toLocaleString()}
            {event.endsAt ? ` - ${event.endsAt.toLocaleString()}` : ''}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Checked In
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-green-600">
              {stats.checkedInOrders} / {stats.totalOrders}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.checkedInPercentage}% of orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              People Checked In
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-blue-600">
              {stats.checkedInTickets} / {stats.totalExpected}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Individual tickets
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-orange-600">
              {stats.totalOrders - stats.checkedInOrders}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Orders awaiting check-in
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">
              {stats.checkedInPercentage}%
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${stats.checkedInPercentage}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <Label htmlFor="search" className="text-sm font-medium mb-2 block">
            Search by name or email
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Start typing name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="w-full md:w-64">
          <Label htmlFor="variant" className="text-sm font-medium mb-2 block">
            Filter by ticket type
          </Label>
          <Select
            value={selectedVariant}
            onValueChange={(value) =>
              setSelectedVariant(value === '-1' ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All ticket types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-1">All ticket types</SelectItem>
              {event.variants.map((variant) => (
                <SelectItem key={variant.id} value={variant.id}>
                  {variant.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Orders ({filteredOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Status</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ticket Type</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Extras</TableHead>
                <TableHead>Custom Fields</TableHead>
                <TableHead>Check-in Time</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow
                  key={order.id}
                  className={cx(
                    'transition-colors',
                    order.checkedIn
                      ? 'bg-green-50 hover:bg-green-100'
                      : 'hover:bg-gray-50',
                  )}
                >
                  <TableCell>
                    <Badge
                      variant={order.checkedIn ? 'default' : 'secondary'}
                      className={cx(
                        'font-medium',
                        order.checkedIn
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : '',
                      )}
                    >
                      {order.checkedIn ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Checked In
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3 mr-1" />
                          Pending
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {(order.customer as any)?.name?.givenName || ''}{' '}
                    {(order.customer as any)?.name?.surname || ''}
                  </TableCell>
                  <TableCell>
                    {(order.customer as any)?.emailAddress || ''}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{order.variant.title}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{order.quantity}</span>
                  </TableCell>
                  <TableCell>
                    {((order.selectedExtras as any[]) || []).map(
                      (extra, index) => (
                        <div key={index} className="text-xs">
                          {extra.title} ({extra.quantity})
                        </div>
                      ),
                    )}
                  </TableCell>
                  <TableHead>
                    {Object.values(order.customFieldResponses || {}).map(
                      (value, index) => (
                        <div key={index} className="text-xs">
                          {value.fieldLabel}: {value.value}
                        </div>
                      ),
                    )}
                  </TableHead>
                  <TableCell>
                    {order.checkedInAt ? (
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.checkedInAt).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={order.checkedIn ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => handleToggleCheckin(order.id)}
                      disabled={toggleCheckinMutation.isPending}
                      className={cx(
                        order.checkedIn
                          ? 'text-red-600 hover:text-red-700'
                          : 'bg-green-600 hover:bg-green-700',
                      )}
                    >
                      {order.checkedIn ? (
                        <>
                          <UserX className="w-4 h-4 mr-1" />
                          Undo
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4 mr-1" />
                          Check In
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredOrders.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {search || selectedVariant
                ? 'No orders match your filters.'
                : 'No orders found for this event.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

CheckinPage.getLayout = (page: any) => <AdminLayout>{page}</AdminLayout>;
export default CheckinPage;
