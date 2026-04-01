import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';

const baseURL = `${process.env.API_BASE_URI}`;

export type User = {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
};

const getJWTHeader = (token?: string) => {
  if (!token) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'No authentication token provided',
    });
  }
  return `Bearer ${token}`;
};

export const users = createRouter()
  // Get all users
  .query('getAllUsers', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return [] as User[];
      }

      try {
        const result = await fetchJson<any, User[]>(`${baseURL}/users`, {
          headers: {
            Authorization: getJWTHeader(token),
          },
        });
        return result;
      } catch (error: any) {
        const detail = error?.data?.error || error?.data?.message || error?.message || 'Failed to fetch users';
        throw new TRPCError({
          code: error.response?.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
          message: detail,
        });
      }
    },
  })

  // Create a new user
  .mutation('createUser', {
    input: z.object({
      email: z.string().email(),
      password: z.string().min(6),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { email, password, token } = input;
      try {
        const result = await fetchJson<any, User>(`${baseURL}/users`, {
          method: 'POST',
          headers: {
            Authorization: getJWTHeader(token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
          }),
        });
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create user',
        });
      }
    },
  });
