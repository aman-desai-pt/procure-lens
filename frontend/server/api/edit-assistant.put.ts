import OpenAI from 'openai';
import fs from 'node:fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface UpdateAssistantRequest {
  instructions?: string;
  name?: string;
  description?: string;
  fileIds?: string[];
  tools?: Array<{
    type: "code_interpreter" | "retrieval";
  } | {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }>;
  removeFiles?: boolean;
}

export default defineEventHandler(async (event) => {
  
  const assistantId = getHeader(event, 'x-assistant-id');
  if (!assistantId) {
    throw createError({
      statusCode: 400,
      message: 'Header x-assistant-id missing',
    });
  }

  const reqBody = await readBody<UpdateAssistantRequest>(event);
  
  try {
    const currentAssistant = await openai.beta.assistants.retrieve(assistantId);

    
    let fileObjects: OpenAI.Files.FileObject[] = [];
    
    if (reqBody.fileIds && reqBody.fileIds.length > 0) {
      fileObjects = await Promise.all(
        reqBody.fileIds.map(async (fileId) => {
          const filePath = `${baseDir}/${fileId}.pdf`;
          return await openai.files.create({
            file: fs.createReadStream(filePath),
            purpose: 'assistants',
          });
        })
      );
    }

    // Get current file IDs from the assistant's files property
    // const currentFileIds = currentAssistant.files?.map(file => file.id) || [];
    
    // Prepare update payload with correct types
    const updatePayload: OpenAI.Beta.Assistants.AssistantUpdateParams = {
      instructions: reqBody.instructions,
      name: reqBody.name ?? currentAssistant.name,
      // description: reqBody.description ?? currentAssistant.description,
      tools: reqBody.tools as OpenAI.Beta.Assistants.AssistantUpdateParams['tools'] ?? currentAssistant.tools,
      // file_ids: reqBody.removeFiles ? [] : [
      //   ...currentFileIds,
      //   ...fileObjects.map(file => file.id)
      // ],
    };
    // Update assistant
    const updatedAssistant = await openai.beta.assistants.update(
      assistantId,
      updatePayload
    );

    return {
      status: 'success',
      assistant: {
        id: updatedAssistant.id,
        name: updatedAssistant.name,
        description: updatedAssistant.description,
        instructions: updatedAssistant.instructions,
        tools: updatedAssistant.tools,
      }
    };

  } catch (error) {
    console.error('Error updating assistant:', error);
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to update assistant',
    });
  }
});

// Utility function for blob storage version
function bufferToResponseLike(buffer: Buffer, fileId: string) {
  return {
    url: `${process.env.VERCEL_STORAGE_BASE_URL}/${fileId}.pdf`,
    blob: () => Promise.resolve(new Blob([buffer]))
  }
}
