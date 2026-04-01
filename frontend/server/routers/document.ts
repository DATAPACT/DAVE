import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';
import { getAuthHeader } from '../get-auth-header';
import { Annotation } from '@/lib/ner/core/types';
import fs from 'fs';
import path from 'path';
import base from '@/components/TranslationProvider/translations/base';
import { getJWTHeader } from '@/utils/trpc';

export type Document = {
  _id: string;
  id: number;
  name: string;
  preview: string;
  text: string;
  features: {
    clusters: {
      [key: string]: Cluster[];
    };
    anonymized?: boolean;
  };
  annotation_sets: {
    [key: string]: AnnotationSet<EntityAnnotation>;
    // entities: AnnotationSet<EntityAnnotation>;
    // Sections?: AnnotationSet<SectionAnnotation>;
    // sentences: AnnotationSet;
  };
};

export type Cluster = {
  id: number;
  title: string;
  type: string;
  mentions: { id: number; mention: string }[];
};

export type AnnotationSet<P = []> = {
  _id?: string;
  name: string;
  next_annid: number;
  annotations: P[];
};

export type Candidate = {
  id: number;
  indexer: number;
  score: number;
  raw_score: number;
  norm_score: number;
  title: string;
  url: string;
  wikipedia_id?: string;
};

export type AdditionalAnnotationProps = {
  mention: string;
  cluster: number;
  title: string;
  url: string;
  is_nil: boolean;
  review_time?: number;
  additional_candidates: Candidate[];
  ner: {
    source: string;
    spacy_model: string;
    type: string;
    score: number;
  };
  linking: {
    source: string;
    is_nil: boolean;
    nil_score: number;
    top_candidate: Candidate;
    candidates: Candidate[];
  };
  types?: string[];
};

export type EntityAnnotation = Annotation<AdditionalAnnotationProps>;
export type SectionAnnotation = Annotation;

const baseURL = `${process.env.API_BASE_URI}`;
// const baseURL = `${process.env.API_BASE_URI}`;
//TODO: modificare chiamata per cercare il doc in locale
const getDocumentById = async (
  id: number,
  deAnonimize?: boolean
): Promise<Document> => {
  try {
    const headers: any = {};
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers.Authorization = authHeader;
    }
    const document = await fetchJson<any, Document>(
      `${baseURL}/document/${id}/${deAnonimize ?? false}`,
      {
        headers,
      }
    );
    console.log('*** current document text ***', document.text);
    return document;
  } catch (err) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Document with id '${id}' not found.`,
    });
  }
};

export type GetDocumentsDoc = {
  _id: string;
  id: number;
  name: string;
  preview: string;
};

export type GetPaginatedDocuments = {
  docs: GetDocumentsDoc[];
  totalDocs: number;
  limit: number;
  totalPages: number;
  page: number;
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
};

const getDocuments = async (
  cursor: number,
  limit: number,
  q?: string
): Promise<GetPaginatedDocuments> => {
  console.log(
    'documents',
    `${baseURL}/document?q=${q}&page=${cursor}&limit=${limit}`
  );
  const headers: any = {};
  const authHeader = getAuthHeader();
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  const res = await fetchJson<any, GetPaginatedDocuments>(
    `${baseURL}/document?q=${q}&page=${cursor}&limit=${limit}`,
    {
      headers,
    }
  );
  return res;
};
/**
 *
 * @param id Document ID
 * @param entities ids of entities to be moved
 * @param sourceCluster previous cluster containing the entities
 * @param destinationCluster new cluster containing the entities
 * @returns
 */
const moveEntitiesToCluster = async (
  id: string,
  entities: number[],
  annotationSet: string,
  sourceCluster: number,
  destinationCluster: number
) => {
  try {
    const headers: any = {};
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers.Authorization = authHeader;
    }
    let res = fetchJson<any, Document>(
      `${baseURL}/document/${id}/move-entities`,
      {
        method: 'POST',
        headers,
        body: {
          entities: entities,
          annotationSet: annotationSet,
          sourceCluster: sourceCluster,
          destinationCluster: destinationCluster,
        },
      }
    );
    return res;
  } catch (err) {
    console.error(err);
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Document with id '${id}' not found.`,
    });
  }
};

