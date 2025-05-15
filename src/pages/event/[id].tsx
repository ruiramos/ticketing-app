import NextError from 'next/error';
import { useRouter } from 'next/router';
import EventItem from '~/components/event-item/event-item';

import type { NextPageWithLayout } from '~/pages/_app';
import { trpc } from '~/utils/trpc';

const EventViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;
  const eventQuery = trpc.event.byId.useQuery({ id });

  if (eventQuery.error) {
    return (
      <NextError
        title={eventQuery.error.message}
        statusCode={eventQuery.error.data?.httpStatus ?? 500}
      />
    );
  }

  if (eventQuery.status !== 'success') {
    return <div>Loading...</div>;
  }
  const { data } = eventQuery;
  return <EventItem event={data} />;
};

export default EventViewPage;
