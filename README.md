# DAVE: Document Assistant for Validation and Exploration

Powered by

<img src="https://www.unimib.it/sites/default/files/styles/foto_paragrafo_testo_640x360/public/logoist_3.jpg?itok=BigfOgRf" alt="UniMiB logo" width="80" />


## **General Description**

DAVE is an AI-powered framework designed for assisted analysis of document collections in knowledge-intensive domains. It enables domain experts to efficiently explore and analyze large text corpora through a combination of:

- **Entity-driven faceted search** for structured information retrieval
- **Conversational AI interface** for natural language queries
- **Interactive entity annotation and correction** for improved knowledge management

DAVE is particularly useful in domains such as **law, healthcare, finance, and real estate**, where factual data is closely tied to entities and their relationships.


## **Related Compliance aspects**
- Traceability and Transparency of AI-Generated Outputs​
- Operational Human Oversight​
- PII Protection and Pseudonymization

## **Top Features**

- **Search & Filter:** Retrieve documents using keyword-based and entity-driven faceted search.
- **Explore:** Navigate documents based on extracted entities and metadata.
- **Conversational AI:** Ask natural language questions and receive relevant document-based answers.
- **Knowledge Consolidation:** Review and refine extracted annotations with user corrections.
- **Human-in-the-loop (HITL) Approach:** Users can continuously refine system-generated annotations.

## **Architecture**
![DAVE](./docs/images/architecture.png)



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

**NEW USER?** Follow the [Quick Start Checklist](docs/QUICK_START_CHECKLIST.md) for a step-by-step guide.

### 1. Configure Environment Variables

**IMPORTANT**: You MUST create a `.env` file before building the project. Skipping this step will cause build failures.

Copy the sample environment file and configure it:

```bash
cp .env.sample .env
```

#### Quick Start Configuration (Works Out of the Box)

The `.env.sample` file has working defaults for local development. For a quick start:

**Option 1: Use Defaults (Fastest)**

The `.env.sample` works as-is for local development. Just copy it:

```bash
cp .env.sample .env
```

**IMPORTANT:** You still need to configure Keycloak after starting the services. See [Keycloak Setup Guide](docs/KEYCLOAK_SETUP.md) for details.

**Option 2: Custom Configuration (Recommended for Production)**

If you want to customize or prepare for production:

1. **Generate and set `NEXTAUTH_SECRET`:**
   ```bash
   openssl rand -base64 32
   ```
   Copy the output and replace the value in `.env`

2. **Update MongoDB passwords:**
   - Change `MONGO_ROOT_PASSWORD` to a secure password
   - Change `MONGO_PASSWORD` to a different secure password
   - Update the password in `MONGO` connection string to match `MONGO_PASSWORD`

3. **Configure Keycloak client secret** (after creating the Keycloak client):
   - Follow the [Keycloak Setup Guide](docs/KEYCLOAK_SETUP.md)
   - Update `KEYCLOAK_SECRET` with the actual client secret from Keycloak

That's it! All other variables have sensible defaults for local development.

---

#### Environment Variables Quick Reference Table

