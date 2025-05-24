import Link from 'next/link';
import { AdminLayout } from '~/components/AdminLayout';
import { trpc } from '~/utils/trpc';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Badge } from '~/components/ui/badge';

const AdminPage = () => {
  const { data: user } = trpc.user.getUser.useQuery();
  const { data: events } = trpc.user.getUserEvents.useQuery();

  if (!user) return null;

  return (
    <div className="">
      <h1 className="text-3xl font-semibold mb-8">Events</h1>
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
                      className="size-1.5 rounded-full bg-emerald-500"
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

AdminPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>;
export default AdminPage;
