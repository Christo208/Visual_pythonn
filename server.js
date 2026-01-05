require('dotenv').config(); 
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors'); 

const app = express();
const PORT = 3000;

//GROK SETUP
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- GLOBAL SETUP ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("❌ FATAL ERROR: GEMINI_API_KEY is not set in the .env file!");
    process.exit(1);
}

// Use gemini-2.5-flash-lite (higher free tier limit) const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

app.use(cors()); 
app.use(express.json());

// --- TEST ENDPOINT TO LIST MODELS ---
/*
app.get('/test-models', async (req, res) => {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const data = await response.json();
        console.log('Available models:', JSON.stringify(data, null, 2));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});*/

// --- MAIN PAGE ENDPOINT ---
app.post('/generate-explanation', async (req, res) => {
    try {
        const { code, inputHistory } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Missing code in request body.' });
        }

        const inputList = inputHistory ? inputHistory.map((input, index) => 
            `Input #${index + 1}: ${input}`
        ).join('\n') : "No input provided.";

        const prompt = `You are a Python tutor explaining code in "BM Style" (Basic-Maestro style).

BM Style Rules:
- Use analogies: variables = boxes, output = chalkboard
- **CRITICAL:** When a line contains 'input()', use the **Actual User Input** provided below.
- Explain line by line with execution flow
- Walk through EVERY loop iteration explicitly
- Use simple, beginner-friendly language
- **CRITICAL FORMATTING:** Start each line with "Line X →"
- **CRITICAL FORMATTING:** Wrap output in <CHALKBOARD> and </CHALKBOARD>
- **CRITICAL FORMATTING:** Wrap variable state in <VARS>VALID_JSON_HERE</VARS>
- **CRITICAL:** Inside <VARS> tags, use ONLY valid JSON format like {"varName": "value"}
- **EXAMPLE:** <VARS>{"n": 5, "factorial": 1}</VARS>

Now explain this Python code in BM Style:
Actual User Inputs Provided:
---
${inputList}
---

\`\`\`python
${code}
\`\`\`

Return ONLY the explanations as a JSON array of strings.`;

        console.log('📡 Calling Gemini API for main page...');
        console.log('📍 URL:', GEMINI_API_URL.split('?')[0]);
        
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        const responseText = await response.text();
        
        if (!response.ok) {
            console.error('❌ Gemini API Error:', response.status);
            console.error('Response:', responseText);
            return res.status(response.status).json({ 
                error: 'Gemini API Error', 
                details: responseText 
            });
        }

        const data = JSON.parse(responseText);
        console.log('✅ Gemini API response received');
        res.json(data);

    } catch (error) {
        console.error('❌ Server Error:', error.message);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message 
        });
    }
});

// --- TUTORIAL PAGE ENDPOINT ---
app.post('/generate-tutorial-explanation', async (req, res) => {
    try {
        const { code, output } = req.body;
        
        const prompt = `Explain this Python code to a 10-year-old in two very short sentences.
        The code is: ${code}. The output was: ${output}.
        Keep it encouraging and simple!`;

        console.log('📡 Calling Gemini API for tutorial...');

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.error('❌ Gemini API Error:', response.status);
            console.error('Response:', responseText);
            return res.status(response.status).json({ 
                error: 'Gemini API Error', 
                details: responseText 
            });
        }

        const data = JSON.parse(responseText);
        console.log('✅ Gemini API response received');
        res.json(data);

    } catch (error) {
        console.error('❌ Server Error:', error.message);
        res.status(500).json({ 
            error: 'Server Error', 
            details: error.message 
        });
    }
});

app.post('/chat-with-assistant', async (req, res) => {
    try {
        const { query, code, output, history } = req.body;

        // Clean, direct instructions. No mention of GSAP or technical setup.
        const systemPrompt = `You are a helpful Python Tutor. 
        - Role: Help the user fix their code. 
        - Tone: Brief, encouraging, and mentor-like. 
        - Constraint: Max 2-3 short sentences per reply.
        - Rules: If they ask about the 'spark', call it their 'code energy' or 'magic'. 
        - Context: Code is [${code}], Output is [${output}].`;

        const messages = [
            { role: "system", content: systemPrompt }
        ];

        // Format history for Groq (limit to last 4 turns to save tokens/prevent 429s)
        history.slice(-4).forEach(item => {
            messages.push({
                role: item.role === "model" ? "assistant" : "user",
                content: item.parts[0].text
            });
        });

        messages.push({ role: "user", content: query });

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: messages,
                max_tokens: 80, // Physical limit to keep responses short
                temperature: 0.6 // Lower temperature = less rambling
            })
        });

        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });

    } catch (error) {
        console.error('❌ Chat Error:', error);
        res.status(500).json({ error: 'Assistant is thinking... try again!' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔑 API Key loaded: ${GEMINI_API_KEY.substring(0, 10)}...`);
    console.log(`📡 Using model: ${GEMINI_MODEL}`);
    console.log(`🧪 Test models at: http://localhost:3000/test-models`);
});