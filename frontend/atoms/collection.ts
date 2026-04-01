import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface Collection {
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
}

// Active collection atom with localStorage persistence
export const activeCollectionAtom = atomWithStorage<Collection | null>(
  'activeCollection',
  null
);

// Collections list atom
export const collectionsAtom = atom<Collection[]>([]);
