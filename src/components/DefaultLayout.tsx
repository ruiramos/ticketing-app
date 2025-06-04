import Head from 'next/head';
import type { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { cn } from '~/lib/utils';

type DefaultLayoutProps = { children: ReactNode };

export const DefaultLayout = ({ children }: DefaultLayoutProps) => {
  const router = useRouter();
  // embed can be "true", "false", true, false, or undefined in query
  const embed = router.query.embed === 'true' || 'embed' in router.query;

  return (
    <>
      <Head>
        <title>Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main
        className={cn(
          'min-h-screen lg:p-6 ',
          embed ? 'md:p-3 md:bg-gray-100 overflow-hidden' : 'p-2 bg-gray-100',
        )}
      >
        <div
          className={cn(
            'bg-white lg:p-8 lg:max-w-screen-xl lg:mx-auto',
            embed
              ? 'md:p-4 md:rounded md:shadow-sm overflow-hidden'
              : 'p-4 rounded shadow-sm',
          )}
        >
          {children}
        </div>
      </main>
    </>
  );
};
