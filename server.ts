import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { RAG_SOURCES, COCHRANE_REVIEW_SOURCE } from "./src/lib/rag_sources";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // API connection health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Helper logic for "kill switch" checking unrelated, sensitive, or harmful topics
  function shouldTriggerKillSwitch(question: string): boolean {
    if (!question || typeof question !== "string") return false;

    const normalized = question.toLowerCase().trim();

    // 1. Extreme/Sensitive/Harmful Topics (Suicide, Self-harm, Racism, Sexism, Homophobia, etc.)
    const extremeKeywords = [
      // Suicide & Self-Harm
      "suicide", "suicidal", "kill myself", "end my life", "hanging myself", "overdose", 
      "cut myself", "harm myself", "self-harm", "self harm", "commit suicide", "dying myself",
      // Racism & Hate Speech
      "racism", "racist", "nigger", "chink", "spic", "gook", "xenophobic", "xenophobia", "white power", "aryan", "neo-nazi", "neonazi",
      // Sexism & Misogyny
      "sexism", "sexist", "misogyny", "misogynist", "patriarchy", "male chauvinist", "slut", "bitch",
      // Homophobia & Transphobia
      "homophobia", "homophobic", "faggot", "dyke", "queer", "transphobic", "transphobia", "gender identity", "anti-gay", "anti-lgbt", "lgbtq"
    ];

    // Check if any extreme/harmful keyword is present in the question
    if (extremeKeywords.some(keyword => normalized.includes(keyword))) {
      return true;
    }

    // 2. Unrelated Topics (Coding, Games, Sports, Finance, Politics, general AI prompts etc.)
    // We check for some common non-medical domain keywords to prevent the API from being used as a general chatbot.
    const unrelatedKeywords = [
      // Tech & Coding
      "write a script", "coding", "javascript", "typescript", "python", "programming", "software", "algorithm", "html", "css",
      // Gaming & Entertainment
      "minecraft", "fortnite", "xbox", "playstation", "nintendo", "video game", "play a game", "sing a song", "sing me a", "write a poem", "tell a joke", "pop music", "rap music",
      // Movies & TV
      "netflix", "movie", "cinema", "actor", "hollywood", "disney", "marvel",
      // Politics & Elections
      "politics", "democrat", "republican", "election", "candidate", "parliament", "congress", "president biden", "donald trump",
      // Crypto & Finance
      "bitcoin", "etherium", "cryptocurrency", "stock market", "investing", "mutual fund", "wall street", "nasdaq"
    ];

    // We check if the input contains direct matches of these unrelated categories
    if (unrelatedKeywords.some(keyword => {
      const r = new RegExp(`\\b${keyword}\\b`, "i");
      return r.test(normalized);
    })) {
      return true;
    }

    return false;
  }

  // Secure API connection to Gemini AI agent
  app.post("/api/chat", async (req, res) => {
    try {
      const { question, prepType } = req.body;

      if (!question || !prepType) {
        return res.status(400).json({ error: "Missing required parameters: question and prepType" });
      }

      // Kill switch check for unrelated, sensitive or harmful topics
      if (shouldTriggerKillSwitch(question)) {
        return res.json({
          text: "I am a clinical protocol assistant and can only answer questions regarding colonoscopies, bowel preparations, and your related clinical instructions. Please ask a question specifically about your bowel prep protocol or contact your healthcare provider for other inquiries."
        });
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
      const cochraneDocument = COCHRANE_REVIEW_SOURCE;

      const systemInstruction = `You are a clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
The patient is using the preparation kit: "${prepType}".

To ensure absolute safety, scientific rigor, and clinical accuracy, you MUST ONLY answer the patient's question based on facts, steps, warnings, outcomes, and guidelines from these two specific official sources:
1. Consumer Medicine Information (CMI) specific to the patient's kit: "${prepType}"
2. Cochrane Systematic Review (CD006330) regarding Bowel Preparation for Colonoscopy (applicable across all different kits)

---------------------------------
OFFICIAL CMI DOCUMENT CONTEXT FOR ${prepType.toUpperCase()}:
${sourceDocument}
---------------------------------

---------------------------------
UNIVERSAL COCHRANE SYSTEMATIC REVIEW (CD006330) CONTEXT:
${cochraneDocument}
---------------------------------

CRITICAL MEDICAL & DESIGN CONSTRAINTS:
1. STRICT TRUTH & RAG SCOPE: Your knowledge is strictly constrained to the text in the CMI document context and Cochrane Systematic Review context provided above. You are FORBIDDEN from bringing in external clinical guidance, alternative timelines, or medical knowledge not present in these documents. If information is present in both, prioritize the specific details from the kit's CMI document, while supplementing with relevant general facts or comparative insights from the Cochrane review.
2. UNKNOWN INFORMATION PROTOCOL: If the answer to the patient's question is not directly mentioned in either of the provided texts, or if there is any ambiguity, you must politely respond: "I cannot find specific details regarding that in the official clinical document for "${prepType}" or the Cochrane Review. To ensure your collection is safe and successful, please contact your clinician's office directly for advice."
3. METRIC UNIT ADHERENCE: You must ONLY use metric units (milliliters/ml, liters/L, grams/g) for liquid and solid measurements, exactly as specified in the source document.
4. TONE: Be helpful, objective, professional, and reassuring. Keep the answer highly focused and easy to digest for a patient undergoing bowel cleansing.`;

      const prompt = `Patient's question: "${question}"

Provide your professional response:`;

      const maxRetries = 3;
      let responseText = "";

      const tryGenerate = async (modelName: string): Promise<string> => {
        let lastAttemptError: any = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction: systemInstruction,
              },
            });
            if (response && response.text) {
              return response.text;
            }
            throw new Error("Empty response returned from Gemini API");
          } catch (err: any) {
            lastAttemptError = err;
            console.warn(`[Gemini API] Attempt ${attempt}/${maxRetries} failed for ${modelName}:`, err?.message || err);
            
            // Check if it's a transient rate limit, server load, or high-demand issue (e.g., 503 or 429)
            const errStr = String(err?.message || err || "").toLowerCase();
            const isTransient = errStr.includes("503") || errStr.includes("demand") || errStr.includes("unavailable") || errStr.includes("429") || errStr.includes("limit") || errStr.includes("temporary");
            
            if (attempt < maxRetries && isTransient) {
              const backoffMs = attempt * 1200; // 1.2s, 2.4s...
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            } else if (!isTransient) {
              // Immediately break for non-transient configuration/key errors
              break;
            }
          }
        }
        throw lastAttemptError || new Error(`Failed to generate content with ${modelName}`);
      };

      try {
        // Try the primary recommended text model first
        responseText = await tryGenerate("gemini-3.5-flash");
      } catch (primaryError: any) {
        console.warn("[Gemini API] Primary model (gemini-3.5-flash) failed or high demand. Trying fallback model gemini-3.1-flash-lite...");
        try {
          // Attempt using the fallback 'gemini-3.1-flash-lite' model which may have different queue capacity
          responseText = await tryGenerate("gemini-3.1-flash-lite");
        } catch (fallbackError: any) {
          console.error("[Gemini API] Both primary and fallback models failed.");
          throw fallbackError; // Propagate the final error to the outer catch block
        }
      }

      res.json({ text: responseText });
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
