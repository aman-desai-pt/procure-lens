import shutil
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered
from pathlib import Path
import logging
from typing import Optional, List
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm

import os
os.environ["PYTORCH_MPS_DISABLE"] = "1"


class BatchPdfConverter:
    def __init__(self, base_dir: Optional[Path] = None):
        """
        Initialize the batch PDF to Markdown converter.
        
        Args:
            base_dir (Path, optional): Base directory for the project. 
                                    If None, uses the parent of the current file's directory.
        """
        self.base_dir = base_dir or Path(__file__).resolve().parent.parent.parent
        self.converter = PdfConverter(artifact_dict=create_model_dict())
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            filename='pdf_conversion.log'
        )
        self.logger = logging.getLogger(__name__)

    def setup_tenant_directories(self, tenant_id: str) -> tuple[Path, Path]:
        """
        Set up tenant-specific input and output directories.
        
        Args:
            tenant_id (str): Identifier for the tenant
            
        Returns:
            tuple[Path, Path]: Paths to input and output directories
        """
        input_dir = self.base_dir / "policy_docs" / tenant_id
        output_dir = self.base_dir / "processed_texts" / tenant_id
        
        # Create directories if they don't exist
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        return input_dir, output_dir


    def move_files_to_tenant_directory(self, temp_dir: Path, tenant_id: str) -> List[Path]:
        """
        Move files from temporary directory to tenant-specific directory.
        
        Args:
            temp_dir (Path): Temporary directory containing uploaded files
            tenant_id (str): Identifier for the tenant
            
        Returns:
            List[Path]: List of paths to moved files
        """
        input_dir, _ = self.setup_tenant_directories(tenant_id)
        moved_files = []

        for file_path in temp_dir.glob("*.pdf"):
            target_path = input_dir / file_path.name
            # If file exists, remove it first (overwrite)
            if target_path.exists():
                target_path.unlink()
            shutil.move(str(file_path), str(target_path))
            moved_files.append(target_path)

        return moved_files

    def get_pdf_files(self, tenant_id: str) -> List[Path]:
        """
        Get all PDF files from the input directory.
        
        Args:
            input_dir (Path): Directory to scan for PDF files
            
        Returns:
            List[Path]: List of paths to PDF files
        """
        input_dir, _ = self.setup_tenant_directories(tenant_id)
        return list(input_dir.glob("*.pdf"))

    def convert_single_pdf(self, pdf_path: Path, tenant_id: str) -> tuple[Path, bool]:
        """
        Convert a single PDF file to Markdown for a specific tenant.
        
        Args:
            pdf_path (Path): Path to the PDF file
            tenant_id (str): Identifier for the tenant
            
        Returns:
            tuple[Path, bool]: PDF path and conversion success status
        """
        _, output_dir = self.setup_tenant_directories(tenant_id)
        output_path = output_dir / f"{pdf_path.stem}.md"

        try:
            logging.info(f"Starting conversion for tenant {tenant_id}: {pdf_path}")
            rendered = self.converter(str(pdf_path))
            text, *_ = text_from_rendered(rendered)
            
            # Write the converted text
            output_path.write_text(text, encoding='utf-8')

            self.logger.info(f"Successfully converted for tenant {tenant_id}: {pdf_path.name}")
            return pdf_path, True
        except Exception as e:
            self.logger.error(f"Error converting {pdf_path.name} for tenant {tenant_id}: {str(e)}")
            return pdf_path, False

    def batch_convert_pdfs(self, tenant_id: str, temp_dir: Optional[Path] = None) -> dict:
        """
        Convert all PDFs for a specific tenant.
        
        Args:
            tenant_id (str): Identifier for the tenant
            temp_dir (Path, optional): Temporary directory containing new uploads
            
        Returns:
            dict: Summary of conversion results
        """
        # If temp_dir is provided, move files to tenant directory first
        if temp_dir and temp_dir.exists():
            self.move_files_to_tenant_directory(temp_dir, tenant_id)

        # Get all PDF files for the tenant
        pdf_files = self.get_pdf_files(tenant_id)
        
        if not pdf_files:
            self.logger.warning(f"No PDF files found for tenant {tenant_id}")
            return {"successful": [], "failed": [], "total": 0}
        
        results = {"successful": [], "failed": [], "total": len(pdf_files)}
        
        # Process files with progress bar
        with tqdm(total=len(pdf_files), desc=f"Converting PDFs for tenant {tenant_id}") as pbar:
            for pdf_path in pdf_files:
                pdf_path, success = self.convert_single_pdf(pdf_path, tenant_id)
                if success:
                    results["successful"].append(pdf_path.name)
                else:
                    results["failed"].append(pdf_path.name)
                pbar.update(1)
        
        return results

    def cleanup_tenant_files(self, tenant_id: str):
        """
        Clean up temporary files for a specific tenant.
        
        Args:
            tenant_id (str): Identifier for the tenant
        """
        input_dir, output_dir = self.setup_tenant_directories(tenant_id)
        
        # Remove processed files that no longer have corresponding PDFs
        pdf_files = set(f.stem for f in input_dir.glob("*.pdf"))
        for md_file in output_dir.glob("*.md"):
            if md_file.stem not in pdf_files:
                md_file.unlink()