export const documents = createRouter()
  .query('getDocument', {
    input: z.object({
      id: z.any(),
      deAnonimize: z.boolean().default(false),
    }),
    resolve: ({ input }) => {
      const { id, deAnonimize } = input;
      return getDocumentById(id, deAnonimize);
    },
  })
  .query('inifniteDocuments', {
    input: z.object({
      q: z.string().nullish(),
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.number().nullish(),
    }),
    resolve: ({ input }) => {
      const { q: qInput, cursor: cursorInput, limit: limitInput } = input;
      const q = qInput || '';
      const cursor = cursorInput || 1;
      const limit = limitInput || 20;

      return getDocuments(cursor, limit, q);
    },
  })
  // Services CRUD via documents backend (requires a user JWT)
  .query('getServices', {
    input: z.object({
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      try {
        const { token } = input;
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any[]>(
          `${baseURL}/document/services`,
          {
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch services',
        });
      }
    },
  })
  .mutation('createService', {
    input: z.object({
      name: z.string(),
      uri: z.string(),
      serviceType: z.string(),
      description: z.string().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, ...body } = input;
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        console.log(
          '[trpc.document.fetchFacetDocuments] token provided:',
          Boolean(token)
        );
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/services`,
          {
            method: 'POST',
            headers,
            body,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create service',
        });
      }
    },
  })
  .mutation('updateService', {
    input: z.object({
      id: z.string(),
      name: z.string().optional(),
      uri: z.string().optional(),
      serviceType: z.string().optional(),
      description: z.string().optional(),
      disabled: z.boolean().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, id, ...body } = input;
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/services/${id}`,
          {
            method: 'PUT',
            headers,
            body,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update service',
        });
      }
    },
  })
  .mutation('deleteService', {
    input: z.object({
      id: z.string(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/services/${id}`,
          {
            method: 'DELETE',
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete service',
        });
      }
    },
  })
  // Configuration endpoints
  .query('getConfigurations', {
    input: z.object({
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      try {
        const { token } = input;
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any[]>(
          `${baseURL}/document/configurations`,
          {
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch configurations',
        });
      }
    },
  })
  .query('getActiveConfiguration', {
    input: z.object({
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      try {
        const { token } = input;
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/configurations/active`,
          {
            headers,
          }
        );
        return result;
      } catch (error: any) {
        // If no active configuration, return null instead of throwing
        if (
          error.message?.includes('404') ||
          error.message?.toLowerCase().includes('not found')
        ) {
          return null;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch active configuration',
        });
      }
    },
  })
  .mutation('createConfiguration', {
    input: z.object({
      name: z.string(),
      // steps: ordered array of pipeline steps (new format)
      steps: z.array(z.any()).optional(),
      // services: legacy slot-map kept for backward compat
      services: z.record(z.any()).optional(),
      isActive: z.boolean().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, ...body } = input;
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/configurations`,
          {
            method: 'POST',
            headers,
            body,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create configuration',
        });
      }
    },
  })
  .mutation('updateConfiguration', {
    input: z.object({
      id: z.string(),
      name: z.string().optional(),
      // steps: ordered array of pipeline steps (new format)
      steps: z.array(z.any()).optional(),
      // services: legacy slot-map kept for backward compat
      services: z.record(z.any()).optional(),
      isActive: z.boolean().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, id, ...body } = input;
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/configurations/${id}`,
          {
            method: 'PUT',
            headers,
            body,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update configuration',
        });
      }
    },
  })
  .mutation('deleteConfiguration', {
    input: z.object({
      id: z.string(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/configurations/${id}`,
          {
            method: 'DELETE',
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete configuration',
        });
      }
    },
  })
  .mutation('activateConfiguration', {
    input: z.object({
      id: z.string(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(
          `${baseURL}/document/configurations/${id}/activate`,
          {
            method: 'POST',
            headers,
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to activate configuration',
        });
      }
    },
  })
  .mutation('moveEntitiesToCluster', {
    input: z.object({
      id: z.string(),
      annotationSet: z.string(),
      entities: z.array(z.number()),
      sourceCluster: z.number(),
      destinationCluster: z.number(),
    }),
    resolve: async ({ input }) => {
      const { id, annotationSet, entities, sourceCluster, destinationCluster } =
        input;
      let moveRes = await moveEntitiesToCluster(
        id,
        entities,
        annotationSet,
        sourceCluster,
        destinationCluster
      );
      console.log('moveRes', moveRes);
      return moveRes;
    },
  })
  .mutation('deleteDocument', {
    input: z.object({ docId: z.string() }),
    resolve: async ({ input }) => {
      const { docId } = input;
      try {
        const headers: any = {};
        const authHeader = getAuthHeader();
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        return fetchJson<any, AnnotationSet<EntityAnnotation>[]>(
          `${baseURL}/document/${docId}`,
          {
            method: 'DELETE',
            headers,
            body: {
              elasticIndex: process.env.ELASTIC_INDEX,
            },
          }
        );
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 402 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete document: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .mutation('deleteAnnotationSet', {
    input: z.object({
      docId: z.string(),
      annotationSetId: z.string(),
    }),
    resolve: async ({ input }) => {
      const { docId, annotationSetId } = input;
      const headers: any = {};
      const authHeader = getAuthHeader();
      if (authHeader) {
        headers.Authorization = authHeader;
      }
      return fetchJson<any, AnnotationSet<EntityAnnotation>[]>(
        `${baseURL}/document/${docId}/annotation-set/${annotationSetId}`,
        {
          method: 'DELETE',
          headers,
        }
      );
    },
  })
  .mutation('save', {
    input: z.object({
      collectionId: z.string(),
      docId: z.string(),
      token: z.string(),
      annotationSets: z.record(z.string(), z.any()),
      features: z
        .object({
          clusters: z.record(z.string(), z.array(z.any())).optional(),
        })
        .optional(),
    }),
    resolve: async ({ input }) => {
      const { docId, annotationSets, features, token, collectionId } = input;
      const elasticIndex = process.env.ELASTIC_INDEX;
      try {
        // Create an abort controller for timeout handling
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30 second timeout

        console.log('Saving annotations for document:', docId);
        console.log('Features being saved:', features);
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, AnnotationSet<EntityAnnotation>[]>(
          `${baseURL}/save`,
          {
            method: 'POST',
            headers,
            body: {
              collectionId: collectionId,
              docId,
              annotationSets,
              features,
              elasticIndex,
            },
            signal: abortController.signal,
          }
        );

        // Clear timeout since request completed
        clearTimeout(timeoutId);

        console.log('Successfully saved annotations for document:', docId);

        // Make sure we return the exact annotation sets that were saved
        // This ensures the client state is synchronized with the server
        if (result && Array.isArray(result)) {
          return result;
        } else {
          // If the server didn't return the expected format, return the original annotation sets
          // This ensures the client doesn't lose its state
          console.warn(
            'Server returned unexpected format for saved annotations, using original data'
          );
          return Object.values(annotationSets);
        }
      } catch (error) {
        console.error('Error saving annotations:', error);

        // More detailed error message based on error type
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.error('Save operation timed out after 30 seconds');
          throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Save operation timed out. Please try again.',
          });
        } else {
          console.error('Failed to save annotations:', error);

          // Return original annotation sets instead of throwing an error
          // This prevents the client from getting into a bad state
          console.warn('Returning original annotation sets due to save error');
          return Object.values(annotationSets);
        }
      }
    },
  })
  .mutation('createDocument', {
    input: z.object({
      document: z.object({
        text: z.string(),
        annotation_sets: z.record(z.string(), z.any()),
        preview: z.string().optional(),
        name: z.string().optional(),
        features: z.record(z.string(), z.any()).optional(),
        offset_type: z.string().optional(),
      }),
      collectionId: z.string(),
      token: z.string().optional(),
      toAnonymize: z.boolean(),
      anonymizeTypes: z.array(z.string()).optional(),
    }),
    resolve: async ({ input }) => {
      const { document, collectionId, token, toAnonymize, anonymizeTypes } =
        input;
      // Ensure downstream always has a string token; when auth is disabled or token not provided, use empty string
      const tokenForApi = token ?? '';
      const elasticIndex = process.env.ELASTIC_INDEX;

      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(tokenForApi);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(`${baseURL}/document`, {
          method: 'POST',
          headers,
          body: {
            ...document,
            collectionId,
            elasticIndex,
            toAnonymize,
            anonymizeTypes,
          },
          timeout: 600000,
        });

        return result;
      } catch (error) {
        console.error('Error creating document:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create document: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .mutation('deanonymizeKey', {
    input: z.object({
      key: z.string(),
    }),
    resolve: async ({ input }) => {
      const { key } = input;

      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getAuthHeader();
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<
          any,
          { key: string; value: string } | { error: string; key: string }
        >(`${baseURL}/document/deanonymize-key`, {
          method: 'POST',
          headers,
          body: {
            key,
          },
        });

        if ('error' in result) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
          });
        }

        return result;
      } catch (error) {
        console.error('Error deanonymizing key:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to deanonymize key: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .mutation('deanonymizeKeys', {
    input: z.object({
      keys: z.array(z.string()),
    }),
    resolve: async ({ input }) => {
      const { keys } = input;

      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getAuthHeader();
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const result = await fetchJson<any, Record<string, string>>(
          `${baseURL}/document/deanonymize-keys`,
          {
            method: 'POST',
            headers,
            body: { keys },
          }
        );

        // Expecting a map of key->value
        return result || {};
      } catch (error) {
        console.error('Error deanonymizing keys:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to deanonymize keys: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .query('getDocumentsByIds', {
    input: z.object({
      ids: z.array(z.string()),
      deAnonimize: z.boolean().optional(),
    }),
    resolve: async ({ input }) => {
      const { ids, deAnonimize } = input;
      try {
        const headers: any = {};
        const authHeader = getAuthHeader();
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const results = await Promise.allSettled(
          ids.map(async (id) => {
            // Fetch full document from backend and transform into a search-like hit
            const doc = await fetchJson<any, Document>(
              `${baseURL}/document/${id}/${deAnonimize ?? false}`,
              { headers }
            );

            // Collect annotations from all annotation sets
            const annotations: EntityAnnotation[] = [];
            if (doc && doc.annotation_sets) {
              Object.values(doc.annotation_sets).forEach((set: any) => {
                if (Array.isArray(set.annotations)) {
                  annotations.push(...set.annotations);
                }
              });
            }

            // Map to FacetedQueryHit-like shape used in the frontend
            return {
              _id: doc._id || String(doc.id),
              id: doc.id,
              mongo_id: doc._id,
              text: doc.preview || doc.text || '',
              name: doc.name || '',
              annotations,
            };
          })
        );

        // Return only fulfilled results
        const hits = results
          .filter((r) => r.status === 'fulfilled')
          .map((r: any) => r.value);

        return hits;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch documents by ids',
        });
      }
    },
  })
  .mutation('fetchFacetDocuments', {
    input: z.object({
      ids: z.array(z.string()),
      deAnonimize: z.boolean().optional(),
      token: z.string().optional(),
    }),
    resolve: async ({ input }) => {
      const { ids, deAnonimize, token } = input;
      // If auth is enabled but no token supplied, avoid calling backend and return empty
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        return [];
      }
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        // Call backend by-ids endpoint
        const result = await fetchJson<any, any>(`${baseURL}/document/by-ids`, {
          method: 'POST',
          headers,
          body: {
            ids,
            deAnonimize: deAnonimize ?? false,
          },
        });
        console.log(
          '[trpc.document.fetchFacetDocuments] fetched',
          Array.isArray(result) ? result.length : 'non-array'
        );
        return result || [];
      } catch (error: any) {
        // Log detailed error for debugging (including possible FetchError.data)
        try {
          console.error('[trpc.document.fetchFacetDocuments] error', error);
          if (error && typeof error === 'object') {
            // If fetchJson threw a FetchError with .data, log it
            // @ts-ignore
            if (error.data) {
              // @ts-ignore
              console.error(
                '[trpc.document.fetchFacetDocuments] response data:',
                error.data
              );
            }
            // log stack if available
            if (error.stack) console.error(error.stack);
          }
        } catch (e) {
          console.error('Failed to log fetchFacetDocuments error', e);
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            (error && error.message) ||
            (error && typeof error === 'object' && JSON.stringify(error)) ||
            'Failed to fetch facet documents',
        });
      }
    },
  })
  .mutation('annotateAndUpload', {
    input: z.object({
      text: z.string(),
      collectionId: z.string(),
      name: z.string().optional(),
      token: z.string().optional(),
      configurationId: z.string().optional(),
      toAnonymize: z.boolean(),
      anonymizeTypes: z.array(z.string()).optional(),
    }),
    resolve: async ({ input }) => {
      const {
        text,
        name,
        collectionId,
        token,
        configurationId,
        toAnonymize,
        anonymizeTypes,
      } = input;

      // Ensure downstream always has a string token; when auth is disabled or token not provided, use empty string
      const tokenForApi = token ?? '';

      // Fetch configuration from database - either specified or active
      let selectedServices: Record<string, any> | undefined;
      try {
        let configToUse: any;

        if (configurationId) {
          // Fetch specific configuration by ID
          const headers: any = {};
          const authHeader = getJWTHeader(tokenForApi);
          if (authHeader) {
            headers.Authorization = authHeader;
          }
          const allConfigs = await fetchJson<any, any[]>(
            `${baseURL}/document/configurations`,
            {
              headers,
            }
          );
          configToUse = allConfigs.find((c: any) => c._id === configurationId);
        } else {
          // Fetch active configuration
          const headers: any = {};
          const authHeader = getJWTHeader(tokenForApi);
          if (authHeader) {
            headers.Authorization = authHeader;
          }
          configToUse = await fetchJson<any, any>(
            `${baseURL}/document/configurations/active`,
            {
              headers,
            }
          );
        }

        if (configToUse) {
          // New format: steps array takes priority over legacy services map
          if (
            Array.isArray(configToUse.steps) &&
            configToUse.steps.length > 0
          ) {
            selectedServices = configToUse.steps;
          } else if (configToUse.services) {
            // Legacy: convert MongoDB Map to plain object
            if (configToUse.services instanceof Map) {
              const legacyObj: Record<string, any> = {};
              configToUse.services.forEach((value: any, key: string) => {
                legacyObj[key] = value;
              });
              selectedServices = legacyObj;
            } else {
              selectedServices = configToUse.services;
            }
          }
        }
      } catch (error: any) {
        console.log('No active configuration found, using defaults');
        selectedServices = undefined;
      }

      const elasticIndex = process.env.ELASTIC_INDEX;

      // Resolve the ordered list of pipeline steps to execute.
      // New format: configToUse.steps  (array of { name, uri, serviceType? })
      // Legacy fallback: configToUse.services  (slot-name -> service map)
      let pipelineSteps: Array<{
        name: string;
        uri: string;
        serviceType?: string;
      }> = [];

      if (selectedServices) {
        const raw = selectedServices as any;
        if (Array.isArray(raw)) {
          // New format: already an array of steps
          pipelineSteps = (raw as any[]).filter(
            (s: any) => s && typeof s.uri === 'string' && s.uri.trim()
          );
        } else if (typeof raw === 'object') {
          // Legacy slot-map format: convert to ordered steps using canonical slot order
          const LEGACY_SLOTS = [
            'NER',
            'NEL',
            'INDEXER',
            'NILPREDICTION',
            'CLUSTERING',
            'CONSOLIDATION',
          ];
          const defaultUriForSlot: Record<string, string> = {
            NER:
              process.env.ANNOTATION_SPACYNER_URL ||
              'http://spacyner:80/api/spacyner',
            NEL:
              process.env.ANNOTATION_BLINK_URL ||
              'http://biencoder:80/api/blink/biencoder/mention/doc',
            INDEXER:
              process.env.ANNOTATION_INDEXER_URL ||
              'http://indexer:80/api/indexer/search/doc',
            NILPREDICTION:
              process.env.ANNOTATION_NILPREDICTION_URL ||
              'http://nilpredictor:80/api/nilprediction/doc',
            CLUSTERING:
              process.env.ANNOTATION_NILCLUSTER_URL ||
              'http://clustering:80/api/clustering',
            CONSOLIDATION:
              process.env.ANNOTATION_CONSOLIDATION_URL ||
              'http://consolidation:80/api/consolidation',
          };
          for (const slot of LEGACY_SLOTS) {
            const entry = raw[slot];
            if (!entry) continue;
            const uri = (entry.uri || '').trim() || defaultUriForSlot[slot];
            if (uri) {
              pipelineSteps.push({
                name: entry.name || slot,
                uri,
                serviceType: slot,
              });
            }
          }
        }
      }

      // If no steps configured, fall through to upload without annotation
      console.log(
        `Pipeline has ${pipelineSteps.length} steps:`,
        pipelineSteps.map((s) => `${s.name} -> ${s.uri}`)
      );

      try {
        // Create initial gatenlp Document
        let gdoc: any = {
          text: text,
          features: {},
          offset_type: 'p',
          annotation_sets: {},
        };

        // Execute each pipeline step sequentially
        for (let i = 0; i < pipelineSteps.length; i++) {
          const step = pipelineSteps[i];
          console.log(
            `Pipeline step ${i + 1}/${pipelineSteps.length}: ${step.name} -> ${
              step.uri
            }`
          );
          gdoc = await fetchJson<any, any>(step.uri, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: gdoc,
            timeout: 300000, // 5 minutes per step
          });
        }

        // Clean up encoding features from linking (artifact of some pipeline steps)
        if (gdoc.annotation_sets && gdoc.annotation_sets.entities_) {
          const entities = gdoc.annotation_sets.entities_.annotations || [];
          for (const ann of entities) {
            if (ann.features?.linking?.encoding) {
              delete ann.features.linking.encoding;
            }
          }
        }

        console.log('Uploading annotated document...');
        // Upload the annotated document
        const documentToUpload = {
          ...gdoc,
          name: name || 'Untitled Document',
          preview: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
          elasticIndex,
          collectionId,
        };

        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(tokenForApi);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, any>(`${baseURL}/document`, {
          method: 'POST',
          headers,
          body: {
            ...documentToUpload,
            toAnonymize,
            anonymizeTypes,
          },
          timeout: 300000, // 5 minutes
        });

        console.log('Document uploaded successfully');
        return result;
      } catch (error) {
        console.error('Error in annotateAndUpload:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to annotate and upload document: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  });
