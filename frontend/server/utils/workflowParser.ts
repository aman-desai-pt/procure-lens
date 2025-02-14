// server/utils/workflowParser.ts

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

/**
 * The procurement workflow steps.
 * Each step includes allowed answers, extra instructions, and (if applicable) terminal answers.
 */
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
      YES: "Use the relevant Panel Templates.\nRefer to Whole of Government Arrangements.\nCheck Professional and Consulting Services Panel resources.",
    },
  },
  {
    step: 'Step 4',
    question: 'What Is the Total Value of Your Procurement?',
    allowedAnswers: ['Above $200,000', 'Between $25,000 – $200,000', 'Under $25,000'],
    terminalAnswers: ['Above $200,000'],
    instructions: {
      'Above $200,000': "Templates not suitable.\nRequires open tender unless exempt.\nMay need Government Procurement Board review.\nContact Procurement at 'XXX@governmentemail.com.au'.",
    },
  },
  {
    step: 'Step 5',
    question: 'Assess Risk Level of Procurement',
    allowedAnswers: ['High', 'Medium', 'Low'],
    terminalAnswers: ['High', 'Medium'],
    instructions: {
      High: "Templates not suitable.\nContact Procurement for guidance.",
      Medium: "Templates not suitable.\nContact Procurement for guidance.",
    },
  },
  {
    step: 'Step 6',
    question: 'Does Your Procurement Have Secure Local Jobs Code (SLJC) Requirements?',
    allowedAnswers: ['YES', 'NO'],
    // For Step 6, even if YES, we just provide instructions without terminating.
    instructions: {
      YES: "Ensure supplier has a Secure Local Jobs Code certificate.\nIf value exceeds $25,000, supplier must provide a Labour Relations, Training, and Workplace Equity Plan.\nIf seeking exemption, ensure prior approval is obtained.",
    },
  },
  {
    step: 'Step 7',
    question: 'Does Your Procurement Involve ICT Components?',
    allowedAnswers: ['YES', 'NO'],
    instructions: {
      YES: "Consult ICT Manager or Digital Data and Technology Solutions (DDTS).\nAdd a Technical Requirements Attachment to procurement documents.\nContact ictprocurement@governmentemail.com.au.",
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
    // This is the final step; no instructions or terminalAnswers needed.
  },
];

/**
 * Uses OpenAI to extract any valid new answers from the user's message based on the remaining steps.
 *
 * @param userMessage - The incoming message from the user.
 * @param currentAnswers - An object mapping step identifiers to already provided answers.
 * @returns A JSON object containing only the valid new answers.
 */
export async function parseWorkflowAnswers(
  userMessage: string,
  currentAnswers: Record<string, string>
): Promise<Record<string, string>> {
  // Identify the steps that haven't been answered yet.
  const remainingSteps = procurementWorkflowSteps.filter(
    (step) => !currentAnswers[step.step]
  );

  const prompt = `
Given the user's message and their current progress in the workflow, extract any valid answers for the remaining steps.
Only extract answers that are explicitly stated or clearly implied in the user's message.
If an answer is ambiguous or doesn't match the allowed values, skip it.

Current Answers:
${Object.entries(currentAnswers)
  .map(([step, answer]) => `${step}: ${answer}`)
  .join('\n')}

Remaining Steps:
${remainingSteps
  .map(
    (s) =>
      `- ${s.step}: ${s.question} (Allowed: ${s.allowedAnswers.join(', ')})`
  )
  .join('\n')}

User Message: "${userMessage}"

Return a JSON object containing only valid new answers. Example:
{
  "Step 2": "YES",
  "Step 3": "NO"
}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    return JSON.parse(response.choices[0].message.content!);
  } catch (error) {
    console.error('Failed to parse workflow answers:', error);
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
  currentAnswers: Record<string, string>
): Promise<{
  nextQuestion: string | null;
  updatedAnswers: Record<string, string>;
  complete: boolean;
  instructions?: string;
}> {
  // Parse new answers from the user's message.
  const newAnswers = await parseWorkflowAnswers(userMessage, currentAnswers);
  const updatedAnswers = { ...currentAnswers, ...newAnswers };

  // Check each answered step in order to see if a terminal answer was provided.
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

  // Find the next step that hasn't been answered.
  const nextStep = procurementWorkflowSteps.find((step) => !updatedAnswers[step.step]);
  const complete = !nextStep;

  return {
    nextQuestion: nextStep ? nextStep.question : null,
    updatedAnswers,
    complete,
  };
}
