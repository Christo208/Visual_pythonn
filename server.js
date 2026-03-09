require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path'); // Added for file pathing

const app = express();
const PORT = 3000;

// GROK SETUP
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- GLOBAL SETUP ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("❌ FATAL ERROR: GEMINI_API_KEY is not set in the .env file!");
    process.exit(1);
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// SMART EXPLANATION CACHE
const explanationCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Clear old entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of explanationCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            explanationCache.delete(key);
        }
    }
}, 10 * 60 * 1000);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Added to serve your HTML/CSS/JS files

// --- ROOT ROUTE ---
// Added to serve index.html when visiting http://localhost:3000/
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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

// --- OLD TUTORIAL ENDPOINT (KEPT FOR COMPATIBILITY) ---
app.post('/generate-tutorial-explanation', async (req, res) => {
    try {
        const { code, output } = req.body;
        const cacheKey = `${code}|${output}`;
        
        const cached = explanationCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('✅ Cache hit! (saving API call)');
            return res.json(cached.data);
        }
        
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
        
        explanationCache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
        });
        
        console.log('✅ Gemini API response received (and cached)');
        res.json(data);

    } catch (error) {
        console.error('❌ Server Error:', error.message);
        res.status(500).json({
            error: 'Server Error',
            details: error.message
        });
    }
});

// --- NEW SMART ENDPOINT WITH PLACEHOLDERS ---
app.post('/generate-smart-tutorial-explanation', async (req, res) => {
    try {
        const { fullCode, mode } = req.body;
        
        if (!fullCode) {
            return res.status(400).json({ error: 'Missing fullCode in request body.' });
        }

        // Check cache first
        const cacheKey = `${fullCode}|${mode}`;
        const cached = explanationCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('✅ Smart cache hit! (saving API call)');
            return res.json(cached.data);
        }

        // Build smart prompt
        const lines = fullCode.split('\n').filter(l => l.trim());
        const prompt = `You are generating step-by-step explanations for a Python learning platform for 10-year-olds.

Code to analyze:
\`\`\`python
${fullCode}
\`\`\`

Mode: ${mode === 'solution' ? 'SOLUTION (using int() for number conversion)' : 'PROBLEM (string concatenation)'}

Generate a JSON array with ONE explanation per line of code.

CRITICAL RULES:
1. Use {{PLACEHOLDERS}} for unknown runtime values:
   - {{USER_INPUT_0}}, {{USER_INPUT_1}}, {{USER_INPUT_2}} for input() calls (in order they appear)
   - {{VAR_NAME}} for variable values (e.g., {{a}}, {{b}}, {{c}})
   - {{RESULT}} for calculation results

2. Reference previous steps naturally:
   - "Remember you typed {{USER_INPUT_0}}..."
   - "Earlier we stored {{a}} in box a..."
   - "Now we're adding {{a}} and {{b}}..."

3. Explain mode-specific features:
   - Solution mode: "The int() machine converts {{USER_INPUT_0}} from text to a real number!"
   - Problem mode: "Python glues {{a}} and {{b}} together like puzzle pieces!"

4. Use platform analogies:
   - Variables = boxes that store things
   - int() = conversion machine (text → number)
   - print() = displaying on screen

5. Keep each explanation 2-3 sentences maximum, encouraging tone

6. **CRITICAL FOR ASSIGNMENT LINES (a=3, b=4, c=5):**
   - Explain the CURRENT action: "You created a box called 'c' and put the number 5 inside!"
   - DO NOT say "You have learned..." or give summary statements
   - Focus on what THIS line does, not what they've accomplished overall
   - **THIS APPLIES TO EVERY LINE, INCLUDING THE LAST LINE**
   - Even if it's the final line, explain what THAT line does, not a summary

Output format (STRICT JSON):
{
    "explanations": [
        {
            "step": 0,
            "line": "exact line of code",
            "explanation": "explanation with {{PLACEHOLDERS}}",
            "placeholders": ["USER_INPUT_0", "VAR_NAME"],
            "type": "input|assignment|print"
        }
    ]
}

CRITICAL: Return ONLY valid JSON, no markdown code blocks, no preamble text.`;

        console.log('📡 Calling Gemini API for SMART tutorial explanations...');
        console.log(`📊 Generating ${lines.length} contextual explanations in 1 API call`);

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
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        // Parse JSON response
        let explanations;
        try {
            // Remove markdown code blocks if present
            const cleanText = rawText.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleanText);
            explanations = parsed.explanations || [];
            
            // Ensure we have enough explanations
            while (explanations.length < lines.length) {
                const idx = explanations.length;
                explanations.push({
                    step: idx,
                    line: lines[idx],
                    explanation: `Line ${idx + 1}: ${lines[idx]} executed successfully!`,
                    placeholders: [],
                    type: 'assignment'
                });
            }
            
            // Trim if we got too many
            explanations = explanations.slice(0, lines.length);
            
        } catch (parseError) {
            console.error('❌ Failed to parse JSON response:', parseError);
            console.error('Raw response:', rawText);
            
            // Fallback: generate simple explanations
            explanations = lines.map((line, idx) => ({
                step: idx,
                line: line,
                explanation: line.includes('input()')
                    ? `You'll type a value here, and Python stores it in a variable!`
                    : line.includes('print(')
                    ? `Python displays the result on the screen!`
                    : `Python creates a box and stores a value inside!`,
                placeholders: [],
                type: line.includes('input()') ? 'input' : line.includes('print(') ? 'print' : 'assignment'
            }));
        }

        const result = { explanations };
        
        // Store in cache
        explanationCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        console.log(`✅ Smart explanations generated and cached: ${explanations.length} steps`);
        res.json(result);

    } catch (error) {
        console.error('❌ Server Error:', error.message);
        res.status(500).json({
            error: 'Server Error',
            details: error.message
        });
    }
});

// --- CHATBOT ENDPOINT --
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
});