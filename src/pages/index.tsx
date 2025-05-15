import { trpc } from '../utils/trpc';
import type { NextPageWithLayout } from './_app';

import Link from 'next/link';

const IndexPage: NextPageWithLayout = () => {
  //const utils = trpc.useUtils();
  const eventsQuery = trpc.event.list.useQuery({
    filter: { enabled: true },
    limit: 5,
  });

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-bold mb-4">Events</h1>
      {eventsQuery.data?.items.map((event) => (
        <div key={event.id} className="mb-4">
          <h2 className="text-xl">
            <Link href={`/event/${event.id}`}>{event.title}</Link>
          </h2>
          <p>{event.text}</p>
        </div>
      ))}
    </div>
  );
};

export default IndexPage;

/**
 * If you want to statically render this page
 * - Export `appRouter` & `createContext` from [trpc].ts
 * - Make the `opts` object optional on `createContext()`
 *
 * @see https://trpc.io/docs/v11/ssg
 */
// export const getStaticProps = async (
//   context: GetStaticPropsContext<{ filter: string }>,
// ) => {
//   const ssg = createServerSideHelpers({
//     router: appRouter,
//     ctx: await createContext(),
//   });
//
//   await ssg.post.all.fetch();
//
//   return {
//     props: {
//       trpcState: ssg.dehydrate(),
//       filter: context.params?.filter ?? 'all',
//     },
//     revalidate: 1,
//   };
// };
