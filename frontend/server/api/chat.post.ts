import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { determineNextWorkflowStep } from '../utils/workflowParser';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ChatMessage {
  role: 'bot' | 'user';
  contents: string;
  fileLength: number; 
}

export default defineEventHandler(async (event) => {
  // Verify required headers.
  const assistantId = getHeader(event, 'x-assistant-id');
  if (!assistantId) {
    throw createError({
      statusCode: 400,
      message: 'Header x-assistant-id missing',
    });
  }
  const vectorStoreId = getHeader(event, 'x-vector-id');
  if (!vectorStoreId) {
    throw createError({
      statusCode: 400,
      message: 'Header x-vector-id missing',
    });
  }

  const reqBody = await readBody<{
    fileIds?: string[];
    query: string;
    workflowAnswers?: { [step: string]: string };
    chatHistory?: ChatMessage[];
  }>(event);

  let fileResponses: OpenAI.Files.FileObject[] = [];
  if (reqBody.fileIds && reqBody.fileIds.length > 0) {
    const baseDir = process.cwd();
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

const currentWorkflowAnswers = reqBody.workflowAnswers || {};
const chatHistory = reqBody.chatHistory || []; // Provide the chat history if available

const { nextQuestion, updatedAnswers, complete, instructions } =
  await determineNextWorkflowStep(reqBody.query, currentWorkflowAnswers, chatHistory);

  // If the workflow isn’t complete or a terminal instruction exists,
  // return a clarifier response.
  if (!complete || (complete && instructions)) {
    return {
      clarifier: true,
      question: nextQuestion,
      workflowAnswers: updatedAnswers,
    };
  }

  // Build the final query with workflow answers.
  const workflowAnswerText = Object.entries(updatedAnswers)
    .map(([step, answer]) => `${step}: ${answer}`)
    .join('\n');
  const finalQuery = `${reqBody.query}\n\nWorkflow Answers:\n${workflowAnswerText}`;

  // Prepare messages for the chat completions endpoint.
  const messages = [
    { role: 'system' as const, content: 'You are a professional procurement assistant.' },
    { role: 'user' as const, content: finalQuery },
  ];

  // Call the chat completions endpoint.
  const completionResponse = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
  });
  const llmAnswer = completionResponse.choices[0].message.content;

  return {
    id: Date.now().toString(), // Replace with your preferred ID strategy.
    firstResponse: llmAnswer,
    clarifier: false,
    workflowAnswers: updatedAnswers,
  };
});
