/* ===================================
   Level 5: Add 3+4 - SMART AI VERSION
   Part 1: Globals, Init, Mode, Editor
   =================================== */

// ============ GLOBAL VARIABLES ============
let editor, pyodide = null, currentStep = 0, totalSteps = 0;
let isRunning = false, animationHistory = [], executionPlan = [];
let stepAnimations = []; // Track animations per step for Back button
let currentVariables = {}, currentLineMarker = null, currentMode = 'problem';

// NEW: Smart AI variables
let preloadedExplanations = [];  // API response array
let placeholderValues = {};       // Runtime values for replacement
let inputCounter = 0;             // Track which input we're on

// ============ SOUND EFFECTS ============
const sounds = {
    keystroke: new Audio('../sounds/keystroke.wav'),
    enter: new Audio('../sounds/enter.wav'),
    notification: new Audio('../sounds/notification.wav'),
    whoosh: new Audio('../sounds/whoosh.wav'),
    machineGear: new Audio('../sounds/gear.mp3'),
    inputFail: new Audio('../sounds/inputfail.wav')
};

sounds.keystroke.volume = 0.2;
sounds.enter.volume = 0.4;
sounds.notification.volume = 0.3;
sounds.whoosh.volume = 0.5;
sounds.inputFail.volume = 0.5;
sounds.machineGear.volume = 1.0;
sounds.machineGear.playbackRate = 1.33; // Speed up from 4s to 3s

// ============ INITIALIZATION ============
window.onload = async () => {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        mode: "python", theme: "monokai", lineNumbers: true, readOnly: "nocursor"
    });
    editor.setValue('a = input()\nb = input()\nprint(a + b)');
    setupModeSelector();
    setupLineRestrictions();
    await loadPyodideEnv();
};

// ============ PYODIDE LOADER ============
async function loadPyodideEnv() {
    if (pyodide) return;
    const output = document.getElementById('output');
    output.textContent = '⏳ Loading Python...';
    try {
        pyodide = await loadPyodide({indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"});
        await pyodide.runPythonAsync(`import sys, io\noutput_buffer = io.StringIO()\nsys.stdout = output_buffer`);
        output.textContent = '✅ Python ready! Click "Run Code" to start.';
    } catch (error) {
        output.innerHTML = `<span class="error">❌ Failed: ${error.message}</span>`;
    }
}

// ============ MODE SELECTOR ============
function setupModeSelector() {
    document.querySelectorAll('input[name="mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMode = e.target.value;
            updateEditorForMode();
            resetExecution();
        });
    });
}

function updateEditorForMode() {
    editor.setValue(currentMode === 'problem' ? 
        'a = input()\nb = input()\nprint(a + b)' : 
        'a = int(input())\nb = int(input())\nprint(a + b)'
    );
    lockPrintStatements();
    lockInputStatements();
}

function resetExecution() {
    currentStep = 0;
    animationHistory = [];
    stepAnimations = [];
    currentVariables = {};
    preloadedExplanations = []; // NEW: Clear smart explanations
    placeholderValues = {};      // NEW: Clear placeholders
    inputCounter = 0;            // NEW: Reset input counter
    
    document.getElementById('memoryBank').innerHTML = '';
    document.getElementById('output').textContent = '>> Click "Run Code" to start...';
    isRunning = false;
    editor.setOption("readOnly", false);
    document.getElementById('runBtn').disabled = false;
    document.getElementById('stepBtn').disabled = true;
    document.getElementById('backBtn').disabled = true;
    updateStepIndicator();
    if (currentLineMarker) {
        currentLineMarker.clear();
        currentLineMarker = null;
    }
}

// ============ EDITOR RESTRICTIONS ============
function setupLineRestrictions() {
    editor.on('beforeChange', (cm, change) => {
        if (change.origin === 'paste' || change.origin === 'drop') {
            if (change.text.join('').includes('\n')) change.cancel();
        }
        if (change.origin === '+input' && change.text.length > 1) change.cancel();
        if (change.origin === '+delete' || change.origin === 'cut') {
            if (change.from.line !== change.to.line) change.cancel();
        }
    });
    lockPrintStatements();
    lockInputStatements();
}

