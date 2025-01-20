from typing import Any, Dict, Union, List, Optional
from fastapi import Depends, FastAPI, Header, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import shutil
import asyncio
from datetime import datetime
from src.llm.openai import PolicyAnalyzer
from src.pipeline import DocumentPipeline
from src.config.config import Settings


class ProcessingResponse(BaseModel):
    job_id: str
    status: str
    details: dict

class DocumentMetadata(BaseModel):
    _id: Optional[str] = None
    source: Optional[str] = None
    type: Optional[str] = None
    original_path: Optional[str] = None

class SearchResult(BaseModel):
    content: str
    metadata: DocumentMetadata

class AIResponse(BaseModel):
    answer: str
    metadata: Dict[str, Any]

class SearchResponse(BaseModel):
    query: str
    ai_response: AIResponse
    relevant_documents: List[SearchResult]

class SearchQuery(BaseModel):
    query: str
    k: int = 5
    metadata_filter: Optional[Dict[str, Any]] = None

async def get_tenant_id(x_tenant_id: str = Header(...)) -> str:
    """Dependency to extract and validate tenant ID from header"""
    if not x_tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-ID header is required")
    return x_tenant_id

def get_tenant_pipeline(tenant_id: str, config: Settings) -> DocumentPipeline:
    """Get a pipeline instance configured for the specific tenant"""
    return DocumentPipeline(
        connection_string=config.COSMOS_ENDPOINT,
        database_name=config.COSMOS_DB_NAME,
        container_name=f"{config.COSMOS_CONTAINER_NAME}_{tenant_id}",  # Tenant-specific container
        openai_api_key=config.OPENAI_API_KEY
    )

def createApp() -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'], 
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    config = Settings()
    

    @app.get("/")
    async def hello_world():
        return {
            "status": "success",
            "message": "Hello World!"
        }

    @app.post("/process-pdfs/", response_model=ProcessingResponse)
    async def process_pdfs(tenant_id: str = Depends(get_tenant_id),files: Optional[List[UploadFile]] = File(None)):
        """
        Upload and process multiple PDF files.
        If no files are uploaded, process all PDFs in the temp_uploads directory.
        """
        temp_dir = Path("temp_uploads")
        temp_dir.mkdir(exist_ok=True)
        try:
            saved_files = []
            
            # Handle uploaded files if provided
            if files:
                for file in files:
                    if not file.filename.lower().endswith('.pdf'):
                        raise HTTPException(status_code=400, detail=f"File {file.filename} is not a PDF")
                    
                    file_path = temp_dir / file.filename
                    with file_path.open("wb") as buffer:
                        shutil.copyfileobj(file.file, buffer)
                    saved_files.append(file_path)
            
            # If no files uploaded, process existing PDFs in directory
            else:
                for file_path in temp_dir.glob("*.pdf"):
                    saved_files.append(file_path)
                
                if not saved_files:
                    raise HTTPException(
                        status_code=404, 
                        detail="No PDF files found in the directory"
                    )
            
            job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            pipeline = get_tenant_pipeline(tenant_id, config)
           
            asyncio.create_task(process_files(job_id, tenant_id, pipeline, temp_dir))
            
            return ProcessingResponse(
                job_id=job_id,
                status="processing",
                details={
                    "files_received": len(saved_files),
                    "file_names": [f.name for f in saved_files]
                }
            )
            
        except Exception as e:
            # Don't delete temp_dir on error since we might want to process files later
            raise HTTPException(status_code=500, detail=str(e))
        
    async def process_files(job_id: str, tenant_id: str, pipeline: DocumentPipeline, input_dir: Path):
        """
        Background task to process files
        """
        try:
            results = await pipeline.process_pdfs(tenant_id, input_dir)
            # Store results (implement storage solution)
            print(f"Processing completed for job {job_id}: {results}")
        except Exception as e:
            print(f"Error processing job {job_id}: {str(e)}")
        finally:
            if input_dir.exists():
                shutil.rmtree(input_dir)
    

    @app.get("/job-status/{job_id}")
    async def get_job_status(job_id: str):
        """
        Get the status of a processing job
        """
        # Implement job status tracking (you might want to use Redis or another storage)
        return {
            "job_id": job_id,
            "status": "completed",  # You should track actual status
            "details": {}
        }

    @app.post("/search/", response_model=SearchResponse)
    async def search_documents(query: SearchQuery, tenant_id: str = Depends(get_tenant_id)):
        try:
            # Initialize PolicyAnalyzer
            policy_analyzer = PolicyAnalyzer(
                api_key=Settings.OPENAI_API_KEY,
                model=Settings.OPENAI_MODEL
            )
            
            pipeline = get_tenant_pipeline(tenant_id, config)
            print(tenant_id)
            metadata_filter = query.metadata_filter or {}
            metadata_filter["tenant_id"] = tenant_id

            # Search in Cosmos DB
            results = pipeline.vector_store.advanced_search(
                query=query.query,
                k=query.k,
                metadata_filter=query.metadata_filter
            )
            
            # Format results
            formatted_results = [
                {
                    "content": doc.page_content,
                    "metadata": {
                        "_id": str(doc.metadata.get("_id")) if doc.metadata.get("_id") else None,
                        "tenant_id": doc.metadata.get("tenant_id"),
                        "source": doc.metadata.get("source"),
                        "type": doc.metadata.get("type"),
                        "original_path": doc.metadata.get("original_path")
                    }
                }
                for doc in results
            ]
            
            ai_response = await policy_analyzer.analyze_policy_query(
                query=query.query,
                search_results=formatted_results
            )
            
            response = {
                "tenant_id": tenant_id,
                "query": query.query,
                "ai_response": ai_response,
                "relevant_documents": formatted_results
            }
            
            return response

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.on_event("shutdown")
    async def shutdown_event():
        """Cleanup on shutdown"""
        # Clean up temporary files
        temp_dir = Path("temp_uploads")
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

    return app


app = createApp()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)