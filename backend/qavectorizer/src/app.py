import hashlib
import json
import logging
import os
import re
import uuid
from functools import lru_cache
from os import environ
from typing import List, Optional

import requests
import torch
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel
from retriever import DocumentRetriever
from sentence_transformers import SentenceTransformer
from settings import AppSettings
from transformers import AutoTokenizer
from utils import (
    collect_chunk_ranks,
    collect_chunk_ranks_full_text,
    get_facets_annotations,
    get_facets_annotations_no_agg,
    get_facets_metadata,
    get_hits,
    group_facets,
)
from vector_search import VectorSearch

from elasticsearch import Elasticsearch

logging.basicConfig(level=logging.DEBUG)


@lru_cache()
def get_settings():
    return AppSettings()


def get_device():
    """
    Automatically detect and return the appropriate device for model inference.
    Returns 'cuda' if CUDA is available, otherwise 'cpu'.
    """
    if torch.cuda.is_available():
        device = "cuda"
        logging.info(f"CUDA is available. Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = "cpu"
        logging.info("CUDA is not available. Using CPU for inference.")
    return device


# Setup FastAPI with comprehensive API documentation:
app = FastAPI(
    title="QA Vectorizer API",
    description="""
    QA Vectorizer API provides document indexing, search, and retrieval capabilities using Elasticsearch and vector embeddings.

    ## Features

    * **Vector Search**: Semantic search using sentence transformers and dense vector embeddings
    * **Hybrid Search**: Combines vector search with full-text search using RRF (Reciprocal Rank Fusion)
    * **Document Management**: Index, update, and delete documents with annotations
    * **Elasticsearch Integration**: Full Elasticsearch index management
    * **Annotation Support**: Handle document annotations and entity mentions
    * **Chunking**: Automatic document chunking with configurable parameters

    ## Authentication

    Currently, the API does not require authentication (CORS is open).
    """,
    version="1.0.0",
    contact={
        "name": "IKBP Team",
    },
    openapi_tags=[
        {
            "name": "Vector Search",
            "description": "Hybrid vector and full-text search operations. Note: Despite the legacy /chroma route name, this actually queries Elasticsearch.",
        },
        {
            "name": "Elasticsearch Index",
            "description": "Elasticsearch index management operations",
        },
        {
            "name": "Elasticsearch Documents",
            "description": "Document indexing and management operations",
        },
        {
            "name": "Elasticsearch Query",
            "description": "Search and query operations",
        },
    ],
)

# I need open CORS for my setup, you may not!!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateCollectionRequest(BaseModel):
    """Request model for creating a new collection"""

    name: str


class IndexDocumentRequest(BaseModel):
    """Request model for indexing documents with embeddings"""

    embeddings: List[List[float]]
    documents: List[str]
    metadatas: List[dict] = []


class QueryCollectionRquest(BaseModel):
    """Request model for querying a collection with vector search"""

    query: str
    filter_ids: List[str] = []
    k: int = 5
    where: dict = None
    include: List[str] = ["metadatas", "documents", "distances"]
    retrievalMethod: str = "full"
    force_rag: bool = False
    # Optional collection identifier to restrict searches to a single collection
    collectionId: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "query": "What is the verdict?",
                "filter_ids": ["doc123"],
                "k": 5,
                "retrievalMethod": "full",
                "force_rag": False,
                "collectionId": "my_collection_id",
            }
        }


class ChunkMetadata(BaseModel):
    """Metadata for a document chunk"""

    doc_id: str
    chunk_size: int

    class Config:
        json_schema_extra = {
            "example": {"doc_id": "a7f8d9e2c1b3456789abcdef", "chunk_size": 450}
        }


class DocumentChunk(BaseModel):
    """A chunk of a document with text and metadata"""

    id: str
    text: str
    metadata: ChunkMetadata

    class Config:
        json_schema_extra = {
            "example": {
                "id": "a7f8d9e2c1b3456789abcdef",
                "text": "Il Tribunale di Milano ha stabilito che la parte ricorrente ha diritto al risarcimento dei danni subiti. La decisione si basa sull'articolo 1223 del codice civile che stabilisce il principio del risarcimento integrale del danno.",
                "metadata": {"doc_id": "a7f8d9e2c1b3456789abcdef", "chunk_size": 245},
            }
        }


class DocumentInfo(BaseModel):
    """Full document information"""

    id: str
    name: str
    text: str
    preview: str
    annotation_sets: Optional[dict] = None
    features: Optional[dict] = None

    class Config:
        json_schema_extra = {
            "example": {
                "id": "a7f8d9e2c1b3456789abcdef",
                "name": "Sentenza 2023/001 - Tribunale di Milano",
                "text": "Il Tribunale di Milano, in data 15 gennaio 2023, ha emesso la seguente sentenza...",
                "preview": "Il Tribunale di Milano, in data 15 gennaio 2023...",
                "annotation_sets": {
                    "entities_": {"name": "entities_", "annotations": []}
                },
                "features": {"year": "2023", "court": "Milano"},
            }
        }