function lockPrintStatements() {
    for (let i = 0; i < editor.lineCount(); i++) {
        const line = editor.getLine(i);
        const match = line.match(/print\s*\(/);
        if (match) {
            const start = match.index;
            editor.markText({line: i, ch: start}, {line: i, ch: start + 6}, 
                {readOnly: true, atomic: true, className: 'cm-locked-print'});
            const close = line.lastIndexOf(')');
            if (close > -1) {
                editor.markText({line: i, ch: close}, {line: i, ch: close + 1}, 
                    {readOnly: true, atomic: true, className: 'cm-locked-print'});
            }
        }
    }
}

function lockInputStatements() {
    for (let i = 0; i < editor.lineCount(); i++) {
        const line = editor.getLine(i);
        const match = line.match(/input\s*\(/);
        if (match) {
            const start = match.index;
            editor.markText({line: i, ch: start}, {line: i, ch: start + 6}, 
                {readOnly: true, atomic: true, className: 'cm-locked-print'});
            const close = line.lastIndexOf(')');
            if (close > -1) {
                editor.markText({line: i, ch: close}, {line: i, ch: close + 1}, 
                    {readOnly: true, atomic: true, className: 'cm-locked-print'});
            }
        }
    }
}

// ============ RUN BUTTON (WITH SMART AI) ============
document.getElementById('runBtn').onclick = async () => {
    if (isRunning || !pyodide && !(await loadPyodideEnv())) return;
    
    isRunning = true;
    currentStep = 0;
    animationHistory = [];
    executionPlan = [];
    stepAnimations = [];
    currentVariables = {};
    placeholderValues = {}; // NEW: Reset placeholders
    inputCounter = 0;       // NEW: Reset input counter
    preloadedExplanations = []; // NEW: Clear previous explanations
    
    editor.setOption("readOnly", true);
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stepBtn').disabled = false;
    document.getElementById('output').textContent = '';
    document.getElementById('memoryBank').innerHTML = '';
    
    const lines = editor.getValue().split('\n').filter(l => l.trim());
    const fullCode = editor.getValue();
    
    try {
        totalSteps = lines.length;
        executionPlan = lines.map((line, idx) => ({
            lineNumber: idx,
            code: line,
            type: line.includes('input(') ? 'input' : line.includes('print(') ? 'print' : 'assignment'
        }));
        
        updateStepIndicator();
        
        // NEW: Call smart endpoint ONCE (only if not already loaded for this exact code)
        const cacheKey = `${fullCode}|${currentMode}`;
        
        if (preloadedExplanations.length === 0) {
            console.log('📡 Fetching smart explanations...');
            try {
                const response = await fetch('http://localhost:3000/generate-smart-tutorial-explanation', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        fullCode: fullCode,
                        mode: currentMode
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    preloadedExplanations = data.explanations || [];
                    console.log(`✅ Loaded ${preloadedExplanations.length} smart explanations`);
                } else {
                    console.warn('⚠️ Smart API failed, using fallback explanations');
                    preloadedExplanations = generateFallbackExplanations(lines);
                }
            } catch (error) {
                console.warn('⚠️ Smart API error, using fallback explanations:', error);
                preloadedExplanations = generateFallbackExplanations(lines);
            }
        } else {
            console.log('✅ Using cached explanations');
        }
        
        showTeacher("✅ Code validated! Click 'Next Step' to see Python in action.");
        
    } catch (error) {
        await generateErrorExplanation(error, editor.getValue());
        isRunning = false;
        editor.setOption("readOnly", "nocursor");
        document.getElementById('runBtn').disabled = false;
    }
};

// NEW: Fallback explanations if API fails
function generateFallbackExplanations(lines) {
    return lines.map((line, idx) => ({
        step: idx,
        line: line,
        explanation: line.includes('input()') 
            ? `You'll type a value here, and Python stores it in a variable!`
            : line.includes('print(')
            ? `Python displays the result on the screen!`
            : `Python executes this line successfully!`,
        placeholders: [],
        type: line.includes('input()') ? 'input' : line.includes('print(') ? 'print' : 'assignment'
    }));
}

// ============ STEP BUTTON (WITH SMART EXPLANATION) ============
document.getElementById('stepBtn').onclick = async () => {
    if (currentStep >= totalSteps) return;
    
    // DISABLE BUTTON IMMEDIATELY
    const stepBtn = document.getElementById('stepBtn');
    stepBtn.disabled = true;
    
    const step = executionPlan[currentStep];
    stepAnimations[currentStep] = [];
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
                
                // Store result in placeholders
                placeholderValues['RESULT'] = newOutput;
            }
        }
        
        // NEW: Show smart explanation with placeholder replacement
        await showSmartExplanation(currentStep);
        
        currentStep++;
        updateStepIndicator();
        updateButtons();
        
        // RE-ENABLE BUTTON AFTER EVERYTHING COMPLETES
        if (currentStep < totalSteps) {
            stepBtn.disabled = false;
        }
        
    } catch (error) {
        await generateErrorExplanation(error, step.code, step.lineNumber);
        stepBtn.disabled = true;
    }
};

