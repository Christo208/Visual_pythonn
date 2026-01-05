// The URL of your local secure Node.js backend proxy
const PROXY_URL = 'http://localhost:3000/generate-explanation';

// Cursor follow effect
const cursorGlow = document.getElementById('cursorGlow');
document.addEventListener('mousemove', (e) => {
    cursorGlow.style.left = e.clientX + 'px';
    cursorGlow.style.top = e.clientY + 'px';
});

let currentStep = 0;
let explanationSteps = [];
let hasRun = false;
let pyodide = null;
let isLoadingPyodide = false;
let currentCode = '';
// *** NEW: Global array to store user inputs
let userInputHistory = [];
// *** END NEW ***

// *** NEW: Global variable for CodeMirror editor instance ***
let editor; //end

// New Global Variable for Speech Synthesis
let utterance = null;
let isSpeaking = false;
// New state tracker for better control
let speechState = 'stopped'; // 'stopped', 'speaking', 'paused'


// *** NEW: Clear input history when running code
function clearInputHistory() {
    // CRITICAL FIX: Clear the contents of the array IN PLACE 
    // (by setting its length to 0) so Pyodide's internal reference remains valid.
    userInputHistory.length = 0; 
}
// *** END NEW ***


// Initialize CodeMirror (This runs when the script loads)
function initCodeEditor() {
    const codeEditorElement = document.getElementById('codeEditor');
    // NOTE: If you are not using an external CodeMirror library link in index.html, this line might throw an error.
    // Assuming CodeMirror is correctly linked.
    editor = CodeMirror.fromTextArea(codeEditorElement, {
        mode: { name: "python", version: 3, singleLineStringErrors: false },
        lineNumbers: true, // Show line numbers
        indentUnit: 4,
        tabSize: 4,
        theme: "monokai" // Use the "monokai" theme you linked in index.html
    });
}
// *** END NEW ***


// Load Pyodide on page load

async function loadPyodideEnv() {
    if (pyodide || isLoadingPyodide) return;
    isLoadingPyodide = true;
    
    const output = document.getElementById('output');
    output.textContent = '⏳ Loading Python environment... (first time only, may take 10-20 seconds)';
    
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
        });
        output.textContent = '✅ Python ready! Write your code and click Run.';
        
        // *** CRITICAL FIX: Explicitly inject the JS array into Python's globals ***
        // This resolves the "AttributeError: userInputHistory" issue by making the array available.
        pyodide.globals.set('input_history_ref', userInputHistory); 

        // Initial Python setup for input capture
        await pyodide.runPythonAsync(`
import sys
import io
import js
import builtins

# Create a string buffer to capture output
output_buffer = io.StringIO()
sys.stdout = output_buffer

# The Python reference to the JavaScript array
# Get the array reference we explicitly set from the JS side
input_history = builtins.globals()['input_history_ref']

# Override input to use browser prompt and record the value
original_input = builtins.input

def custom_input(prompt_text=""):
    # Call the JavaScript prompt function
    result = js.prompt(str(prompt_text))
    
    # Store the input in the JS array (via Python ref) before returning it
    input_history.append(result if result is not None else "")
    
    # Return the input, defaulting to an empty string if the user cancels the prompt
    return result if result is not None else ""

builtins.input = custom_input
        `);
    } catch (error) {
        output.innerHTML = `<span class="error">❌ Failed to load Python: ${error.message}</span>`;
        console.error('Pyodide loading error:', error);
    }
    isLoadingPyodide = false;
}



// Load Pyodide when page loads
window.addEventListener('load', () => {
    loadPyodideEnv();
    initCodeEditor(); // *** NEW: Initialize CodeMirror here ***
});

