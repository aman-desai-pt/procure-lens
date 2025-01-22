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
    fileIds: string[];
  }>(event);

  if (reqBody.fileIds.length > 0) {
    const filePaths = reqBody.fileIds.map((fileId) => `${baseDir}/${fileId}.pdf`);
    const fileStreams = filePaths.map((filePath) => fs.createReadStream(filePath));
    await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStoreId, { files: fileStreams });
  }
});
