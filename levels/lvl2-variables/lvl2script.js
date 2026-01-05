/* ===================================
   Level 2: Variable Storage
   Complete Script with SVG Trails & Precise Positioning
   =================================== */

// ============ GLOBAL VARIABLES ============
let editor;
let pyodide = null;
let currentStep = 0;
let totalSteps = 0;
let isRunning = false;
let animationHistory = [];
let executionPlan = [];
let currentVariables = {};

// ============ SOUND EFFECTS (SHARED FOLDER) ============
const sounds = {
    notification: new Audio('../sounds/notification.wav'),
    whoosh: new Audio('../sounds/whoosh.wav')
};

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
    
    editor.setValue('message = "Keep Smiling"\nprint(message)\nuserNo = 101\nprint("User Number is", userNo)');
    
    setupLineRestrictions();
    await loadPyodideEnv();
};

// ============ PYODIDE LOADER ============
async function loadPyodideEnv() {
    if (pyodide) return;
    
    const output = document.getElementById('output');
    output.textContent = '⏳ Loading Python environment...\n(First time only, may take 10-20 seconds)';
    
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
        });
        
        await pyodide.runPythonAsync(`
import sys
import io

output_buffer = io.StringIO()
sys.stdout = output_buffer
        `);
        
        output.textContent = '✅ Python ready! Click "Run Code" to start.';
    } catch (error) {
        output.innerHTML = `<span class="error">❌ Failed to load Python: ${error.message}</span>`;
        console.error('Pyodide loading error:', error);
    }
}

// ============ CODE EDITOR RESTRICTIONS ============
function setupLineRestrictions() {
    editor.on('beforeChange', function(cm, change) {
        if (change.origin === 'paste' || change.origin === 'drop') {
            const text = change.text.join('');
            if (text.includes('\n')) {
                change.cancel();
                return;
            }
        }
        
        if (change.origin === '+input' && change.text.length > 1) {
            change.cancel();
            return;
        }
        
        if (change.origin === '+delete' || change.origin === 'cut') {
            const from = change.from;
            const to = change.to;
            if (from.line !== to.line) {
                change.cancel();
                return;
            }
        }
    });

    lockPrintStatements();
}