// Generate BM-style explanation using the secure Backend Proxy
async function generateExplanation(code, inputHistory) {
    try {
        // We now send the code to our local backend proxy
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // The request body only needs the user's code
            body: JSON.stringify({ code: code, inputHistory: inputHistory })
        });

        if (!response.ok) {
            // If the proxy itself returns an error (e.g., 500), throw
            throw new Error(`Proxy Error: ${response.status} - Check if your server.js is running.`);
        }

        // Get the response data from the proxy
        const data = await response.json();
        
        // Extract the text part from the nested Gemini response structure
        const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!aiResponse) {
            console.error("API Response Data:", data);
            throw new Error('API Response was empty or malformed.');
        }
        
        // Try to parse JSON array from response
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        } else {
            // Fallback: split by lines if JSON parsing fails
            return aiResponse.split('\n').filter(line => line.trim().length > 0);
        }
        
    } catch (error) {
        console.error('Explanation Error:', error);
        // Fallback to mock explanations if the server/API fails
        return [
            "Line 1 → Fallback: A secure connection error occurred, so this is a generic explanation.",
            "Line 2 → Please ensure your backend proxy (server.js) is running in the terminal.",
            "Line 3 → The actual API key is now safe on the server side, where it belongs!",
        ];
    }
}

// In script.js

// In script.js

async function runCode() {
    clearInputHistory()
    const code = editor.getValue();
    const output = document.getElementById('output');
    const explainBtn = document.getElementById('explainBtn');
    
    if (!code.trim()) {
        output.innerHTML = '<span class="error">❌ Error: No code to run!</span>';
        return;
    }

    if (!pyodide) {
        output.textContent = '⏳ Loading Python environment...';
        await loadPyodideEnv();
        if (!pyodide) return;
    }

    output.textContent = '⏳ Running your code...\n';
    hasRun = false;
    explainBtn.disabled = true;

    try {
        let capturedOutput = '';
        
        // --- START ROBUST PYTHON EXECUTION SETUP ---
        // CRITICAL: ONLY reset the output buffer here. 
        // We use a single pyodide.runPythonAsync call for execution.
        
        const fullPythonCode = `
import sys
import io

# 1. Reset the output buffer for a clean run
output_buffer = io.StringIO()
sys.stdout = output_buffer

# 2. Run the user's actual code
${code}

# 3. Capture the output
captured_output = output_buffer.getvalue()
captured_output
        `;
        
        // Run the combined setup, user code, and capture logic
        capturedOutput = await pyodide.runPythonAsync(fullPythonCode);
        
        // --- END ROBUST PYTHON EXECUTION SETUP ---
        
        if (capturedOutput && capturedOutput.trim()) {
            output.textContent = '✅ Output:\n\n' + capturedOutput;
        } else {
            output.textContent = '✅ Code executed successfully! (No output)';
        }
        
        hasRun = true;
        currentCode = code; // Store the code for explanation
        explainBtn.disabled = false;
        
    } catch (error) {
        // Display Python errors in a friendly way
        let errorMsg = error.message;
        
        // Clean up the error message
        if (errorMsg.includes('Traceback')) {
            const lines = errorMsg.split('\n');
            const relevantLines = lines.filter(line => 
                !line.includes('pyodide') && 
                !line.includes('eval_code') &&
                line.trim() !== ''
            );
            errorMsg = relevantLines.join('\n');
        }
        
        output.innerHTML = `<span class="error">❌ Error:\n\n${errorMsg}</span>`;
    }
}
// In script.js

// In script.js

async function explainCode() {
    // Only proceed if code has been run successfully
    if (!hasRun) return;
    
    const explanationText = document.getElementById('explanationText');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    // Show loading state
    explanationText.className = 'explanation-text';
    explanationText.innerHTML = '🤖 Generating BM-style explanation using AI...<span class="loading"></span>';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    
    // CRITICAL FIX: Call generateExplanation ONCE and pass the history.
    explanationSteps = await generateExplanation(currentCode, userInputHistory);
    
    currentStep = 0;
    showStep();
    
    prevBtn.disabled = false;
    nextBtn.disabled = false;
}

// In script.js

// In script.js

