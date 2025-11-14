import { AdminLayout } from '~/components/AdminLayout';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { trpc } from '~/utils/trpc';
import { RoleEnum, type Role } from '~/lib/schemas';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Users,
  Plus,
  Trash2,
} from 'lucide-react';

const OrganisationDashboard = () => {
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<Role>('USER');

  const { data: organization, refetch } = trpc.user.getOrganization.useQuery();

  const { data: invitations, refetch: refetchInvitations } =
    trpc.user.getOrganizationInvitations.useQuery();

  const inviteMemberMutation = trpc.user.inviteOrganizationMember.useMutation({
    onSuccess: () => {
      refetch();
      refetchInvitations();
      setIsAddMemberOpen(false);
      setNewMemberEmail('');
      setNewMemberName('');
      setNewMemberRole('USER');
    },
  });

  const cancelInvitationMutation = trpc.user.cancelInvitation.useMutation({
    onSuccess: () => {
      refetchInvitations();
    },
  });

  const removeMemberMutation = trpc.user.removeOrganizationMember.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inviteMemberMutation.mutateAsync({
        email: newMemberEmail,
        name: newMemberName,
        role: newMemberRole,
      });
      alert(
        'Invitation sent successfully! The user will receive an email to join the organization.',
      );
    } catch (error) {
      console.error('Failed to send invitation:', error);
      alert(`Failed to send invitation: ${(error as Error).message}.`);
    }
  };

  const handleCancelInvitation = async (
    invitationId: string,
    email: string,
  ) => {
    if (
      confirm(`Are you sure you want to cancel the invitation for ${email}?`)
    ) {
      try {
        await cancelInvitationMutation.mutateAsync({ invitationId });
      } catch (error) {
        console.error('Failed to cancel invitation:', error);
        alert('Failed to cancel invitation. Please try again.');
      }
    }
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (
      confirm(
        `Are you sure you want to remove ${userName} from the organization? This action cannot be undone.`,
      )
    ) {
      try {
        await removeMemberMutation.mutateAsync({ userId });
      } catch (error) {
        console.error('Failed to remove member:', error);
        alert('Failed to remove member. Please try again.');
      }
    }
  };

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded mb-4 w-64"></div>
          <div className="h-64 bg-gray-300 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Organization Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your organization details and team members
        </p>
      </div>

      {/* Organization Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Organization Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {organization.name}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{organization.email}</span>
                </div>
                {organization.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{organization.phone}</span>
                  </div>
                )}
                {(organization.address || organization.city) && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {[
                        organization.address,
                        organization.city,
                        organization.postCode,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
                {organization.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <a
                      href={organization.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {organization.website}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {organization.users.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Team Members
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <div className="p-0">
        <div className="flex items-center justify-between mb-4 pb-0">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members
          </h2>

          <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite New Member</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleInviteMember} className="space-y-4">
                <div>
                  <Label htmlFor="memberEmail">Email Address *</Label>
                  <Input
                    id="memberEmail"
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="member@example.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="memberName">Full Name *</Label>
                  <Input
                    id="memberName"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="memberRole">Role</Label>
                  <select
                    id="memberRole"
                    value={newMemberRole}
                    onChange={(e) => {
                      setNewMemberRole(RoleEnum.parse(e.target.value));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RoleEnum.options.map((role) => (
                      <option key={role} value={role}>
                        {role.charAt(0) + role.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddMemberOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={inviteMemberMutation.isPending}
                  >
                    {inviteMemberMutation.isPending
                      ? 'Sending Invitation...'
                      : 'Send Invitation'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Table className="bg-white p-0">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organization.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name || 'N/A'}
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      handleRemoveMember(user.id, user.name || user.email)
                    }
                    disabled={removeMemberMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pending Invitations */}
      {invitations &&
        invitations.filter((inv) => inv.status === 'PENDING').length > 0 && (
          <div className="p-0">
            <h2 className="text-xl font-semibold flex items-center gap-2 px-6 mb-4">
              <Mail className="w-5 h-5" />
              Pending Invitations
            </h2>

            <Table className="bg-white p-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations
                  .filter((invitation) => invitation.status === 'PENDING')
                  .map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">
                        {invitation.name}
                      </TableCell>
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {invitation.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(invitation.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleCancelInvitation(
                              invitation.id,
                              invitation.email,
                            )
                          }
                          disabled={cancelInvitationMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
    </div>
  );
};

OrganisationDashboard.getLayout = (page: any) => (
  <AdminLayout>{page}</AdminLayout>
);

export default OrganisationDashboard;