class QueryCollectionResponse(BaseModel):
    """Response model for query collection endpoint"""

    doc: DocumentInfo
    chunks: List[DocumentChunk]
    full_docs: bool

    class Config:
        json_schema_extra = {
            "example": {
                "doc": {
                    "id": "a7f8d9e2c1b3456789abcdef",
                    "name": "Sentenza 2023/001 - Tribunale di Milano",
                    "text": "Il Tribunale di Milano, in data 15 gennaio 2023, ha emesso la seguente sentenza. Il giudice Mario Rossi ha presieduto l'udienza...",
                    "preview": "Il Tribunale di Milano, in data 15 gennaio 2023...",
                    "annotation_sets": {
                        "entities_": {
                            "name": "entities_",
                            "annotations": [
                                {
                                    "id": 1,
                                    "type": "persona",
                                    "start": 89,
                                    "end": 100,
                                    "mention": "Mario Rossi",
                                }
                            ],
                        }
                    },
                    "features": {"year": "2023", "court": "Milano"},
                },
                "chunks": [
                    {
                        "id": "a7f8d9e2c1b3456789abcdef",
                        "text": "Il Tribunale di Milano ha stabilito che la parte ricorrente ha diritto al risarcimento dei danni subiti. La decisione si basa sull'articolo 1223 del codice civile.",
                        "metadata": {
                            "doc_id": "a7f8d9e2c1b3456789abcdef",
                            "chunk_size": 165,
                        },
                    },
                    {
                        "id": "a7f8d9e2c1b3456789abcdef",
                        "text": "La parte ricorrente, Giuseppe Verdi, ha presentato ricorso contro la parte convenuta, Antonio Bianchi, contestando la validità del contratto sottoscritto.",
                        "metadata": {
                            "doc_id": "a7f8d9e2c1b3456789abcdef",
                            "chunk_size": 156,
                        },
                    },
                ],
                "full_docs": False,
            }
        }


class CreateElasticIndexResponse(BaseModel):
    """Response model for creating an Elasticsearch index"""

    n_documents: int

    class Config:
        json_schema_extra = {
            "example": {
                "legal_documents": {
                    "aliases": {},
                    "mappings": {
                        "properties": {
                            "text": {"type": "text"},
                            "name": {"type": "keyword"},
                            "annotations": {"type": "nested"},
                            "metadata": {"type": "nested"},
                            "chunks": {"type": "nested"},
                        }
                    },
                    "settings": {
                        "index": {
                            "mapping": {"nested_objects": {"limit": "20000"}},
                            "number_of_shards": "1",
                            "number_of_replicas": "1",
                        }
                    },
                },
                "n_documents": 0,
            }
        }


class DeleteIndexResponse(BaseModel):
    """Response model for deleting an index"""

    count: int

    class Config:
        json_schema_extra = {"example": {"count": 1}}


class IndexDocumentResponse(BaseModel):
    """Response model for indexing a document"""

    result: str
    id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {"result": "created", "id": "a7f8d9e2c1b3456789abcdef"}
        }


class AnnotationUpdateResponse(BaseModel):
    """Response model for updating annotations"""

    result: str
    document_id: str
    annotations_count: int

    class Config:
        json_schema_extra = {
            "example": {
                "result": "updated",
                "document_id": "doc123",
                "annotations_count": 15,
            }
        }


class SearchHit(BaseModel):
    """A single search result hit"""

    id: str
    name: str
    text: str
    preview: Optional[str] = None
    score: float

    class Config:
        json_schema_extra = {
            "example": {
                "id": "doc123",
                "name": "Sentenza 2023/001",
                "text": "Full document text...",
                "preview": "Preview text...",
                "score": 12.5,
            }
        }


class FacetValue(BaseModel):
    """A facet value with count"""

    value: str
    count: int
    display_name: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "value": "entity_123",
                "display_name": "M**** R****",
                "count": 15,
            }
        }


class PaginationInfo(BaseModel):
    """Pagination information"""

    current_page: int
    total_pages: int
    total_hits: int

    class Config:
        json_schema_extra = {
            "example": {"current_page": 1, "total_pages": 5, "total_hits": 100}
        }


class QueryElasticIndexResponse(BaseModel):
    """Response model for querying an Elasticsearch index"""

    hits: List[SearchHit]
    facets: dict
    pagination: PaginationInfo

    class Config:
        json_schema_extra = {
            "example": {
                "hits": [
                    {
                        "id": "doc123",
                        "name": "Sentenza 2023/001",
                        "text": "Il Tribunale di Milano...",
                        "preview": "Il Tribunale...",
                        "score": 12.5,
                    }
                ],
                "facets": {
                    "annotations": {
                        "persona": [
                            {
                                "value": "entity_123",
                                "display_name": "M**** R****",
                                "count": 15,
                            }
                        ],
                        "parte": [
                            {
                                "value": "entity_456",
                                "display_name": "G****** V****",
                                "count": 8,
                            }
                        ],
                    },
                    "metadata": {
                        "Anno Sentenza": [
                            {"value": "2023", "count": 45},
                            {"value": "2022", "count": 38},
                        ]
                    },
                },
                "pagination": {
                    "current_page": 1,
                    "total_pages": 5,
                    "total_hits": 100,
                },
            }
        }


