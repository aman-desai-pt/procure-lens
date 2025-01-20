from pathlib import Path
from typing import List, Optional, Dict, Any
import asyncio
from langchain_openai import OpenAIEmbeddings
from tenacity import retry, stop_after_attempt, wait_exponential
from src.document_processing.pdf_parser import BatchPdfConverter
from src.document_processing.text_splitter import DocumentProcessor
from src.db.cosmos_db import VectorStore, VectorSearchConfig, BatchConfig
import numpy as np
from src.config.config import Settings

class DocumentPipeline:
    def __init__(
        self,
        connection_string: str,
        database_name: str,
        container_name: str,
        openai_api_key: str,
        embedding_dimension: int = 1536,
        batch_size: int = 100,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        separator: str = "\n\n",
        min_chunk_size: int = 100
    ):
        """
        Initialize the document processing pipeline.
        
        Args:
            connection_string: Cosmos DB connection string
            database_name: Database name
            container_name: Container name
            openai_api_key: OpenAI API key
            embedding_dimension: Dimension of the embedding vectors
            batch_size: Size of batches for processing
            chunk_size: Size of text chunks
            chunk_overlap: Overlap between chunks
            separator: String to use as separator when splitting text
            min_chunk_size: Minimum size of text chunks
        """
        self.pdf_converter = BatchPdfConverter()
        
        self.doc_processor = DocumentProcessor(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separator=separator,
            min_chunk_size=min_chunk_size,
            strip_whitespace=True,
            cleanup_text=True
        )
        self.embeddings = OpenAIEmbeddings(
            api_key=openai_api_key,
            model=Settings.EMBEDDING_MODEL,
            chunk_size=batch_size
        )
        
        # Initialize vector store
        self.vector_store = VectorStore(
            connection_string=connection_string,
            database_name=database_name,
            collection_name=container_name,
            embedding_model=self.embeddings,
            config=VectorSearchConfig(
                dimensions=embedding_dimension
            ),
            batch_config=BatchConfig(
                batch_size=batch_size
            )
        )
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def process_pdfs(
        self,
        tenant_id: str,
        input_dir: Optional[Path] = None,
        additional_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process PDF files through the entire pipeline with tenant isolation.
        
        Args:
            tenant_id: Identifier for the tenant
            input_dir: Optional directory containing PDF files
            additional_metadata: Optional additional metadata to add to documents
            
        Returns:
            Dict containing processing statistics
        """
        try:
            # Initialize base metadata with tenant_id
            base_metadata = {
                "tenant_id": tenant_id,
                **(additional_metadata or {})
            }
            
            # Step 1: Convert PDFs to Markdown with tenant-specific paths
            conversion_results = self.pdf_converter.batch_convert_pdfs(tenant_id, temp_dir=input_dir)
            
            if not conversion_results["successful"]:
                raise ValueError("No PDFs were successfully converted")
            
            # Step 2: Process converted markdown files
            documents = []
            output_dir = self.pdf_converter.base_dir / "processed_texts" / tenant_id
            
            for filename in conversion_results["successful"]:
                file_path = output_dir / f"{Path(filename).stem}.md"
                text = file_path.read_text(encoding='utf-8')
                
                # Merge document metadata with base metadata
                doc_metadata = {
                    **base_metadata,
                    "source": filename,
                    "type": "pdf",
                    "original_path": str(file_path)
                }
                
                documents.append({
                    "text": text,
                    "metadata": doc_metadata
                })
            
            # Step 3: Add documents to processor and split into chunks
            self.doc_processor.clear()  # Clear any previous documents
            self.doc_processor.add_documents(documents)
            chunks = self.doc_processor.split_text()
            
            # Step 4: Convert chunks to format suitable for vector store
            # Ensure each chunk inherits the tenant_id and other metadata
            langchain_docs = []
            for chunk in chunks:
                doc = chunk.to_lc_document()
                # Ensure tenant metadata is preserved
                doc.metadata.update(base_metadata)
                langchain_docs.append(doc)
            
            # Step 5: Store in vector store with embeddings
            # Documents will be stored in tenant-specific container due to pipeline initialization
            await self.vector_store.batch_add_documents(langchain_docs)
            
            # Get processing statistics
            processing_stats = self.doc_processor.get_status()
            
            # Return comprehensive statistics
            return {
                "tenant_id": tenant_id,
                "pdfs_processed": len(conversion_results["successful"]),
                "pdfs_failed": len(conversion_results["failed"]),
                "failed_files": conversion_results["failed"],
                "chunks_created": len(chunks),
                "documents_stored": len(chunks),
                "processing_stats": processing_stats
            }
            
        except Exception as e:
            print(f"Error in document processing pipeline for tenant {tenant_id}: {str(e)}")
            raise

    async def search_documents(
        self,
        query: str,
        tenant_id: str,
        filter_criteria: Optional[Dict[str, Any]] = None,
        k: int = 4
    ) -> List[Dict[str, Any]]:
        """
        Search processed documents using vector similarity within tenant context.
        
        Args:
            query: Search query
            tenant_id: Identifier for the tenant
            filter_criteria: Optional additional metadata filters
            k: Number of results to return
            
        Returns:
            List of matching documents with scores
        """
        # Ensure tenant isolation in search
        base_filter = {"tenant_id": tenant_id}
        if filter_criteria:
            base_filter.update(filter_criteria)
        
        metadata_filter = self.vector_store.create_metadata_filter([base_filter])
            
        results = await self.vector_store.advanced_search(
            query=query,
            k=k,
            filter=metadata_filter
        )
        
        # Format results
        formatted_results = []
        for doc, score in results:
            formatted_results.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "similarity_score": score
            })
            
        return formatted_results

    async def add_texts(
        self,
        texts: List[str],
        tenant_id: str,
        metadata: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Add raw texts to the pipeline with tenant isolation.
        
        Args:
            texts: List of text strings to process
            tenant_id: Identifier for the tenant
            metadata: Optional list of metadata dictionaries
            
        Returns:
            Processing statistics
        """
        try:
            # Clear previous documents
            self.doc_processor.clear()
            
            # Ensure each document has tenant metadata
            if metadata is None:
                metadata = [{"tenant_id": tenant_id} for _ in texts]
            else:
                metadata = [dict(m, tenant_id=tenant_id) for m in metadata]
            
            # Add texts to processor
            self.doc_processor.add_texts(texts, metadata)
            
            # Split into chunks
            chunks = self.doc_processor.split_text()
            
            # Convert to LangChain documents with tenant metadata preserved
            langchain_docs = []
            for chunk in chunks:
                doc = chunk.to_lc_document()
                # Ensure tenant metadata is preserved
                if "tenant_id" not in doc.metadata:
                    doc.metadata["tenant_id"] = tenant_id
                langchain_docs.append(doc)
            
            # Store in vector store
            await self.vector_store.batch_add_documents(langchain_docs)
            
            # Get and return statistics
            return {
                "tenant_id": tenant_id,
                "chunks_created": len(chunks),
                "documents_stored": len(chunks),
                "processing_stats": self.doc_processor.get_status()
            }
            
        except Exception as e:
            print(f"Error processing texts for tenant {tenant_id}: {str(e)}")
            raise