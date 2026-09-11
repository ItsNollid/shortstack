export async function generateMetadata(filename: string) {
  try {
    const prompt = `Based on the video filename "${filename}", generate a title, description, and tags. Return ONLY a JSON object containing title (string, max 50 chars), description (string), and tags (array of strings).`;
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3', // Adjust model name if needed
        prompt,
        stream: false,
        format: 'json'
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data: JSON.parse(data.response) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to connect to Ollama' };
  }
}
