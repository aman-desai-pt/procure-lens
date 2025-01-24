import OpenAI from 'openai';
import fs from 'node:fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async (event) => {
  const assistantId = getHeader(event, 'x-assistant-id');
  if (!assistantId)
    throw createError({
      statusCode: 400,
      message: 'Header x-assistant-id missing',
    });

  const vectorStoreId = getHeader(event, 'x-vector-id');
  if (!vectorStoreId)
    throw createError({
      statusCode: 400,
      message: 'Header x-vector-id missing',
    });

  const reqBody = await readBody<{
    fileIds?: string[];
    query: string;
  }>(event);

  let fileResponses: OpenAI.Files.FileObject[] = [];
  if (reqBody.fileIds && reqBody.fileIds.length > 0) {
    const filePaths = reqBody.fileIds.map((fileId) => `${baseDir}/${fileId}.pdf`);
    fileResponses = await Promise.all(
      filePaths.map(async (filePath) => {
        return await openai.files.create({
          file: fs.createReadStream(filePath),
          purpose: 'assistants',
        });
      })
    );
  }


  const thread = await openai.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: reqBody.query,
        // attachments: fileResponses.map((f) => ({ file_id: f.id, tools: [{ type: 'file_search' }] })) || undefined,
      },
    ],
  });

  const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistantId,
  });

  const messages = await openai.beta.threads.messages.list(thread.id, {
    run_id: run.id,
  });
  
  const message = messages.data.pop()!;

  let llmAnswer = '';
  if (message.content[0].type === 'text') {
    const { text } = message.content[0];
    llmAnswer = text.value;
  }
  
  return { id: thread.id, firstResponse: llmAnswer };
});
