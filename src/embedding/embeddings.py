from typing import List, Union
from langchain_community.embeddings import OpenAIEmbeddings

def get_embeddings(
    texts: Union[str, List[str]], 
    api_key: str, 
    model: str = "text-embedding-ada-002", 
    chunk_size: int = 100
) -> Union[List[float], List[List[float]]]:
    """
    Generate embeddings for the provided text(s) using OpenAIEmbeddings.

    Args:
        texts (Union[str, List[str]]): The input text or list of texts to embed.
        api_key (str): OpenAI API key.
        model (str, optional): OpenAI embedding model to use. Defaults to "text-embedding-ada-002".
        chunk_size (int, optional): Number of tokens per chunk for processing. Defaults to 100.

    Returns:
        Union[List[float], List[List[float]]]: Embedding(s) for the input text(s).
    """
    # Initialize the OpenAIEmbeddings object
    embeddings_model = OpenAIEmbeddings(
        api_key=api_key,
        model=model,
        chunk_size=chunk_size
    )
    
    # If a single string is provided, return a single embedding
    if isinstance(texts, str):
        return embeddings_model.embed_query(texts)
    
    # If a list of texts is provided, return a list of embeddings
    elif isinstance(texts, list):
        return embeddings_model.embed_documents(texts)
    
    # Raise an error for unsupported input types
    else:
        raise ValueError("Input must be a string or a list of strings.")
