'use client';

import NextError from 'next/error';
import { useRouter } from 'next/router';
import EventItem2 from '~/components/event-item2/event-item2';

import type { NextPageWithLayout } from '~/pages/_app';
import { trpc } from '~/utils/trpc';

const EventViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;
  const eventQuery = trpc.event.byId.useQuery({ id }, { enabled: !!id });

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
  return <EventItem2 event={data} />;
};

export default EventViewPage;
