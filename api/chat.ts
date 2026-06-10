import { GoogleGenAI } from "@google/genai";
import { RAG_SOURCES, COCHRANE_REVIEW_SOURCE } from "../src/lib/rag_sources.js";

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

  // Helper check for specific out-of-scope hazards/substances to block out-of-context requests
  const hazardKeywords = [
    "engine oil", "motor oil", "brake fluid", "transmission fluid", "coolant", "antifreeze", 
    "wd-40", "wd40", "gasoline", "petrol", "diesel", "kerosene", "battery acid", 
    "bleach", "windex", "detergent", "paint thinner", "acetone", "household cleaner"
  ];

  if (hazardKeywords.some(keyword => normalized.includes(keyword))) {
    return true;
  }

  // 2. Unrelated Topics (Coding, Games, Sports, Finance, Politics, general AI prompts etc.)
  const unrelatedKeywords = [
    "write a script", "coding", "javascript", "typescript", "python", "programming", "software", "algorithm", "html", "css",
    "minecraft", "fortnite", "xbox", "playstation", "nintendo", "video game", "play a game", "sing a song", "sing me a", "write a poem", "tell a joke", "pop music", "rap music",
    "netflix", "movie", "cinema", "actor", "hollywood", "disney", "marvel",
    "politics", "democrat", "republican", "election", "candidate", "parliament", "congress", "president biden", "donald trump",
    "bitcoin", "etherium", "cryptocurrency", "stock market", "investing", "mutual fund", "wall street", "nasdaq"
  ];

  // Check if the input contains direct matches
  if (unrelatedKeywords.some(keyword => {
    const r = new RegExp(`\\b${keyword}\\b`, "i");
    return r.test(normalized);
  })) {
    return true;
  }

  return false;
}