// NEW: Smart Explanation Display
async function showSmartExplanation(stepIndex) {
    if (!preloadedExplanations[stepIndex]) {
        showTeacher(`Step ${stepIndex + 1} executed successfully!`);
        return;
    }
    
    let explanation = preloadedExplanations[stepIndex].explanation;
    const placeholders = preloadedExplanations[stepIndex].placeholders || [];
    
    // Replace all known placeholders
    placeholders.forEach(placeholder => {
        if (placeholderValues[placeholder]) {
            const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
            explanation = explanation.replace(regex, placeholderValues[placeholder]);
        }
    });
    
    // Also replace variable placeholders like {{a}}, {{b}}, {{c}}
    Object.keys(currentVariables).forEach(varName => {
        const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
        explanation = explanation.replace(regex, currentVariables[varName]);
    });
    
    showTeacher(explanation);
}

// ============ INPUT VALIDATION ============
function isValidIntInput(value) {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const num = Number(trimmed);
    return !isNaN(num) && Number.isInteger(num);
}

// ============ INPUT HANDLING (WITH PLACEHOLDER TRACKING) ============
async function handleInputStatement(step) {
    const inputMatch = step.code.match(/(\w+)\s*=\s*(int\()?input\(/);
    if (!inputMatch) return;
    const varName = inputMatch[1];
    const hasInt = !!inputMatch[2];
    const userInput = await showInteractiveInput("Enter value:");
    
    // NEW: Store user input in placeholders
    placeholderValues[`USER_INPUT_${inputCounter}`] = userInput;
    inputCounter++;
    
    if (hasInt && !isValidIntInput(userInput)) {
        await animateInputToMemoryWithMachine(varName, userInput, hasInt, false);
        showTeacher("❌ Oops! int() only works with whole numbers. Try again!");
        inputCounter--; // Don't increment counter for failed input
        return handleInputStatement(step);
    }
    
    pyodide.globals.set("_temp_input", userInput);
    await pyodide.runPythonAsync(step.code.replace("input()", "_temp_input"));
    const value = pyodide.globals.get(varName).toString();
    currentVariables[varName] = value;
    
    // NEW: Also store variable value in placeholders
    placeholderValues[varName] = value;
    
    await animateInputToMemoryWithMachine(varName, value, hasInt, true);
}

// ============ INTERACTIVE INPUT ============
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
                
                const action = {type: 'input', element: inputLine, isNew: true};
                animationHistory.push(action);
                stepAnimations[currentStep].push(action); 
                
                gsap.to(inputField, {
                    textShadow: '0 0 20px #4ade80',
                    duration: 0.3,
                    onComplete: () => resolve(value)
                });
            }
        });
    });
}

