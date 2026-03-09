/* ===================================
   Level 4: User Input
   FINAL VERSION - Improved Back Button & Step Tracking
   =================================== */

// ============ GLOBAL VARIABLES ============
let editor;
let pyodide = null;
let currentStep = 0;
let totalSteps = 0;
let isRunning = false;
let animationHistory = [];
let stepAnimations = []; // FIX #1: Added step tracking global
let executionPlan = [];
let currentVariables = {};
let currentLineMarker = null;

// ============ SOUND EFFECTS ============
const sounds = {
    keystroke: new Audio('sounds/keystroke.wav'),
    enter: new Audio('sounds/enter.wav'),
    notification: new Audio('sounds/notification.wav'),
    whoosh: new Audio('sounds/whoosh.wav')
};

sounds.keystroke.volume = 0.2;
sounds.enter.volume = 0.4;
sounds.notification.volume = 0.3;
sounds.whoosh.volume = 0.5;

// ============ INITIALIZATION ============
window.onload = async () => {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        mode: "python",
        theme: "monokai",
        lineNumbers: true,
        readOnly: false
    });
    
    editor.setValue('name = input("Enter your name: ")\nprint(name)');
    setupLineRestrictions();
    await loadPyodideEnv();
};

// ============ PYODIDE LOADER ============
async function loadPyodideEnv() {
    if (pyodide) return;
    const output = document.getElementById('output');
    output.textContent = '⏳ Loading Python environment...';
    try {
        pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
        await pyodide.runPythonAsync(`import sys, io\noutput_buffer = io.StringIO()\nsys.stdout = output_buffer`);
        output.textContent = '✅ Python ready! Click "Run Code" to start.';
    } catch (error) {
        output.innerHTML = `<span class="error">❌ Failed to load Python: ${error.message}</span>`;
    }
}

// ============ EDITOR RESTRICTIONS ============
function setupLineRestrictions() {
    editor.on('beforeChange', (cm, change) => {
        if ((change.origin === 'paste' || change.origin === 'drop') && change.text.join('').includes('\n')) change.cancel();
        if (change.origin === '+input' && change.text.length > 1) change.cancel();
        if ((change.origin === '+delete' || change.origin === 'cut') && change.from.line !== change.to.line) change.cancel();
    });
    lockPrintStatements();
    lockInputStatements();
}

