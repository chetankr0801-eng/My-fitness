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
    const memory = body.memory || {
      meals: [],
      protein: 0,
      water: 0,
    };

    if (!userMessage) {
      return {
        statusCode: 200,
        body: JSON.stringify({ reply: 'No message provided' }),
      };
    }

    // 🧠 SYSTEM PROMPT (PERSONALIZED + MEMORY)
    const systemPrompt = `
You are a strict but practical Indian fitness coach.

User:
- Age: 30
- Weight: 65kg
- Goal: Lose belly fat
- Diet: Non-veg

Daily targets:
- Protein: 106g
- Water: 3L
- Activity: 15 checkpoints

Today's progress:
- Meals eaten: ${JSON.stringify(memory.meals)}
- Protein so far: ${memory.protein}g
- Water intake: ${memory.water}L

Instructions:
- Give direct meal suggestions
- Focus on remaining protein
- Be practical (Indian food)
- Keep answers short
- No generic advice
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        max_tokens: 300,
      }),
    });

    const data = await response.json();

    console.log('OPENAI RESPONSE:', JSON.stringify(data));

    let reply = '';

    if (data?.choices?.[0]?.message?.content) {
      reply = data.choices[0].message.content;
    } else if (data?.error?.message) {
      reply = data.error.message;
    } else {
      reply = 'AI response error';
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ reply }),
    };

  } catch (error) {
    console.error('AI ERROR:', error);

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: 'AI unavailable — try again later.' }),
    };
  }
};