export default async function handler(req: any, res: any) {
  // Add CORS headers for flexibility
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { question, prepType } = req.body || {};

    if (!question || !prepType) {
      return res.status(400).json({ error: "Missing required parameters: question and prepType" });
    }

    // Kill switch check
    if (shouldTriggerKillSwitch(question)) {
      return res.status(200).json({
        text: "I am a clinical protocol assistant and can only answer questions regarding colonoscopies, bowel preparations, and your related clinical instructions. Please ask a question specifically about your bowel prep protocol or contact your healthcare provider for other inquiries."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        text: "The AI assistant is currently not fully configured. Please ensure that the GEMINI_API_KEY is defined in the environment variables of your deployment team."
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

    const cleanPrepType = String(prepType || '').trim();
    const isOther = cleanPrepType.toLowerCase() === 'other';
    const sourceDocument = RAG_SOURCES[cleanPrepType] || RAG_SOURCES[prepType] || "No source document available for this preparation.";
    const cochraneDocument = COCHRANE_REVIEW_SOURCE;

    let systemInstruction = "";
    if (isOther) {
      systemInstruction = `You are a clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
The patient is using a customized or unspecified bowel prep kit (referred to as "Other").

To ensure absolute safety, scientific rigor, and clinical accuracy, you MUST ONLY answer the patient's question based on facts, steps, warnings, outcomes, and guidelines from this specific official source:
1. Cochrane Systematic Review (CD006330) regarding Bowel Preparation for Colonoscopy (applicable as general medical consensus across all preparations)

CRITICAL MEDICAL & DESIGN CONSTRAINTS:
1. STRICT TRUTH & COCHRANE SCOPE: Your knowledge is strictly constrained to the text in the Cochrane Systematic Review context provided below. Because the patient is using "Other" (or a non-standard custom kit), you DO NOT have a specific Consumer Medicine Information (CMI) document. You are FORBIDDEN from using any external clinical guidance, brand-specific timelines, or general medical/world knowledge. If something is not in the Cochrane review, do not answer it or give advice.
2. UNKNOWN INFORMATION PROTOCOL: If the patient asks about specific brand dosing times, sachet ingredients, mixing procedures, or if the question cannot be answered using the facts and instructions contained in the provided Cochrane text, you must politely respond: "I cannot find specific details regarding that in the universal Cochrane Review. Since you are not using a standard predefined prep kit, I do not have a specific manufacturer leaflet to draw from. To ensure your prep is safe and successful, please check your specific kit's box or contact your doctor's office directly."
3. UNRELATED TOPICS AND HARMFUL SUBSTANCES: If asked about drinking or consuming non-medical liquids, household chemicals, industrial fluids, or auto chemicals (including but not limited to engine oil, motor oil, gasoline, diesel, coolant, bleach, detergents), or any topic completely unrelated to a medical colonoscopy preparation, you are FORBIDDEN from providing advice, general knowledge warnings, or recommendations. You MUST trigger the UNKNOWN INFORMATION PROTOCOL and politely refuse to answer.
4. METRIC UNIT ADHERENCE: You must ONLY use metric units (milliliters/ml, liters/L, grams/g) for liquid and solid measurements, exactly as specified in the source document.
5. TONE: Be helpful, objective, professional, and reassuring. Keep the answer highly focused and easy to digest for a patient undergoing bowel cleansing.

---------------------------------
UNIVERSAL COCHRANE SYSTEMATIC REVIEW (CD006330) CONTEXT:
${cochraneDocument}
---------------------------------`;
    } else {
      systemInstruction = `You are a clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
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
2. UNKNOWN INFORMATION PROTOCOL: If the patient's question cannot be answered using the facts and instructions contained in the provided texts, or if the provided texts do not mention the topic of the query, you must politely respond: "I cannot find specific details regarding that in the official clinical document for "${prepType}" or the Cochrane Review. To ensure your collection is safe and successful, please contact your clinician's office directly for advice."
3. UNRELATED TOPICS AND HARMFUL SUBSTANCES: If asked about drinking or consuming non-medical liquids, household chemicals, industrial fluids, or auto chemicals (including but not limited to engine oil, motor oil, gasoline, diesel, coolant, bleach, detergents), or any topic completely unrelated to a medical colonoscopy preparation, you are FORBIDDEN from providing advice, general knowledge warnings, or recommendations. You MUST trigger the UNKNOWN INFORMATION PROTOCOL and politely refuse to answer.
4. METRIC UNIT ADHERENCE: You must ONLY use metric units (milliliters/ml, liters/L, grams/g) for liquid and solid measurements, exactly as specified in the source document.
5. TONE: Be helpful, objective, professional, and reassuring. Keep the answer highly focused and easy to digest for a patient undergoing bowel cleansing.`;
    }

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
          
          const errStr = String(err?.message || err || "").toLowerCase();
          const isTransient = errStr.includes("503") || errStr.includes("demand") || errStr.includes("unavailable") || errStr.includes("429") || errStr.includes("limit") || errStr.includes("temporary");
          
          if (attempt < maxRetries && isTransient) {
            const backoffMs = attempt * 1200;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          } else if (!isTransient) {
            break;
          }
        }
      }
      throw lastAttemptError || new Error(`Failed to generate content with ${modelName}`);
    };

    try {
      responseText = await tryGenerate("gemini-3.5-flash");
    } catch (primaryError: any) {
      console.warn("[Gemini API] Primary model (gemini-3.5-flash) failed or high demand. Trying fallback model gemini-3.1-flash-lite...");
      try {
        responseText = await tryGenerate("gemini-3.1-flash-lite");
      } catch (fallbackError: any) {
        console.error("[Gemini API] Both primary and fallback models failed.");
        throw fallbackError;
      }
    }

    return res.status(200).json({ text: responseText });
  } catch (error: any) {
    console.error("Serverless Gemini API Error:", error);
    return res.status(200).json({
      text: `I'm sorry, I'm having trouble connecting to my knowledge base right now. (Error: ${error?.message || error || "Unknown Error"}). Please ensure your GEMINI_API_KEY environment variable is configured in your project settings and try again.`
    });
  }
}