| Category | Variable | Required | Default | Description |
|----------|----------|----------|---------|-------------|
| **Authentication** | `NEXTAUTH_SECRET` | No | `dev-secret-key...` | NextAuth.js secret (works for dev, change in production!) |
| | `NEXTAUTH_URL` | No | `http://127.0.0.1:3000/dave/api/auth` | Public auth callback URL |
| | `NEXTAUTH_URL_INTERNAL` | No | `http://localhost:3000` | Internal auth URL for server-side requests |
| **MongoDB** | `MONGO_ROOT_PASSWORD` | No | `dev_root_password_123` | MongoDB root password (change in production!) |
| | `MONGO_PASSWORD` | No | `dev_app_password_456` | MongoDB app user password (change in production!) |
| | `MONGO` | No | `mongodb://usr:dev_app_password_456@...` | MongoDB connection string (change passwords in production!) |
| **Frontend** | `LISTEN_UI` | No | `3000` | Port for UI service |
| | `ACCESS_USERNAME` | No | `admin` | Basic auth username (if not using Keycloak) |
| | `ACCESS_PASSWORD` | No | `password` | Basic auth password (change in production!) |
| | `NEXT_PUBLIC_BASE_PATH` | No | `/dave` | Base path for application URL |
| | `NEXT_PUBLIC_FULL_PATH` | No | `http://127.0.0.1:3000/dave` | Full public URL |
| | `VARIANT` | No | `default` | UI theme variant |
| **Keycloak (SSO)** | `USE_KEYCLOAK` | No | `true` | Enable Keycloak authentication |
| | `KEYCLOAK_ADMIN` | No | `admin` | Keycloak admin username |
| | `KEYCLOAK_ADMIN_PASSWORD` | No | `admin` | Keycloak admin password (change in production!) |
| | `KEYCLOAK_ID` | No | `dave_client` | Keycloak client ID |
| | `KEYCLOAK_SECRET` | Yes | `your-keycloak-secret-change-me` | Keycloak client secret (get from Keycloak admin console) |
| | `KEYCLOAK_ISSUER` | No | `http://keycloak:8080/realms/DAVE` | Keycloak realm issuer URL |
| **Elasticsearch** | `ELASTIC_INDEX` | No | `dave` | Elasticsearch index name |
| | `ELASTIC_PORT` | No | `9200` | Elasticsearch port |
| **Document Service** | `DOCS_PORT` | No | `3001` | Document service port |
| | `API_BASE_URI` | No | `http://documents:3001` | Internal document service URL |
| | `API_USERNAME` | No | `api_user` | Internal API username |
| | `API_PASSWORD` | No | `dev_api_password_789` | Internal API password (change in production!) |
| | `DOCUMENTS_JWT_SECRET` | No | `dev-jwt-secret-key...` | JWT secret for documents (change in production!) |
| **Text Generation** | `TEXT_GENERATION_ADDR` | No | `http://text-generation:8000` | Text generation service URL |
| | `API_LLM` | No | `http://text-generation:8000/v1` | LLM API endpoint |
| | `TEXT_GENERATION_GPU_LAYERS` | No | `35` | GPU layers for model (adjust for your GPU) |
| | `MODEL_NAME` | No | `default-model` | Text generation model name |
| **QA Vectorizer** | `QAVECTORIZER_ADDR` | No | `7863` | QA vectorizer service port |
| | `API_INDEXER` | No | `http://qavectorizer:7863` | Indexer API endpoint |
| | `SENTENCE_TRANSFORMER_EMBEDDING_MODEL` | No | `Alibaba-NLP/gte-multilingual-base` | Hugging Face embedding model |
| | `SENTENCE_TRANSFORMER_DEVICE` | No | `cuda` | Device for inference (`cuda` or `cpu`) |
| | `OGG2NAME_INDEX` | No | `dave_ogg2name` | Object-to-name mapping index |
| **Docker** | `RESTART_POLICY` | No | `unless-stopped` | Container restart policy |
| **Optional Features** | `NO_LOGIN` | No | `false` | Disable authentication (dev only) |
| | `LOCALE` | No | `ita` | Application language (`ita`, `eng`) |
| | `NEXT_PUBLIC_QUESTIONS` | No | - | Predefined chat questions (separated by `-\|`) |
| | `NEXT_PUBLIC_SYSTEM_PROMPT` | No | - | Custom AI system prompt |
| **Annotation Services** | `ANNOTATION_SPACYNER_URL` | No | - | SpaCy NER service URL (optional) |
| | `ANNOTATION_BLINK_URL` | No | - | BLINK entity linking URL (optional) |
| | `ANNOTATION_INDEXER_URL` | No | - | Annotation indexer URL (optional) |
| | `ANNOTATION_NILPREDICTION_URL` | No | - | NIL prediction service URL (optional) |
| | `ANNOTATION_NILCLUSTER_URL` | No | - | NIL clustering service URL (optional) |
| | `ANNOTATION_CONSOLIDATION_URL` | No | - | Annotation consolidation URL (optional) |

