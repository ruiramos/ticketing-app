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

      <main className="h-screen p-3 lg:p-6 bg-gray-100">
        <div className="bg-white p-3 lg:p-6">{children}</div>
      </main>
    </>
  );
};
