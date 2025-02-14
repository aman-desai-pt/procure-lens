import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { determineNextWorkflowStep } from '../utils/workflowParser';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Example blobStorage placeholder – replace with your actual implementation.
const blobStorage = {
  async getItemRaw(filename: string): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  },
};

function bufferToResponseLike(buffer: Buffer, fileId: string) {
  return {
    url: `${process.env.VERCEL_STORAGE_BASE_URL}/${fileId}.pdf`,
    blob: () => Promise.resolve(new Blob([buffer])),
  };
}

export default defineEventHandler(async (event) => {
  const assistantId = getHeader(event, 'x-assistant-id');
  if (!assistantId) {
    throw createError({ statusCode: 400, message: 'Header x-assistant-id missing' });
  }
  const chatId = getHeader(event, 'x-chat-id');
  if (!chatId) {
    throw createError({ statusCode: 400, message: 'Header x-chat-id missing' });
  }

  const reqBody = await readBody<{
    fileIds?: string[];
    query: string;
    workflowAnswers?: { [step: string]: string };
  }>(event);

  // Process file attachments if provided.
  let fileResponses: OpenAI.Files.FileObject[] = [];
  if (reqBody.fileIds && reqBody.fileIds.length > 0) {
    fileResponses = await Promise.all(
      reqBody.fileIds.map(async (fileId) => {
        const b = (await blobStorage.getItemRaw(`${fileId}.pdf`)) as ArrayBuffer;
        return await openai.files.create({
          file: bufferToResponseLike(Buffer.from(b), fileId),
          purpose: 'assistants',
        });
      })
    );
  }

  const currentWorkflowAnswers = reqBody.workflowAnswers || {};
  const { nextQuestion, updatedAnswers, complete, instructions } =
    await determineNextWorkflowStep(reqBody.query, currentWorkflowAnswers);

  if (!complete || (complete && instructions)) {
    return {
      clarifier: true,
      question: nextQuestion,
      workflowAnswers: updatedAnswers,
    };
  }

  const workflowAnswerText = Object.entries(updatedAnswers)
    .map(([step, answer]) => `${step}: ${answer}`)
    .join('\n');
  const finalQuery = `${reqBody.query}\n\nWorkflow Answers:\n${workflowAnswerText}`;
  const combinedQuery = `Query: ${finalQuery}`;

  const messages = [
    { role: 'system' as const, content: 'You are a professional procurement assistant.' },
    { role: 'user' as const, content: combinedQuery },
  ];

  const completionResponse = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
  });
  const llmAnswer = completionResponse.choices[0].message.content;

  return {
    response: llmAnswer,
    clarifier: false,
    workflowAnswers: updatedAnswers,
  };
});