---

#### Detailed Environment Variables Reference

For production deployments or custom configurations, review and adjust these variables as needed:

#### Variables to Update (Development vs Production)

The `.env.sample` file has working defaults for all variables. For **local development**, you can use them as-is. For **production**, you should update these:

- **`NEXTAUTH_SECRET`** - Authentication secret for NextAuth.js
  - Development default: `dev-secret-key-change-in-production-use-openssl-rand-base64-32` (works but insecure)
  - Production: Generate with `openssl rand -base64 32`

- **`NEXTAUTH_URL`** - Public URL for authentication callbacks
  - Development default: `http://127.0.0.1:3000/dave/api/auth` (works for local)
  - Production: `https://yourdomain.com/dave/api/auth`

- **`MONGO_ROOT_PASSWORD`** - MongoDB root password
  - Development default: `dev_root_password_123` (works but insecure)
  - Production: Use a strong password

- **`MONGO_PASSWORD`** - MongoDB application user password
  - Development default: `dev_app_password_456` (works but insecure)
  - Production: Use a strong password (different from root password)

- **`MONGO`** - MongoDB connection string
  - Development default: `mongodb://usr:dev_app_password_456@mongo:27017/dave?authSource=admin` (works)
  - Production: Update password to match your `MONGO_PASSWORD`

- **`KEYCLOAK_SECRET`** - Keycloak client secret (MUST be set after Keycloak setup)
  - No working default - must get from Keycloak Admin Console
  - See [Keycloak Setup Guide](docs/KEYCLOAK_SETUP.md)

#### Docker Configuration

- **`RESTART_POLICY`** - Docker restart policy for all containers
  - Options: `no`, `always`, `on-failure`, `unless-stopped`
  - Default: `unless-stopped`

#### Keycloak Authentication (Optional - for SSO/OAuth)

DAVE supports Keycloak for enterprise SSO. If not using Keycloak, you can use basic authentication.

- **`USE_KEYCLOAK`** - Enable/disable Keycloak authentication
  - Default: `true`
  - Set to `false` to use basic auth only

- **`KEYCLOAK_DB_PASSWORD`** - Password for Keycloak's PostgreSQL database
  - Default: `keycloak`

- **`KEYCLOAK_ADMIN`** - Keycloak admin username
  - Default: `admin`

- **`KEYCLOAK_ADMIN_PASSWORD`** - Keycloak admin password
  - Default: `admin`
  - **Change in production!**

- **`KEYCLOAK_HOSTNAME`** - Hostname for Keycloak server
  - Default: `vm.chronos.disco.unimib.it`
  - Adjust for your domain

- **`KEYCLOAK_ISSUER`** - Keycloak realm issuer URL
  - Default: `http://keycloak:8080/realms/DAVE`

- **`KEYCLOAK_ID`** - Keycloak client ID
  - Default: `dave_client`

- **`KEYCLOAK_SECRET`** - Keycloak client secret
  - Default: `your-keycloak-secret-change-me`
  - **Change in production!**

#### Frontend (UI) Configuration

- **`LISTEN_UI`** - Port for the UI service to listen on
  - Default: `3000`

- **`ACCESS_USERNAME`** - Basic auth username for UI (when not using Keycloak)
  - Default: `admin`

- **`ACCESS_PASSWORD`** - Basic auth password for UI (when not using Keycloak)
  - Default: `password`
  - **Change in production!**

- **`NEXT_PUBLIC_BASE_PATH`** - Base path for the application in the URL
  - Default: `/dave`
  - Used for reverse proxy setups

