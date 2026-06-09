import { GoogleGenAI } from "@google/genai";
import { RAG_SOURCES } from "./rag_sources";

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
    const sourceDocument = RAG_SOURCES[prepType] || "No source document available for this preparation.";
    
    const prompt = `You are a clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
The patient is using the preparation kit: "${prepType}".

To ensure absolute safety and medical accuracy, you MUST ONLY answer the patient's question using the facts, steps, warnings, and guidelines provided within the official Consumer Medicine Information (CMI) document context below.

---------------------------------
OFFICIAL CMI DOCUMENT CONTEXT FOR ${prepType.toUpperCase()}:
${sourceDocument}
---------------------------------

CRITICAL MEDICAL & DESIGN CONSTRAINTS:
1. STRICT TRUTH & RAG SCOPE: Your knowledge is strictly constrained to the text in the CMI document context above. You are FORBIDDEN from bringing in external clinical guidance, alternative timelines, or medical knowledge not present in this document. 
2. UNKNOWN INFORMATION PROTOCOL: If the answer to the patient's question is not directly mentioned in the provided text, or if there is any ambiguity, you must politely respond: "I cannot find specific details regarding that in the official clinical document for "${prepType}". To ensure your collection is safe and successful, please contact your clinician's office directly for advice."
3. METRIC UNIT ADHERENCE: You must ONLY use metric units (milliliters/ml, liters/L, grams/g) for liquid and solid measurements, exactly as specified in the source document.
4. TONE: Be helpful, objective, professional, and reassuring. Keep the answer highly focused and easy to digest for a patient undergoing bowel cleansing.

Patient's question: "${question}"

Provide your professional RAG-secured response:`;

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