function showStep() {
    // CRITICAL: Stop the voice instantly when changing steps
    window.speechSynthesis.cancel(); 
    speechState = 'stopped'; // Reset state tracker
    document.getElementById('readBtn').innerHTML = '🔊 Read';
    document.getElementById('readBtn').disabled = false; 

    const explanationText = document.getElementById('explanationText');
    const variablePanel = document.getElementById('variablePanel');
    
    // Ensure we don't try to access an index that doesn't exist
    if (currentStep < 0 || currentStep >= explanationSteps.length) return;

    let currentExplanation = explanationSteps[currentStep]; // Use 'let' for modification
    
    // ----------------------------------------------------
    // 1. VARIABLE BOX LOGIC (NEW)
    // ----------------------------------------------------
    const varsMatch = currentExplanation.match(/<VARS>(.*?)<\/VARS>/);
    let variableHTML = '';
    
    if (varsMatch && varsMatch[1]) {
        try {
            // Parse the JSON string from the AI output
            const varsJson = JSON.parse(varsMatch[1]);
            
            for (const name in varsJson) {
                const value = varsJson[name];
                // Create the HTML for one variable box
                variableHTML += `
                    <div class="variable-box">
                        <span class="variable-box-name">${name}</span> = 
                        <span class="variable-box-value">${value}</span>
                    </div>
                `;
            }
            
            // Remove the <VARS> tag from the explanation text
            currentExplanation = currentExplanation.replace(/<VARS>.*?<\/VARS>/, '');

        } catch (e) {
            console.error("Error parsing AI Variable JSON:", e);
            variableHTML = '<p class="error">Variable data error. See console.</p>';
        }
    } else {
        // Default message if no variables are found yet
        variableHTML = '<p style="color:#777;">Variables will be initialized here.</p>';
    }
    
    // Update the Variable Panel
    variablePanel.innerHTML = variableHTML;
    // ----------------------------------------------------


    // ----------------------------------------------------
    // 2. CHALKBOARD/OUTPUT HIGHLIGHT LOGIC (Existing from previous steps)
    // ----------------------------------------------------
    // IMPORTANT: You need to define clearOutputHighlight()
    if (typeof clearOutputHighlight === 'function') {
        clearOutputHighlight();
    } else {
        // Fallback or reminder to implement:
        document.getElementById('output').innerHTML = document.getElementById('output').textContent;
    }


    const outputMatch = currentExplanation.match(/<CHALKBOARD>(.*?)<\/CHALKBOARD>/);

    if (outputMatch && outputMatch[1]) {
        const outputValue = outputMatch[1]; 
        const outputElement = document.getElementById('output');
        
        // This is a robust way to highlight the text exactly as it appeared
        const highlightedHTML = outputElement.innerHTML.replace(
            new RegExp(outputValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            `<span class="output-highlight">${outputValue}</span>`
        );
        
        outputElement.innerHTML = highlightedHTML;
        currentExplanation = currentExplanation.replace(/<\/?CHALKBOARD>/g, '');
        
        const highlightSpan = document.querySelector('.output-highlight');
        if (highlightSpan) {
            highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    // ----------------------------------------------------


    // ----------------------------------------------------
    // 3. CODE LINE HIGHLIGHT LOGIC 
    // ----------------------------------------------------
    const match = currentExplanation.match(/^Line (\d+) →/);
    
    if (match && match[1]) {
        const lineNumber = parseInt(match[1], 10);
        // Assuming highlightLine(num) is your CodeMirror function
        if (typeof highlightLine === 'function') {
             highlightLine(lineNumber);
        }
    } else {
         // Assuming highlightLine(0) clears the highlight
         if (typeof highlightLine === 'function') {
            highlightLine(0);
         }
    }
    // ----------------------------------------------------

    // Final Display Update
    explanationText.className = 'explanation-text';
    explanationText.innerHTML = `<span class="line-info">Step ${currentStep + 1}/${explanationSteps.length}</span>${currentExplanation}`;
    
    document.getElementById('prevBtn').disabled = currentStep === 0;
    document.getElementById('nextBtn').disabled = currentStep === explanationSteps.length - 1;
}

// *** CRITICAL: Define a simple clearOutputHighlight function (assuming you need it) ***
function clearOutputHighlight() {
    const outputElement = document.getElementById('output');
    // Simple way to remove all highlight spans and restore text content
    outputElement.innerHTML = outputElement.textContent;
}

// Global variable to store the original output content for clearing highlights
let originalOutputContent = '';

function clearOutputHighlight() {
    const outputElement = document.getElementById('output');
    // Restore the output panel's content from the saved original copy
    if (originalOutputContent) {
        outputElement.innerHTML = originalOutputContent;
    }
}

// Global variable to store the current marker for clearing highlights
let currentMarker = null;

function highlightLine(lineNumber) {
    if (!editor) return; 

    // CodeMirror uses 0-based indexing for lines, so subtract 1
    const lineIndex = lineNumber - 1;

    // 1. Clear any existing highlight
    if (currentMarker) {
        currentMarker.clear();
        currentMarker = null;
    }

    // 2. Check for a valid line number
    if (lineIndex >= 0 && lineIndex < editor.lineCount()) {
        // 3. Reverting to token highlighting using markText
        currentMarker = editor.markText(
            { line: lineIndex, ch: 0 },
            { line: lineIndex, ch: editor.getLine(lineIndex).length },
            { className: 'CodeMirror-activeline-token' } // Token highlight class
        );
        
        // Ensure the editor scrolls the highlighted line into view
        editor.scrollIntoView(lineIndex, 50);
    }
}

function previousStep() {
    if (currentStep > 0) {
        currentStep--;
        showStep();
    }
}

function nextStep() {
    if (currentStep < explanationSteps.length - 1) {
        currentStep++;
        showStep();
    }
}

// In script.js

// In script.js

// In script.js

function toggleSpeech() {
    const readBtn = document.getElementById('readBtn');

    if (speechState === 'paused') {
        // RESUME INTENT: Resume the speech and update our state
        window.speechSynthesis.resume();
        speechState = 'speaking';
        readBtn.innerHTML = '⏸️ Pause';
    } 
    else if (speechState === 'speaking') {
        // PAUSE INTENT: Pause the speech and update our state
        window.speechSynthesis.pause();
        speechState = 'paused';
        readBtn.innerHTML = '▶️ Resume';
    } 
    else { // speechState === 'stopped'
        // START INTENT: Begin reading
        readExplanation();
    }
}

// In script.js

function readExplanation() {
    const readBtn = document.getElementById('readBtn');
    
    // Stop any speech currently in progress (soft cancel)
    window.speechSynthesis.cancel(); 

    // Get the current text from the explanation panel (use innerHTML to get the tags)
    let textToRead = document.getElementById('explanationText').innerHTML;
    
    // 1. Remove HTML tags like <span> and <output_highlight> for clean reading
    textToRead = textToRead.replace(/<[^>]*>/g, ''); 
    
    // 2. Remove the line/step info and the right-arrow for a smoother reading experience
    let final_text = textToRead.replace(/Step \d+\/\d+/, '')
                               .replace(/Line \d+ →/, '')
                               .trim();
    
    // Create a new speech synthesis utterance
    utterance = new SpeechSynthesisUtterance(final_text);
    utterance.rate = 1.0; // Standard speed (adjust between 0.1 and 10)
    utterance.pitch = 1.0; // Standard pitch (adjust between 0 and 2)

    // 3. ATTEMPT TO FIND A BETTER VOICE
    const voices = window.speechSynthesis.getVoices();
    // Try to find a voice that sounds less robotic (e.g., Google or a natural English voice)
    const preferredVoice = voices.find(voice => 
        voice.lang.includes('en') && (
            voice.name.includes('Google') || 
            voice.name.includes('Natural') ||
            voice.name.includes('US')
        )
    );
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }
    // Note: Voice selection depends entirely on the user's OS/browser.

    // Set callbacks
    utterance.onstart = () => {
        readBtn.innerHTML = '⏸️ Pause';
    };

    utterance.onend = () => {
        // Reset state only when speech completes naturally
        speechState = 'stopped'; 
        readBtn.innerHTML = '🔊 Read';
    };

     // Start speaking!
    window.speechSynthesis.speak(utterance);
    // CRITICAL: Set the state immediately on start
    speechState = 'speaking'; 
}

function resetAll() {
    editor.setValue('')
    document.getElementById('output').textContent = 'Ready to run your code...';
    document.getElementById('explanationText').className = 'explanation-text empty';
    document.getElementById('explanationText').textContent = "Click 'Explain' after running your code to see step-by-step breakdown! 🚀";
    document.getElementById('explainBtn').disabled = true;
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
    hasRun = false;
    currentStep = 0;
    explanationSteps = [];
    currentCode = '';
}