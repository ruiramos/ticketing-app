import Head from 'next/head';
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

type DefaultLayoutProps = { children: ReactNode };

export const DefaultLayout = ({ children }: DefaultLayoutProps) => {
  return (
    <>
      <Head>
        <title>Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        className={cn(
          'min-h-screen p-4',
          'bg-gradient-to-br from-purple-50 to-violet-100',
        )}
      >
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
      {/*
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
       */}
    </>
  );
};
