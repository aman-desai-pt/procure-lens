import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async () => {
  try {
    const assistantsList = await openai.beta.assistants.list({
      limit: 100, 
      order: 'desc', 
    });

    return {
      total: assistantsList.data.length,
      assistants: assistantsList.data.map(assistant => ({
        id: assistant.id,
        name: assistant.name,
        createdAt: assistant.created_at,
        model: assistant.model,
        vector_id: assistant.tool_resources?.file_search?.vector_store_ids?.[0] || null
      }))
    };
  } catch (error) {
    console.error('Error retrieving assistants:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to retrieve assistants'
    });
  }
});