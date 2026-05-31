import type { User as BaseUser } from "../../schemas/user.schema";

export interface User extends BaseUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}
