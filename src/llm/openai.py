from typing import List, Dict, Optional
import logging
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

class PolicyAnalyzer:
    def __init__(self, api_key: str, model: str = "gpt-4-turbo-preview"):
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def _create_context(self, search_results: List[Dict]) -> str:
        """Create context from search results for the AI"""
        context_parts = []
        for i, result in enumerate(search_results, 1):
            content = result['content'].strip()
            source = result['metadata'].get('source', 'Unknown')
            context_parts.append(f"[Document {i} from {source}]:\n{content}\n")
            
        return "\n".join(context_parts)

    def _create_prompt(self, query: str, context: str) -> str:
        """Create a prompt for the AI"""
        return f"""You are a knowledgeable policy advisor. You help users understand and interpret company policies and procedures.
        Using only the information from the provided policy documents, answer the following question.
        If the answer cannot be fully determined from the given context, acknowledge what you can answer and what information is missing.

        Context from relevant policy documents:
        {context}

        Question: {query}

        Please provide a clear, well-structured answer that:
        1. Directly addresses the question
        2. Cites specific sections of the policies where relevant
        3. Explains any important context or implications
        4. Highlights any limitations or additional considerations

        Answer:"""

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def analyze_policy_query(
        self,
        query: str,
        search_results: List[Dict],
        temperature: float = 0.3
    ) -> Dict:
        """
        Analyze policy documents and answer the query
        
        Args:
            query: User's question about policies
            search_results: List of relevant policy documents
            temperature: OpenAI temperature parameter
            
        Returns:
            Dict containing the AI response and metadata
        """
        try:
            context = self._create_context(search_results)
            prompt = self._create_prompt(query, context)
            
            logger.info(f"Sending query to OpenAI: {query}")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful policy advisor who provides accurate, well-structured answers based on company policies."},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=4000
            )
            
            answer = response.choices[0].message.content
            
            return {
                "answer": answer,
                "metadata": {
                    "num_documents": len(search_results),
                    "sources": [result['metadata']['source'] for result in search_results]
                }
            }
            
        except Exception as e:
            logger.error(f"Error in policy analysis: {str(e)}")
            raise