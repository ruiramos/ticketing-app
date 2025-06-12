import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, type ReactNode } from 'react';
import { trpc, type RouterOutput } from '~/utils/trpc';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from './ui/button';

type AdminLayoutProps = { children: ReactNode };
type GetUserOutput = RouterOutput['user']['getUser'];

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const { data: user } = trpc.user.getUser.useQuery();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      void signIn();
    }
  }, [status]);

  return (
    <>
      <Head>
        <title>Ticketing App - Admin</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen bg-gray-100">
        {!!user && <AdminHeader user={user} />}
        <div className="max-w-screen-xl mx-auto py-12 px-4">{children}</div>
      </main>
    </>
  );
};

const AdminHeader = ({ user }: { user: GetUserOutput }) => {
  const router = useRouter();
  
  const isEventsActive = router.pathname.startsWith('/admin') && !router.pathname.startsWith('/admin/organisation');
  const isOrganisationActive = router.pathname.startsWith('/admin/organisation');

  return (
    <div className="bg-white flex justify-between py-2 px-4 text-sm border-b border-gray-200 items-center">
      <div className="w-1/4">Ticketing Admin</div>
      <div className="flex gap-2 font-medium text-gray-400 items-center">
        <Link 
          href="/admin" 
          className={`no-underline ${isEventsActive ? 'text-primary' : 'hover:text-gray-500'}`}
        >
          Events
        </Link>
        <Link
          href="/admin/organisation"
          className={`no-underline ${isOrganisationActive ? 'text-primary' : 'hover:text-gray-500'}`}
        >
          Organisation
        </Link>
      </div>
      <div className="w-1/4 text-right text-muted-foreground">
        Hello {user?.name}!
        <Button
          variant="outline"
          size="sm"
          className="ml-2"
          onClick={() => void signOut({ callbackUrl: '/' })}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
};
