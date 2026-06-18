export async function fetchMistralModels(): Promise<string[]> {
  const response = await fetch('/api/models');
  if (!response.ok) {
    return ['mistral-small-latest', 'mistral-large-latest', 'mistral-medium-latest']; // defaults
  }
  return await response.json();
}

export async function chatWithMistral(messages: { role: string; content: string }[], model: string = 'mistral-small-latest') {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, model }),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to communicate with Mistral';
    try {
      const errorData = await response.json();
      if (errorData?.error) errorMessage = errorData.error;
    } catch(e) {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