class GetElasticMappingRequest(BaseModel):
    """Request model for getting Elasticsearch index mapping"""

    index_name: str


class IndexElasticDocumentWithProcessingRequest(BaseModel):
    """Request model for indexing a document with full processing (annotations, chunking, embeddings)"""

    text: str
    id: str
    collectionId: str
    annotation_sets: Optional[dict] = None
    preview: Optional[str] = None
    name: Optional[str] = None
    features: Optional[dict] = None
    offset_type: Optional[str] = None
    text_deanonymized: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "text": "This is the full text of the legal document...",
                "collectionId": "collection id",
                "name": "Document Title",
                "preview": "This is a preview...",
                "annotation_sets": {},
                "features": {},
                "offset_type": "character",
                "text_deanonymized": "This is the de-anonymized text...",
            }
        }


class CustomJSONResponse(JSONResponse):
    media_type = "application/json"

    def render(self, content: any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


@app.post(
    "/chroma/collection/{collection_name}/query",
    response_class=CustomJSONResponse,
    tags=["Vector Search"],
    summary="Hybrid vector and full-text search (Elasticsearch)",
    description="""
    Perform hybrid vector and full-text search using RRF (Reciprocal Rank Fusion).

    **Note:** Despite the legacy route name `/chroma`, this endpoint queries Elasticsearch, not ChromaDB.
    The route name will be updated in a future version.

    This endpoint combines:
    - Dense vector search using sentence embeddings (via Elasticsearch kNN)
    - Full-text search matching (via Elasticsearch query_string)
    - Entity matching (unless disabled with retrievalMethod='hibrid_no_ner')

    The results from different search methods are combined using Reciprocal Rank Fusion (RRF)
    to provide the most relevant document chunks.

    **Parameters:**
    - `collection_name`: Name of the Elasticsearch index to search
    - Request body contains query text, filters, and retrieval method configuration

    Returns ranked document chunks with their parent documents and metadata.
    """,
    response_description="List of documents with relevant chunks ranked by RRF score",
)
async def query_collection(
    collection_name: str,
    req: QueryCollectionRquest,
):
    # Prefer collectionId in JSON body, fallback to X-Collection-Id header
    collection_id = None
    if getattr(req, "collectionId", None):
        collection_id = req.collectionId

    # Delegate to VectorSearch class
    doc_results = vector_search.search(
        collection_name=collection_name,
        query=req.query,
        retrieval_method=req.retrievalMethod,
        filter_ids=req.filter_ids if hasattr(req, "filter_ids") else None,
        collection_id=collection_id,
        force_rag=req.force_rag if hasattr(req, "force_rag") else False,
        collect_chunk_ranks_fn=collect_chunk_ranks,
        collect_chunk_ranks_full_text_fn=collect_chunk_ranks_full_text,
    )

    return doc_results


def get_string_hash(input_string):
    """Generate SHA256 hash for a given string."""
    hash_object = hashlib.sha256()
    hash_object.update(input_string.encode("utf-8"))
    return hash_object.hexdigest()


def process_annotation(annotation, text, document_id):
    """Process a single annotation into the required format."""
    name = text[annotation["start"] : annotation["end"]]

    ann_object = {
        "mention": name,
        "start": annotation["start"],
        "end": annotation["end"],
        "id": annotation["id"],
        "type": annotation["type"],
    }

    # Handle linking information
    if "linking" in annotation.get("features", {}) and not annotation["features"][
        "linking"
    ].get("is_nil", True):
        linking = annotation["features"]["linking"]
        ann_object.update(
            {
                "display_name": annotation["features"].get("title", name),
                "is_linked": True,
                "id_ER": linking.get("top_candidate", {}).get("url", ""),
            }
        )
    else:
        ann_object.update(
            {"display_name": name, "is_linked": False, "id_ER": f"{document_id}_{name}"}
        )

    return ann_object


def clean_document_data(file_object):
    """Clean and prepare document data for indexing."""
    # Remove unnecessary fields
    for key in ["annotation_sets", "annoation_sets", "features", "_id"]:
        if key in file_object:
            del file_object[key]

    # Ensure required fields exist
    if "metadata" not in file_object:
        file_object["metadata"] = []

    return file_object


def get_index_settings():
    """Get the index settings with custom nested object limit."""
    return {
        "settings": {"index.mapping.nested_objects.limit": 20000},
        "mappings": {
            "properties": {
                "text": {"type": "text"},
                "text_deanonymized": {"type": "text"},
                "name": {"type": "keyword"},
                "preview": {"type": "keyword"},
                "id": {"type": "keyword"},
                "metadata": {
                    "type": "nested",
                    "properties": {
                        "type": {"type": "keyword"},
                        "value": {"type": "keyword"},
                    },
                },
                "annotations": {
                    "type": "nested",
                    "properties": {
                        "mention": {"type": "keyword"},
                        "start": {"type": "integer"},
                        "end": {"type": "integer"},
                        "display_name": {"type": "keyword"},
                        "id": {"type": "integer"},
                        "type": {"type": "keyword"},
                        "is_linked": {"type": "boolean"},
                        "id_ER": {"type": "keyword"},
                    },
                },
                "chunks": {
                    "type": "nested",
                    "properties": {
                        "vectors": {
                            "type": "nested",
                            "properties": {
                                "predicted_value": {
                                    "type": "dense_vector",
                                    "index": True,
                                    "dims": 768,
                                    "similarity": "cosine",
                                },
                                "text": {"type": "text"},
                                "entities": {"type": "text"},
                            },
                        },
                    },
                },
            }
        },
    }


class CreateElasticIndexRequest(BaseModel):
    """Request model for creating an Elasticsearch index"""

    name: str

    class Config:
        json_schema_extra = {"example": {"name": "legal_documents"}}


@app.post(
    "/elastic/index",
    tags=["Elasticsearch Index"],
    summary="Create or get Elasticsearch index",
    description="""
    Create a new Elasticsearch index with predefined settings for document search.

    If the index already exists, returns the existing index configuration.

    Index settings include:
    - Nested object limit: 20000
    - Text fields for full-text search
    - Nested annotations and metadata
    - Dense vector fields for semantic search (768 dimensions, cosine similarity)
    """,
    response_description="Index configuration and document count",
)
def create_elastic_index(req: CreateElasticIndexRequest):
    if es_client.indices.exists(index=req.name):
        index = es_client.indices.get(index=req.name)
        count = es_client.count(index=req.name)

        return {**index, "n_documents": count}

    index_settings = get_index_settings()
    es_client.indices.create(index=req.name, **index_settings)

    index = es_client.indices.get(index=req.name)

    return {**index, "n_documents": 0}


@app.delete(
    "/elastic/index/{index_name}",
    tags=["Elasticsearch Index"],
    summary="Delete an Elasticsearch index",
    description="Delete an Elasticsearch index and all its documents permanently.",
    response_description="Deletion confirmation",
)
def delete_elastic_index(index_name: str):
    try:
        es_client.indices.delete(index=index_name)
        return {"count": 1}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Error while deleting index")


class IndexElasticDocumentRequest(BaseModel):
    """Request model for indexing a raw document"""

    doc: dict

    class Config:
        json_schema_extra = {
            "example": {
                "doc": {
                    "id": "doc123",
                    "text": "Document content here...",
                    "name": "Document Title",
                    "metadata": [],
                }
            }
        }


class AddAnnotationsRequest(BaseModel):
    """Request model for adding annotations to a document"""

    mentions: List[dict]

    class Config:
        json_schema_extra = {
            "example": {
                "mentions": [
                    {
                        "id": 1,
                        "mention": "John Doe",
                        "type": "persona",
                        "start": 10,
                        "end": 18,
                        "is_linked": False,
                        "id_ER": "1",
                    }
                ]
            }
        }


def index_elastic_document_raw(doc, index_name):
    res = es_client.index(index=index_name, document=doc)
    es_client.indices.refresh(index=index_name)
    return res["result"]


@app.post(
    "/elastic/index/{index_name}/doc",
    tags=["Elasticsearch Documents"],
    summary="Index a raw document",
    description="Index a document directly into Elasticsearch without processing.",
    response_description="Indexing result status",
)
def index_elastic_document(req: IndexElasticDocumentRequest, index_name: str):
    return index_elastic_document_raw(req.doc, index_name)


@app.delete(
    "/elastic/index/{index_name}/doc/{doc_id}",
    tags=["Elasticsearch Documents"],
    summary="Delete a document by ID",
    description="Delete a specific document from an Elasticsearch index by its document ID.",
    response_description="Deletion confirmation",
)
def delete_elastic_document(index_name: str, doc_id: str):
    try:
        response = es_client.delete_by_query(
            index=index_name, body={"query": {"term": {"id": doc_id}}}
        )
        return {"deleted": response["deleted"]}
    except Exception as e:
        logging.error(f"Error deleting document {doc_id} from index {index_name}: {e}")
        raise HTTPException(
            status_code=404, detail=f"Document {doc_id} not found in index {index_name}"
        )


def ogg2name(ogg):
    return ogg2name_index.get(ogg, "UNKNOWN")


def tipodoc2name(tipo):
    # TODO
    if tipo == "S":
        return "Sentenza"
    else:
        return tipo


def anonymize(s, s_type="persona", anonymize_type=["persona"]):
    if not s:
        return ""
    if s_type in anonymize_type:
        words = s.split()
        new_words = ["".join([word[0]] + ["*" * (len(word) - 1)]) for word in words]
        return " ".join(new_words)
    else:
        return s


@app.post(
    "/elastic/index/{index_name}/doc/{document_id}/annotations",
    tags=["Elasticsearch Documents"],
    summary="Add annotations to a document",
    description="""
    Add or update annotations (entity mentions) for a specific document.

    Annotations include:
    - Entity mentions (persona, parte, controparte, etc.)
    - Entity linking information
    - Start/end positions in the text
    - Display names with optional anonymization
    """,
    response_description="Update result with annotation count",
)
def add_annotations_to_document(
    index_name: str, document_id: str, req: AddAnnotationsRequest
):
    try:
        # First get the document
        doc_query = {
            "query": {
                "bool": {
                    "should": [
                        {"term": {"id": document_id}},
                        {"term": {"mongo_id": document_id}},
                    ]
                }
            }
        }

        search_result = es_client.search(index=index_name, body=doc_query)

        if search_result["hits"]["total"]["value"] == 0:
            raise HTTPException(
                status_code=404, detail=f"Document with ID {document_id} not found"
            )

        # Get the document ID in Elasticsearch
        es_doc_id = search_result["hits"]["hits"][0]["_id"]

        # Create the complete annotations array directly from the request
        annotations = []
        for mention in req.mentions:
            annotation = {
                "id": mention.get("id"),
                "id_ER": mention.get("id_ER", ""),
                "start": mention.get("start", 0),
                "end": mention.get("end", 0),
                "type": mention.get("type", "unknown"),
                "mention": mention.get("mention", ""),
                "is_linked": mention.get("is_linked", False),
                "display_name": mention.get(
                    "display_name",
                    anonymize(mention.get("mention", ""))
                    if mention.get("type") in ["persona", "parte", "controparte"]
                    else mention.get("mention", ""),
                ),
                "anonymize": mention.get("type") in ["persona", "parte", "controparte"],
            }
            annotations.append(annotation)

        # Direct update of the entire annotations array in a single operation
        result = es_client.update(
            index=index_name,
            id=es_doc_id,
            body={"doc": {"annotations": annotations}},
            refresh=True,
        )

        return {
            "result": result["result"],
            "document_id": document_id,
            "annotations_count": len(annotations),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating annotations: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating annotations: {str(e)}"
        )


@app.post(
    "/elastic/index/{index_name}/doc/mongo",
    tags=["Elasticsearch Documents"],
    summary="Index a MongoDB document",
    description="""
    Index a document from MongoDB format with automatic metadata mapping.

    Automatically maps MongoDB document fields to Elasticsearch schema and processes entity clusters.
    """,
    response_description="Indexing result status",
)
def index_elastic_document_mongo(req: IndexElasticDocumentRequest, index_name: str):
    METADATA_MAP = {
        "annosentenza": "Anno Sentenza",
        "annoruolo": "Anno Rouolo",
        "codiceoggetto": lambda x: ogg2name(x),
        "parte": "Parte",
        "controparte": "Controparte",
        "nomegiudice": "Nome Giudice",
        "tipodocumento": lambda x: tipodoc2name(x),
    }

    mongo_doc = req.doc

    doc = {}
    doc["mongo_id"] = mongo_doc["id"]
    doc["name"] = mongo_doc["name"]
    doc["text"] = mongo_doc["text"]
    doc["metadata"] = [
        {"type": mk, "value": mv}
        for mk, mv in mongo_doc["features"].items()
        if mk in METADATA_MAP
    ]

    doc["annotations"] = [
        {
            "id": cluster["id"],
            # this will be a real ER id when it exists
            "id_ER": cluster["id"],
            "start": 0,
            "end": 0,
            "type": cluster["type"],
            "mention": cluster["title"],
            "is_linked": bool(cluster.get("url", False)),
            # this is temporary, there will be a display name directly in the annotaion object
            "display_name": anonymize(cluster["type"], cluster["title"]),
        }
        for cluster in mongo_doc["features"]["clusters"]["entities_merged"]
    ]

    return index_elastic_document_raw(doc, index_name)


class QueryElasticIndexRequest(BaseModel):
    """Request model for querying an Elasticsearch index"""

    text: str
    metadata: list = None
    annotations: list = None
    n_facets: int = 20
    page: int = 1
    documents_per_page: int = 20
    collection_id: Optional[str] = None
    is_anonymized: bool = True

    class Config:
        json_schema_extra = {
            "example": {
                "text": "search query",
                "page": 1,
                "documents_per_page": 20,
                "metadata": [{"type": "Anno Sentenza", "value": "2023"}],
                "annotations": [{"type": "persona", "value": "entity_id"}],
                "is_anonymized": True,
            }
        }


@app.post(
    "/elastic/index/{index_name}/query",
    tags=["Elasticsearch Query"],
    summary="Query an Elasticsearch index",
    description="""
    Search documents in an Elasticsearch index with filtering and faceting.

    Features:
    - Full-text search on document content
    - Filter by metadata (year, type, etc.)
    - Filter by annotations (entities, persons, etc.)
    - Faceted search results
    - Pagination support
    """,
    response_description="Search results with hits, facets, and pagination info",
)
async def query_elastic_index(
    index_name: str,
    req: QueryElasticIndexRequest,
):
    from_offset = (req.page - 1) * req.documents_per_page
    print(f"requested collection ID: {req.collection_id}")
    # Initialize with empty must array
    query = {
        "bool": {
            "must": [],
            "filter": {"bool": {"should": []}},
        },
    }

    # Add text query or match_all
    # Use text_deanonymized field if is_anonymized is False, otherwise use text field
    if req.text and req.text.strip():
        search_field = "text" if req.is_anonymized else "text_deanonymized"
        print(
            f"DEBUG: is_anonymized={req.is_anonymized}, searching in field='{search_field}'"
        )
        query["bool"]["must"].append(
            {"query_string": {"query": req.text, "default_field": search_field}}
        )
    else:
        query["bool"]["must"].append({"match_all": {}})

    # Add collection filter if provided (use keyword OR phrase-match to tolerate text/keyword mappings)
    if req.collection_id:
        query["bool"]["must"].append(
            {
                "bool": {
                    "should": [
                        {"term": {"collectionId.keyword": req.collection_id}},
                        {"match_phrase": {"collectionId": req.collection_id}},
                    ],
                    "minimum_should_match": 1,
                }
            }
        )

    # print("annotations", req.annotations)
    if req.annotations != None and len(req.annotations) > 0:
        for annotation in req.annotations:
            query["bool"]["filter"]["bool"]["should"].append(
                {
                    "nested": {
                        "path": "annotations",
                        "query": {
                            "bool": {
                                "must": [
                                    {
                                        "term": {
                                            "annotations.id_ER": annotation["value"]
                                        }
                                    },
                                    {"term": {"annotations.type": annotation["type"]}},
                                ],
                            }
                        },
                    }
                },
            )

    if req.metadata != None and len(req.metadata) > 0:
        for metadata in req.metadata:
            query["bool"]["filter"]["bool"]["should"].append(
                {
                    "nested": {
                        "path": "metadata",
                        "query": {
                            "bool": {
                                "must": [
                                    {"term": {"metadata.value": metadata["value"]}},
                                    {"term": {"metadata.type": metadata["type"]}},
                                ],
                            }
                        },
                    }
                },
            )
    # get all docs if req.text is empty
    # if (req.text == "" or req.text == None or req.text == " ") and (req.metadata == None or len(req.metadata) == 0) and (req.annotations == None or len(req.annotations) == 0):
    print(query)

    # Execute main query for documents (fast, no aggregations)
    try:
        search_res = es_client.search(
            index=index_name,
            size=20,
            source_excludes=["chunks", "annotation_sets"],
            from_=from_offset,
            query=query,
            timeout="10s",
        )
    except Exception as e:
        logging.error(f"Error executing main ES search: {e}")
        raise

    # Safely extract hit count
    try:
        total_hits = search_res.get("hits", {}).get("total", {}).get("value", 0)
    except Exception:
        total_hits = 0

    # If zero hits and a collection filter was provided, do not attempt any fallbacks.
    # Keep behavior strict: respect the requested collection_id and simply log the condition.
    if total_hits == 0 and getattr(req, "collection_id", None):
        logging.warning(
            f"Elastic search returned 0 hits for index='{index_name}', collection_id='{req.collection_id}'. No fallbacks will be performed."
        )

    hits = get_hits(search_res)
    total_hits = search_res["hits"]["total"]["value"]

    # Fetch a larger sample of documents for facet calculation (fast query, just for facets)
    facet_sample_size = min(200, total_hits)  # Get up to 200 docs for facets

    if facet_sample_size > 20:  # Only do separate query if we need more docs
        try:
            facet_res = es_client.search(
                index=index_name,
                size=facet_sample_size,
                _source=[
                    "annotations",
                    "metadata",
                ],  # Only fetch what we need for facets
                query=query,
                timeout="5s",
            )
            # Use the larger sample for facets
            annotations_facets = get_facets_annotations_no_agg(facet_res)
            annotations_facets = group_facets(annotations_facets)
            metadata_facets = get_facets_metadata(facet_res)
        except Exception as e:
            logging.warning(f"Facet query failed, using page results: {e}")
            # Fallback to current page
            annotations_facets = get_facets_annotations_no_agg(search_res)
            annotations_facets = group_facets(annotations_facets)
            metadata_facets = get_facets_metadata(search_res)
    else:
        # Use the current page results for facets
        annotations_facets = get_facets_annotations_no_agg(search_res)
        annotations_facets = group_facets(annotations_facets)
        metadata_facets = get_facets_metadata(search_res)

    num_pages = total_hits // req.documents_per_page
    if (
        total_hits % req.documents_per_page > 0
    ):  # if there is a remainder, add one more page
        num_pages += 1
    print(f"length of results: {len(hits)}")
    print(f"annotations aggregated: {annotations_facets}")
    return {
        "hits": hits,
        "facets": {"annotations": annotations_facets, "metadata": metadata_facets},
        "pagination": {
            "current_page": req.page,
            "total_pages": num_pages,
            "total_hits": total_hits,
        },
    }


@app.get(
    "/elastic/index/{index_name}/mapping",
    tags=["Elasticsearch Index"],
    summary="Get index mapping",
    description="Retrieve the Elasticsearch mapping for an index to inspect field types and structure.",
    response_description="Index mapping configuration",
)
def get_elastic_mapping(index_name: str):
    """Get the Elasticsearch mapping for an index to help diagnose type issues."""
    try:
        mapping = es_client.indices.get_mapping(index=index_name)
        return mapping
    except Exception as e:
        return {"error": str(e)}


@app.post(
    "/{elastic_index}/_doc",
    tags=["Elasticsearch Documents"],
    summary="Index document with full processing",
    description="""
    Index a document with complete processing pipeline:

    1. **Annotation Processing**: Extract and process entity annotations
    2. **Text Chunking**: Split document into chunks (500 chars, 100 overlap)
    3. **Embedding Generation**: Generate vector embeddings using sentence transformers
    4. **Indexing**: Store in Elasticsearch with all metadata

    This is the recommended endpoint for indexing new documents.
    """,
    response_description="Indexing result with document ID",
)
def index_document_with_processing(
    elastic_index: str, req: IndexElasticDocumentWithProcessingRequest
):
    """Index a document with full processing: annotations, chunking, embeddings."""

    try:
        print(f"=== Indexing document to {elastic_index} ===")
        print(f"Document name: {req.name}")
        print(f"Text length: {len(req.text) if req.text else 0}")
        print(f"Has annotation_sets: {req.annotation_sets is not None}")
        print(f"Has collection id {req.collectionId}")
        print(f"Has de-anonymized text: {req.text_deanonymized is not None}")

        # Debug: Check if text_deanonymized is available or using fallback
        if req.text_deanonymized:
            print("DEBUG: text_deanonymized is available, using it")
        else:
            print(
                "DEBUG: text_deanonymized is NOT available, using fallback to text field"
            )

        # Prepare the document
        file_object = {
            "id": req.id,
            "text": req.text,
            "text_deanonymized": req.text_deanonymized
            if req.text_deanonymized
            else req.text,
            "annotation_sets": req.annotation_sets,
            "preview": req.preview,
            "name": req.name,
            "features": req.features,
            "offset_type": req.offset_type,
            "collectionId": req.collectionId,
        }

        # Generate document ID
        # file_object["id"] = get_string_hash(file_object["text"])
        # print(f"Generated document ID: {file_object['id']}")

        # Process annotations
        annotations = []
        annotation_sets = file_object.get("annotation_sets", {}) or {}
        print(f"annotation_sets keys: {list(annotation_sets.keys())}")
        entities = annotation_sets.get("entities_", {})
        print(f"entities_ keys: {list(entities.keys()) if entities else 'None'}")
        raw_annotations = entities.get("annotations", [])
        print(f"Number of raw annotations to process: {len(raw_annotations)}")

        for i, annotation in enumerate(raw_annotations):
            try:
                ann_object = process_annotation(
                    annotation, file_object["text"], file_object["id"]
                )
                annotations.append(ann_object)
                if i < 3:  # Log first 3 annotations for debugging
                    print(
                        f"Processed annotation {i}: {ann_object.get('mention', 'N/A')} (type: {ann_object.get('type', 'N/A')})"
                    )
            except Exception as e:
                print(f"Warning: Error processing annotation {i}: {e}")
                print(f"Annotation data: {annotation}")
                continue

        file_object["annotations"] = annotations
        print(f"Total annotations processed and added: {len(annotations)}")

        # Clean up the document
        file_object = clean_document_data(file_object)

        # Ensure index exists
        if not es_client.indices.exists(index=elastic_index):
            index_settings = get_index_settings()
            es_client.indices.create(index=elastic_index, **index_settings)

        # Chunk and embed - use de-anonymized text for embeddings if available
        text_for_chunking = req.text_deanonymized if req.text_deanonymized else req.text

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=100,
            length_function=len,
        )
        chunks = text_splitter.split_text(text_for_chunking)

        # Also chunk the anonymized text for preview purposes
        chunks_anonymized = text_splitter.split_text(file_object["text"])

        if chunks:
            embeddings = model.encode(chunks, show_progress_bar=False)

            passages_body = []
            for i, (emb, chunk) in enumerate(zip(embeddings, chunks)):
                # Store both anonymized and de-anonymized versions
                chunk_anonymized = (
                    chunks_anonymized[i] if i < len(chunks_anonymized) else chunk
                )
                passages_body.append(
                    {
                        "vectors": {
                            "predicted_value": emb.tolist(),
                            "text": chunk,  # De-anonymized text for generation
                            "text_anonymized": chunk_anonymized,  # Anonymized text for preview
                            "entities": "",
                        }
                    }
                )

            file_object["chunks"] = passages_body

        # Index the document
        print(
            f"Indexing document with {len(file_object.get('annotations', []))} annotations..."
        )
        res = es_client.index(index=elastic_index, document=file_object)
        es_client.indices.refresh(index=elastic_index)
        print(f"Document indexed successfully: {res['result']}")
        print(f"=== Indexing complete ===")

        return {"result": res["result"], "id": file_object["id"]}

    except Exception as e:
        print(f"ERROR in index_document_with_processing: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Error processing document: {str(e)}"
        )


