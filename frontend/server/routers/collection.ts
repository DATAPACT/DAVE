import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';

const baseURL = `${process.env.API_BASE_URI}`;
export type collectionDocInfo = {
  name: string;
  preview?: string;
  id: string;
};
export type Collection = {
  id: string;
  name: string;
  ownerId: string;
  allowedUserIds: string[];
  createdAt: string;
  updatedAt: string;
  config?: {
    typesToHide: string[];
    typesOrder?: string[];
  };
  /** @deprecated legacy field, use config.typesToHide instead */
  collectionTypes?: string[];
};

export type User = {
  userId: string;
  email: string;
  name?: string;
};

const getJWTHeader = (token?: string) => {
  if (!token) {
    if (process.env.USE_AUTH === 'false') {
      return ''; // No Authorization header when auth is disabled
    }
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'No authentication token provided',
    });
  }
  return `Bearer ${token}`;
};

export const collections = createRouter()
  // Get all collections accessible by the current user
  .query('getAll', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      // If no token supplied and auth is enabled, avoid calling backend and return empty collection list early
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        return [] as Collection[];
      }

      try {
        const result = await fetchJson<any, Collection[]>(
          `${baseURL}/collection`,
          {
            headers: {
              Authorization: getJWTHeader(token),
            },
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch collections',
        });
      }
    },
  })

  // Get a specific collection by ID
  .query('getById', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection/${id}`,
          {
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch collection',
        });
      }
    },
  })
  .query('getCollectionInfo', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, collectionDocInfo[]>(
          `${baseURL}/collection/collectioninfo/${id}`,
          {
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch collection info',
        });
      }
    },
  })
  // Get facets cache for a collection (proxied to backend /collection/facetsCache/:id)
  .query('facetsCache', {
    input: z.object({ id: z.string(), token: z.string().optional() }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const result = await fetchJson<any, any>(
          `${baseURL}/collection/facetsCache/${encodeURIComponent(id)}`,
          {
            method: 'GET',
            headers,
          }
        );
        return result;
      } catch (error: any) {
        const status = error?.response?.status ?? error?.status;
        if (status === 401 || status === 403) {
          return null;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch facets cache',
        });
      }
    },
  })
  // Create a new collection
  .mutation('create', {
    input: z.object({
      name: z.string().min(1),
      allowedUserIds: z.array(z.string()).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { name, allowedUserIds, token } = input;
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name,
              allowedUserIds: allowedUserIds || [],
            }),
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create collection',
        });
      }
    },
  })

  // Update a collection
  .mutation('update', {
    input: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      allowedUserIds: z.array(z.string()).optional(),
      config: z
        .object({
          typesToHide: z.array(z.string()).optional(),
          typesOrder: z.array(z.string()).optional(),
        })
        .optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, name, allowedUserIds, config, token } = input;
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection/${id}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              name,
              allowedUserIds,
              config,
            }),
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code:
            error.status === 403
              ? 'FORBIDDEN'
              : error.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update collection',
        });
      }
    },
  })

  // Delete a collection
  .mutation('delete', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const elasticIndex = process.env.ELASTIC_INDEX;

        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<
          any,
          { message: string; collection: Collection }
        >(`${baseURL}/collection/${id}`, {
          method: 'DELETE',
          headers,
          body: {
            elasticIndex,
          },
        });
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code:
            error.status === 403
              ? 'FORBIDDEN'
              : error.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete collection',
        });
      }
    },
  })

  // Get all users for sharing
  .query('getAllUsers', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      // If no token supplied and auth is enabled, do not call backend and return empty users list early
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        console.log(
          'collections.getAllUsers: no token supplied, returning empty array'
        );
        return [] as User[];
      }

      try {
        console.log(
          'collections.getAllUsers: received token (masked)',
          `${token?.slice(0, 6)}...${token?.slice(-4)}`
        );
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, User[]>(
          `${baseURL}/collection/users/all`,
          {
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch users',
        });
      }
    },
  })

  // Download collection as zip (starts background export job, polls status, then downloads)
  .query('download', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        // Start export job for the collection using fetchJson helper (ensures JSON handling)
        // Add debug logs to help diagnose request/response issues
        try {
          console.log(
            '[trpc.collections.download] starting export POST',
            `${baseURL}/export/start`
          );
          console.log('[trpc.collections.download] request headers:', headers);
          try {
            console.log(
              '[trpc.collections.download] request body:',
              JSON.stringify({ collectionId: id })
            );
          } catch (e) {
            console.log(
              '[trpc.collections.download] request body: <unserializable>'
            );
          }
        } catch (e) {
          // swallow logging errors
        }

        const startJson = await fetchJson<any, { jobId: string }>(
          `${baseURL}/export/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(headers.Authorization
                ? { Authorization: headers.Authorization }
                : {}),
            },
            body: { collectionId: id },
          }
        );

        try {
          console.log(
            '[trpc.collections.download] export start response:',
            startJson
          );
        } catch (e) {
          // ignore logging errors
        }

        const jobId = startJson?.jobId;
        if (!jobId) {
          // Provide extra debug info when jobId is missing
          console.error(
            '[trpc.collections.download] export start returned no jobId, full response:',
            startJson
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Export job did not return a jobId',
          });
        }

        // Poll job status until completed or failed (timeout after 5 minutes)
        const timeoutMs = 5 * 60 * 1000;
        const pollIntervalMs = 2000;
        const deadline = Date.now() + timeoutMs;

        while (true) {
          const statusJson = await fetchJson<
            any,
            { status: string; _error?: string }
          >(`${baseURL}/export/${jobId}/status`, {
            method: 'GET',
            headers: headers.Authorization
              ? { Authorization: headers.Authorization }
              : {},
          });
          const status = statusJson?.status;

          if (status === 'completed') break;
          if (status === 'failed') {
            const errMsg = statusJson?._error || 'Export job failed';
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: errMsg,
            });
          }

          if (Date.now() > deadline) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Export job timed out',
            });
          }

          await new Promise((r) => setTimeout(r, pollIntervalMs));
        }

        // Download the exported file (binary) - use fetch for binary response
        const dlRes = await fetch(`${baseURL}/export/${jobId}/download`, {
          headers: headers.Authorization
            ? { Authorization: headers.Authorization }
            : {},
        });
        if (!dlRes.ok) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to download exported file',
          });
        }
        const buffer = await dlRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentDisposition = dlRes.headers.get('content-disposition');
        const filename = contentDisposition
          ? (contentDisposition.split('filename=')[1] || `${id}.zip`).replace(
              /"/g,
              ''
            )
          : `${id}.zip`;

        return { data: base64, filename };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to download collection',
        });
      }
    },
  });