- **`NEXT_PUBLIC_FULL_PATH`** - Full public URL for the application
  - Default: `http://127.0.0.1:3000/dave`
  - For production: `https://yourdomain.com/dave`

- **`NEXTAUTH_URL_INTERNAL`** - Internal NextAuth URL (for server-side requests)
  - Default: `http://localhost:3000`

- **`VARIANT`** - UI variant/theme configuration
  - Default: `default`

- **`HOST`** - Host binding for services
  - Default: `0.0.0.0`

- **`NEXT_PUBLIC_ELASTIC_INDEX`** - Elasticsearch index name (exposed to frontend)
  - Default: `dave`

**Optional UI Features:**

- **`NO_LOGIN`** - Disable authentication (development/testing only)
  - Default: `false`
  - Set to `true` to bypass login

- **`LOCALE`** - Application locale/language
  - Default: `ita` (Italian)
  - Other options: `eng` (English)

- **`NEXT_PUBLIC_QUESTIONS`** - Predefined chat questions (separated by `-|`)
  - Example: `What is this document about?-|Summarize the main points-|Who are the key entities?`

- **`NEXT_PUBLIC_SYSTEM_PROMPT`** - Custom system prompt for AI chat
  - Default: Uses built-in expert assistant prompt

#### Document Service Configuration

- **`DOCS_PORT`** - Port for the document service
  - Default: `3001`

- **`API_BASE_URI`** - Internal URL for document service API
  - Default: `http://documents:3001`

- **`API_USERNAME`** - Username for internal API authentication
  - Default: `api_user`

- **`API_PASSWORD`** - Password for internal API authentication
  - Default: `api_password_change_me`
  - **Change in production!**

- **`DOCUMENTS_JWT_SECRET`** - JWT secret for document service authentication
  - Default: `your-secret-key-change-in-production`
  - **Change in production!**

#### Elasticsearch Configuration

- **`ELASTIC_INDEX`** - Name of the Elasticsearch index
  - Default: `dave`

- **`ELASTIC_PORT`** - Elasticsearch port
  - Default: `9200`

#### Text Generation Service Configuration

- **`TEXT_GENERATION_ADDR`** - Internal URL for text generation service
  - Default: `http://text-generation:8000`

- **`TEXT_GENERATION_KEY`** - API key for text generation service
  - Default: `your-key`

- **`MODEL_NAME`** - Name of the text generation model
  - Default: `default-model`

- **`API_LLM`** - LLM API endpoint (OpenAI-compatible format)
  - Default: `http://text-generation:8000/v1`

- **`TEXT_GENERATION_GPU_LAYERS`** - Number of GPU layers to offload
  - Default: `35`
  - Adjust based on your GPU memory (higher = more GPU usage, faster inference)

- **`TEXT_GENERATION`** - Enable text generation features
  - Default: `true`

#### QA Vectorizer Service Configuration

- **`HOST_BASE_URL`** - Base URL for the vectorizer host
  - Default: `http://0.0.0.0`

- **`QAVECTORIZER_ADDR`** - Port for QA vectorizer service
  - Default: `7863`

- **`API_INDEXER`** - Indexer API endpoint (exposed to frontend)
  - Default: `http://qavectorizer:7863`

- **`CHROMA_PORT`** - Port for ChromaDB (if used)
  - Default: `8000`

- **`SENTENCE_TRANSFORMER_EMBEDDING_MODEL`** - Hugging Face model for embeddings
  - Default: `Alibaba-NLP/gte-multilingual-base`
  - Other options: `sentence-transformers/all-MiniLM-L6-v2`, `intfloat/multilingual-e5-large`

- **`SENTENCE_TRANSFORMER_DEVICE`** - Device for inference
  - Options: `cuda` (GPU), `cpu` (CPU)
  - Default: `cuda`