/* ===================================
   Level 5: Add 3+4 - SMART AI VERSION
   Part 2: Animations, Helpers, Nav
   =================================== */

// ============ MACHINE CREATION ============
function createIntMachine(midX, midY) {
    const machine = document.createElement('div');
    machine.className = 'int-machine';
    machine.style.left = `${midX}px`;
    machine.style.top = `${midY}px`;
    machine.innerHTML = `
        <div class="machine-body">
            <div class="machine-label">int()</div>
            <svg class="machine-gears" viewBox="0 0 120 80">
                <g class="gear gear-1" transform="translate(35, 40)">
                    <circle r="18" fill="#8b5cf6" stroke="#fff" stroke-width="2"/>
                    <circle r="3" fill="#fff"/>
                    <rect x="-2" y="-22" width="4" height="8" fill="#fff" rx="1"/>
                    <rect x="-2" y="14" width="4" height="8" fill="#fff" rx="1"/>
                    <rect x="-22" y="-2" width="8" height="4" fill="#fff" rx="1"/>
                    <rect x="14" y="-2" width="8" height="4" fill="#fff" rx="1"/>
                </g>
                <g class="gear gear-2" transform="translate(85, 40)">
                    <circle r="15" fill="#7c3aed" stroke="#fff" stroke-width="2"/>
                    <circle r="3" fill="#fff"/>
                    <rect x="-2" y="-18" width="4" height="6" fill="#fff" rx="1"/>
                    <rect x="-2" y="12" width="4" height="6" fill="#fff" rx="1"/>
                    <rect x="-18" y="-2" width="6" height="4" fill="#fff" rx="1"/>
                    <rect x="12" y="-2" width="6" height="4" fill="#fff" rx="1"/>
                </g>
            </svg>
            <div class="machine-intake"></div>
            <div class="machine-output"></div>
        </div>`;
    document.body.appendChild(machine);
    return machine;
}

