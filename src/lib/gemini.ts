import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function askPrepAI(question: string, prepType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a medical assistant helping a patient with their bowel preparation for a colonoscopy. 
      The patient is using the prep drug: ${prepType}.
      
      Patient's question: "${question}"
      
      Provide a helpful, accurate, and reassuring answer based on standard medical guidelines for this specific prep. 
      If you are unsure or if the question is complex, advise the patient to contact their doctor's office.
      Keep the answer concise and easy to understand.`,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later or contact your doctor for urgent questions.";
  }
}
