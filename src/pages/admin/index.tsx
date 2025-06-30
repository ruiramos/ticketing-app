import Link from 'next/link';
import { AdminLayout } from '~/components/AdminLayout';
import { trpc } from '~/utils/trpc';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Plus } from 'lucide-react';
import { cx } from 'class-variance-authority';
const AdminPage = () => {
  const { data: user } = trpc.user.getUser.useQuery();
  const { data: events } = trpc.user.getUserEvents.useQuery();

  if (!user) return null;

  return (
    <div className="">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">Events</h1>
        <Button variant={'default'} asChild>
          <Link href="/admin/events/new" className="no-underline">
            <Plus className="w-4 h-4" />
            Create New Event
          </Link>
        </Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(events || []).map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/events/${event.id}`}>{event.title}</Link>
                </TableCell>
                <TableCell>
                  {event.startsAt.toLocaleString()}
                  {event.endsAt ? ` - ${event.endsAt.toLocaleString()}` : ''}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    <span
                      className={cx(
                        'size-1.5 rounded-full mx-0.5',
                        event.enabled ? 'bg-emerald-500' : 'bg-gray-500',
                      )}
                      aria-hidden="true"
                    ></span>
                    {event.enabled ? 'Live' : 'Disabled'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

AdminPage.getLayout = (page: any) => <AdminLayout>{page}</AdminLayout>;
export default AdminPage;
