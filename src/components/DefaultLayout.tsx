import Head from 'next/head';
import type { ReactNode } from 'react';

type DefaultLayoutProps = { children: ReactNode };

export const DefaultLayout = ({ children }: DefaultLayoutProps) => {
  return (
    <>
      <Head>
        <title>Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen p-3 lg:p-6 bg-gray-100">
        <div className="bg-white p-6 lg:p-8 lg:max-w-screen-xl lg:mx-auto rounded shadow-sm">
          {children}
        </div>
      </main>
    </>
  );
};
