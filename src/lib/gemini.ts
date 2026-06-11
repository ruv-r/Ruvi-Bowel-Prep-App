export async function askPrepAI(
  question: string, 
  prepType: string, 
  procDate?: string, 
  currentDate?: string, 
  daysRemaining?: number
): Promise<string> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, prepType, procDate, currentDate, daysRemaining }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return `Server Error: ${errorText || "Failed to fetch AI assistant reply"}`;
    }

    const data = await response.json();
    return data.text || "No response received";
  } catch (error: any) {
    console.error("AI Assistant network error:", error);
    return `Connection Error: ${error?.message || "Could not reach the server"}. Please try again later or contact your doctor for urgent questions.`;
  }
}
