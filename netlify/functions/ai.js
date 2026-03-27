exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ reply: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);

    /* ── Input fields ───────────────────────────────────────── */
    const userMessage = body.message;
    const memory      = body.memory || { meals: [], protein: 0, water: 0 };
    const model       = body.model      || 'gpt-4o-mini';
    const max_tokens  = body.max_tokens || 400;

    // Full conversation history passed from frontend takes priority.
    // Falls back to a single user message if history not provided.
    const history = body.messages || [{ role: 'user', content: userMessage }];

    if (!history || history.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ reply: 'AI unavailable — try again later.' }),
      };
    }

    /* ── Build dynamic system prompt with user context ──────── */
    const remainingProtein = Math.max(0, 106 - (memory.protein || 0));
    const mealsLogged      = memory.meals && memory.meals.length > 0
      ? JSON.stringify(memory.meals)
      : 'Nothing logged yet';

    // If frontend already sends a system prompt, append memory context to it.
    // Otherwise use the full coach prompt below.
    const baseSystem = body.system || '';

    const coachPrompt = `You are a strict but practical Indian fitness coach for Chetan.
Weight: 65kg. Goal: Fat loss. Diet: Indian (veg + non-veg). Target protein: 106g/day.

TODAY'S DATA:
- Meals eaten: ${mealsLogged}
- Protein consumed: ${memory.protein || 0}g
- Remaining protein needed: ${remainingProtein}g
- Water intake: ${memory.water || 0}L

YOUR JOB:
- Give direct, actionable advice — no fluff, no generic tips.
- When asked about food, diet, or what to eat — ALWAYS respond in this exact format:

Meal suggestion:
- Food item (quantity) → Xg protein
- Food item (quantity) → Xg protein
Total protein: Xg

RULES:
- Use common Indian foods only (dal, paneer, eggs, chicken, curd, soya, rajma, etc.).
- Always include exact quantity (e.g. 100g, 2 pieces, 1 bowl).
- Always include protein per item and a total.
- Focus on remaining ${remainingProtein}g needed — suggest only what fills the gap.
- Keep answers short. Maximum 5 food items per suggestion.
- Never suggest foods already eaten today unless essential.
- For non-food questions, answer directly and practically in under 100 words.`;

    const finalSystem = baseSystem
      ? `${baseSystem}\n\n---\nMEMORY CONTEXT:\n- Protein so far: ${memory.protein || 0}g\n- Remaining: ${remainingProtein}g\n- Water: ${memory.water || 0}L\n- Meals: ${mealsLogged}`
      : coachPrompt;

    /* ── Build OpenAI messages array ────────────────────────── */
    // OpenAI uses { role: "system" } as the first message
    const openAIMessages = [
      { role: 'system', content: finalSystem },
      ...history.filter(m => m.role !== 'system'), // strip any system msgs from history
    ];

    /* ── Call OpenAI API ─────────────────────────────────────── */
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens,
        messages: openAIMessages,
      }),
    });

    /* ── Handle OpenAI errors ────────────────────────────────── */
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[ai.js] OpenAI error ${response.status}:`, errText);
      return {
        statusCode: 200,
        body: JSON.stringify({ reply: 'AI unavailable — try again later.' }),
      };
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[ai.js] Unexpected OpenAI response shape:', JSON.stringify(data));
      return {
        statusCode: 200,
        body: JSON.stringify({ reply: 'AI unavailable — try again later.' }),
      };
    }

    const text = data.choices[0].message.content;

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: text }),
    };

  } catch (error) {
    console.error('[ai.js] Handler error:', error);
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: 'AI unavailable — try again later.' }),
    };
  }
};