// ============ MACHINE ANIMATION (CORE) ============
async function animateInputToMemoryWithMachine(varName, value, hasInt, isValid) {
    const inputField = document.querySelector('.terminal-input[disabled]:last-of-type');
    if (!inputField) return;
    
    const inputRect = inputField.getBoundingClientRect();
    const textCenterX = inputRect.left + 8 + (inputField.value.length * 4.5);
    
    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = value;
    spark.style.left = `${textCenterX - 40}px`;
    spark.style.top = `${inputRect.top + inputRect.height / 2}px`;
    document.body.appendChild(spark);
    
    const bank = document.getElementById('memoryBank');
    const box = document.createElement('div');
    box.id = `box-${varName}`;
    
    if (!hasInt) {
        box.className = 'variable-box string-box';
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${value}</span>`;
        bank.appendChild(box);
        const targetRect = box.getBoundingClientRect();
        const trail = createDirectionalTrail(textCenterX, inputRect.top + inputRect.height / 2, 
            targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2, false);
        sounds.whoosh.play().catch(() => {});
        
        await new Promise(resolve => {
            gsap.to(spark, {
                left: targetRect.left + targetRect.width / 2 - 40,
                top: targetRect.top + targetRect.height / 2,
                duration: 1.5,
                ease: "power2.inOut",
                onUpdate: () => {
                    const rect = spark.getBoundingClientRect();
                    updateTrailParticles(trail, rect.left + rect.width / 2, rect.top + rect.height / 2, 
                        textCenterX, inputRect.top + inputRect.height / 2);
                },
                onComplete: () => {
                    spark.remove();
                    removeTrail(trail);
                    gsap.to(box, {opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", onComplete: resolve});
                    
                    const action = {type: 'memory', element: box, isNew: true};
                    animationHistory.push(action);
                    stepAnimations[currentStep].push(action);
                }
            });
        });
    } else {
        box.className = 'variable-box number-box';
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${value}</span>`;
        bank.appendChild(box);
        const targetRect = box.getBoundingClientRect();
        
        const startX = textCenterX;
        const startY = inputRect.top + inputRect.height / 2;
        const endX = targetRect.left + targetRect.width / 2;
        const endY = targetRect.top + targetRect.height / 2;
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        
        const machine = createIntMachine(midX, midY);
        const machineRect = machine.getBoundingClientRect();
        const intakeX = machineRect.left + 30;
        const intakeY = machineRect.top + machineRect.height / 2;
        const outputX = machineRect.right - 30;
        const outputY = machineRect.top + machineRect.height / 2;
        
        const trail1 = createDirectionalTrail(startX, startY, intakeX, intakeY, false);
        sounds.whoosh.play().catch(() => {});
        
        await new Promise(resolve => {
            gsap.to(spark, {
                left: intakeX - 40, top: intakeY, scale: 0.7, duration: 1.2, ease: "power2.in",
                onUpdate: () => {
                    const rect = spark.getBoundingClientRect();
                    updateTrailParticles(trail1, rect.left + rect.width / 2, rect.top + rect.height / 2, startX, startY);
                },
                onComplete: () => { removeTrail(trail1); spark.style.opacity = '0'; resolve(); }
            });
        });
        
        if (isValid) {
            sounds.machineGear.currentTime = 0;
            sounds.machineGear.play().catch(() => {});

            const tl = gsap.timeline();
            tl.to('.gear-1', {rotation: 720, duration: 3, ease: "none", transformOrigin: "center"}, 0)
              .to('.gear-2', {rotation: -720, duration: 3, ease: "none", transformOrigin: "center"}, 0)
              .to('.machine-body', {boxShadow: '0 0 50px rgba(16, 185, 129, 0.9)', duration: 0.6, yoyo: true, repeat: 2}, 0.5)
              .call(() => {
                  sounds.notification.currentTime = 0;
                  sounds.notification.play().catch(() => {});
              }, null, 3);
            await tl;
            
            spark.className = 'animation-spark spark-number';
            spark.textContent = value;
            spark.style.left = `${outputX - 40}px`;
            spark.style.top = `${outputY}px`;
            spark.style.opacity = '1';
            sounds.enter.play().catch(() => {});
            
            const trail2 = createDirectionalTrail(outputX, outputY, endX, endY, true);
            await new Promise(resolve => {
                gsap.to(spark, {
                    left: endX - 40, top: endY, scale: 1, duration: 1, ease: "power2.out",
                    onUpdate: () => {
                        const rect = spark.getBoundingClientRect();
                        updateTrailParticles(trail2, rect.left + rect.width / 2, rect.top + rect.height / 2, outputX, outputY);
                    },
                    onComplete: () => {
                        spark.remove(); machine.remove(); removeTrail(trail2);
                        gsap.to(box, {opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", onComplete: resolve});
                        
                        const action = {type: 'memory', element: box, isNew: true};
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);
                    }
                });
            });
        } else {
            sounds.machineGear.currentTime = 0;
            sounds.machineGear.play().catch(() => {});

            const tl = gsap.timeline();
            tl.to('.gear-1', {rotation: 45, duration: 0.15, yoyo: true, repeat: 19, ease: "power2.out", transformOrigin: "center"}, 0)
              .to('.gear-2', {rotation: -45, duration: 0.15, yoyo: true, repeat: 19, ease: "power2.out", transformOrigin: "center"}, 0)
              .to('.machine-body', {boxShadow: '0 0 50px rgba(239, 68, 68, 0.9)', x: '+=5', duration: 0.1, yoyo: true, repeat: 29}, 0.3)
              .call(() => {
                  sounds.inputFail.currentTime = 0;
                  sounds.inputFail.play().catch(() => {});
              }, null, 3);
            await tl;
            
            await new Promise(resolve => {
                gsap.to(spark, {
                    left: intakeX - 150, top: intakeY - 80, rotation: 720, opacity: 0, duration: 0.8, ease: "power2.out",
                    onComplete: () => { spark.remove(); machine.remove(); box.remove(); resolve(); }
                });
            });
        }
    }
}

// ============ PRINT ANIMATION ============
async function animatePrint(step, text) {
    const match = step.code.match(/print\((.*)\)/);
    if (!match) return;
    
    const printContent = match[1];
    const parts = parsePrintContent(printContent);
    
    const isAddition = printContent.trim().match(/^(\w+)\s*\+\s*(\w+)$/);
    const bothVariables = parts.length === 2 && parts[0].type === 'variable' && parts[1].type === 'variable';
    
    if (isAddition && bothVariables) {
        await animatePrintWithMerge(step, text, parts);
    } else {
        await animatePrintStandard(step, text, parts);
    }
}

async function animatePrintWithMerge(step, text, parts) {
    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = currentMode === 'problem' ? 'output-line output-error' : 'output-line output-success';
    line.textContent = text;
    output.appendChild(line);
    
    const lineRect = line.getBoundingClientRect();
    const targetX = lineRect.left + lineRect.width / 2;
    const targetY = lineRect.top + lineRect.height / 2;
    
    const sparks = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const box = document.getElementById(`box-${part.varName}`);
        if (!box) continue;
        
        const boxRect = box.getBoundingClientRect();
        const startX = boxRect.left + boxRect.width / 2;
        const startY = boxRect.top + boxRect.height / 2;
        
        const spark = document.createElement('div');
        spark.className = 'animation-spark spark-variable';
        spark.textContent = part.value;
        spark.style.left = `${startX - 40}px`;
        spark.style.top = `${startY}px`;
        document.body.appendChild(spark);
        
        box.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.8)';
        setTimeout(() => box.style.boxShadow = '', 1200);
        sparks.push({element: spark, startX, startY, value: part.value});
    }
    
    if (sparks.length !== 2) {
        await animatePrintStandard(step, text, parts);
        return;
    }
    
    sounds.whoosh.play().catch(() => {});
    const midX = (sparks[0].startX + sparks[1].startX) / 2;
    const midY = (sparks[0].startY + sparks[1].startY) / 2;
    const trails = sparks.map(s => createDirectionalTrail(s.startX, s.startY, midX, midY, true));
    
    await Promise.all(sparks.map((spark, idx) => {
        return new Promise(resolve => {
            gsap.to(spark.element, {
                left: midX - 40, top: midY, duration: 1, ease: "power2.inOut",
                onUpdate: () => {
                    const rect = spark.element.getBoundingClientRect();
                    updateTrailParticles(trails[idx], rect.left + rect.width / 2, rect.top + rect.height / 2, spark.startX, spark.startY);
                },
                onComplete: () => { removeTrail(trails[idx]); resolve(); }
            });
        });
    }));
    
    const mergeText = document.createElement('div');
    mergeText.className = 'merge-animation';
    mergeText.style.cssText = `position:fixed; left:${midX-60}px; top:${midY-30}px; font-size:2rem; font-weight:bold; font-family:'Courier New'; color:#ffd700; z-index:10001; pointer-events:none; text-align:center; width:200px;`;
    mergeText.innerHTML = `${sparks[0].value} <span style="color: #fff;">+</span> ${sparks[1].value}`;
    document.body.appendChild(mergeText);
    
    sparks.forEach(s => s.element.style.opacity = '0');
    
    await new Promise(resolve => {
        const tl = gsap.timeline();
        tl.to(mergeText, {scale: 1.3, duration: 0.3, ease: "power2.out"})
          .to(mergeText, {scale: 1, duration: 0.3, ease: "power2.in"})
          .to(mergeText, {textShadow: '0 0 30px rgba(255, 215, 0, 0.9)', duration: 0.4}, "-=0.3")
          .to(mergeText, {duration: 0.5, onStart: () => {
              mergeText.textContent = text;
              mergeText.style.color = currentMode === 'problem' ? '#ef4444' : '#10b981';
          }})
          .to(mergeText, {onComplete: resolve});
    });
    
    const finalSpark = document.createElement('div');
    finalSpark.className = currentMode === 'problem' ? 'animation-spark' : 'animation-spark spark-number';
    finalSpark.textContent = text;
    finalSpark.style.left = `${midX - 40}px`;
    finalSpark.style.top = `${midY}px`;
    document.body.appendChild(finalSpark);
    
    mergeText.remove();
    sparks.forEach(s => s.element.remove());
    
    const finalTrail = createDirectionalTrail(midX, midY, targetX, targetY, false);
    await new Promise(resolve => {
        gsap.to(finalSpark, {
            left: targetX - 40, top: targetY, duration: 0.8, ease: "power2.out",
            onUpdate: () => {
                const rect = finalSpark.getBoundingClientRect();
                updateTrailParticles(finalTrail, rect.left + rect.width / 2, rect.top + rect.height / 2, midX, midY);
            },
            onComplete: () => { finalSpark.remove(); removeTrail(finalTrail); resolve(); }
        });
    });
    
    await new Promise(resolve => {
        gsap.to(line, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out", onComplete: resolve });
        
        const action = {type: 'output', element: line, isNew: true};
        animationHistory.push(action);
        stepAnimations[currentStep].push(action);
    });
    
    if (currentMode === 'solution') showConfetti();
}