function lockPrintStatements() {
    const lineCount = editor.lineCount();
    
    for (let i = 0; i < lineCount; i++) {
        const line = editor.getLine(i);
        const printMatch = line.match(/print\s*\(/);
        
        if (printMatch) {
            const startCh = printMatch.index;
            
            editor.markText(
                { line: i, ch: startCh },
                { line: i, ch: startCh + 6 },
                { readOnly: true, atomic: true, className: 'cm-locked-print' }
            );
            
            const closingParenIndex = line.lastIndexOf(')');
            if (closingParenIndex > -1) {
                editor.markText(
                    { line: i, ch: closingParenIndex },
                    { line: i, ch: closingParenIndex + 1 },
                    { readOnly: true, atomic: true, className: 'cm-locked-print' }
                );
            }
            
            editor.markText(
                { line: i, ch: startCh + 6 },
                { line: i, ch: closingParenIndex },
                { className: 'cm-editable-zone' }
            );
        }
    }
}

// ============ RUN BUTTON ============
document.getElementById('runBtn').onclick = async () => {
    if (isRunning) return;
    if (!pyodide) {
        await loadPyodideEnv();
        if (!pyodide) return;
    }
    
    isRunning = true;
    currentStep = 0;
    animationHistory = [];
    executionPlan = [];
    currentVariables = {};
    
    editor.setOption("readOnly", true);
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stepBtn').disabled = false;
    document.getElementById('output').textContent = '';
    document.getElementById('memoryBank').innerHTML = '';
    
    const code = editor.getValue();
    const lines = code.split('\n').filter(l => l.trim());
    
    try {
        await pyodide.runPythonAsync(`compile('''${code}''', '<string>', 'exec')`);
        
        totalSteps = lines.length;
        executionPlan = lines.map((line, idx) => ({
            lineNumber: idx,
            code: line,
            type: line.includes('print(') ? 'print' : 'assignment'
        }));
        
        updateStepIndicator();
        showTeacher("✅ Code validated! Click 'Next Step' to see how Python executes it line by line.");
        
    } catch (error) {
        await generateErrorExplanation(error, code);
        isRunning = false;
        editor.setOption("readOnly", false);
        document.getElementById('runBtn').disabled = false;
    }
};

// ============ STEP BUTTON ============
document.getElementById('stepBtn').onclick = async () => {
    if (currentStep >= totalSteps) return;
    
    const step = executionPlan[currentStep];
    highlightLine(step.lineNumber);
    
    try {
        await pyodide.runPythonAsync(step.code);
        
        const varsJs = pyodide.globals.toJs();
        currentVariables = {};
        for (let [key, value] of varsJs) {
            if (!key.startsWith('_') && key !== 'output_buffer' && key !== 'sys' && key !== 'io') {
                currentVariables[key] = String(value);
            }
        }
        
        const output = await pyodide.runPythonAsync('output_buffer.getvalue()');
        
        if (step.type === 'assignment') {
            await animateAssignment(step, currentVariables);
        } else if (step.type === 'print') {
            const newOutput = output.split('\n').filter(l => l.trim()).pop() || '';
            await animatePrint(step, newOutput);
        }
        
        await generateStepExplanation(step, currentVariables, output);
        
        currentStep++;
        updateStepIndicator();
        updateButtons();
        
    } catch (error) {
        await generateErrorExplanation(error, step.code, step.lineNumber);
        document.getElementById('stepBtn').disabled = true;
    }
};

// ============ ANIMATE VARIABLE ASSIGNMENT ============
async function animateAssignment(step, variables) {
    const varMatch = step.code.match(/(\w+)\s*=\s*(.+)/);
    if (!varMatch) return;
    
    const varName = varMatch[1];
    const varValue = variables[varName];
    
    const lineCoords = editor.charCoords({line: step.lineNumber, ch: 0}, "page");
    
    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = varValue;
    spark.style.left = `${lineCoords.left}px`;
    spark.style.top = `${lineCoords.top}px`;
    document.body.appendChild(spark);
    
    let box = document.getElementById(`box-${varName}`);
    if (!box) {
        const bank = document.getElementById('memoryBank');
        box = document.createElement('div');
        box.className = 'variable-box';
        box.id = `box-${varName}`;
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${varValue}</span>`;
        bank.appendChild(box);
    } else {
        box.querySelector('.box-value').textContent = varValue;
    }
    
    const targetRect = box.getBoundingClientRect();
    
    const startX = lineCoords.left;
    const startY = lineCoords.top;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    
    const trailParticles = createDirectionalTrail(startX, startY, endX, endY, false);
    
    sounds.whoosh.currentTime = 0;
    sounds.whoosh.play().catch(e => console.warn('Whoosh sound failed:', e));
    
    await new Promise(resolve => {
        gsap.to(spark, {
            left: endX - 40,
            top: endY,
            duration: 1.2,
            ease: "power2.out",
            onUpdate: function() {
                const sparkRect = spark.getBoundingClientRect();
                const currentX = sparkRect.left + sparkRect.width / 2;
                const currentY = sparkRect.top + sparkRect.height / 2;
                updateTrailParticles(trailParticles, currentX, currentY, startX, startY);
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trailParticles);
                
                gsap.to(box, {
                    opacity: 1,
                    scale: 1,
                    duration: 0.5,
                    ease: "back.out(1.7)",
                    onComplete: resolve
                });
                
                animationHistory.push({
                    type: 'memory',
                    element: box,
                    isNew: true
                });
            }
        });
    });
}

// ============ ANIMATE PRINT STATEMENT (WITH PRECISE POSITIONING) ============
async function animatePrint(step, text) {
    const printContentMatch = step.code.match(/print\((.*)\)/);
    if (!printContentMatch) return;
    
    const printContent = printContentMatch[1];
    const output = document.getElementById('output');
    
    const parts = parsePrintContent(printContent);
    
    const line = document.createElement('div');
    line.className = 'output-line';
    line.textContent = text;
    output.appendChild(line);
    
    const lineRect = line.getBoundingClientRect();
    
    const positions = calculatePartPositions(parts, text, lineRect);
    
    const sparkPromises = parts.map((part, idx) => {
        const pos = positions[idx];
        return createAndAnimateSpark(part, pos, step.lineNumber);
    });
    
    if (sparkPromises.length > 0) {
        sounds.whoosh.currentTime = 0;
        sounds.whoosh.play().catch(e => console.warn('Whoosh sound failed:', e));
    }
    
    await Promise.all(sparkPromises);
    
    await new Promise(resolve => {
        gsap.to(line, {
            opacity: 1,
            x: 0,
            duration: 0.5,
            ease: "power2.out",
            onComplete: resolve
        });
        
        animationHistory.push({
            type: 'output',
            element: line
        });
    });
}

// ============ PARSE PRINT CONTENT ============
function parsePrintContent(content) {
    const parts = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        
        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
            current = '';
        } else if (char === quoteChar && inQuote) {
            inQuote = false;
            parts.push({ 
                type: 'string', 
                value: current,
                source: 'editor'
            });
            current = '';
        } else if (char === ',' && !inQuote) {
            if (current.trim() && !inQuote) {
                const varName = current.trim();
                parts.push({ 
                    type: 'variable', 
                    value: currentVariables[varName] || varName,
                    varName: varName,
                    source: 'memory'
                });
                current = '';
            }
        } else if (inQuote) {
            current += char;
        } else if (char !== ' ') {
            current += char;
        }
    }
    
    if (current.trim()) {
        const varName = current.trim();
        parts.push({ 
            type: 'variable', 
            value: currentVariables[varName] || varName,
            varName: varName,
            source: 'memory'
        });
    }
    
    return parts;
}

// ============ CALCULATE PRECISE PART POSITIONS ============
function calculatePartPositions(parts, fullText, lineRect) {
    const positions = [];
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.fontFamily = "'Courier New', monospace";
    tempDiv.style.fontSize = '16px';
    tempDiv.style.whiteSpace = 'pre';
    document.body.appendChild(tempDiv);
    
    let currentX = lineRect.left + 60;
    const baseY = lineRect.top + lineRect.height / 2;
    
    parts.forEach(part => {
        positions.push({
            x: currentX,
            y: baseY
        });
        
        tempDiv.textContent = part.value;
        const width = tempDiv.offsetWidth;
        currentX += width+45;
    });
    
    tempDiv.remove();
    return positions;
}

// ============ CREATE AND ANIMATE SPARK WITH PRECISE LANDING ============
async function createAndAnimateSpark(part, targetPos, lineNumber) {
    let startX, startY, isGold;
    
    if (part.source === 'editor') {
        const editorCoords = editor.charCoords({line: lineNumber, ch: 0}, "page");
        startX = editorCoords.left;
        startY = editorCoords.top;
        isGold = false;
    } else {
        const box = document.getElementById(`box-${part.varName}`);
        if (!box) return;
        
        const boxRect = box.getBoundingClientRect();
        startX = boxRect.left + boxRect.width / 2;
        startY = boxRect.top + boxRect.height / 2;
        isGold = true;
        
        box.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.8)';
        setTimeout(() => box.style.boxShadow = '', 1200);
    }
    
    const spark = document.createElement('div');
    spark.className = isGold ? 'animation-spark spark-variable' : 'animation-spark';
    spark.textContent = part.value;
    spark.style.left = `${startX}px`;
    spark.style.top = `${startY}px`;
    document.body.appendChild(spark);
    
    const trailParticles = createDirectionalTrail(startX, startY, targetPos.x, targetPos.y, isGold);
    
    return new Promise(resolve => {
        gsap.to(spark, {
            left: targetPos.x - 40,
            top: targetPos.y,
            duration: 1.2,
            ease: "power2.out",
            onUpdate: function() {
                const sparkRect = spark.getBoundingClientRect();
                const currentX = sparkRect.left + sparkRect.width / 2;
                const currentY = sparkRect.top + sparkRect.height / 2;
                updateTrailParticles(trailParticles, currentX, currentY, startX, startY);
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trailParticles);
                resolve();
            }
        });
    });
}

// ============ SVG TRAIL SYSTEM ============
function createDirectionalTrail(startX, startY, endX, endY, isGold = false) {
    const svg = document.getElementById('trailSvg');
    const particles = [];
    const color = isGold ? '#ffd700' : '#4ade80';
    
    for (let i = 0; i < 8; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', 6 - i * 0.5);
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', 0.9 - i * 0.1);
        circle.setAttribute('cx', startX);
        circle.setAttribute('cy', startY);
        svg.appendChild(circle);
        particles.push({ element: circle, index: i });
    }
    
    return particles;
}

function updateTrailParticles(particles, currentX, currentY, startX, startY) {
    const dx = currentX - startX;
    const dy = currentY - startY;
    const angle = Math.atan2(dy, dx);
    
    particles.forEach(({ element, index }) => {
        const offset = (index + 1) * 12;
        const x = currentX - Math.cos(angle) * offset;
        const y = currentY - Math.sin(angle) * offset;
        
        element.setAttribute('cx', x);
        element.setAttribute('cy', y);
    });
}

function removeTrail(particles) {
    particles.forEach(({ element }) => element.remove());
}

// ============ AI EXPLANATIONS ============
async function generateStepExplanation(step, variables, output) {
    try {
        const response = await fetch('http://localhost:3000/generate-tutorial-explanation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: step.code, output: output })
        });

        const data = await response.json();
        const explanation = data?.candidates?.[0]?.content?.parts?.[0]?.text || 
                          `Line ${step.lineNumber + 1} executed successfully!`;
        
        showTeacher(explanation);
    } catch (error) {
        console.error('Explanation error:', error);
        showTeacher(`Line ${step.lineNumber + 1}: ${step.code} - Executed successfully!`);
    }
}

async function generateErrorExplanation(error, code, lineNumber = null) {
    const output = document.getElementById('output');
    output.innerHTML = `<span class="error">❌ Error detected... Getting AI help...</span>`;
    
    try {
        const response = await fetch('http://localhost:3000/generate-tutorial-explanation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, output: error.message })
        });

        const data = await response.json();
        const explanation = data?.candidates?.[0]?.content?.parts?.[0]?.text || 
                          `Error: ${error.message}`;
        
        output.innerHTML = `<span class="error">❌ Oops! Something went wrong:\n\n${error.message}</span>`;
        
        const bubble = document.getElementById('teacherBubble');
        const text = document.getElementById('teacherText');
        text.innerHTML = `<strong style="color: #dc2626;">🔍 What went wrong:</strong><br><br>${explanation}`;
        bubble.classList.add('show');
        bubble.style.borderColor = '#fca5a5';
        bubble.style.backgroundColor = '#fef2f2';
        
        if (lineNumber !== null) {
            highlightErrorLine(lineNumber);
        }
        
    } catch (apiError) {
        console.error('Error explanation API failed:', apiError);
        output.innerHTML = `<span class="error">❌ Error:\n${error.message}\n\nTip: Check your syntax and variable names!</span>`;
        showTeacher("❌ There's an error in your code. Double-check your spelling and syntax!");
    }
}

// ============ NAVIGATION BUTTONS ============
document.getElementById('backBtn').onclick = () => {
    if (currentStep > 0) {
        currentStep--;
        reverseLastAnimation();
        updateStepIndicator();
        updateButtons();
        showTeacher(`Back to Step ${currentStep}. Click 'Next Step' to continue.`);
    }
};

function reverseLastAnimation() {
    const lastAction = animationHistory.pop();
    if (!lastAction) return;
    
    gsap.to(lastAction.element, {
        opacity: 0,
        scale: lastAction.type === 'memory' ? 0.5 : 1,
        x: lastAction.type === 'output' ? -20 : 0,
        duration: 0.3,
        onComplete: () => {
            if (lastAction.isNew) {
                lastAction.element.remove();
            }
        }
    });
}

document.getElementById('resetBtn').onclick = () => {
    location.reload();
};

// ============ HELPER FUNCTIONS ============
let currentLineMarker = null;  // Add at top with other globals

function highlightLine(lineNum) {
    // Clear previous highlight
    if (currentLineMarker) {
        currentLineMarker.clear();
    }
    
    currentLineMarker = editor.markText(
        { line: lineNum, ch: 0 },
        { line: lineNum, ch: editor.getLine(lineNum).length },
        { className: 'CodeMirror-activeline-background' }
    );
    
    // Remove the setTimeout - keep it permanent!
    editor.scrollIntoView({ line: lineNum, ch: 0 }, 50);
}
function highlightErrorLine(lineNum) {
    editor.markText(
        { line: lineNum, ch: 0 },
        { line: lineNum, ch: editor.getLine(lineNum).length },
        { 
            className: 'CodeMirror-error-line',
            css: 'background-color: rgba(239, 68, 68, 0.2); border-left: 3px solid #ef4444;'
        }
    );
    
    editor.scrollIntoView({ line: lineNum, ch: 0 }, 50);
}

function showTeacher(message) {
    const bubble = document.getElementById('teacherBubble');
    const text = document.getElementById('teacherText');
    text.textContent = message;
    bubble.classList.add('show');
    bubble.style.borderColor = '#bbf7d0';
    bubble.style.backgroundColor = '#f0fdf4';
    
    sounds.notification.currentTime = 0;
    sounds.notification.play().catch(e => console.warn('Notification sound failed:', e));
}

function updateStepIndicator() {
    document.getElementById('stepIndicator').textContent = 
        isRunning ? `Step ${currentStep}/${totalSteps}` : 'Ready to run...';
}

function updateButtons() {
    document.getElementById('backBtn').disabled = (currentStep === 0);
    document.getElementById('stepBtn').disabled = (currentStep >= totalSteps);
    
    if (currentStep >= totalSteps) {
        showTeacher("🎉 Excellent! You've seen how Python stores and uses variables! Try changing the values and running again.");
        editor.setOption("readOnly", false);
        document.getElementById('runBtn').disabled = false;
        isRunning = false;
    }
}