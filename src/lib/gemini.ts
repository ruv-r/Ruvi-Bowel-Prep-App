import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || 
                   import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      return null;
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export async function askPrepAI(question: string, prepType: string) {
  try {
    const ai = getGenAI();
    if (!ai) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it to your environment variables.");
    }

    const model = (ai as any).getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `You are a medical assistant helping a patient with their bowel preparation for a colonoscopy. 
      The patient is using the prep drug: ${prepType}.
      
      Patient's question: "${question}"
      
      Provide a helpful, accurate, and reassuring answer based on standard medical guidelines for this specific prep. 
      If you are unsure or if the question is complex, advise the patient to contact their doctor's office.
      Keep the answer concise and easy to understand.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API Error:", error);
    if (error instanceof Error && error.message.includes("GEMINI_API_KEY")) {
      return "The AI assistant is not configured yet. Please ensure the GEMINI_API_KEY is set in the environment variables.";
    }
    return "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later or contact your doctor for urgent questions.";
  }
}