- **`OGG2NAME_INDEX`** - Elasticsearch index for object-to-name mapping
  - Default: `dave_ogg2name`

#### Annotation Pipeline Services (Optional)

These services enable advanced NER (Named Entity Recognition) and entity linking features. Leave empty if not using these features.

- **`ANONYMIZATION_ENDPOINT`** - URL for anonymization service
  - Optional, leave empty if not used

- **`ANNOTATION_SPACYNER_URL`** - URL for SpaCy NER annotation service
  - Optional, leave empty if not used

- **`ANNOTATION_BLINK_URL`** - URL for BLINK entity linking service
  - Optional, leave empty if not used

- **`ANNOTATION_INDEXER_URL`** - URL for annotation indexer service
  - Optional, leave empty if not used

- **`ANNOTATION_NILPREDICTION_URL`** - URL for NIL (Not In Lexicon) prediction service
  - Optional, leave empty if not used

- **`ANNOTATION_NILCLUSTER_URL`** - URL for NIL clustering service
  - Optional, leave empty if not used

- **`ANNOTATION_CONSOLIDATION_URL`** - URL for annotation consolidation service
  - Optional, leave empty if not used

#### Security Best Practices

1. **Never use default passwords in production** - Change all default passwords and secrets
2. **Generate strong secrets** - Use `openssl rand -base64 32` for all secret values
3. **Use HTTPS in production** - Configure a reverse proxy (nginx, traefik) with SSL/TLS
4. **Restrict network access** - Use firewall rules to limit access to services
5. **Keep credentials secure** - Never commit `.env` file to version control
6. **Regular updates** - Keep all services and dependencies up to date

#### Example Production Configuration

For production deployments, your `.env` should look similar to:

```bash
# Production example (DO NOT copy these exact values!)
NEXTAUTH_SECRET=Kx8vQ2pL9mR3wN7sJ4fY1hT6cV5bA0zE2gU8xD3qW9e=
NEXTAUTH_URL=https://yourdomain.com/dave/api/auth
MONGO_ROOT_PASSWORD=SecureRootPass123
MONGO_PASSWORD=SecureAppPass456
MONGO=mongodb://usr:SecureAppPass456@mongo:27017/dave?authSource=admin
KEYCLOAK_ADMIN_PASSWORD=SecureKeycloakAdmin789
DOCUMENTS_JWT_SECRET=JWTSecret234567890abcdef
```

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
- Build and start PostgreSQL (for Keycloak)
- Build and start Keycloak (authentication server)
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

Wait for all services to be healthy (especially Elasticsearch and Keycloak, which may take a minute to initialize).

### 4. Configure Keycloak Authentication

After the services start, you need to configure Keycloak:

1. **Access Keycloak Admin Console:**
   - URL: `http://127.0.0.1:8080`
   - Username: `admin`
   - Password: `admin`

2. **Follow the Keycloak Setup Guide:**
   - See [docs/KEYCLOAK_SETUP.md](docs/KEYCLOAK_SETUP.md) for detailed step-by-step instructions
   - Create the `DAVE` realm
   - Create the `dave_client` client
   - Get the client secret
   - Update `KEYCLOAK_SECRET` in your `.env` file
   - Create at least one user to log in with

3. **Restart the UI service** after updating the `.env`:
   ```bash
   docker compose restart ui
   ```

**Alternative:** If you don't want to use Keycloak, set `USE_KEYCLOAK=false` in `.env` and use basic authentication (username: `admin`, password: `password`).

## Data Ingestion

### 5. Prepare Your Documents

Place your **GateNLP format documents** in the following directory:

```bash
scripts/input_data/
```

### 6. Upload Documents to MongoDB

From the **root folder**, run the MongoDB upload script:

```bash
python scripts/upload_mongo.py
```

This script will:
- Read GateNLP documents from `scripts/input_data/`
- Parse and validate the document format
- Upload documents to MongoDB

