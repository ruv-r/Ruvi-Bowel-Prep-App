import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { RAG_SOURCES } from "./src/lib/rag_sources";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // API connection health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Secure API connection to Gemini AI agent
  app.post("/api/chat", async (req, res) => {
    try {
      const { question, prepType } = req.body;

      if (!question || !prepType) {
        return res.status(400).json({ error: "Missing required parameters: question and prepType" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({
          text: "The AI assistant is currently not fully configured. Please ensure that the GEMINI_API_KEY is defined in the Settings > Secrets panel of your workspace."
        });
      }

      // Initialize Gemini Client
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

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

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Server Gemini API Error:", error);
      res.json({
        text: `I'm sorry, I'm having trouble connecting to my knowledge base right now. (Error: ${error?.message || error || "Unknown Error"}). Please ensure your GEMINI_API_KEY is configured in the Settings > Secrets tab and try again.`
      });
    }
  });

  // Vite development middleware vs. static build distribution
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
