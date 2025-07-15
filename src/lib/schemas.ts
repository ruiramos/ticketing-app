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

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postCode: z.string().optional(),
  website: z.string().optional(),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
