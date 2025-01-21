import OpenAI from 'openai';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async () => {
  const assistant = await openai.beta.assistants.create({
    name: 'Analyst Assistant',
    instructions:
      'You are an expert analyst. Understand the policy and any other relevant documents such as the orgs risk matrix or other procurement docs, and provide best answers',
    model: 'gpt-4o',
    tools: [{ type: 'file_search' }],
  });

  // Create a vector store including our two files.
  const vectorStore = await openai.beta.vectorStores.create({
    name: 'Tenant Global Store',
  });

  await openai.beta.assistants.update(assistant.id, {
    tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
  });

  return { id: assistant.id, vector: vectorStore.id };
});
