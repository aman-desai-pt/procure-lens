from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from html import unescape
from langchain.text_splitter import CharacterTextSplitter
from langchain.schema import Document
import re

@dataclass
class Data:
    """Data class to hold document content and metadata"""
    text: str
    data: Dict[str, Any]

    def to_lc_document(self) -> Document:
        """Convert to LangChain Document format"""
        return Document(page_content=self.text, metadata=self.data)

class DocumentProcessor:
    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        separator: str = "\n\n",
        min_chunk_size: int = 100,
        strip_whitespace: bool = True,
        cleanup_text: bool = True
    ):
        """
        Initialize DocumentProcessor with configuration parameters.
        
        Args:
            chunk_size: Maximum size of text chunks
            chunk_overlap: Number of characters to overlap between chunks
            separator: String to use as separator when splitting text
            min_chunk_size: Minimum size of text chunks
            strip_whitespace: Whether to strip whitespace from chunk edges
            cleanup_text: Whether to perform text cleanup operations
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separator = separator
        self.min_chunk_size = min_chunk_size
        self.strip_whitespace = strip_whitespace
        self.cleanup_text = cleanup_text
        self.data_inputs: List[Data] = []
        self.status: List[Data] = []

    def _docs_to_data(self, docs: List[Document]) -> List[Data]:
        """Convert LangChain documents to Data objects"""
        return [Data(text=doc.page_content, data=doc.metadata) for doc in docs]

    def _clean_text(self, text: str) -> str:
        """Clean up text by removing extra whitespace and normalizing characters"""
        if not self.cleanup_text:
            return text

        # Replace multiple newlines with double newline
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        # Replace multiple spaces with single space
        text = re.sub(r' +', ' ', text)
        
        # Remove whitespace around newlines
        text = re.sub(r' *\n *', '\n', text)
        
        if self.strip_whitespace:
            text = text.strip()
        
        return text

    def add_documents(self, documents: List[Dict[str, Any]]) -> None:
        """
        Add documents to be processed.
        
        Args:
            documents: List of dictionaries containing 'text' and 'metadata' keys
        """
        for doc in documents:
            if 'text' not in doc or 'metadata' not in doc:
                raise ValueError("Documents must contain 'text' and 'metadata' keys")
            self.data_inputs.append(Data(
                text=self._clean_text(doc['text']),
                data=doc['metadata']
            ))

    def add_texts(self, texts: List[str], metadata: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Add raw texts with optional metadata.
        
        Args:
            texts: List of text strings to process
            metadata: Optional list of metadata dictionaries for each text
        """
        if metadata is None:
            metadata = [{} for _ in texts]
        
        if len(texts) != len(metadata):
            raise ValueError("Number of texts and metadata entries must match")
        
        for text, meta in zip(texts, metadata):
            self.data_inputs.append(Data(
                text=self._clean_text(text),
                data=meta
            ))

    def split_text(self) -> List[Data]:
        """Split documents into chunks based on configured parameters"""
        # Unescape separator if it contains escaped characters
        separator = unescape(self.separator)
        
        # Convert Data objects to LangChain Documents
        documents = [
            _input.to_lc_document() 
            for _input in self.data_inputs 
            if isinstance(_input, Data)
        ]
        
        # Initialize text splitter
        splitter = CharacterTextSplitter(
            chunk_overlap=self.chunk_overlap,
            chunk_size=self.chunk_size,
            separator=separator,
            strip_whitespace=self.strip_whitespace,
            length_function=len,
        )
        
        # Split documents
        docs = splitter.split_documents(documents)
        
        # Filter out chunks that are too small
        docs = [
            doc for doc in docs 
            if len(doc.page_content) >= self.min_chunk_size
        ]
        
        # Convert back to Data objects
        data = self._docs_to_data(docs)
        self.status = data
        return data

    def get_status(self) -> Dict[str, Any]:
        """Get processing status and statistics"""
        return {
            "input_documents": len(self.data_inputs),
            "output_chunks": len(self.status),
            "average_chunk_size": sum(len(d.text) for d in self.status) / len(self.status) if self.status else 0,
            "total_characters": sum(len(d.text) for d in self.status),
        }

    def clear(self) -> None:
        """Clear all stored documents and status"""
        self.data_inputs = []
        self.status = []