settings = get_settings()
print(settings.dict())
logger = logging.getLogger(__name__)

# if not os.getenv("ENVIRONMENT", "production") == "dev":
# Automatically detect the best device (CUDA or CPU)
device = get_device()
print(f"Available device {device}")
model = SentenceTransformer(
    environ.get(
        "SENTENCE_TRANSFORMER_EMBEDDING_MODEL", "Alibaba-NLP/gte-multilingual-base"
    ),
    device=device,
    trust_remote_code=True,
)
# Override with environment variable if specified, otherwise use auto-detected device
target_device = environ.get("SENTENCE_TRANSFORMER_DEVICE", device)
print(f"Model loaded on device: {model.device}")
model = model.eval()
tokenizer = AutoTokenizer.from_pretrained("microsoft/Phi-3.5-mini-instruct")

# Print each collection
# for collection in collections:
#     print(collection)
_ES_HOST = environ.get("ES_HOST", "es")
_ES_PORT = int(settings.elastic_port)
print(
    "starting es client",
    {
        "host": _ES_HOST,
        "scheme": "http",
        "port": _ES_PORT,
    },
)
es_client = Elasticsearch(
    hosts=[
        {
            "host": _ES_HOST,
            "scheme": "http",
            "port": _ES_PORT,
        }
    ],
    request_timeout=60,
    # headers={
    #     "accept": "application/vnd.elasticsearch+json; compatible-with=8",
    #     "content_type": "application/vnd.elasticsearch+json; compatible-with=8",
    # },
)

