import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = "gpt-4-turbo-preview"
    COSMOS_DB_NAME = os.getenv("COSMOS_DB_NAME")
    COSMOS_CONTAINER_NAME = os.getenv("COSMOS_CONTAINER_NAME")
    COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
    EMBEDDING_MODEL = "text-embedding-ada-002"