import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async () => {
  try {
    const assistantsList = await openai.beta.assistants.list({
      limit: 100,
    });

    const deletionResults = {
      total: assistantsList.data.length,
      deleted: 0,
      failed: 0,
      errors: [] as { id: string, error: string }[]
    };

    for (const assistant of assistantsList.data) {
      try {
        await openai.beta.assistants.del(assistant.id);
        deletionResults.deleted++;
      } catch (error) {
        deletionResults.failed++;
        deletionResults.errors.push({
          id: assistant.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      message: 'Deletion process completed',
      results: deletionResults
    };
  } catch (error) {
    console.error('Error deleting assistants:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to delete assistants'
    });
  }
});