# Create retrievers based on .env pipeline addresses and docker-compose UI elastic indexes
retrievers = {}
retrievers["batini"] = DocumentRetriever(
    url=environ.get("PIPELINE_ADDRESS", "http://10.0.0.108:3001") + "/api/document"
)
retrievers["bologna_renzo_matched_1"] = DocumentRetriever(
    url=environ.get("DEMO_PIPELINE_ADDRESS", "http://10.0.0.108:3002") + "/api/document"
)
retrievers["sperimentazione"] = DocumentRetriever(
    url=environ.get("SPERIMENTAZIONE_PIPELINE_ADDRESS", "http://10.0.0.108:3003")
    + "/api/document"
)
retrievers["indagini"] = DocumentRetriever(
    url=environ.get("INDAGINI_PIPELINE_ADDRESS", "http://10.0.0.108:3004")
    + "/api/document"
)
retrievers["mirko"] = DocumentRetriever(
    url=environ.get("MIRKO_PIPELINE_ADDRESS", "http://10.0.0.108:3005")
    + "/api/document"
)
retrievers["doc_eng_1"] = DocumentRetriever(
    url=environ.get("RENZO_PIPELINE_ADDRESS", "http://10.0.0.108:3006")
    + "/api/document"
)
retrievers["messages"] = DocumentRetriever(
    url=environ.get("MESSAGES_PIPELINE_ADDRESS", "http://10.0.0.108:3007")
    + "/api/document"
)
retrievers["eu"] = DocumentRetriever(
    url=environ.get("EU_PIPELINE_ADDRESS", "http://10.0.0.108:3008") + "/api/document"
)
retrievers["eu_v2"] = DocumentRetriever(
    url=environ.get("EU_V2_PIPELINE_ADDRESS", "http://10.0.0.108:3009")
    + "/api/document"
)
retrievers["anonymization"] = DocumentRetriever(
    url=environ.get("ANONYMIZATION_PIPELINE_ADDRESS", "http://documents:3001")
    + "/api/document"
)
retrievers["anonymized"] = DocumentRetriever(
    url=environ.get("ANONYMIZATION_PIPELINE_ADDRESS", "http://documents:3001")
    + "/api/document"
)
retrievers["eu_anonymized"] = DocumentRetriever(
    url="http://10.0.0.108:3011/api/document"
)
retriever = retrievers["batini"]  # default retriever

# Initialize VectorSearch
vector_search = VectorSearch(
    model=model,
    es_client=es_client,
    tokenizer=tokenizer,
    retrievers=retrievers,
    default_retriever=retriever,
)

# if not os.getenv("ENVIRONMENT", "production") == "dev":
#     with open(environ.get("OGG2NAME_INDEX"), "r") as fd:
#         ogg2name_index = json.load(fd)

# [start fastapi]:
_PORT = int(settings.indexer_server_port)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=_PORT)