async function animatePrintStandard(step, text, parts) {
    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = currentMode === 'problem' ? 'output-line output-error' : 'output-line output-success';
    line.textContent = text;
    output.appendChild(line);
    
    const lineRect = line.getBoundingClientRect();
    const positions = calculatePartPositions(parts, text, lineRect);
    sounds.whoosh.play().catch(() => {});
    
    await Promise.all(parts.map((part, idx) => createAndAnimateSpark(part, positions[idx], step.lineNumber)));
    
    await new Promise(resolve => {
        gsap.to(line, {opacity: 1, x: 0, duration: 0.5, ease: "power2.out", onComplete: resolve});
        
        const action = {type: 'output', element: line, isNew: true};
        animationHistory.push(action);
        stepAnimations[currentStep].push(action);
    });
    
    if (currentMode === 'solution') showConfetti();
}

// ============ PARSE PRINT CONTENT ============
function parsePrintContent(content) {
    const parts = [];
    let current = '', inQuote = false, quoteChar = '';
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        
        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true; 
            quoteChar = char; 
            current = '';
        } else if (char === quoteChar && inQuote) {
            inQuote = false;
            parts.push({type: 'string', value: current, source: 'editor'});
            current = '';
        } else if ((char === ',' || char === '+') && !inQuote) {
            if (current.trim()) {
                const varName = current.trim();
                if (currentVariables.hasOwnProperty(varName)) {
                    parts.push({
                        type: 'variable', 
                        value: currentVariables[varName], 
                        varName: varName, 
                        source: 'memory'
                    });
                } else {
                    parts.push({type: 'string', value: varName, source: 'editor'});
                }
                current = '';
            }
        } else if (char !== ' ') {
            current += char;
        }
    }
    
    if (current.trim()) {
        const varName = current.trim();
        if (currentVariables.hasOwnProperty(varName)) {
            parts.push({
                type: 'variable', 
                value: currentVariables[varName], 
                varName: varName, 
                source: 'memory'
            });
        } else {
            parts.push({type: 'string', value: varName, source: 'editor'});
        }
    }
    
    return parts;
}

