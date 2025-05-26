import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { trpc, type RouterOutput } from '~/utils/trpc';

type AdminLayoutProps = { children: ReactNode };
type GetUserOutput = RouterOutput['user']['getUser'];

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const { data: user } = trpc.user.getUser.useQuery();

  return (
    <>
      <Head>
        <title>Ticketing App - Admin</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen bg-gray-100">
        {!!user && <AdminHeader user={user} />}
        <div className="max-w-6xl mx-auto py-12">{children}</div>
      </main>
    </>
  );
};

const AdminHeader = ({ user }: { user: GetUserOutput }) => {
  return (
    <div className="bg-white flex justify-between py-3 px-4 text-sm border-b border-gray-200">
      <div className="w-1/4">Ticketing Admin</div>
      <div className="flex gap-2 font-medium text-gray-400">
        <Link href="/admin" className="no-underline text-primary">
          Events
        </Link>
        <Link href="#" className="no-underline hover:text-gray-500">
          Orders
        </Link>
      </div>
      <div className="w-1/4 text-right text-muted-foreground">
        Hello {user?.name}!
      </div>
    </div>
  );
};
