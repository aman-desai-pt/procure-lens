import OpenAI from 'openai';
import fs from 'fs/promises'; // Use fs.promises for async file operations
import path from 'path';
import { fileURLToPath } from 'url';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const LOG_FILE_PATH = path.join(currentDir, 'openai_log.json');

async function logOpenAIInteraction(prompt: string, response: any) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      prompt,
      response: response.choices[0].message.content,
    };

    let existingLogs: any[] = [];
    try {
      const fileData = await fs.readFile(LOG_FILE_PATH, 'utf-8');
      try {
        existingLogs = JSON.parse(fileData);
      } catch (jsonError) {
        console.error('Error parsing log file JSON:', jsonError);
        existingLogs = [];
      }
    } catch (readError: any) {
      if (readError.code === 'ENOENT') {
        existingLogs = [];
      } else {
        console.error('Error reading log file:', readError);
      }
    }

    existingLogs.push(logEntry);
    await fs.writeFile(LOG_FILE_PATH, JSON.stringify(existingLogs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
}

/**
 * A workflow step now includes optional instructions and terminalAnswers.
 * - instructions: a mapping from a specific answer to guidance text.
 * - terminalAnswers: an array of answers that should end the workflow.
 */
export type WorkflowStep = {
  step: string;
  question: string;
  allowedAnswers: string[];
  instructions?: { [answer: string]: string };
  terminalAnswers?: string[];
};

export const procurementWorkflowSteps: WorkflowStep[] = [
  {
    step: 'Step 1',
    question: 'Is Your Activity a Procurement or a Grant?',
    allowedAnswers: ['Procurement', 'Grant'],
    terminalAnswers: ['Grant'],
    instructions: {
      Grant: 'Templates cannot be used for Grants. Process terminated.',
    },
  },
  {
    step: 'Step 2',
    question: 'Does Your Procurement Involve Construction Work?',
    allowedAnswers: ['YES', 'NO'],
    terminalAnswers: ['YES'],
    instructions: {
      YES: "Refer to Major Projects Executive Support or ACT Property Group.\nContact Procurement at 'XXX@governmentemail.com.au'.\nUse The Capital Framework for major projects.\nTemplates are NOT suitable.",
    },
  },
  {
    step: 'Step 3',
    question: 'Can You Use an Existing Panel or Standing Offer Arrangement?',
    allowedAnswers: ['YES', 'NO'],
    terminalAnswers: ['YES'],
    instructions: {
      YES: 'Use the relevant Panel Templates.\nRefer to Whole of Government Arrangements.\nCheck Professional and Consulting Services Panel resources.',
    },
  },
  {
    step: 'Step 4',
    question: 'What Is the Total Value of Your Procurement?',
    allowedAnswers: ['Above $200,000', 'Between $25,000 – $200,000', 'Under $25,000'],
    terminalAnswers: ['Above $200,000'],
    instructions: {
      'Above $200,000':
        "Templates not suitable.\nRequires open tender unless exempt.\nMay need Government Procurement Board review.\nContact Procurement at 'XXX@governmentemail.com.au'.",
    },
  },
  {
    step: 'Step 5',
    question: 'Assess Risk Level of Procurement',
    allowedAnswers: ['High', 'Medium', 'Low'],
    terminalAnswers: ['High', 'Medium'],
    instructions: {
      High: 'Templates not suitable.\nContact Procurement for guidance.',
      Medium: 'Templates not suitable.\nContact Procurement for guidance.',
    },
  },
  {
    step: 'Step 6',
    question: 'Does Your Procurement Have Secure Local Jobs Code (SLJC) Requirements?',
    allowedAnswers: ['YES', 'NO'],
    instructions: {
      YES: 'Ensure supplier has a Secure Local Jobs Code certificate.\nIf value exceeds $25,000, supplier must provide a Labour Relations, Training, and Workplace Equity Plan.\nIf seeking exemption, ensure prior approval is obtained.',
    },
  },
  {
    step: 'Step 7',
    question: 'Does Your Procurement Involve ICT Components?',
    allowedAnswers: ['YES', 'NO'],
    instructions: {
      YES: 'Consult ICT Manager or Digital Data and Technology Solutions (DDTS).\nAdd a Technical Requirements Attachment to procurement documents.\nContact ictprocurement@governmentemail.com.au.',
    },
  },
  {
    step: 'Step 8',
    question: 'Select the Appropriate Template',
    allowedAnswers: [
      'Low-risk Goods & Services under $200,000 (No SLJC)',
      'Low-risk Goods & Services under $200,000 (With SLJC Requirements)',
      'Professional & Consulting Services Panel Procurement',
    ],
  },
];

/**
 * Uses OpenAI to extract any valid new answers from the user's message based on the remaining steps.
 *
 * @param userMessage - The incoming message from the user.
 * @param currentAnswers - An object mapping step identifiers to already provided answers.
 * @returns A JSON object containing only the valid new answers.
 */
export type ChatMessage = {
  role: 'bot' | 'user';
  contents: string;
};

export async function parseWorkflowAnswers(
  userMessage: string,
  currentAnswers: Record<string, string>,
  chatHistory: ChatMessage[]
): Promise<Record<string, string>> {
  const remainingSteps = procurementWorkflowSteps.filter((step) => !currentAnswers[step.step]);

  const prompt = `
<WorkflowData>
  <CurrentAnswers>
    ${Object.entries(currentAnswers)
      .map(([step, answer]) => `<Answer step="${step}">${answer}</Answer>`)
      .join('\n')}
  </CurrentAnswers>
  <RemainingSteps>
    ${remainingSteps
      .map(
        (s) => `<Step id="${s.step}">
      <Question>${s.question}</Question>
      <AllowedAnswers>${s.allowedAnswers.join(', ')}</AllowedAnswers>
    </Step>`
      )
      .join('\n')}
  </RemainingSteps>
  <ChatHistory>
    ${chatHistory.map((msg) => `<Message role="${msg.role}">${msg.contents}</Message>`).join('\n')}
  </ChatHistory>
  <UserMessage>${userMessage}</UserMessage>
</WorkflowData>
<Instructions>
  If the procurement activity involves items like pens, paper, or other office supplies, it should be inferred that construction work is not involved. In such cases, automatically consider the construction question answered with "NO" and skip to the next step.
</Instructions>

<!--
Return an XML snippet with the new valid answers.
For example:
<NewAnswers>
  <Answer step="Step 2">YES</Answer>
  <Answer step="Step 3">NO</Answer>
</NewAnswers>
-->
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0
  });

  await logOpenAIInteraction(prompt, response);

  const rawContent = response.choices[0].message.content;

  const xmlMatch = rawContent?.match(/<NewAnswers>([\s\S]*?)<\/NewAnswers>/);
  if (xmlMatch) {
    const answersXml = xmlMatch[1];
    const answerRegex = /<Answer\s+step="([^"]+)">([^<]+)<\/Answer>/g;
    const newAnswers: Record<string, string> = {};
    let match;
    while ((match = answerRegex.exec(answersXml)) !== null) {
      const step = match[1].trim();
      const answer = match[2].trim();
      newAnswers[step] = answer;
    }
    return newAnswers;
  } else {
    console.error('No XML <NewAnswers> found in response:', rawContent);
    return {};
  }
}

/**
 * Determines the next workflow step based on the user's message and existing answers.
 * If any answer is designated as terminal, its instructions will be returned and the workflow ends.
 *
 * @param userMessage - The latest message from the user.
 * @param currentAnswers - The answers collected so far.
 * @returns An object containing:
 *  - nextQuestion: the next question or terminal instruction,
 *  - updatedAnswers: merged answers,
 *  - complete: whether the workflow is complete,
 *  - instructions: any additional guidance to display.
 */
export async function determineNextWorkflowStep(
  userMessage: string,
  currentAnswers: Record<string, string>,
  chatHistory: ChatMessage[]
): Promise<{
  nextQuestion: string | null;
  updatedAnswers: Record<string, string>;
  complete: boolean;
  instructions?: string;
}> {
  const newAnswers = await parseWorkflowAnswers(userMessage, currentAnswers, chatHistory);
  const updatedAnswers = { ...currentAnswers, ...newAnswers };

  for (const step of procurementWorkflowSteps) {
    const answer = updatedAnswers[step.step];
    if (answer && step.terminalAnswers && step.terminalAnswers.includes(answer)) {
      const instruction = step.instructions ? step.instructions[answer] : null;
      return {
        nextQuestion: instruction || null,
        updatedAnswers,
        complete: true,
        instructions: instruction || undefined,
      };
    }
  }

  const nextStep = procurementWorkflowSteps.find((step) => !updatedAnswers[step.step]);
  const complete = !nextStep;

  return {
    nextQuestion: nextStep ? nextStep.question : null,
    updatedAnswers,
    complete,
  };
}
