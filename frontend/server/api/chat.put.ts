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

  const chatId = getHeader(event, 'x-chat-id');
  if (!chatId)
    throw createError({
      statusCode: 400,
      message: 'Header x-chat-id missing',
    });

  const reqBody = await readBody<{
    fileIds?: string[];
    query: string;
  }>(event);

  let fileResponses: OpenAI.Files.FileObject[] = [];
  if (reqBody.fileIds && reqBody.fileIds.length > 0) {
    fileResponses = await Promise.all(
      reqBody.fileIds.map(async (fileId) => {
        const b = await blobStorage.getItemRaw(`${fileId}.pdf`) as ArrayBuffer;
        return await openai.files.create({
          file: bufferToResponseLike(Buffer.from(b), fileId),
          purpose: 'assistants',
        });
      })
    );
  }

  await openai.beta.threads.messages.create(chatId, {
    role: 'user',
    content: reqBody.query,
    attachments: fileResponses.map((f) => ({ file_id: f.id, tools: [{ type: 'file_search' }] })) || undefined,
  });

  const run = await openai.beta.threads.runs.createAndPoll(chatId, {
    assistant_id: assistantId,
  });

  const messages = await openai.beta.threads.messages.list(chatId, {
    run_id: run.id,
  });

  const message = messages.data.pop()!;

  let llmAnswer = '';
  if (message.content[0].type === 'text') {
    const { text } = message.content[0];
    llmAnswer = text.value;
  }

  return { response: llmAnswer };
});

function bufferToResponseLike(buffer: Buffer, fileId: string) {
  return {
    url: `${process.env.VERCEL_STORAGE_BASE_URL}/${fileId}.pdf`,
    blob: () => Promise.resolve(new Blob([buffer]))
  }
}