### 7. Index Documents in Elasticsearch

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
- **Keycloak**: `8080` (http://127.0.0.1:8080)
- **PostgreSQL** (Keycloak DB): `5432` (internal only)
- **QA Vectorizer**: `7863`
- **Text Generation**: `7862`, `8000`

## Troubleshooting

### Build Fails with "Invalid URL" or "ERR_INVALID_URL"

**Error:**
```
TypeError [ERR_INVALID_URL]: Invalid URL
at parseUrl (.../next-auth/utils/parse-url.js:13:16)
```

**Solution:** This means your `.env` file is missing.

1. Ensure you created the `.env` file: `cp .env.sample .env`
2. The `.env.sample` already has correct defaults, so this should work immediately
3. Rebuild: `docker compose build --no-cache ui`

### Build Fails with Missing Function Import

**Error:**
```
Attempted import error: 'getStartAndEndIndexForPagination' is not exported from '@/utils/shared'
```

**Solution:** This is fixed in the latest version. Pull the latest changes:
```bash
git pull origin main
docker compose build --no-cache ui
```

### Cannot Log In to DAVE

**Error:** Login fails or redirects incorrectly

**Solution:** You need to configure Keycloak first.

1. Make sure you completed the Keycloak setup steps
2. Verify `KEYCLOAK_SECRET` in `.env` matches the secret from Keycloak admin console
3. Restart UI service: `docker compose restart ui`
4. See [Keycloak Setup Guide](docs/KEYCLOAK_SETUP.md) for detailed instructions

**Alternative:** Disable Keycloak and use basic auth:
```bash
# In .env file, set:
USE_KEYCLOAK=false

# Restart services
docker compose restart ui documents

# Log in with:
# Username: admin
# Password: password
```

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
docker compose logs -f keycloak
```

### Elasticsearch Memory Issues

If Elasticsearch fails to start, you may need to increase Docker's memory allocation:
- Docker Desktop: Go to Settings → Resources → Memory (set to at least 8GB)

### MongoDB Connection Issues

Verify MongoDB is running and accepting connections:
```bash
# Using default password from .env.sample
docker compose exec mongo mongosh -u root -p dev_root_password_123

# Or use your custom password if you changed it
docker compose exec mongo mongosh -u root -p <YOUR_MONGO_ROOT_PASSWORD>
```

### Python Script Errors

Ensure you're running scripts from the root folder:
```bash
# Correct
python scripts/upload_mongo.py

# Incorrect
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

## **Commercial Information**

| Organisation (s) | License Nature | License |
|------------------|----------------|---------|
| University of Milano-Bicocca  | Open Source | Apache-2.0 |

## **Expected KPIs**

|What (types)|How(Process)|Values|
|------------|------------|------|
|Quality of RAG responses to user prompts| Using internal benchmarks with ground truth answers, including  one internal benchmark from Philips BC of questions developed in the project |Recall@10 > 50% on retrieved context|
 User satisfaction when using the application|	Using a User Experience Questionnaire (UEQ)| Exceed the standard evaluation thresholds defined by the UEQ, on generated answer|

## **Related Project Links**
| Project Links |
| ------------- | 	
| Software GitHub Repository --> [github.com/unimib-datAI/DAVE](https://github.com/unimib-datAI/DAVE)

## **Additional Links**

Check out our demonstration video:  
[![Watch the Demo](https://img.shields.io/badge/Watch-Demo-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/watch?v=XG7RsI3t-2Q)

## **Cite this Work**

Agazzi, R., Alva Principe, R., Pozzi, R., Ripamonti, M., & Palmonari, M. (2025).
DAVE: A Framework for Assisted Analysis of Document Collections in Knowledge-Intensive Domains.
In Proceedings of the Thirty-Fourth International Joint Conference on Artificial Intelligence (IJCAI-25), Demo Track.
https://doi.org/10.24963/ijcai.2025/1246
