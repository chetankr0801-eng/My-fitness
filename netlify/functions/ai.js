exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ reply: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const userMessage = body.message;

    if (!userMessage) {
      return {
        statusCode: 200,
        body: JSON.stringify({ reply: 'No message provided' }),
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    const data = await response.json();

    // ✅ SAFE RESPONSE HANDLING
    let reply = '';

    if (data?.content?.[0]?.text) {
      reply = data.content[0].text;
    } else if (data?.error?.message) {
      reply = data.error.message;
    } else {
      reply = 'AI response format error';
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ reply }),
    };

  } catch (error) {
    console.error('AI FUNCTION ERROR:', error);
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: 'AI unavailable — try again later.' }),
    };
  }
};
