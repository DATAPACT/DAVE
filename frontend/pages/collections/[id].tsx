import { ToolbarLayout, useText } from '@/components';
import { useContext, useMutation, useQuery } from '@/utils/trpc';
import { Button, Pagination, Spinner } from '@heroui/react';
import { NextPage } from 'next';
import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { isRequestFromIframe } from '@/utils/auth';
import { useRouter } from 'next/router';
import { useEffect, useState, ReactNode } from 'react';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import styled from '@emotion/styled';
import { collectionDocInfo } from '@/server/routers/collection';
import { FiTrash2 } from '@react-icons/all-files/fi/FiTrash2';
import {
  message,
  notification,
  Popconfirm,
  Modal,
  Select,
  Divider,
} from 'antd';
import { useAtom } from 'jotai';
import { activeCollectionAtom, collectionsAtom } from '@/atoms/collection';
import { UploadDocumentsModal } from '@/components/UploadDocumentsModal';
import { uploadModalOpenAtom } from '@/atoms/upload';
import { GetServerSideProps } from 'next';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
const PageContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: start;
  align-items: start;
  margin-top: 25px;
  margin-bottom: 0px;
`;
const Chip = styled.span({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '5px 15px',
  borderRadius: 9999,
  backgroundColor: '#e8f2ff', // soft background
  color: '#0366d6', // accent text color
  fontWeight: 600,
  fontSize: '25px',
  border: '1px solid rgba(3,102,214,0.12)',
  lineHeight: 1,
});
const TableWrapper = styled.div`
  overflow-x: auto;
  padding: 0 16px;
  margin-top: 12px;

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 14px;
  }

  thead th {
    background: #f5f7fb;
    font-weight: 700;
    padding: 12px 8px;
    text-align: left;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  thead th:first-child {
    border-top-left-radius: 8px;
  }

  thead th:last-child {
    border-top-right-radius: 8px;
  }

  tbody td {
    padding: 10px 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    vertical-align: top;
  }

  tbody tr:hover td {
    background: rgba(0, 0, 0, 0.02);
  }
`;
const SortableTypeItem = ({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px',
        borderRadius: 6,
        background: isDragging ? '#e8f0fe' : '#fafafa',
        border: '1px solid #e8e8e8',
        marginBottom: 4,
        opacity: isDragging ? 0.8 : 1,
        userSelect: 'none',
      }}
      {...attributes}
    >
      <span
        style={{ cursor: 'grab', color: '#bbb', display: 'flex' }}
        {...listeners}
      >
        <GripVertical size={14} />
      </span>
      {children}
    </div>
  );
};

const Collection: NextPage = () => {
  const t = useText('collections');
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = router.query.id as string | undefined;
  const utils = useContext();
  const enabled = Boolean(id && session?.accessToken);
  const token = (session as any)?.accessToken as string | undefined;
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  const [allCollections, setAllCollections] = useAtom(collectionsAtom);
  const [activeCollection, setActiveCollection] = useAtom(activeCollectionAtom);
  const [, setUploadModalOpen] = useAtom(uploadModalOpenAtom);

  const [typesModalOpen, setTypesModalOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [typesOrder, setTypesOrder] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const pageSize = 20;
  const updateMutation = useMutation(['collection.update'], {
    onSuccess: (res) => {
      // optionally invalidate or refetch queries
      try {
        utils.invalidateQueries(['collection.getAll']);
        if (id) utils.invalidateQueries(['collection.getById', { id }]);
      } catch (e) {
        // ignore
      }
    },
    onError: (err) => {
      console.error('[collection.update] error', err);
    },
  });

  const [currentCollectionName, setCurrentCollectionName] = useState<
    string | null
  >(null);
  // delete mutation with onSuccess that updates cache locally
  const deleteDocumentMutation = useMutation(['document.deleteDocument'], {
    onSuccess: (_result, variables) => {
      // Build the same query key you use in useQuery
      const queryKey: ['collection.getCollectionInfo', { id: string; token: any }] = [
        'collection.getCollectionInfo',
        { id: id ?? '', token: (session as any)?.accessToken },
      ];

      // Remove the deleted doc from the cached array (instant local update)
      utils.setQueryData(queryKey, (old: collectionDocInfo[] | undefined) =>
        old ? old.filter((d: collectionDocInfo) => d.id !== variables.docId) : []
      );

      // Optionally show a success message
      message.success(t('documentDeleted'));
    },
    onError: () => {
      message.error(t('errorDeleting'));
    },
  });
  const { data, isLoading, refetch } = useQuery(
    [
      'collection.getCollectionInfo',
      { id: id ?? '', token: (session as any)?.accessToken },
    ],
    { enabled: enabled }
  );
  async function handleDeleteDocument(docId: string) {
    try {
      await deleteDocumentMutation.mutateAsync({
        docId: docId,
      });
    } catch (error) {
      console.error(`Error deleting the document ${docId}`);
    }
  }
  useEffect(() => {
    if (allCollections && id) {
      const currentCol = allCollections.find((coll) => coll.id === id);
      if (currentCol) setCurrentCollectionName(currentCol.name);
      // initialize selected types from active collection or global collections
      const current =
        allCollections?.find((c) => c.id === id) || activeCollection;
      const initial =
        current?.config?.typesToHide || current?.collectionTypes || [];
      setSelectedTypes(Array.isArray(initial) ? initial : []);
      const allTypes: string[] = Array.isArray(
        (current as any)?.collectionTypes
      )
        ? (current as any).collectionTypes
        : [];
      const savedOrder: string[] = Array.isArray(current?.config?.typesOrder)
        ? (current.config.typesOrder as string[])
        : [];
      if (savedOrder.length > 0) {
        setTypesOrder([
          ...savedOrder.filter((t) => allTypes.includes(t)),
          ...allTypes.filter((t) => !savedOrder.includes(t)),
        ]);
      } else {
        setTypesOrder([...allTypes]);
      }
    }
  }, [allCollections, id]);

  // reset to first page when data for the table changes
  useEffect(() => {
    setPage(1);
  }, [data, id]);
  if (status === 'loading' || isLoading) {
    return (
      <ToolbarLayout>
        <PageContainer>
          <Spinner size="lg" />
        </PageContainer>
      </ToolbarLayout>
    );
  }

  return (
    <ToolbarLayout>
      <PageContainer>
        <Header>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <Button
              color="primary"
              startContent={<FiArrowLeft />}
              onPress={() => router.push('/collections')}
            >
              {t('backToCollections')}
            </Button>
            <Button
              variant="flat"
              style={{ color: 'black' }}
              onPress={() => setTypesModalOpen(true)}
              color="secondary"
            >
              {t('editCollectionConfig')}
            </Button>
          </div>
          <h2 className="text-2xl font-bold mt-4">
            {t('collectionDocuments', {
              name: currentCollectionName || t('untitled'),
            })}
          </h2>
        </Header>

        <TableWrapper>
          <table aria-label="Collection documents">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px' }}>
                  {t('tableHeaders.id')}
                </th>
                <th style={{ textAlign: 'left', padding: '8px' }}>
                  {t('tableHeaders.name')}
                </th>
                <th style={{ textAlign: 'left', padding: '8px' }}>
                  {t('tableHeaders.preview')}
                </th>
                <th style={{ textAlign: 'left', padding: '8px', width: 100 }}>
                  {t('tableHeaders.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(data ?? [])
                .slice((page - 1) * pageSize, page * pageSize)
                .map((docInfo: collectionDocInfo) => (
                  <tr key={docInfo.id}>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      {docInfo.id.slice(0, 10) + '...'}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <span>{docInfo.name}</span>
                    </td>
                    <td
                      style={{
                        padding: '8px',
                        verticalAlign: 'top',
                        maxWidth: 500,
                      }}
                    >
                      <span style={{ maxWidth: 500, display: 'block' }}>
                        {docInfo.preview
                          ? docInfo.preview.slice(0, 50) + '...'
                          : t('noPreview')}
                      </span>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <Popconfirm
                        okText="Confirm"
                        cancelText="Cancel"
                        title={t('deleteDocument')}
                        description={t('deleteConfirmation')}
                        onConfirm={() => handleDeleteDocument(docInfo.id)}
                      >
                        <Button
                          style={{ margin: 'auto' }}
                          size="sm"
                          color="danger"
                          variant="flat"
                        >
                          <FiTrash2 />
                        </Button>
                      </Popconfirm>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableWrapper>
        {/* Pagination controls: 20 items per page */}
        <div
          style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}
        >
          <Pagination
            total={Math.max(1, Math.ceil((data?.length || 0) / pageSize))}
            page={page}
            onChange={(p) => setPage(p)}
          />
        </div>
        <Modal
          title={t('editCollectionConfig')}
          open={typesModalOpen}
          onCancel={() => setTypesModalOpen(false)}
          onOk={async () => {
            // update atoms locally
            try {
              // update collectionsAtom
              const updated = allCollections.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      config: {
                        ...(c.config || {}),
                        typesToHide: selectedTypes,
                        typesOrder: typesOrder,
                      },
                    }
                  : c
              );
              // update active collection atom
              const newActive =
                activeCollection && activeCollection.id === id
                  ? {
                      ...activeCollection,
                      config: {
                        ...(activeCollection.config || {}),
                        typesToHide: selectedTypes,
                        typesOrder: typesOrder,
                      },
                    }
                  : activeCollection;
              // persist via TRPC update mutation
              try {
                await updateMutation.mutateAsync({
                  id: id || '',
                  config: {
                    typesToHide: selectedTypes,
                    typesOrder: typesOrder,
                  },
                  token: authDisabled ? undefined : token,
                });
                // write atoms: update collections array and active collection
                setAllCollections(updated);
                setActiveCollection(newActive);
                message.success(t('typesSaved'));
              } catch (e) {
                console.error('Failed to update collection via TRPC', e);
                message.error(t('errorSavingTypes'));
              }
            } catch (e) {
              message.error(t('errorSavingTypes'));
            } finally {
              setTypesModalOpen(false);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <label htmlFor="types-select" style={{ minWidth: 150 }}>
              {t('typesToHide')}
            </label>
            <div style={{ flex: 1 }}>
              <Select
                id="types-select"
                mode="multiple"
                style={{ width: '100%' }}
                placeholder={t('selectTypes')}
                value={selectedTypes}
                onChange={(v) => setSelectedTypes(Array.isArray(v) ? v : [])}
              >
                {(
                  allCollections?.find((c) => c.id === id)?.collectionTypes ||
                  []
                ).map((type) => (
                  <Select.Option key={type} value={type}>
                    {type}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </div>
          <Divider style={{ margin: '16px 0 12px' }} />
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>
              {t('typesOrder')}
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) => {
                if (over && active.id !== over.id) {
                  setTypesOrder((old) =>
                    arrayMove(
                      old,
                      old.indexOf(String(active.id)),
                      old.indexOf(String(over.id))
                    )
                  );
                }
              }}
            >
              <SortableContext
                items={typesOrder}
                strategy={verticalListSortingStrategy}
              >
                {typesOrder.map((type) => (
                  <SortableTypeItem key={type} id={type}>
                    <span style={{ fontSize: 13 }}>{type}</span>
                  </SortableTypeItem>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </Modal>
        <UploadDocumentsModal doneUploading={refetch} collectionId={id} />
        <Button
          color="primary"
          style={{ zIndex: 1, marginTop: 15 }}
          onPress={() => setUploadModalOpen(true)}
        >
          {t('uploadAnnotatedDocuments')}
        </Button>
      </PageContainer>
    </ToolbarLayout>
  );
};

// Protect this page - require authentication unless USE_AUTH is false
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false' && !isRequestFromIframe(context.req)) {
    const session = await getServerSession(context.req, context.res, authOptions);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Collection;
