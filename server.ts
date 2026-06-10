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

      const cleanPrepType = String(prepType || '').trim();
      const isOther = cleanPrepType.toLowerCase() === 'other';

      // Exact UNKNOWN INFORMATION PROTOCOL message definitions
      const unknownOtherMsg = "I cannot find specific details regarding that in the universal Cochrane Review. Since you are not using a standard predefined prep kit, I do not have a specific manufacturer leaflet to draw from. To ensure your prep is safe and successful, please check your specific kit's box or contact your doctor's office directly.";
      const unknownBrandMsg = `I cannot find specific details regarding that in the official clinical document for "${prepType}" or the Cochrane Review. To ensure your collection is safe and successful, please contact your clinician's office directly for advice.`;
      const selectedUnknownMsg = isOther ? unknownOtherMsg : unknownBrandMsg;

      // Hazard & Out-of-scope Substance Check
      const normalizedQuestion = question.toLowerCase().trim();
      const hazardKeywords = [
        "engine oil", "motor oil", "brake fluid", "transmission fluid", "coolant", "antifreeze", 
        "wd-40", "wd40", "gasoline", "petrol", "diesel", "kerosene", "battery acid", 
        "bleach", "windex", "detergent", "paint thinner", "acetone", "household cleaner",
        "motor-oil", "engine-oil"
      ];

      if (hazardKeywords.some(keyword => normalizedQuestion.includes(keyword))) {
        // Confined to document - prevent any engine oil / hazard knowledge bleeding
        return res.json({ text: selectedUnknownMsg });
      }

      // Kill switch check for unrelated, sensitive or harmful topics
      if (shouldTriggerKillSwitch(question)) {
        return res.json({
          text: "I am a clinical protocol assistant and can only answer questions regarding colonoscopies, bowel preparations, and your related clinical instructions. Please ask a question specifically about your bowel prep protocol or contact your healthcare provider for other inquiries."
        });
      }

      console.log(`[Chat Endpoint] Incoming request - prepType: "${cleanPrepType}", question: "${question}"`);

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

      const sourceDocument = RAG_SOURCES[cleanPrepType] || RAG_SOURCES[prepType] || "No source document available for this preparation.";
      const cochraneDocument = COCHRANE_REVIEW_SOURCE;

      console.log(`[Chat Endpoint] Context Loaded: sourceDocument Length = ${sourceDocument.length} chars, cochraneDocument Length = ${cochraneDocument.length} chars`);

      let systemInstruction = "";
      if (isOther) {
        systemInstruction = `You are a clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
The patient is using a customized or unspecified bowel prep kit (referred to as "Other").

=== ABSOLUTE CONSTRAINT: STRICT DOCUMENT-ONLY GROUNDING ===
Your knowledge is strictly and absolutely limited to the text in the UNIVERSAL COCHRANE SYSTEMATIC REVIEW provided below. You do not possess any general world knowledge, medical knowledge, common sense, or reasoning outside of the literal sentences in the provided text.
- If the patient's question contains ANY terms, concepts, products, chemicals, substances, medications, or ideas that are not explicitly written in the provided text, you are FORBIDDEN from discussing, warning about, detailing, explaining, or acknowledging them.
- If the patient asks about consuming or drinking non-medical liquids, household liquids, auto chemicals (like engine oil, motor oil, bleach, gasoline), or any other substance not explicitly discussed as an approved bowel preparation agent, you MUST NOT warn them or give safety advice using general knowledge. You MUST strictly treat it as completely unknown and output the exact UNKNOWN INFORMATION PROTOCOL response.
- DO NOT use external clinical assumptions. If the patient asks "What happens if I drink motor oil?" or "Can I eat bananas?", since "motor oil" and "bananas" are NOT mentioned in the text below, you must NOT say they are bad or explain why. You MUST strictly output the EXACT text of the UNKNOWN INFORMATION PROTOCOL message.

UNKNOWN INFORMATION PROTOCOL:
If the patient's question refers to any topic, brand, time, ingredient, or item not explicitly covered by the Cochrane review text, respond with this EXACT text and nothing else:
"${unknownOtherMsg}"

METRIC ONLY: You must only use metric units (milliliters/ml, liters/L, grams/g).

TONE: Objective, professional, reassuring, and direct. Keep answers extremely short and concise. Do not add general conversation or intro/outro.

---------------------------------
UNIVERSAL COCHRANE SYSTEMATIC REVIEW (CD006330) CONTEXT:
${cochraneDocument}
---------------------------------`;
      } else {
        systemInstruction = `You are a clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
The patient is using the preparation kit: "${prepType}".

=== ABSOLUTE CONSTRAINT: STRICT DOCUMENT-ONLY GROUNDING ===
Your knowledge is strictly and absolutely limited to the text in the OFFICIAL CMI DOCUMENT and UNIVERSAL COCHRANE SYSTEMATIC REVIEW provided below. You do not possess any general world knowledge, medical knowledge, common sense, or reasoning outside of the literal sentences in the provided texts.
- If the patient's question contains ANY terms, concepts, products, chemicals, substances, medications, or ideas that are not explicitly written in the provided contexts, you are FORBIDDEN from discussing, warning about, detailing, explaining, or acknowledging them.
- If the patient asks about consuming or drinking non-medical liquids, household liquids, auto chemicals (like engine oil, motor oil, bleach, gasoline), or any other substance not explicitly discussed as an approved bowel preparation agent, you MUST NOT warn them or give safety advice using general knowledge. You MUST strictly treat it as completely unknown and output the exact UNKNOWN INFORMATION PROTOCOL response.
- DO NOT use external clinical assumptions. If the patient asks "What happens if I drink motor oil?" or "Can I eat bananas?", since they are not mentioned in the provided texts, you must NOT say they are bad or explain why. You MUST strictly output the EXACT text of the UNKNOWN INFORMATION PROTOCOL message.

UNKNOWN INFORMATION PROTOCOL:
If the patient's question refers to any topic, brand, time, ingredient, or item not explicitly covered by the provided texts, respond with this EXACT text and nothing else:
"${unknownBrandMsg}"

METRIC ONLY: You must only use metric units (milliliters/ml, liters/L, grams/g).

TONE: Objective, professional, reassuring, and direct. Keep answers extremely short and concise. Do not add general conversation or intro/outro.

---------------------------------
OFFICIAL CMI DOCUMENT CONTEXT FOR ${prepType.toUpperCase()}:
${sourceDocument}
---------------------------------

---------------------------------
UNIVERSAL COCHRANE SYSTEMATIC REVIEW (CD006330) CONTEXT:
${cochraneDocument}
---------------------------------`;
      }

      const prompt = `Patient's question: "${question}"

Provide your response:`;

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
