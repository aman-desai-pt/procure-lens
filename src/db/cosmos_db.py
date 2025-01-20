from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass
from enum import Enum
import asyncio
import logging
from langchain_community.vectorstores.azure_cosmos_db import (
    AzureCosmosDBVectorSearch,
    CosmosDBSimilarityType,
    CosmosDBVectorSearchType,
)
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_core.documents import Document
from src.config.config import Settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SearchType(Enum):
    SIMILARITY = "similarity"
    MMR = "mmr"
    SIMILARITY_THRESHOLD = "similarity_threshold"

@dataclass
class BatchConfig:
    batch_size: int = 100
    max_concurrency: int = 4

@dataclass
class VectorSearchConfig:
    num_lists: int = 100
    dimensions: int = 1536  
    similarity_type: CosmosDBSimilarityType = CosmosDBSimilarityType.COS
    search_type: CosmosDBVectorSearchType = CosmosDBVectorSearchType.VECTOR_IVF
    m: int = 16
    ef_construction: int = 64
    ef_search: int = 40
    score_threshold: float = 0.1

class VectorStore:
    def __init__(
        self,
        connection_string: str,
        database_name: str,
        collection_name: str,
        embedding_model: Optional[OpenAIEmbeddings] = None,
        index_name: str = "vector-search-index",
        config: Optional[VectorSearchConfig] = None,
        batch_config: Optional[BatchConfig] = None
    ):
        self.connection_string = connection_string
        self.namespace = f"{database_name}.{collection_name}"
        self.index_name = index_name
        self.embedding_model = embedding_model or self._get_default_embeddings()
        self.config = config or VectorSearchConfig()
        self.batch_config = batch_config or BatchConfig()
        self._index_created = False
        
        logger.info(f"Initializing vector store for namespace: {self.namespace}")
        
        # Initialize the vector store
        self.vector_store = AzureCosmosDBVectorSearch.from_connection_string(
            connection_string=self.connection_string,
            namespace=self.namespace,
            embedding=self.embedding_model,
            index_name=self.index_name
        )

    def _get_default_embeddings(self) -> OpenAIEmbeddings:
        """Create default OpenAI embeddings configuration"""
        logger.info("Using default OpenAI embeddings configuration")
        return OpenAIEmbeddings(
            api_key=Settings.OPENAI_API_KEY,
            model=Settings.EMBEDDING_MODEL,
            chunk_size=100
        )

    def ensure_index_exists(self) -> None:
        """Ensure the vector search index exists, creating it if necessary"""
        if not self._index_created:
            try:
                logger.info(f"Creating vector search index '{self.index_name}' with parameters:")
                logger.info(f"- Dimensions: {self.config.dimensions}")
                logger.info(f"- Number of lists: {self.config.num_lists}")
                
                self.vector_store.create_index(
                    num_lists=self.config.num_lists,
                    dimensions=self.config.dimensions,
                    m=self.config.m,
                    ef_construction=self.config.ef_construction
                )
                self._index_created = True
                logger.info("Vector search index created successfully")
            except Exception as e:
                if "already exists" in str(e).lower():
                    logger.info("Vector search index already exists")
                    self._index_created = True
                else:
                    logger.error(f"Error creating vector search index: {str(e)}")
                    raise

    async def batch_add_documents(
        self,
        documents: List[Union[str, Document]],
        metadatas: Optional[List[Dict]] = None
    ) -> List[str]:
        """
        Asynchronously add documents in batches with configurable concurrency
        """
        # Ensure index exists before adding documents
        self.ensure_index_exists()
        
        logger.info(f"Adding {len(documents)} documents in batches of {self.batch_config.batch_size}")
        
        async def process_batch(batch_docs: List[Union[str, Document]], batch_metadata: Optional[List[Dict]]):
            try:
                if isinstance(batch_docs[0], str):
                    return self.vector_store.add_texts(
                        texts=batch_docs,
                        metadatas=batch_metadata
                    )
                else:
                    return self.vector_store.add_documents(documents=batch_docs)
            except Exception as e:
                logger.error(f"Error processing batch: {str(e)}")
                raise

        # Prepare batches
        doc_batches = [
            documents[i:i + self.batch_config.batch_size]
            for i in range(0, len(documents), self.batch_config.batch_size)
        ]
        
        if metadatas:
            metadata_batches = [
                metadatas[i:i + self.batch_config.batch_size]
                for i in range(0, len(metadatas), self.batch_config.batch_size)
            ]
        else:
            metadata_batches = [None] * len(doc_batches)

        logger.info(f"Processing {len(doc_batches)} batches with max concurrency {self.batch_config.max_concurrency}")
        
        # Process batches with controlled concurrency
        semaphore = asyncio.Semaphore(self.batch_config.max_concurrency)
        async with semaphore:
            tasks = [
                process_batch(batch_docs, batch_meta)
                for batch_docs, batch_meta in zip(doc_batches, metadata_batches)
            ]
            results = await asyncio.gather(*tasks)
        
        logger.info("Batch document addition completed successfully")
        return [item for sublist in results for item in sublist]

    def advanced_search(
        self,
        query: Union[str, List[float]],
        search_type: SearchType = SearchType.SIMILARITY,
        metadata_filter: Optional[Dict[str, Any]] = None,
        k: int = 4,
        score_threshold: float = 0.0,
        mmr_lambda: float = 0.5
    ) -> List[Document]:
        """
        Perform advanced vector search with different search types and filtering
        """
        self.ensure_index_exists()
        
        logger.info(f"Performing {search_type.value} search with query: {query}")
        
        try:
            if search_type == SearchType.MMR:
                return self.vector_store.max_marginal_relevance_search(
                    query=query,
                    k=k,
                    fetch_k=min(k * 4, 100),
                    lambda_mult=mmr_lambda,
                    filter=metadata_filter
                )
            elif search_type == SearchType.SIMILARITY_THRESHOLD:
                return self.vector_store.similarity_search(
                    query=query,
                    k=k,
                    filter=metadata_filter,
                    score_threshold=score_threshold
                )
            else:
                return self.vector_store.similarity_search(
                    query=query,
                    k=k,
                    filter=metadata_filter
                )
        except Exception as e:
            logger.error(f"Search failed: {str(e)}")
            raise