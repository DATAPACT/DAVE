# DAVE: Document Assistant for Validation and Exploration

Powered by

<img src="https://www.unimib.it/sites/default/files/styles/foto_paragrafo_testo_640x360/public/logoist_3.jpg?itok=BigfOgRf" alt="UniMiB logo" width="80" />


Software GitHub Repository: [github.com/unimib-datAI/DAVE](https://github.com/unimib-datAI/DAVE)


## **General Description**

DAVE is an AI-powered framework designed for assisted analysis of document collections in knowledge-intensive domains. It enables domain experts to efficiently explore and analyze large text corpora through a combination of:

- **Entity-driven faceted search** for structured information retrieval
- **Conversational AI interface** for natural language queries
- **Interactive entity annotation and correction** for improved knowledge management

DAVE is particularly useful in domains such as **law, healthcare, finance, and real estate**, where factual data is closely tied to entities and their relationships.


## **Top Features**

- **Search & Filter:** Retrieve documents using keyword-based and entity-driven faceted search.
- **Explore:** Navigate documents based on extracted entities and metadata.
- **Conversational AI:** Ask natural language questions and receive relevant document-based answers.
- **Knowledge Consolidation:** Review and refine extracted annotations with user corrections.
- **Human-in-the-loop (HITL) Approach:** Users can continuously refine system-generated annotations.

## **Architecture**
![DAVE](./images/architecture.png)

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Docker** (version 20.10 or higher)
- **Docker Compose** (version 1.29 or higher)
- **Python** (version 3.8 or higher)
- **NVIDIA GPU** (optional, but recommended for text generation and vectorization services)

### Installing Docker and Docker Compose

#### On Linux:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

#### On macOS:
Download and install [Docker Desktop for Mac](https://docs.docker.com/desktop/mac/install/)

#### On Windows:
Download and install [Docker Desktop for Windows](https://docs.docker.com/desktop/windows/install/)

Verify installation:
```bash
docker --version
docker compose version
```

## Project Structure

```
DAVE/
├── backend/
│   ├── documents/          # Document service
│   ├── qavectorizer/       # Question-answering vectorizer service
│   └── text-generation/    # Text generation service
├── frontend/               # Next.js UI application
├── scripts/
│   ├── input_data/         # Place your GateNLP format documents here
│   ├── upload_mongo.py     # Script to upload documents to MongoDB
│   └── insert_elastic.py   # Script to index documents in Elasticsearch
├── mongo/                  # MongoDB data and initialization scripts
├── elasticsearch/          # Elasticsearch data
├── models/                 # ML models directory
├── docker-compose.yml      # Docker Compose configuration
├── requirements.txt        # Python dependencies
└── .env                    # Environment variables (create from .env.sample)
```

## Setup Instructions

### 1. Configure Environment Variables

Copy the sample environment file and configure it:

```bash
cp .env.sample .env
```

Edit the `.env` file and populate the following variables:

#### UI Configuration
- **`UI_ACCESS_USERNAME`** - Username for UI authentication (default: `admin`)
- **`UI_ACCESS_PASSWORD`** - Password for UI authentication (default: `password`)
- **`UI_NEXTAUTH_SECRET`** - Secret key for NextAuth.js session encryption (generate a random string)
- **`UI_NEXTAUTH_URL`** - NextAuth callback URL (default: `http://127.0.0.1:3000/dave/api/auth`)
- **`UI_NEXT_PUBLIC_BASE_PATH`** - Base path for the UI (default: `/dave`)
- **`UI_NEXT_PUBLIC_FULL_PATH`** - Full path URL for the UI (default: `http://127.0.0.1:3000/dave`)
- **`UI_API_LLM`** - Internal URL for text generation service
- **`UI_API_INDEXER`** - Internal URL for indexer service
- **`UI_VARIANT`** - UI variant configuration (default: `default`)
- **`LISTEN_UI`** - Port for UI service (default: `3000`)

#### MongoDB Configuration
- **`MONGO_ROOT_PASSWORD`** - Root password for MongoDB (change this!)
- **`MONGO_PASSWORD`** - Application user password for MongoDB (change this!)
- **`MONGO`** - MongoDB connection string (uses variables above)

#### Elasticsearch Configuration
- **`ELASTIC_INDEX`** - Name of the Elasticsearch index (default: `dave`)

#### Text Generation Configuration
- **`TEXT_GENERATION_ADDR`** - Internal URL for text generation service
- **`TEXT_GENERATION_GPU_LAYERS`** - Number of GPU layers to use (default: `35`)

#### QA Vectorizer Configuration
- **`HOST_BASE_URL`** - Base URL for the host (default: `http://0.0.0.0`)
- **`QAVECTORIZER_ADDR`** - Port for QA vectorizer service (default: `7863`)
- **`SENTENCE_TRANSFORMER_EMBEDDING_MODEL`** - Hugging Face model for embeddings
- **`SENTENCE_TRANSFORMER_DEVICE`** - Device for inference (`cuda` for GPU, `cpu` for CPU)
- **`OGG2NAME_INDEX`** - Index name for object-to-name mapping

#### General Configuration
- **`RESTART_POLICY`** - Docker restart policy (default: `unless-stopped`)

### 2. Install Python Dependencies

From the **root folder** of the project, install the required Python packages:

```bash
pip install -r requirements.txt
```

Or using a virtual environment (recommended):

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Start Docker Services

Launch all services using Docker Compose:

```bash
docker compose up -d
```

This command will:
- Build and start MongoDB
- Build and start Elasticsearch
- Build and start the document service
- Build and start the QA vectorizer service
- Build and start the text generation service
- Build and start the UI service

Check that all services are running:

```bash
docker compose ps
```

Wait for all services to be healthy (especially Elasticsearch, which may take a minute to initialize).

## Data Ingestion

### 4. Prepare Your Documents

Place your **GateNLP format documents** in the following directory:

```bash
scripts/input_data/
```

### 5. Upload Documents to MongoDB

From the **root folder**, run the MongoDB upload script:

```bash
python scripts/upload_mongo.py
```

This script will:
- Read GateNLP documents from `scripts/input_data/`
- Parse and validate the document format
- Upload documents to MongoDB

### 6. Index Documents in Elasticsearch

From the **root folder**, run the Elasticsearch indexing script:

```bash
python scripts/insert_elastic.py
```

This script will:
- Retrieve documents from MongoDB
- Process and vectorize the documents
- Index documents in Elasticsearch for fast searching

## Accessing the Application

Once all services are running and data is ingested, you can access the UI at:

```
http://127.0.0.1:3000/dave
```

### Important Note on Localhost

**Note:** If you experience connection issues, use `127.0.0.1` instead of `localhost`. Some systems have DNS resolution issues with `localhost` that can prevent proper connectivity.

## Service Ports

The following services are exposed on these ports:

- **UI**: `3000` (http://127.0.0.1:3000/dave)
- **MongoDB**: `27018` (internal: 27017)
- **Document Service**: `3001`
- **Elasticsearch**: `9200`
- **QA Vectorizer**: `7863`
- **Text Generation**: `7862`, `8000`

## Troubleshooting

### Services Not Starting

Check logs for a specific service:
```bash
docker compose logs -f <service_name>
```

Example:
```bash
docker compose logs -f ui
docker compose logs -f es
docker compose logs -f mongo
```

### Elasticsearch Memory Issues

If Elasticsearch fails to start, you may need to increase Docker's memory allocation:
- Docker Desktop: Go to Settings → Resources → Memory (set to at least 8GB)

### MongoDB Connection Issues

Verify MongoDB is running and accepting connections:
```bash
docker compose exec mongo mongosh -u root -p <MONGO_ROOT_PASSWORD>
```

### Python Script Errors

Ensure you're running scripts from the root folder:
```bash
# ✓ Correct
python scripts/upload_mongo.py

# ✗ Incorrect
cd scripts && python upload_mongo.py
```

### GPU Not Detected

If you have an NVIDIA GPU but it's not being used:
- Install [NVIDIA Docker runtime](https://github.com/NVIDIA/nvidia-docker)
- Verify with: `docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi`

## Stopping Services

To stop all services:

```bash
docker compose down
```

To stop and remove all data (volumes):

```bash
docker compose down -v
```

## Updating

To update the services after code changes:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Support

For issues or questions, please refer to the project documentation or contact the development team.


## **License**

DAVE is open-source and released under the [Apache-2.0](./LICENSE) License.

## **Additional Links**

Check out our demonstration video:  
[![Watch the Demo](https://img.shields.io/badge/Watch-Demo-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/watch?v=XG7RsI3t-2Q)