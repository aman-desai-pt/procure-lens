import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async (event) => {
  try {
    const form = await readMultipartFormData(event);
    
    if (!form || form.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'No file uploaded'
      });
    }

    if (form.length > 1) {
      throw createError({
        statusCode: 400,
        message: 'Only one PDF file is allowed'
      });
    }

    const file = form[0];

    if (!file.filename) {
        throw createError({
            statusCode: 400,
            message: 'Only one PDF file is allowed'
        });
    }

    if (!file.filename.toLowerCase().endsWith('.pdf')) {
      throw createError({
        statusCode: 400,
        message: `Invalid file type: ${file.filename}. Only PDF files are allowed.`
      });
    }

    const uniqueFilename = `${file.filename}`;
    const filePath = path.join(process.cwd(), 'uploads', uniqueFilename);

    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(filePath, file.data);

    try {
      const openaiFile = await openai.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'assistants',
      });

      const vectorStore = await openai.beta.vectorStores.create({
        name: `Vector Store for ${file.filename}`,
      });

      await openai.beta.vectorStores.files.create(vectorStore.id, {
        file_id: openaiFile.id
      });

      const assistant = await openai.beta.assistants.create({
        name: `Analyst - ${file.filename}`,
        instructions:`
You are a professional AI assistant designed to analyze **policy documents** and provide actionable guidance in a JSON-structured format. Your responses must derive **exclusively** from the attached policy document. Use structured, logical, and policy-compliant answers tailored to the query, referencing specific sections when applicable.  

---

**Guidelines:**  

1. **Policy-Driven Responses:**  
   Ensure all answers are based solely on the attached policy document. If the required information is not present in the document, state: "No information available in the provided policy document."  

2. **JSON Output Format:**  
   Deliver your response in a JSON format with the following structure:  
   json
[
  {
    "title": "Step 1",
    "summary": "A brief summary of the step.",
    "details": "Detailed explanation of the step.",
    "detailedDescription": "Additional elaboration, examples, or further guidance, if necessary.",
    "reference": "Section or clause from the policy document, if applicable."
  },
  ...
]

     

3. **Clarity and Professionalism:**  
   Use professional yet simple language. Make the structure scalable for processes requiring multiple steps.  

4. **Special Notes or Exceptions:**  
   Include an additional section if the process involves special conditions, approvals, or exceptions.  

---
only give the array of objects as response don't give anything else just array  should start with [ ]
**Output:**  
[
  {
    "title": "Overview",
    "summary": "High-level summary of the process derived from the policies.",
    "details": "Summarize the relevant section(s) or policy information that directly apply to the query.",
    "detailedDescription": "Provide further clarification, if required, to ensure complete understanding of the policy.",
    "reference": "Section or clause from the attached document."
  },
  {
    "title": "Step 1",
    "summary": "Brief description of the first step.",
    "details": "Detailed explanation of the first action required, including conditions or requirements.",
    "detailedDescription": "Elaborate with additional insights, examples, or scenarios that could apply to this step.",
    "reference": "Specific section or clause of the policy document."
  },
  ---- and so on
]

    `,
        model: 'o3-mini',
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: { vector_store_ids: [vectorStore.id] }
        }
      });

      fs.unlinkSync(filePath);

      return {
        message: 'Assistant created successfully',
        assistant: {
          assistantId: assistant.id,
          filename: file.filename,
          vectorStoreId: vectorStore.id,
          fileId: openaiFile.id
        }
      };
    } catch (openaiError) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw createError({
        statusCode: 500,
        message: 'Failed to process file with OpenAI'
      });
    }
  } catch (error) {
    console.error('Error creating assistant:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to create assistant'
    });
  }
});