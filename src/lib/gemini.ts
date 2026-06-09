export async function askPrepAI(question: string, prepType: string): Promise<string> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, prepType }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch AI assistant reply");
    }

    const data = await response.json();
    return data.text || "No response received";
  } catch (error) {
    console.error("AI Assistant network error:", error);
    return "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later or contact your doctor for urgent questions.";
  }
}