// ============ POSITION CALCULATION ============
function calculatePartPositions(parts, text, lineRect) {
    const positions = [];
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:absolute;visibility:hidden;font-family:"Courier New";font-size:16px;white-space:pre';
    document.body.appendChild(tempDiv);
    let currentX = lineRect.left + 20;
    const baseY = lineRect.top + lineRect.height / 2;
    parts.forEach(part => {
        positions.push({x: currentX, y: baseY});
        tempDiv.textContent = part.value;
        currentX += tempDiv.offsetWidth;
    });
    tempDiv.remove();
    return positions;
}

// ============ SPARK ANIMATION ============
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

// ============ SVG TRAIL SYSTEM ============
function createDirectionalTrail(startX, startY, endX, endY, isGold) {
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
        particles.push({element: circle, index: i});
    }
    return particles;
}

function updateTrailParticles(particles, currentX, currentY, startX, startY) {
    const angle = Math.atan2(currentY - startY, currentX - startX);
    particles.forEach(({element, index}) => {
        const offset = (index + 1) * 12;
        element.setAttribute('cx', currentX - Math.cos(angle) * offset);
        element.setAttribute('cy', currentY - Math.sin(angle) * offset);
    });
}

function removeTrail(particles) {
    particles.forEach(({element}) => element.remove());
}

