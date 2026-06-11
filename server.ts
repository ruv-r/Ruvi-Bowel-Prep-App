import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { RAG_SOURCES, COCHRANE_REVIEW_SOURCE } from "./src/lib/rag_sources";

// Helper to format date nicely
function formatDateFriendly(dateStr: string): string {
  if (!dateStr) return "unknown date";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch (e) {
    return dateStr;
  }
}

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

  // Fallback response generator in case of API quota limit issues or empty API keys
  function generateFallbackResponse(question: string, prepType: string, daysRemaining?: number): string {
    const qStr = question.toLowerCase().trim();
    const prepName = prepType || 'your bowel preparation';
    
    let intro = `Hi there! I am Prep Bud, your friendly helper. Since our primary AI connection is currently experiencing high demand or quota limits, I've loaded your instructions directly from our official, offline clinical database to make sure you get instant, accurate assistance right away. ❤️\n\n`;

    // 1. Extreme topics or general unrelated check
    if (qStr.includes("suicide") || qStr.includes("harm") || qStr.includes("kill myself")) {
      return `If you are experiencing a mental health emergency, self-harm thoughts, or severe distress, please contact emergency services (like 000 in Australia or 911/988) immediately. I care about your safety first.`;
    }

    const hasTimeline = daysRemaining !== undefined && !isNaN(daysRemaining);

    if (hasTimeline) {
      if (daysRemaining > 7) {
        if (qStr.includes("eat") || qStr.includes("food") || qStr.includes("diet") || qStr.includes("solid") || qStr.includes("fiber") || qStr.includes("meal") || qStr.includes("banana") || qStr.includes("bread") || qStr.includes("rice") || qStr.includes("kiwi") || qStr.includes("tomato") || qStr.includes("seed") || qStr.includes("nut")) {
          return intro + `Since your procedure is still **${daysRemaining} days away**, you are currently in the **Pre-preparation phase**.\n\n` +
            `* **Diet Rules:** You do **not** need to restrict your diet yet! You can eat custom or normal foods, muesli, seeds, fruits, vegetables, etc., exactly as you normally would.\n` +
            `* **Timeline Warning:** Your active low-residue physical diet restrictions and prep steps should start exactly **7 days prior** to your scheduled procedure. You can return to this app then to initiate your customized daily guidance easily!`;
        }
      } else if (daysRemaining === 0) {
        if (qStr.includes("eat") || qStr.includes("food") || qStr.includes("diet") || qStr.includes("solid") || qStr.includes("fiber") || qStr.includes("meal") || qStr.includes("banana") || qStr.includes("bread") || qStr.includes("rice") || qStr.includes("kiwi") || qStr.includes("tomato") || qStr.includes("seed") || qStr.includes("nut")) {
          return intro + `Today is the **Day of your Procedure (Day 0)**! You must follow these absolute guidelines:\n\n` +
            `* **Fast Completely:** Strictly **no food, drink, or water** starting 2 hours prior to your scheduled examination (or 6 hours if using Picolax). Absolutely no solid foods under any circumstances.\n` +
            `* **Compliance:** Proper fasting is a critical medical safety rule to prevent any aspiration/vomiting risks during clinical sedation. Please proceed directly to your hospital/clinic as planned.`;
        }
      } else if (daysRemaining === 1) {
        if (qStr.includes("eat") || qStr.includes("food") || qStr.includes("diet") || qStr.includes("solid") || qStr.includes("fiber") || qStr.includes("meal") || qStr.includes("banana") || qStr.includes("bread") || qStr.includes("rice") || qStr.includes("kiwi") || qStr.includes("tomato") || qStr.includes("seed") || qStr.includes("nut")) {
          return intro + `Today is **Day -1 (the day before your procedure)**. You have entered the absolute clean-out phase:\n\n` +
            `* **Strict Clear Liquids Only:** You must stop **all** solid food, meats, dairy, milk, and fruit pulps immediately. Only consume approved clear liquids (clear water, clear bio-strained broth, black coffee/tea without milk, plain pale gelatin/sports drinks). Avoid red or purple colorings!\n` +
            `* **Doses:** Make sure to follow and consume your active bowel kit sachets precisely at the prescribed timeline hours of Day -1.`;
        }
      } else if (daysRemaining > 1 && daysRemaining <= 7) {
        if (qStr.includes("eat") || qStr.includes("food") || qStr.includes("diet") || qStr.includes("solid") || qStr.includes("fiber") || qStr.includes("meal") || qStr.includes("banana") || qStr.includes("bread") || qStr.includes("rice") || qStr.includes("kiwi") || qStr.includes("tomato") || qStr.includes("seed") || qStr.includes("nut")) {
          return intro + `Today is **Day -${daysRemaining} (${daysRemaining} days remaining)**. You are in the **Low-Residue Transition Phase**:\n\n` +
            `* **Low-Residue diet active:** Transition to eating low-residue foods like eggs, white bread, plain white rice, boiled chicken, skinless steamed white fish, or plain pasta.\n` +
            `* **Strict Restraints:** Avoid eating seeds, grains, muesli, raw fruit/vegetable skin (like kiwi, tomatoes), and high-fiber/fibrous foods.\n` +
            `* **Aesthetic Note:** **Do NOT** take your bowel preparation laxatives or clear-liquid fast today! Those only begin on Day -1. Today is purely a low-fiber diet shift to optimize your cleanse.`;
        }
        if (qStr.includes("take") || qStr.includes("dose") || qStr.includes("pill") || qStr.includes("medication") || qStr.includes("sachet") || qStr.includes("step") || qStr.includes("how to mix") || qStr.includes("mix")) {
          return intro + `Today is **Day -${daysRemaining} (${daysRemaining} days remaining)**.\n\n` +
            `* **Laxative / Sachet Doses:** You do **not** take any of your active bowel preparation sachet doses or laxative tablets today. Those only start on Day -1 (the day before your procedure).\n` +
            `* **What to do:** Focus on following the **low-residue diet** instructions of your schedule today, avoid seeds/fibers, and keep drinking plenty of clear fluids/water to stay hydrated.`;
        }
      }
    }

    // 2. Clear liquid / drink questions
    if (qStr.includes("drink") || qStr.includes("fluid") || qStr.includes("liquid") || qStr.includes("water") || qStr.includes("broth") || qStr.includes("coffee") || qStr.includes("tea") || qStr.includes("juice") || qStr.includes("soda") || qStr.includes("gelatin")) {
      return intro + `Regarding **fluids and drinking** on your clear liquid diet:\n\n` +
        `* **Strictly Allowed/Approved Fluids:** Clear plain water, clear strained broth, black tea or black coffee (no milk or dairy), clear apple or pear juice (no pulp), light-colored sports drinks, and clear carbonated soft drinks.\n` +
        `* **Absolute Constraints:** Do **NOT** consume any liquids that are orange, red, or purple in color, as the dyes can mimic bleeding or stain your colon walls, which might obscure the doctor's cam view. Also, strictly avoid any milk, dairy, or yogurt products.\n` +
        `* **Hydration Advice:** Be sure to drink at least 250 mL of clear fluids every hour during your clean-out phase to stay safe, healthy, and hydrated!`;
    }

    // 3. Diet / food query
    if (qStr.includes("eat") || qStr.includes("food") || qStr.includes("diet") || qStr.includes("solid") || qStr.includes("fiber") || qStr.includes("meal") || qStr.includes("banana") || qStr.includes("bread") || qStr.includes("rice") || qStr.includes("kiwi") || qStr.includes("tomato") || qStr.includes("seed") || qStr.includes("nut")) {
      return intro + `Regarding your **diet and food rules** for prep:\n\n` +
        `* **7 Days Before Procedure:** You should transition to a **low-residue diet**. Strictly avoid high-fiber foods, whole grain breads, muesli, nuts, seeds, raw vegetables, skin-on fresh fruits (like tomatoes, kiwi, berries), and raw legumes.\n` +
        `* **1 Day Before (Cleanse Day):** You must stop all solid foods immediately. You are on a **strict clear fluids only diet**. No solids, dairy, or pulp at all!\n` +
        `* **Procedure Day:** Stop drinking all liquids (even water) completely exactly 2 hours prior to your scheduled examination time to prevent any aspiration risk. Please follow this safety rule strictly!`;
    }

    // 4. Medication, Dose, pill, contraceptive, steps
    if (qStr.includes("take") || qStr.includes("dose") || qStr.includes("pill") || qStr.includes("medication") || qStr.includes("contraceptive") || qStr.includes("sachet") || qStr.includes("step") || qStr.includes("how to mix") || qStr.includes("mix")) {
      let specificDosing = "";
      if (prepName.includes("Glycoprep")) {
        specificDosing = `For **${prepType}**:\n* On Day -1, mix the Glycoprep sachet under the recommended volumes typically 1L of water, and drink it slowly over 1 hour. Take other components (like Magnesium Citrate sachet and Bisacodyl stimulant tablets) exactly at the hours set in your timeline list.`;
      } else if (prepName.includes("Plenvu")) {
        specificDosing = `For **Plenvu**:\n* Dose 1 and Dose 2 must be diluted in 500 mL of water and consumed slowly, followed by an additional 500 mL of clear fluids over the next 30-60 minutes. Close compliance is important!`;
      } else if (prepName.includes("Picolax") || prepName.includes("Picoprep")) {
        specificDosing = `For **${prepType}**:\n* Sachets are mixed in 250 mL of warm water and drunk. Be sure to follow each dose with a glass of clear water, and drink at least 250 mL of clear fluid every hour to flush properly.`;
      } else {
        specificDosing = `Please mix and consume your specific bowel prep kit exactly as stated on your clinical instruction sheet, and remain near a toilet once dose administration begins.`;
      }

      return intro + `Regarding **taking your preparation doses and medications**:\n\n` +
        `${specificDosing}\n\n` +
        `* **Warning regarding Contraceptives & Oral Medications:** Rapid bowel movements from laxatives prevent other medicines from absorbing properly. If you take oral birth control pills within 1 hour before or after taking your prep, they may be flushed without absorbing. Use alternative barrier precautions this month!\n` +
        `* For critical heart, blood pressure, or diabetes medications, consult your prescribing doctor directly on how to adjust your dosing.`;
    }

    // 5. Symptoms, nausea, vomit, sick, headache
    if (qStr.includes("sick") || qStr.includes("nausea") || qStr.includes("vomit") || qStr.includes("headache") || qStr.includes("pain") || qStr.includes("stomach") || qStr.includes("bloat") || qStr.includes("cramp")) {
      return intro + `I am so sorry to hear you are feeling unwell! Mild bloating, nausea, stomach cramps, and headache can occur during active bowel cleansing as your body clears liquids rapidly.\n\n` +
        `* **If Nauseated:** Try slowing down your intake. Sip your bowel prep solution or water over a longer period rather than gulping. Sucking on a pale-colored barley sugar or mint candy can also help soothe your stomach.\n` +
        `* **Hydration:** Headaches and lightheadedness are often due to mild dehydration. Ensure you are continuously sipping allowed clear liquids and broth to replenish fluids and salts.\n` +
        `* **Symptom Tracker:** Remember to log this symptom on the right side panel of your dashboard so you can download the report for your clinical team!\n` +
        `* **CRITICAL ALERT:** If you experience severe, unbearable pain, active bleeding, persistent vomiting, or lightheadedness that prevents you from standing up, please contact your doctor or call medical emergency lines immediately. Your safety is paramount!`;
    }

    // 6. Generic or friendly welcome
    let currentDayStr = hasTimeline 
      ? (daysRemaining > 7 
          ? `(currently Pre-preparation Phase, ${daysRemaining} days remaining)` 
          : daysRemaining === 0 
            ? `(today is Day of Procedure)` 
            : `(currently Day -${daysRemaining})`) 
      : "";

    return intro + `I am Prep Bud, your dedicated clinical prep assistant for **${prepName}** ${currentDayStr}!\n\n` +
      `I can help you navigate this cleanse completely offline. Ask me anything about:\n` +
      `* **Diet / Eating Rules:** (e.g., "What can I eat on Day 7?", "Can I eat solid food tomorrow?")\n` +
      `* **Approved Fluids:** (e.g., "Can I drink coffee?", "What juices are allowed?")\n` +
      `* **Medications & Contraceptives:** (e.g., "Will my birth control pill still work?", "How to mix my sachets?")\n` +
      `* **Handling Side-effects:** (e.g., "I feel nauseous, what should I do?")\n\n` +
      `What specific part of your bowel preparation schedule can I support you with today?`;
  }

  // Secure API connection to Gemini AI agent
  app.post("/api/chat", async (req, res) => {
    let question = "";
    let prepType = "";
    let cleanPrepType = "";
    try {
      const body = req.body || {};
      question = body.question;
      prepType = body.prepType;

      if (!question || !prepType) {
        return res.status(400).json({ error: "Missing required parameters: question and prepType" });
      }

      cleanPrepType = String(prepType || '').trim();
      const isOther = cleanPrepType.toLowerCase() === 'other';

      const clientProcDate = body.procDate;
      const clientCurrentDate = body.currentDate || new Date().toISOString();
      let daysRemaining = body.daysRemaining !== undefined && body.daysRemaining !== null ? Number(body.daysRemaining) : NaN;
      if (isNaN(daysRemaining) && clientProcDate) {
        const target = new Date(clientProcDate);
        const today = new Date(clientCurrentDate);
        target.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const diff = target.getTime() - today.getTime();
        daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

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
          text: "I am Prep Bud, your friendly clinical protocol assistant, and can only answer questions regarding colonoscopies, bowel preparations, and your related clinical instructions. Please ask a question specifically about your bowel prep protocol or contact your healthcare provider for other inquiries."
        });
      }

      console.log(`[Chat Endpoint] Incoming request - prepType: "${cleanPrepType}", question: "${question}", Days Remaining: ${daysRemaining}`);

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("[Chat Endpoint] GEMINI_API_KEY is undefined. Falling back to offline model assistant.");
        const fallbackText = generateFallbackResponse(question, cleanPrepType, daysRemaining);
        return res.json({ text: fallbackText });
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

      let timelineInstruction = "";
      if (clientProcDate && !isNaN(daysRemaining)) {
        if (daysRemaining > 7) {
          timelineInstruction = `
=== CHRONOLOGICAL CONTEXT ===
- Today's date relative to procedure: **${daysRemaining} days remaining** until the procedure scheduled for ${formatDateFriendly(clientProcDate)}.
- Strict Phase: **Pre-preparation / Normal Diet**. The patient is currently outside of the 7-day bowel prep dietary restriction period.
- YOUR CRITICAL DIRECTION: If the patient asks what they can/cannot eat or drink, or what rules they should follow right now, you MUST explicitly recognize that they are still ${daysRemaining} days out from their procedure date (${formatDateFriendly(clientProcDate)}), which is outside the active 7-day restriction period. Reassure them that they DO NOT need to restrict their diet yet and they can eat a normal diet today. Let them know they should return to this advisor exactly 7 days prior to their procedure. Do NOT trigger the UNKNOWN INFORMATION PROTOCOL fallback message for normal food/diet queries when they are more than 7 days out!
`;
        } else if (daysRemaining === 0) {
          timelineInstruction = `
=== CHRONOLOGICAL CONTEXT ===
- Today's date relative to procedure: **Today is the EXACT Day of the Procedure (Day 0)** (Procedure Date: ${formatDateFriendly(clientProcDate)}).
- Strict Phase: **Absolute Fasting / Sedation Readiness**. Absolute zero solid foods are allowed, and all fluid/water intake must be completely stopped exactly 2 hours prior to the procedure.
- YOUR CRITICAL DIRECTION: If they ask about eating or drinking, emphasize that they are now on their actual procedure day and must maintain complete fasting protocols. Do not give diet advice for any earlier days.
`;
        } else if (daysRemaining === 1) {
          timelineInstruction = `
=== CHRONOLOGICAL CONTEXT ===
- Today's date relative to procedure: **Day -1 (The day before the procedure)** (Procedure Date: ${formatDateFriendly(clientProcDate)}).
- Strict Phase: **Clear Liquids Only & Bowel Cleansing Kit Start**. Strictly no solid food, dairy, or meats are allowed. Only approved clear liquids and prescribed bowel prep doses are to be taken.
- YOUR CRITICAL DIRECTION: If they ask what they can eat or do, make sure they understand they are on Day -1 (the day before the procedure) and must strictly limit themselves to clear liquids only. They must not eat solid foods under any circumstances!
`;
        } else if (daysRemaining > 1 && daysRemaining <= 7) {
          timelineInstruction = `
=== CHRONOLOGICAL CONTEXT ===
- Today's date relative to procedure: **Day -${daysRemaining} (${daysRemaining} days remaining)** until the procedure scheduled for ${formatDateFriendly(clientProcDate)}.
- Strict Phase: **Low-Residue Transition Phase**. The patient is in the low-fiber diet transition period. Normal fiber, seeds, nuts, whole grains, raw vegetables, and skin-on fruits must be completely avoided.
- YOUR CRITICAL DIRECTION: Keep advice strictly appropriate for Day -${daysRemaining}. Remind them that they can eat low-residue foods like white rice, white bread, plain pasta, eggs, chicken, and skinless steam-boiled fish. Reassure them that they should **NOT** start clear liquid diets or take their bowel cleanser/laxative sachets today—those are strictly for the day before (Day -1).
`;
        } else if (daysRemaining < 0) {
          timelineInstruction = `
=== CHRONOLOGICAL CONTEXT ===
- Today's date relative to procedure: **The procedure has already occurred** (Date: ${formatDateFriendly(clientProcDate)}).
- Strict Phase: **Post-procedure recovery**.
- YOUR CRITICAL DIRECTION: Reassure them that the preparation is complete, and guide them to consult their recovery discharge paperwork or post-procedure clinic directions for dietary resumption.
`;
        }
      } else if (clientProcDate) {
        timelineInstruction = `
=== CHRONOLOGICAL CONTEXT ===
- Procedure is scheduled for ${formatDateFriendly(clientProcDate)}, but the current comparison date is undetermined.
`;
      }

      let systemInstruction = "";
      if (isOther) {
        systemInstruction = `You are "Prep Bud", a friendly, empathetic, and helpful clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
The patient is using a customized or unspecified bowel prep kit (referred to as "Other").
${timelineInstruction}

=== ABSOLUTE CONSTRAINT: STRICT DOCUMENT-ONLY GROUNDING ===
Your knowledge is strictly and absolutely limited to the text in the UNIVERSAL COCHRANE SYSTEMATIC REVIEW provided below. You do not possess any general world knowledge, medical knowledge, common sense, or reasoning outside of the literal sentences in the provided text.
- If the patient's question contains ANY terms, concepts, products, chemicals, substances, medications, or ideas that are not explicitly written in the provided text, you are FORBIDDEN from discussing, warning about, detailing, explaining, or acknowledging them.
- If the patient asks about consuming or drinking non-medical liquids, household liquids, auto chemicals (like engine oil, motor oil, bleach, gasoline), or any other substance not explicitly discussed as an approved bowel preparation agent, you MUST NOT warn them or give safety advice using general knowledge. You MUST strictly treat it as completely unknown and output the exact UNKNOWN INFORMATION PROTOCOL response.
- DO NOT use external clinical assumptions. If the patient asks "What happens if I drink motor oil?" or "Can I eat bananas?", since "motor oil" and "bananas" are NOT mentioned in the text below, you must NOT say they are bad or explain why. You MUST strictly output the EXACT text of the UNKNOWN INFORMATION PROTOCOL message.

=== EXCEPTION TO GROUNDING CONSTRAINTS ===
- TEMPORAL SCHEDULING EXCEPTION: Providing chronological context, confirming that there are ${daysRemaining} days remaining, or reassuring the user that they can eat normally when they are outside of the active 7-day bowel prep dietary restriction period is a critical, mandatory exception to the grounding constraints. Do NOT trigger the UNKNOWN INFORMATION PROTOCOL fallback message when reassuring a user that they can eat normally during their Pre-preparation / Normal Diet phase (>7 days remaining) or when confirming typical day-specific dietary instructions for the current day out.

UNKNOWN INFORMATION PROTOCOL:
If the patient's question refers to any topic, brand, time, ingredient, or item not explicitly covered by the Cochrane review text, respond with this EXACT text and nothing else:
"${unknownOtherMsg}"

METRIC ONLY: You must only use metric units (milliliters/ml, liters/L, grams/g).

TONE: Extremely friendly, empathetic, reassuring, and helpful. Keep answers highly focused and direct, but wrap the information in a warm, caring manner. Always stay strictly grounded in the facts.

---------------------------------
UNIVERSAL COCHRANE SYSTEMATIC REVIEW (CD006330) CONTEXT:
${cochraneDocument}
---------------------------------`;
      } else {
        systemInstruction = `You are "Prep Bud", a friendly, empathetic, and helpful clinical protocol assistant helping a patient with their bowel preparation for a colonoscopy.
The patient is using the preparation kit: "${prepType}".
${timelineInstruction}

=== ABSOLUTE CONSTRAINT: STRICT DOCUMENT-ONLY GROUNDING ===
Your knowledge is strictly and absolutely limited to the text in the OFFICIAL CMI DOCUMENT and UNIVERSAL COCHRANE SYSTEMATIC REVIEW provided below. You do not possess any general world knowledge, medical knowledge, common sense, or reasoning outside of the literal sentences in the provided texts.
- If the patient's question contains ANY terms, concepts, products, chemicals, substances, medications, or ideas that are not explicitly written in the provided contexts, you are FORBIDDEN from discussing, warning about, detailing, explaining, or acknowledging them.
- If the patient asks about consuming or drinking non-medical liquids, household liquids, auto chemicals (like engine oil, motor oil, bleach, gasoline), or any other substance not explicitly discussed as an approved bowel preparation agent, you MUST NOT warn them or give safety advice using general knowledge. You MUST strictly treat it as completely unknown and output the exact UNKNOWN INFORMATION PROTOCOL response.
- DO NOT use external clinical assumptions. If the patient asks "What happens if I drink motor oil?" or "Can I eat bananas?", since they are not mentioned in the provided texts, you must NOT say they are bad or explain why. You MUST strictly output the EXACT text of the UNKNOWN INFORMATION PROTOCOL message.

=== EXCEPTION TO GROUNDING CONSTRAINTS ===
- TEMPORAL SCHEDULING EXCEPTION: Providing chronological context, confirming that there are ${daysRemaining} days remaining, or reassuring the user that they can eat normally when they are outside of the active 7-day bowel prep dietary restriction period is a critical, mandatory exception to the grounding constraints. Do NOT trigger the UNKNOWN INFORMATION PROTOCOL fallback message when reassuring a user that they can eat normally during their Pre-preparation / Normal Diet phase (>7 days remaining) or when confirming typical day-specific dietary instructions for the current day out.

UNKNOWN INFORMATION PROTOCOL:
If the patient's question refers to any topic, brand, time, ingredient, or item not explicitly covered by the provided texts, respond with this EXACT text and nothing else:
"${unknownBrandMsg}"

METRIC ONLY: You must only use metric units (milliliters/ml, liters/L, grams/g).

TONE: Extremely friendly, empathetic, reassuring, and helpful. Keep answers highly focused and direct, but wrap the information in a warm, caring manner. Always stay strictly grounded in the facts.

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
      console.error("Server Gemini API Error (Using Offline Fallback):", error);
      const fallbackText = generateFallbackResponse(question, cleanPrepType);
      res.json({ text: fallbackText });
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
