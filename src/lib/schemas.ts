import { z } from 'zod';

export const RoleEnum = z.enum(['USER', 'ADMIN']);

export type Role = z.infer<typeof RoleEnum>;

export const InviteOrganizationMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: RoleEnum.default('USER'),
});

export type InviteOrganizationMemberInput = z.infer<
  typeof InviteOrganizationMemberSchema
>;