function lockPrintStatements() {
    for (let i = 0; i < editor.lineCount(); i++) {
        const line = editor.getLine(i);
        const match = line.match(/print\s*\(/);
        if (match) {
            editor.markText({line: i, ch: match.index}, {line: i, ch: match.index + 6}, {readOnly: true, atomic: true, className: 'cm-locked-print'});
            const close = line.lastIndexOf(')');
            if (close > -1) editor.markText({line: i, ch: close}, {line: i, ch: close + 1}, {readOnly: true, atomic: true, className: 'cm-locked-print'});
        }
    }
}

function lockInputStatements() {
    for (let i = 0; i < editor.lineCount(); i++) {
        const line = editor.getLine(i);
        const match = line.match(/input\s*\(/);
        if (match) {
            editor.markText({line: i, ch: match.index}, {line: i, ch: match.index + 6}, {readOnly: true, atomic: true, className: 'cm-locked-print'});
            const close = line.lastIndexOf(')');
            if (close > -1) editor.markText({line: i, ch: close}, {line: i, ch: close + 1}, {readOnly: true, atomic: true, className: 'cm-locked-print'});
        }
    }
}

// ============ RUN BUTTON ============
document.getElementById('runBtn').onclick = async () => {
    if (isRunning) return;
    isRunning = true;
    currentStep = 0;
    animationHistory = [];
    stepAnimations = []; // FIX #2: Reset step tracking
    executionPlan = [];
    currentVariables = {};
    
    editor.setOption("readOnly", true);
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stepBtn').disabled = false;
    document.getElementById('output').textContent = '';
    document.getElementById('memoryBank').innerHTML = '';
    
    const lines = editor.getValue().split('\n').filter(l => l.trim());
    totalSteps = lines.length;
    executionPlan = lines.map((line, idx) => ({
        lineNumber: idx,
        code: line,
        type: line.includes('input(') ? 'input' : line.includes('print(') ? 'print' : 'assignment'
    }));
    
    updateStepIndicator();
    showTeacher("✅ Code validated! Click 'Next Step' to see how Python handles user input.");
};

// ============ STEP BUTTON ============
document.getElementById('stepBtn').onclick = async () => {
    if (currentStep >= totalSteps) return;
    
    const stepBtn = document.getElementById('stepBtn'); // FIX #3: Disable during animation
    stepBtn.disabled = true;

    const step = executionPlan[currentStep];
    stepAnimations[currentStep] = []; // FIX #3: Initialize tracking for this step
    highlightLine(step.lineNumber);
    
    try {
        if (step.type === 'input') {
            await handleInputStatement(step);
        } else {
            await pyodide.runPythonAsync(step.code);
            const varsJs = pyodide.globals.toJs();
            currentVariables = {};
            for (let [key, value] of varsJs) {
                if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                    currentVariables[key] = String(value);
                }
            }
            if (step.type === 'print') {
                const output = await pyodide.runPythonAsync('output_buffer.getvalue()');
                const newOutput = output.split('\n').filter(l => l.trim()).pop() || '';
                await animatePrint(step, newOutput);
            }
        }
        
        await generateStepExplanation(step, currentVariables);
        currentStep++;
        updateStepIndicator();
        updateButtons();

        if (currentStep < totalSteps) stepBtn.disabled = false; // Re-enable if steps remain
        
    } catch (error) {
        await generateErrorExplanation(error, step.code, step.lineNumber);
        stepBtn.disabled = true;
    }
};

// ============ INPUT HANDLING ============
async function handleInputStatement(step) {
    const inputMatch = step.code.match(/(\w+)\s*=\s*input\(\s*["']?(.*)["']?\s*\)/);
    if (!inputMatch) return;
    
    const [, varName, rawPrompt] = inputMatch;
    const promptText = rawPrompt || "Enter value:";
    const userInput = await showInteractiveInput(promptText);
    
    pyodide.globals.set(varName, userInput);
    currentVariables[varName] = userInput;
    await animateInputToMemory(varName, userInput);
}

async function showInteractiveInput(promptText) {
    return new Promise((resolve) => {
        const output = document.getElementById('output');
        const inputLine = document.createElement('div');
        inputLine.className = 'input-line';
        inputLine.innerHTML = `<span class="prompt-text">>> ${promptText}</span><input type="text" class="terminal-input" autofocus />`;
        output.appendChild(inputLine);
        
        const inputField = inputLine.querySelector('.terminal-input');
        inputField.addEventListener('input', () => {
            sounds.keystroke.currentTime = 0;
            sounds.keystroke.play().catch(() => {});
        });
        
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inputField.value.trim()) {
                const value = inputField.value.trim();
                sounds.enter.play().catch(() => {});
                inputField.disabled = true;
                
                // FIX #4: Track input line animation
                const action = { type: 'input', element: inputLine, isNew: true };
                animationHistory.push(action);
                stepAnimations[currentStep].push(action);

                gsap.to(inputField, {
                    textShadow: '0 0 20px #4ade80, 0 0 40px #4ade80',
                    duration: 0.3,
                    onComplete: () => resolve(value)
                });
            }
        });
    });
}

// ============ INPUT TO MEMORY ANIMATION ============
async function animateInputToMemory(varName, value) {
    const inputField = document.querySelector('.terminal-input:disabled:last-child');
    const inputRect = inputField.getBoundingClientRect();
    
    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = value;
    spark.style.left = `${inputRect.left}px`;
    spark.style.top = `${inputRect.top}px`;
    document.body.appendChild(spark);
    
    const bank = document.getElementById('memoryBank');
    const box = document.createElement('div');
    box.className = 'variable-box';
    box.id = `box-${varName}`;
    box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${value}</span>`;
    bank.appendChild(box);
    
    const targetRect = box.getBoundingClientRect();
    const startX = inputRect.left + inputRect.width / 2;
    const startY = inputRect.top + inputRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    
    const trail = createDirectionalTrail(startX, startY, endX, endY, false);
    sounds.whoosh.play().catch(() => {});
    
    await new Promise(resolve => {
        gsap.to(spark, {
            left: endX - 40, top: endY, duration: 1.5, ease: "none",
            onUpdate: () => {
                const rect = spark.getBoundingClientRect();
                updateTrailParticles(trail, rect.left + rect.width / 2, rect.top + rect.height / 2, startX, startY);
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trail);
                gsap.to(box, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", onComplete: resolve });
                
                // FIX #4: Track memory box animation
                const action = { type: 'memory', element: box, isNew: true };
                animationHistory.push(action);
                stepAnimations[currentStep].push(action);
            }
        });
    });
}

// ============ PRINT ANIMATION ============
async function animatePrint(step, text) {
    const match = step.code.match(/print\((.*)\)/);
    if (!match) return;
    
    const parts = parsePrintContent(match[1]);
    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = 'output-line';
    line.textContent = text;
    output.appendChild(line);
    
    const lineRect = line.getBoundingClientRect();
    const positions = calculatePartPositions(parts, text, lineRect);
    
    if (parts.length > 0) sounds.whoosh.play().catch(() => {});
    await Promise.all(parts.map((part, idx) => createAndAnimateSpark(part, positions[idx], step.lineNumber)));
    
    await new Promise(resolve => {
        gsap.to(line, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out", onComplete: resolve });
        
        // FIX #4: Track output line animation
        const action = { type: 'output', element: line, isNew: true };
        animationHistory.push(action);
        stepAnimations[currentStep].push(action);
    });
}

// ============ HELPERS (PARSING, POSITIONS, TRAILS) ============
function parsePrintContent(content) {
    const parts = [];
    let current = '', inQuote = false, quoteChar = '';
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if ((char === '"' || char === "'") && !inQuote) { inQuote = true; quoteChar = char; current = ''; }
        else if (char === quoteChar && inQuote) { inQuote = false; parts.push({ type: 'string', value: current, source: 'editor' }); current = ''; }
        else if (char === ',' && !inQuote) { if (current.trim()) { const v = current.trim(); parts.push({ type: 'variable', value: currentVariables[v] || v, varName: v, source: 'memory' }); current = ''; } }
        else if (inQuote || char !== ' ') current += char;
    }
    if (current.trim()) { const v = current.trim(); parts.push({ type: 'variable', value: currentVariables[v] || v, varName: v, source: 'memory' }); }
    return parts;
}

function calculatePartPositions(parts, fullText, lineRect) {
    const positions = [];
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute;visibility:hidden;font-family:"Courier New";font-size:16px;white-space:pre';
    document.body.appendChild(temp);
    let currentX = lineRect.left + 20;
    parts.forEach(part => {
        positions.push({ x: currentX, y: lineRect.top + lineRect.height / 2 });
        temp.textContent = part.value;
        currentX += temp.offsetWidth;
    });
    temp.remove();
    return positions;
}

async function createAndAnimateSpark(part, targetPos, lineNumber) {
    let startX, startY, isGold;
    if (part.source === 'editor') {
        const coords = editor.charCoords({line: lineNumber, ch: 0}, "page");
        startX = coords.left; startY = coords.top; isGold = false;
    } else {
        const box = document.getElementById(`box-${part.varName}`);
        if (!box) return;
        const rect = box.getBoundingClientRect();
        startX = rect.left + rect.width / 2; startY = rect.top + rect.height / 2; isGold = true;
        box.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.8)';
        setTimeout(() => box.style.boxShadow = '', 1200);
    }
    
    const spark = document.createElement('div');
    spark.className = isGold ? 'animation-spark spark-variable' : 'animation-spark';
    spark.textContent = part.value;
    spark.style.left = `${startX}px`; spark.style.top = `${startY}px`;
    document.body.appendChild(spark);
    const trail = createDirectionalTrail(startX, startY, targetPos.x, targetPos.y, isGold);
    
    return new Promise(resolve => {
        gsap.to(spark, {
            left: targetPos.x - 40, top: targetPos.y, duration: 1.2, ease: "none",
            onUpdate: () => {
                const rect = spark.getBoundingClientRect();
                updateTrailParticles(trail, rect.left + rect.width / 2, rect.top + rect.height / 2, startX, startY);
            },
            onComplete: () => { spark.remove(); removeTrail(trail); resolve(); }
        });
    });
}

function createDirectionalTrail(startX, startY, endX, endY, isGold) {
    const svg = document.getElementById('trailSvg');
    const particles = [];
    const color = isGold ? '#ffd700' : '#4ade80';
    for (let i = 0; i < 8; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', 6 - i * 0.5); circle.setAttribute('fill', color); circle.setAttribute('opacity', 0.9 - i * 0.1);
        circle.setAttribute('cx', startX); circle.setAttribute('cy', startY);
        svg.appendChild(circle);
        particles.push({ element: circle, index: i });
    }
    return particles;
}

function updateTrailParticles(particles, curX, curY, startX, startY) {
    const angle = Math.atan2(curY - startY, curX - startX);
    particles.forEach(({ element, index }) => {
        const off = (index + 1) * 12;
        element.setAttribute('cx', curX - Math.cos(angle) * off);
        element.setAttribute('cy', curY - Math.sin(angle) * off);
    });
}

function removeTrail(particles) { particles.forEach(({ element }) => element.remove()); }

// ============ AI EXPLANATIONS ============
async function generateStepExplanation(step, variables) {
    try {
        const response = await fetch('http://localhost:3000/generate-tutorial-explanation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: step.code, output: JSON.stringify(variables) })
        });
        const data = await response.json();
        showTeacher(data?.candidates?.[0]?.content?.parts?.[0]?.text || `Line ${step.lineNumber + 1} executed!`);
    } catch (e) {
        showTeacher(step.type === 'input' ? "Python stored your input in memory!" : "Python printed the value to the screen!");
    }
}

async function generateErrorExplanation(error, code, line = null) {
    const output = document.getElementById('output');
    output.innerHTML = `<span class="error">❌ Error: ${error.message}</span>`;
    showTeacher("🔍 Check your syntax and try again!");
    if (line !== null) highlightErrorLine(line);
}

// ============ NAVIGATION ============
document.getElementById('backBtn').onclick = () => {
    if (currentStep > 0) {
        currentStep--;
        reverseLastAnimation();
        updateStepIndicator();
        updateButtons();
        showTeacher(`Back to Step ${currentStep}.`);
    }
};

// FIX #5: REPLACED reverseLastAnimation()
function reverseLastAnimation() {
    const lastStepAnimations = stepAnimations.pop();
    if (!lastStepAnimations || lastStepAnimations.length === 0) return;
    
    lastStepAnimations.reverse().forEach(action => {
        gsap.to(action.element, {
            opacity: 0,
            scale: action.type === 'memory' ? 0.5 : 1,
            x: action.type === 'output' ? -20 : 0,
            duration: 0.3,
            onComplete: () => { if (action.isNew) action.element.remove(); }
        });
        animationHistory.pop();
    });
}

document.getElementById('resetBtn').onclick = () => location.reload();

// ============ HELPERS ============
function highlightLine(lineNum) {
    if (currentLineMarker) currentLineMarker.clear();
    currentLineMarker = editor.markText({ line: lineNum, ch: 0 }, { line: lineNum, ch: editor.getLine(lineNum).length }, { className: 'CodeMirror-activeline-background' });
    editor.scrollIntoView({ line: lineNum, ch: 0 }, 50);
}

function highlightErrorLine(lineNum) {
    editor.markText({ line: lineNum, ch: 0 }, { line: lineNum, ch: editor.getLine(lineNum).length }, { className: 'CodeMirror-error-line', css: 'background-color: rgba(239, 68, 68, 0.2); border-left: 3px solid #ef4444;' });
    editor.scrollIntoView({ line: lineNum, ch: 0 }, 50);
}

function showTeacher(message) {
    const bubble = document.getElementById('teacherBubble');
    const text = document.getElementById('teacherText');
    text.textContent = message;
    bubble.classList.add('show');
    sounds.notification.currentTime = 0;
    sounds.notification.play().catch(() => {});
}

function updateStepIndicator() {
    document.getElementById('stepIndicator').textContent = isRunning ? `Step ${currentStep}/${totalSteps}` : 'Ready to run...';
}

function updateButtons() {
    document.getElementById('backBtn').disabled = (currentStep === 0);
    document.getElementById('stepBtn').disabled = (currentStep >= totalSteps);
    if (currentStep >= totalSteps) {
        showTeacher("🎉 Excellent! You've learned how Python gets input from users!");
        editor.setOption("readOnly", false);
        document.getElementById('runBtn').disabled = false;
        isRunning = false;
    }
}