// ============ AI EXPLANATIONS (FALLBACK) ============
async function generateErrorExplanation(error, code, lineNumber) {
    const output = document.getElementById('output');
    output.innerHTML = `<span class="error">❌ Error detected...</span>`;
    output.innerHTML = `<span class="error">❌ ${error.message}</span>`;
    showTeacher("❌ Error detected. Double-check your code!");
}

// ============ NAVIGATION ============
document.getElementById('backBtn').onclick = () => {
    if (currentStep > 0) {
        currentStep--;
        reverseLastAnimation();
        updateStepIndicator();
        updateButtons();
        
        // NEW: Show previous smart explanation (already loaded)
        if (currentStep > 0) {
            showSmartExplanation(currentStep - 1);
        } else {
            showTeacher("Back to the start. Click 'Next Step' to begin again.");
        }
    }
};

function reverseLastAnimation() {
    const lastStepAnimations = stepAnimations.pop();
    if (!lastStepAnimations || lastStepAnimations.length === 0) return;
    
    lastStepAnimations.reverse().forEach(action => {
        gsap.to(action.element, {
            opacity: 0,
            scale: action.type === 'memory' ? 0.5 : 1,
            x: action.type === 'output' ? -20 : 0,
            duration: 0.3,
            onComplete: () => {
                if (action.isNew) action.element.remove();
            }
        });
        animationHistory.pop();
    });
}

document.getElementById('resetBtn').onclick = () => location.reload();

// ============ HELPERS ============
function highlightLine(lineNum) {
    if (currentLineMarker) currentLineMarker.clear();
    currentLineMarker = editor.markText(
        {line: lineNum, ch: 0},
        {line: lineNum, ch: editor.getLine(lineNum).length},
        {className: 'CodeMirror-activeline-background'}
    );
    editor.scrollIntoView({line: lineNum, ch: 0}, 50);
}

function showTeacher(message) {
    const bubble = document.getElementById('teacherBubble');
    const text = document.getElementById('teacherText');
    text.textContent = message;
    bubble.classList.add('show');
    bubble.style.borderColor = '#bbf7d0';
    bubble.style.backgroundColor = '#f0fdf4';
    sounds.notification.currentTime = 0;
    sounds.notification.play().catch(() => {});
}

function updateStepIndicator() {
    document.getElementById('stepIndicator').textContent = 
        isRunning ? `Step ${currentStep}/${totalSteps}` : 'Ready to run...';
}

function updateButtons() {
    document.getElementById('backBtn').disabled = (currentStep === 0);
    document.getElementById('stepBtn').disabled = (currentStep >= totalSteps);
    
    if (currentStep >= totalSteps) {
        // Show completion message in teacher bubble (not as a fake "last line explanation")
        showTeacher("🎉 Excellent! You've learned string vs number addition! Try switching modes and run again.");
        editor.setOption("readOnly", "nocursor");
        document.getElementById('runBtn').disabled = false;
        isRunning = false;
    }
}

function showConfetti() {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `position:fixed; width:10px; height:10px; background:${colors[Math.floor(Math.random()*colors.length)]}; left:${Math.random()*window.innerWidth}px; top:-10px; border-radius:50%; pointer-events:none; z-index:10002;`;
        document.body.appendChild(confetti);
        gsap.to(confetti, {
            y: window.innerHeight + 20,
            x: `+=${Math.random() * 200 - 100}`,
            rotation: Math.random() * 720,
            opacity: 0,
            duration: 2 + Math.random() * 2,
            ease: "power2.in",
            onComplete: () => confetti.remove()
        });
    }
}