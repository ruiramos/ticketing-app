import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession, signIn } from 'next-auth/react';
import { DefaultLayout } from '~/components/DefaultLayout';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { trpc } from '~/utils/trpc';
import { CheckCircle, XCircle, Building2 } from 'lucide-react';

const InviteAcceptancePage = () => {
  const router = useRouter();
  const { token } = router.query;
  const { status } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { data: invitationData, isLoading: isLoadingInvitation } =
    trpc.user.getInvitationByToken.useQuery(
      { token: token as string },
      {
        enabled:
          !!token && typeof token === 'string' && status === 'authenticated',
        retry: false,
      },
    );

  const acceptInvitationMutation = trpc.user.acceptInvitation.useMutation();

  const handleAcceptInvitation = async () => {
    if (!token || typeof token !== 'string') {
      setResult({
        success: false,
        message: 'Invalid invitation token',
      });
      return;
    }

    setIsProcessing(true);
    try {
      await acceptInvitationMutation.mutateAsync({ token });
      setResult({
        success: true,
        message:
          'Invitation accepted successfully! You are now a member of the organization.',
      });

      // Redirect to admin dashboard after 3 seconds
      setTimeout(() => {
        router.push('/admin');
      }, 3000);
    } catch (error: any) {
      setResult({
        success: false,
        message:
          error.message || 'Failed to accept invitation. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      signIn(undefined, { callbackUrl: window.location.href });
    }
  }, [status]);

  if (status === 'loading' || isLoadingInvitation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded mb-4 w-64"></div>
          <div className="h-32 bg-gray-300 rounded"></div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Sign In Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              Please sign in to accept the organization invitation.
            </p>
            <Button
              onClick={() =>
                signIn(undefined, { callbackUrl: window.location.href })
              }
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card>
        <CardContent className="space-y-6 pt-12 pb-12">
          {!result && !isProcessing && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <Building2 className="w-16 h-16 text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  You've been invited to join{' '}
                  {invitationData?.organizationName && (
                    <span className="text-blue-600">
                      {invitationData.organizationName}
                    </span>
                  )}
                  !
                </h2>
                <p className="text-muted-foreground mb-2">
                  {invitationData?.name && <>Hi {invitationData.name}, you</>}{' '}
                  have been invited to join{' '}
                  <span className="font-medium capitalize">
                    {invitationData?.organizationName}
                  </span>{' '}
                  on the <strong>Ticketing App</strong>. .
                </p>
                <p className="text-muted-foreground mb-6">
                  Click the button below to accept the invitation and become a
                  member of the organization.
                </p>
                <Button onClick={handleAcceptInvitation} size="lg">
                  Accept Invitation
                </Button>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
              </div>
              <p className="text-muted-foreground">
                Processing your invitation...
              </p>
            </div>
          )}

          {result && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                {result.success ? (
                  <CheckCircle className="w-16 h-16 text-green-500" />
                ) : (
                  <XCircle className="w-16 h-16 text-red-500" />
                )}
              </div>
              <div>
                <h2
                  className={`text-xl font-semibold mb-2 ${
                    result.success ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {result.success ? 'Success!' : 'Error'}
                </h2>
                <p className="text-muted-foreground mb-6">{result.message}</p>
                {result.success ? (
                  <p className="text-sm text-muted-foreground">
                    Redirecting to admin dashboard...
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Button onClick={handleAcceptInvitation} variant="outline">
                      Try Again
                    </Button>
                    <br />
                    <Button
                      onClick={() => router.push('/')}
                      variant="ghost"
                      size="sm"
                    >
                      Go to Home
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

InviteAcceptancePage.getLayout = (page: any) => (
  <DefaultLayout>{page}</DefaultLayout>
);

export default InviteAcceptancePage;
