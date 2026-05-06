/* ===================================
   Level 8: Loops — Main Script
   For Loop & While Loop Visualizer
   =================================== */

// ============ IMPORTS ============
import { renderListTable } from '../shared/list/listRenderer.js';
import {
    animateListCreation,
    reverseListCreation,
    initializePianoSynth,
    initializeListSounds
} from '../shared/list/listAnimations.js';

import {
    showGlassPane,
    dissolveGlassPane,
    injectEngineBox,
    updateForEngine,
    updateWhileEngine,
    removeEngineBox,
    animateLoopBack,
    updateActiveLine,
    animateBreakArrow,
    disintegrateEngineBox,
    animateContinueArrow
} from './glassAnimations.js';

// ============ GLOBAL VARIABLES ============
let editor, pyodide = null, currentStep = 0, totalSteps = 0;
let isRunning = false, executionPlan = [];
let currentVariables = {}, currentLineMarker = null, currentTab = 'for-list';
let preloadedExplanations = [];
let stepHistory = [];
let renderedLists = new Set();

// Loop-specific state
let glassState = null;   // { glassPaneEl, frostedMarks }
let engineRef = null;    // { widget, element }

// ============ SOUND EFFECTS ============
const sounds = {
    keystroke: new Audio('../sounds/keystroke.wav'),
    enter: new Audio('../sounds/enter.wav'),
    notification: new Audio('../sounds/notification.wav'),
    whoosh: new Audio('../sounds/whoosh.wav')
};

sounds.keystroke.volume = 0.2;
sounds.enter.volume = 0.4;
sounds.notification.volume = 0.3;
sounds.whoosh.volume = 0.5;

// ============ TAB TEMPLATES ============
const tabTemplates = {
    'for-list': `fruits = ["apple", "banana", "cherry"]
for fruit in fruits:
    print(fruit)`,

    'while': `i = 1
while i <= 3:
    print(i)
    i = i + 1`,

    'for-break': `nums = [1, 2, 3, 4, 5]
for n in nums:
    print(n)
    break`,

    'for-continue': `nums = [1, 2, 3]
for n in nums:
    continue
    print(n)`
};

// ============ INITIALIZATION ============
window.onload = async () => {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        mode: "python",
        theme: "monokai",
        lineNumbers: true,
        readOnly: "nocursor"
    });

    editor.setValue(tabTemplates['for-list']);
    setupTabSelector();
    setupLineLocking();
    await loadPyodideEnv();
};

// ============ PYODIDE LOADING ============
async function loadPyodideEnv() {
    if (pyodide) return;
    const output = document.getElementById('output');
    output.textContent = '⏳ Loading Python...\n(First time only, may take 10-20 seconds)';

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
        initializePianoSynth();
        initializeListSounds();

    } catch (error) {
        output.innerHTML = `<span class="error">❌ Failed: ${error.message}</span>`;
    }
}

// ============ TAB SELECTOR SETUP ============
function setupTabSelector() {
    document.querySelectorAll('input[name="tab"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentTab = e.target.value;
            editor.setValue(tabTemplates[currentTab]);
            setupLineLocking();
            resetExecution();
        });
    });
}

// ============ LINE LOCKING (All lines locked for Level 8) ============
function setupLineLocking() {
    editor.getAllMarks().forEach(mark => mark.clear());

    // Lock ALL lines — students observe, not edit
    for (let i = 0; i < editor.lineCount(); i++) {
        editor.markText(
            { line: i, ch: 0 },
            { line: i, ch: editor.getLine(i).length },
            { readOnly: true, atomic: true, className: 'cm-locked' }
        );
    }
}

// ============ RESET EXECUTION ============
async function resetExecution() {
    currentStep = 0;
    executionPlan = [];
    currentVariables = {};
    preloadedExplanations = [];
    stepHistory = [];
    renderedLists.clear();

    // Clean up loop visuals
    if (glassState) {
        try {
            await dissolveGlassPane(glassState.glassPaneEl, editor, glassState.frostedMarks, glassState.activeLoopMarks);
        } catch (e) { /* ignore */ }
        glassState = null;
    }
    if (engineRef) {
        try {
            await removeEngineBox(engineRef);
        } catch (e) { /* ignore */ }
        engineRef = null;
    }

    document.getElementById('memoryBank').innerHTML = '';
    document.getElementById('output').textContent = '>> Click "Run Code" to start...';
    isRunning = false;

    document.getElementById('runBtn').disabled = false;
    document.getElementById('stepBtn').disabled = true;
    document.getElementById('backBtn').disabled = true;

    updateStepIndicator();

    if (currentLineMarker !== null) {
        editor.removeLineClass(currentLineMarker, 'wrap', 'step-line-highlight');
        currentLineMarker = null;
    }

    if (pyodide) {
        try {
            await pyodide.runPythonAsync(`
for name in list(globals().keys()):
    if not name.startswith('_') and name not in ['output_buffer', 'sys', 'io']:
        del globals()[name]
            `);
        } catch (e) {
            console.warn('Could not clear Pyodide globals:', e);
        }
    }

    document.getElementById('teacherBubble').classList.remove('show');
}

// ============ RUN BUTTON ============
document.getElementById('runBtn').onclick = async () => {
    if (isRunning || !pyodide && !(await loadPyodideEnv())) return;

    isRunning = true;
    currentStep = 0;
    executionPlan = [];
    currentVariables = {};
    preloadedExplanations = [];
    stepHistory = [];
    renderedLists.clear();
    glassState = null;
    engineRef = null;

    document.getElementById('runBtn').disabled = true;
    document.getElementById('stepBtn').disabled = false;
    document.getElementById('output').textContent = '';
    document.getElementById('memoryBank').innerHTML = '';

    if (pyodide) {
        try {
            await pyodide.runPythonAsync(`
for name in list(globals().keys()):
    if not name.startswith('_') and name not in ['output_buffer', 'sys', 'io']:
        del globals()[name]
output_buffer.truncate(0)
output_buffer.seek(0)
            `);
        } catch (e) {
            console.warn('Could not clear Pyodide globals:', e);
        }
    }

    const fullCode = editor.getValue();

    try {
        // Build the execution plan using static JS parser
        executionPlan = buildExecutionPlan(fullCode);
        totalSteps = executionPlan.length;
        updateStepIndicator();

        console.log('📋 Execution plan:', executionPlan);

        // Try fetching explanations
        try {
            const response = await fetch('http://localhost:3000/generate-smart-tutorial-explanation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullCode, mode: currentTab })
            });

            if (response.ok) {
                const data = await response.json();
                preloadedExplanations = data.explanations || [];
            } else {
                preloadedExplanations = generateFallbackExplanations(executionPlan);
            }
        } catch (error) {
            preloadedExplanations = generateFallbackExplanations(executionPlan);
        }

        showTeacher("✅ Code validated! Click 'Next Step' to execute line by line.");

    } catch (error) {
        displayError(`Code validation failed: ${error.message}`);
        isRunning = false;
        document.getElementById('runBtn').disabled = false;
    }
};

// ============ EXECUTION PLAN BUILDER (Static JS Parser) ============
// ⭐ Completely replaces sys.settrace() — which doesn't work in Pyodide WASM.
// Parses code statically in pure JS and generates a deterministic execution plan.
function buildExecutionPlan(code) {
    // Normalize Windows line endings
    code = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const codeLines = code.split('\n');
    const steps = [];

    // ---- Step 1: Identify structure ----
    let loopInfo = null;
    let preLoopLines = []; // lines before the loop header
    let bodyLines = [];    // indented lines inside the loop

    for (let i = 0; i < codeLines.length; i++) {
        const trimmed = codeLines[i].trim();
        if (!trimmed) continue; // skip blank lines

        if (!loopInfo) {
            // Look for loop header
            const forM = trimmed.match(/^for\s+(\w+)\s+in\s+(\w+)\s*:$/);
            const whileM = trimmed.match(/^while\s+(.+)\s*:$/);

            if (forM) {
                loopInfo = { type: 'for', headerLine: i, iterVar: forM[1], iterableName: forM[2] };
            } else if (whileM) {
                loopInfo = { type: 'while', headerLine: i, condition: whileM[1] };
            } else {
                preLoopLines.push(i); // pre-loop assignment line
            }
        } else if (codeLines[i].match(/^\s+/)) {
            // Indented line → loop body
            bodyLines.push(i);
        }
    }

    if (!loopInfo) {
        console.error('❌ No loop found in code!');
        return [];
    }
    loopInfo.bodyLines = bodyLines;

    console.log('🔎 Static parser — loopInfo:', loopInfo);
    console.log('🔎 Pre-loop lines:', preLoopLines, '| Body lines:', bodyLines);

    // ---- Step 2: Pre-loop assignments ----
    for (const lineNum of preLoopLines) {
        const trimmed = codeLines[lineNum].trim();
        if (trimmed.match(/^\w+\s*=\s*\[/)) {
            steps.push({ lineNumber: lineNum, code: trimmed, type: 'list-assign' });
        } else if (trimmed.match(/^\w+\s*=/)) {
            steps.push({ lineNumber: lineNum, code: trimmed, type: 'assignment' });
        }
    }

    // ---- Step 3: Build loop iterations ----
    if (loopInfo.type === 'for') {
        // Parse list items directly from the code text
        const listLine = preLoopLines.length > 0 ? codeLines[preLoopLines[0]].trim() : '';
        const listMatch = listLine.match(/\w+\s*=\s*\[(.+)\]/);
        let items = [];
        if (listMatch) {
            items = listMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        }
        loopInfo.items = items;

        console.log('🔎 For-loop items:', items);

        // Loop-enter step
        steps.push({
            lineNumber: loopInfo.headerLine,
            code: codeLines[loopInfo.headerLine].trim(),
            type: 'loop-enter',
            loopType: 'for',
            iterVar: loopInfo.iterVar,
            iterableName: loopInfo.iterableName,
            items: items
        });

        // Generate steps for each iteration
        let forLoopBroken = false;
        for (let idx = 0; idx < items.length; idx++) {
            // Loop-assign: assign current item to iterator variable
            steps.push({
                lineNumber: loopInfo.headerLine,
                code: `${loopInfo.iterVar} = ${items[idx]}`,
                type: 'loop-assign',
                iterVar: loopInfo.iterVar,
                iterValue: items[idx],
                iterIndex: idx
            });

            // Body lines for this iteration
            let didBreak = false;
            let didContinue = false;
            for (const bLine of bodyLines) {
                const trimmed = codeLines[bLine].trim();
                if (trimmed === 'break') {
                    steps.push({
                        lineNumber: bLine, code: 'break', type: 'loop-break',
                        loopEndLine: bodyLines[bodyLines.length - 1],
                        loopHeaderLine: loopInfo.headerLine
                    });
                    didBreak = true;
                    break;
                } else if (trimmed === 'continue') {
                    steps.push({
                        lineNumber: bLine, code: 'continue', type: 'loop-continue',
                        toLine: loopInfo.headerLine
                    });
                    didContinue = true;
                    break;
                } else if (trimmed.startsWith('print(')) {
                    steps.push({ lineNumber: bLine, code: trimmed, type: 'print' });
                } else if (trimmed.match(/^\w+\s*=\s*.+/)) {
                    steps.push({ lineNumber: bLine, code: trimmed, type: 'assignment' });
                }
            }

            if (didBreak) { forLoopBroken = true; break; }

            // Normal loop-back between iterations (skip if continue — continue arrow IS the arc)
            if (!didContinue && idx < items.length - 1) {
                steps.push({
                    lineNumber: bodyLines[bodyLines.length - 1],
                    code: 'loop-back', type: 'loop-back',
                    toLine: loopInfo.headerLine
                });
            }
        }

        if (!forLoopBroken) {
            // Final loop-back + loop-exit after last iteration
            steps.push({
                lineNumber: bodyLines[bodyLines.length - 1],
                code: 'loop-back', type: 'loop-back',
                toLine: loopInfo.headerLine
            });
            steps.push({
                lineNumber: loopInfo.headerLine,
                code: 'loop-exit', type: 'loop-exit'
            });
        }

    } else if (loopInfo.type === 'while') {
        // Simulate the while-loop logic in JS
        // Parse initial assignment to find the counter variable and starting value
        const conditionRaw = loopInfo.condition; // e.g. "i <= 5"
        const condMatch = conditionRaw.match(/(\w+)\s*(<=|<|>=|>|!=|==)\s*(\d+)/);

        if (!condMatch) {
            console.error('❌ Could not parse while condition:', conditionRaw);
            return steps;
        }

        const counterVar = condMatch[1];
        const operator = condMatch[2];
        const limit = parseInt(condMatch[3]);

        // Find starting value from pre-loop assignment
        let counterValue = 0;
        for (const lineNum of preLoopLines) {
            const trimmed = codeLines[lineNum].trim();
            const assignM = trimmed.match(new RegExp(`^${counterVar}\\s*=\\s*(\\d+)`));
            if (assignM) {
                counterValue = parseInt(assignM[1]);
                break;
            }
        }

        // Find the increment expression in the body
        let incrementLine = -1;
        let incrementExpr = null;
        for (const bLine of bodyLines) {
            const trimmed = codeLines[bLine].trim();
            const incM = trimmed.match(new RegExp(`^${counterVar}\\s*=\\s*(.+)`));
            if (incM) {
                incrementLine = bLine;
                incrementExpr = incM[1]; // e.g. "i + 1"
                break;
            }
        }

        console.log(`🔎 While-loop: ${counterVar} starts at ${counterValue}, condition: ${counterVar} ${operator} ${limit}`);

        // Evaluate condition helper
        function evalCondition(val) {
            switch (operator) {
                case '<=': return val <= limit;
                case '<': return val < limit;
                case '>=': return val >= limit;
                case '>': return val > limit;
                case '!=': return val != limit;
                case '==': return val == limit;
                default: return false;
            }
        }

        // Loop-enter step
        steps.push({
            lineNumber: loopInfo.headerLine,
            code: codeLines[loopInfo.headerLine].trim(),
            type: 'loop-enter',
            loopType: 'while',
            condition: conditionRaw
        });

        // Generate iterations
        let maxIterations = 100; // safety cap
        let iteration = 0;

        let whileLoopBroken = false;
        while (evalCondition(counterValue) && iteration < maxIterations) {
            // While-check: TRUE
            const condStr = conditionRaw.replace(new RegExp(`\\b${counterVar}\\b`, 'g'), String(counterValue));
            steps.push({
                lineNumber: loopInfo.headerLine,
                code: condStr,
                type: 'while-check',
                conditionStr: condStr,
                conditionResult: true
            });

            // Body lines
            let didBreak_w = false;
            let didContinue_w = false;
            for (const bLine of bodyLines) {
                const trimmed = codeLines[bLine].trim();
                if (trimmed === 'break') {
                    steps.push({
                        lineNumber: bLine, code: 'break', type: 'loop-break',
                        loopEndLine: bodyLines[bodyLines.length - 1],
                        loopHeaderLine: loopInfo.headerLine
                    });
                    didBreak_w = true;
                    break;
                } else if (trimmed === 'continue') {
                    steps.push({
                        lineNumber: bLine, code: 'continue', type: 'loop-continue',
                        toLine: loopInfo.headerLine
                    });
                    didContinue_w = true;
                    break;
                } else if (trimmed.startsWith('print(')) {
                    steps.push({ lineNumber: bLine, code: trimmed, type: 'print' });
                } else if (trimmed.match(/^\w+\s*=\s*.+/)) {
                    steps.push({ lineNumber: bLine, code: trimmed, type: 'assignment' });
                }
            }

            if (didBreak_w) { whileLoopBroken = true; break; }

            // Always simulate increment (handles continue templates where increment precedes continue)
            if (incrementExpr) {
                const simpleInc = incrementExpr.match(/(\w+)\s*([+\-*])\s*(\d+)/);
                if (simpleInc) {
                    const op = simpleInc[2], val = parseInt(simpleInc[3]);
                    if (op === '+') counterValue += val;
                    else if (op === '-') counterValue -= val;
                    else if (op === '*') counterValue *= val;
                }
            }

            // Loop-back only for normal iterations (continue arrow IS the arc)
            if (!didContinue_w) {
                steps.push({
                    lineNumber: bodyLines[bodyLines.length - 1],
                    code: 'loop-back', type: 'loop-back',
                    toLine: loopInfo.headerLine
                });
            }

            iteration++;
        }

        if (!whileLoopBroken) {
            // Final while-check: FALSE
            const finalCondStr = conditionRaw.replace(new RegExp(`\\b${counterVar}\\b`, 'g'), String(counterValue));
            steps.push({
                lineNumber: loopInfo.headerLine, code: finalCondStr,
                type: 'while-check', conditionStr: finalCondStr, conditionResult: false
            });
            steps.push({ lineNumber: loopInfo.headerLine, code: 'loop-exit', type: 'loop-exit' });
        }
    }

    console.log(`📋 Static plan built: ${steps.length} steps`, steps);
    return steps;
}

// ============ FALLBACK EXPLANATIONS ============
function generateFallbackExplanations(steps) {
    return steps.map((step, idx) => ({
        step: idx,
        line: step.code,
        explanation: getFallbackText(step),
        placeholders: [],
        type: step.type
    }));
}

function getFallbackText(step) {
    switch (step.type) {
        case 'list-assign':   return `Python creates a list and stores it in memory.`;
        case 'loop-enter':    return `We are inside the loop now. Everything outside is on pause.`;
        case 'loop-assign':   return `The loop picks '${step.iterValue}' from the iterable and assigns it to '${step.iterVar}'.`;
        case 'while-check':   return step.conditionResult
            ? `The condition ${step.conditionStr} is TRUE — the loop body executes again.`
            : `The condition ${step.conditionStr} is FALSE — the loop ends!`;
        case 'print':         return `Python displays the value on the screen!`;
        case 'assignment':    return `Python executes: ${step.code}`;
        case 'loop-back':     return `The loop body is done — jumping back to the top!`;
        case 'loop-exit':     return `Loop complete! The world comes back into focus.`;
        case 'loop-break':    return `⛔ break! Python immediately exits the loop — no more iterations.`;
        case 'loop-continue': return `⏭️ continue! Python skips the rest of this iteration and jumps back to the top.`;
        default:              return `Executing: ${step.code}`;
    }
}

// ============ STEP BUTTON ============
document.getElementById('stepBtn').onclick = async () => {
    if (currentStep >= totalSteps) return;

    const stepBtn = document.getElementById('stepBtn');
    stepBtn.disabled = true;
    document.getElementById('backBtn').disabled = true;

    const step = executionPlan[currentStep];
    const stepData = {
        lineNumber: step.lineNumber,
        type: step.type,
        outputElements: [],
        variableElements: [],
        // Snapshot for back button
        previousVariables: { ...currentVariables },
        hadGlass: !!glassState,
        hadEngine: !!engineRef
    };

    try {
        highlightLine(step.lineNumber);

        switch (step.type) {
            case 'list-assign':
                await handleListAssign(step, stepData);
                break;
            case 'loop-enter':
                await handleLoopEnter(step, stepData);
                break;
            case 'loop-assign':
                await handleLoopAssign(step, stepData);
                break;
            case 'while-check':
                await handleWhileCheck(step, stepData);
                break;
            case 'print':
                await handlePrint(step, stepData);
                break;
            case 'assignment':
                await handleAssignment(step, stepData);
                break;
            case 'loop-back':
                await handleLoopBack(step, stepData);
                break;
            case 'loop-exit':
                await handleLoopExit(step, stepData);
                break;
            case 'loop-break':
                await handleBreak(step, stepData);
                break;
            case 'loop-continue':
                await handleContinue(step, stepData);
                break;
            default:
                console.warn('Unknown step type:', step.type);
        }

        stepHistory.push(stepData);
        await showSmartExplanation(currentStep);
        currentStep++;
        updateStepIndicator();
        updateButtons();

        if (currentStep >= totalSteps) {
            setTimeout(() => {
                showTeacher("🎉 Excellent! You've seen how loops work! Try the other tab.");
                document.getElementById('runBtn').disabled = false;
                isRunning = false;
            }, 2000);
        }

        if (currentStep < totalSteps) stepBtn.disabled = false;
        if (currentStep > 0) document.getElementById('backBtn').disabled = false;

    } catch (error) {
        console.error('Step execution error:', error);
        displayError(`Error: ${error.message}`);
        stepBtn.disabled = false;
    }
};

// ============ STEP HANDLERS ============

async function handleListAssign(step, stepData) {
    // Execute in Python
    await pyodide.runPythonAsync(step.code);

    const varMatch = step.code.match(/(\w+)\s*=\s*\[(.+)\]/);
    if (!varMatch) return;

    const varName = varMatch[1];
    const rawItems = varMatch[2];
    const items = rawItems.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));

    const memoryBank = document.getElementById('memoryBank');
    const listElement = renderListTable(varName, items, memoryBank, []);

    stepData.variableElements.push(listElement);
    renderedLists.add(varName);

    // Animate list creation
    await new Promise(resolve => {
        animateListCreation(listElement, items, () => resolve());
    });
}

async function handleLoopEnter(step, stepData) {
    const loopInfo = getLoopInfo();
    if (!loopInfo) return;

    const lastBodyLine = loopInfo.bodyLines[loopInfo.bodyLines.length - 1] || loopInfo.headerLine;
    editor.setOption('styleActiveLine', false);

    // Inject engine box FIRST so that CodeMirror pushes the lines down.
    // This allows showGlassPane to calculate the correct Y-coordinates for the glass overlay.
    if (step.loopType === 'for') {
        engineRef = injectEngineBox(editor, 'for', loopInfo.headerLine, {
            iterVar: step.iterVar,
            iterableName: step.iterableName,
            items: step.items || []
        });
    } else {
        engineRef = injectEngineBox(editor, 'while', loopInfo.headerLine, {
            condition: step.condition || ''
        });
    }
    stepData.engineCreated = true;

    // Show glass pane (calculated using the newly pushed-down line coordinates)
    glassState = showGlassPane(editor, loopInfo.headerLine, lastBodyLine);
    stepData.glassCreated = true;
    updateActiveLine(editor, loopInfo.headerLine);

    showTeacher("🔁 We are inside the loop now. Everything outside is on pause.");
}

async function handleLoopAssign(step, stepData) {
    updateActiveLine(editor, step.lineNumber);

    // Update engine token track
    if (engineRef) {
        updateForEngine(engineRef.element, step.iterIndex);
    }

    stepData.loopAssignData = {
        iterVar: step.iterVar,
        iterValue: step.iterValue,
        iterIndex: step.iterIndex
    };

    // Execute in Python to keep state in sync
    await pyodide.runPythonAsync(`${step.iterVar} = ${JSON.stringify(step.iterValue)}`);

    // Animate: green spark from engine token → memory bank variable box
    const varName = step.iterVar;
    const varValue = step.iterValue;

    // Get origin from the current token in the engine box
    let startX, startY;
    if (engineRef) {
        const currentToken = engineRef.element.querySelector('.token-current');
        if (currentToken) {
            const tokenRect = currentToken.getBoundingClientRect();
            startX = tokenRect.left + tokenRect.width / 2;
            startY = tokenRect.top + tokenRect.height / 2;
        }
    }

    // Fallback origin
    if (!startX) {
        const lineCoords = editor.charCoords({ line: step.lineNumber, ch: 0 }, "page");
        startX = lineCoords.left;
        startY = lineCoords.top;
    }

    // Create or update the variable box
    let box = document.getElementById(`box-${varName}`);
    const isNew = !box;
    if (!box) {
        const bank = document.getElementById('memoryBank');
        box = document.createElement('div');
        box.className = 'variable-box';
        box.id = `box-${varName}`;
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${varValue}</span>`;
        bank.appendChild(box);
        stepData.variableElements.push(box);
    }

    stepData.loopAssignData.isNewBox = isNew;
    stepData.loopAssignData.previousValue = isNew ? null : box.querySelector('.box-value')?.textContent;

    // Animate spark
    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = varValue;
    spark.style.left = `${startX}px`;
    spark.style.top = `${startY}px`;
    document.body.appendChild(spark);

    const targetRect = box.getBoundingClientRect();
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    const trailParticles = createDirectionalTrail(startX, startY, endX, endY, false);

    sounds.whoosh.currentTime = 0;
    sounds.whoosh.play().catch(() => { });

    await new Promise(resolve => {
        gsap.to(spark, {
            left: endX - 40,
            top: endY,
            duration: 1.0,
            ease: "power2.out",
            onUpdate: function () {
                const sparkRect = spark.getBoundingClientRect();
                updateTrailParticles(trailParticles, sparkRect.left + sparkRect.width / 2,
                    sparkRect.top + sparkRect.height / 2, startX, startY);
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trailParticles);

                // Update box value
                box.querySelector('.box-value').textContent = varValue;

                if (isNew) {
                    gsap.to(box, {
                        opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)",
                        onComplete: resolve
                    });
                } else {
                    // Pulse flash for update
                    box.classList.add('pulse-update');
                    setTimeout(() => box.classList.remove('pulse-update'), 500);
                    resolve();
                }
            }
        });
    });

    currentVariables[varName] = varValue;
}

async function handleWhileCheck(step, stepData) {
    updateActiveLine(editor, step.lineNumber);

    stepData.whileCheckData = {
        conditionStr: step.conditionStr,
        conditionResult: step.conditionResult
    };

    if (engineRef) {
        await updateWhileEngine(engineRef.element, step.conditionStr, step.conditionResult);
    }
}

async function handlePrint(step, stepData) {
    updateActiveLine(editor, step.lineNumber);

    // Execute in Python
    await pyodide.runPythonAsync(`output_buffer.truncate(0)\noutput_buffer.seek(0)`);
    await pyodide.runPythonAsync(step.code);
    const output = await pyodide.runPythonAsync('output_buffer.getvalue()');
    const newOutput = output.split('\n').filter(l => l.trim()).pop() || '';

    const outputDiv = document.getElementById('output');
    const outputLine = document.createElement('div');
    outputLine.className = 'output-line';
    outputLine.textContent = newOutput;
    outputLine.style.opacity = '0';
    outputDiv.appendChild(outputLine);
    stepData.outputElements.push(outputLine);

    // Determine the source variable for the spark
    const printMatch = step.code.match(/print\((\w+)\)/);
    let sparkSource = null;

    if (printMatch) {
        const varName = printMatch[1];
        const box = document.getElementById(`box-${varName}`);
        if (box) sparkSource = { element: box, isGold: true };
    }

    if (sparkSource) {
        // Yellow spark from memory bank box → output
        const boxRect = sparkSource.element.getBoundingClientRect();
        const startX = boxRect.left + boxRect.width / 2;
        const startY = boxRect.top + boxRect.height / 2;

        // Glow source box
        sparkSource.element.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.8)';
        setTimeout(() => sparkSource.element.style.boxShadow = '', 1200);

        const spark = document.createElement('div');
        spark.className = 'animation-spark spark-variable';
        spark.textContent = newOutput;
        spark.style.left = `${startX}px`;
        spark.style.top = `${startY}px`;
        document.body.appendChild(spark);

        const outRect = outputLine.getBoundingClientRect();
        const endX = outRect.left + 20;
        const endY = outRect.top;

        const trailParticles = createDirectionalTrail(startX, startY, endX, endY, true);

        sounds.whoosh.currentTime = 0;
        sounds.whoosh.play().catch(() => { });

        await new Promise(resolve => {
            gsap.to(spark, {
                left: endX,
                top: endY,
                duration: 1.0,
                ease: "power2.out",
                onUpdate: function () {
                    const sparkRect = spark.getBoundingClientRect();
                    updateTrailParticles(trailParticles, sparkRect.left + sparkRect.width / 2,
                        sparkRect.top + sparkRect.height / 2, startX, startY);
                },
                onComplete: () => {
                    spark.remove();
                    removeTrail(trailParticles);
                    gsap.to(outputLine, {
                        opacity: 1, x: 0, duration: 0.5, ease: "power2.out",
                        onComplete: resolve
                    });
                }
            });
        });
    } else {
        // Simple fade-in if no source variable found
        await new Promise(resolve => {
            gsap.to(outputLine, {
                opacity: 1, x: 0, duration: 0.5, ease: "power2.out",
                onComplete: resolve
            });
        });
    }
}

async function handleAssignment(step, stepData) {
    updateActiveLine(editor, step.lineNumber);

    const varMatch = step.code.match(/(\w+)\s*=\s*(.+)/);
    if (!varMatch) return;

    const varName = varMatch[1];

    // Execute in Python
    await pyodide.runPythonAsync(step.code);

    // Get the new value from Python
    let varValue;
    try {
        varValue = String(await pyodide.runPythonAsync(varName));
    } catch (e) {
        varValue = varMatch[2]; // Fallback to code text
    }

    const lineCoords = editor.charCoords({ line: step.lineNumber, ch: 0 }, "page");

    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = varValue;
    spark.style.left = `${lineCoords.left}px`;
    spark.style.top = `${lineCoords.top}px`;
    document.body.appendChild(spark);

    let box = document.getElementById(`box-${varName}`);
    const isNew = !box;
    if (!box) {
        const bank = document.getElementById('memoryBank');
        box = document.createElement('div');
        box.className = 'variable-box';
        box.id = `box-${varName}`;
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${varValue}</span>`;
        bank.appendChild(box);
        stepData.variableElements.push(box);
    }

    stepData.assignmentData = {
        varName,
        isNewBox: isNew,
        previousValue: isNew ? null : box.querySelector('.box-value')?.textContent
    };

    const targetRect = box.getBoundingClientRect();
    const startX = lineCoords.left;
    const startY = lineCoords.top;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    const trailParticles = createDirectionalTrail(startX, startY, endX, endY, false);

    sounds.whoosh.currentTime = 0;
    sounds.whoosh.play().catch(() => { });

    await new Promise(resolve => {
        gsap.to(spark, {
            left: endX - 40,
            top: endY,
            duration: 1.2,
            ease: "power2.out",
            onUpdate: function () {
                const sparkRect = spark.getBoundingClientRect();
                updateTrailParticles(trailParticles, sparkRect.left + sparkRect.width / 2,
                    sparkRect.top + sparkRect.height / 2, startX, startY);
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trailParticles);

                box.querySelector('.box-value').textContent = varValue;

                if (isNew) {
                    gsap.to(box, {
                        opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)",
                        onComplete: resolve
                    });
                } else {
                    box.classList.add('pulse-update');
                    setTimeout(() => box.classList.remove('pulse-update'), 500);
                    resolve();
                }
            }
        });
    });

    currentVariables[varName] = varValue;
}

async function handleLoopBack(step, stepData) {
    const loopInfo = getLoopInfo();
    if (!loopInfo) return;

    const fromLine = step.lineNumber;
    const toLine = step.toLine !== undefined ? step.toLine : loopInfo.headerLine;

    stepData.loopBackData = { fromLine, toLine };

    await animateLoopBack(editor, fromLine, toLine);
    updateActiveLine(editor, loopInfo.headerLine);
}

async function handleLoopExit(step, stepData) {
    stepData.loopExitData = true;

    // Dissolve glass pane
    if (glassState) {
        await dissolveGlassPane(glassState.glassPaneEl, editor, glassState.frostedMarks, glassState.activeLoopMarks);
        glassState = null;
    }
    editor.setOption('styleActiveLine', true);
    updateActiveLine(editor, null);

    // Remove engine box
    if (engineRef) {
        await removeEngineBox(engineRef);
        engineRef = null;
    }

    showTeacher("🎉 Loop complete! The world comes back into focus.");
}

async function handleBreak(step, stepData) {
    updateActiveLine(editor, step.lineNumber);

    // Save enough state for Back to reconstruct the glass + engine
    stepData.loopBreakData = {
        hadGlass:  !!glassState,
        hadEngine: !!engineRef
    };

    // 1. Red escape arrow shoots out of the glass pane
    const endLine = step.loopEndLine !== undefined ? step.loopEndLine : step.lineNumber;
    await animateBreakArrow(editor, step.lineNumber, endLine);

    // 2. Flash glass pane border red
    if (glassState && glassState.glassPaneEl) {
        glassState.glassPaneEl.classList.add('break-flash');
        await new Promise(r => setTimeout(r, 300));
        glassState.glassPaneEl.classList.remove('break-flash');
    }

    // 3. Dissolve glass pane
    if (glassState) {
        await dissolveGlassPane(glassState.glassPaneEl, editor, glassState.frostedMarks, glassState.activeLoopMarks);
        glassState = null;
    }
    editor.setOption('styleActiveLine', true);
    updateActiveLine(editor, null);

    // 4. Shatter (not fade) the engine box
    if (engineRef) {
        await disintegrateEngineBox(engineRef);
        engineRef = null;
    }

    showTeacher("⛔ break! The loop was forcefully stopped and exits immediately!");
}

async function handleContinue(step, stepData) {
    updateActiveLine(editor, step.lineNumber);

    stepData.loopContinueData = {
        fromLine: step.lineNumber,
        toLine:   step.toLine
    };

    // Amber arc arrow back to loop header
    await animateContinueArrow(editor, step.lineNumber, step.toLine);
    updateActiveLine(editor, step.toLine);

    showTeacher("⏭️ continue! Python skips the rest of this iteration and jumps back to the top.");
}

// ============ BACK BUTTON ============
document.getElementById('backBtn').onclick = async () => {
    if (currentStep === 0) return;

    document.getElementById('backBtn').disabled = true;
    document.getElementById('stepBtn').disabled = true;

    currentStep--;
    const lastStepData = stepHistory.pop();

    if (lastStepData) {
        // Reverse output elements
        lastStepData.outputElements.forEach(el => {
            gsap.to(el, { opacity: 0, x: -20, duration: 0.3, onComplete: () => el.remove() });
        });

        // Reverse variable elements (newly created boxes)
        for (const el of lastStepData.variableElements) {
            if (el.classList && el.classList.contains('list-container')) {
                const varName = el.dataset.varName;
                if (varName) renderedLists.delete(varName);
                await new Promise(resolve => reverseListCreation(el, () => resolve()));
            } else {
                gsap.to(el, { opacity: 0, scale: 0.5, duration: 0.3, onComplete: () => el.remove() });
            }
        }

        // Reverse loop-assign (restore previous variable value or remove box)
        if (lastStepData.loopAssignData) {
            const { iterVar, previousValue, isNewBox } = lastStepData.loopAssignData;
            if (isNewBox) {
                // Box was already removed by variableElements cleanup above
            } else if (previousValue !== null) {
                const box = document.getElementById(`box-${iterVar}`);
                if (box) {
                    box.querySelector('.box-value').textContent = previousValue;
                }
            }
            // Reverse engine token
            if (engineRef && lastStepData.loopAssignData.iterIndex > 0) {
                updateForEngine(engineRef.element, lastStepData.loopAssignData.iterIndex - 1);
            }
            currentVariables[iterVar] = previousValue || '';
        }

        // Reverse assignment (restore previous value or remove box)
        if (lastStepData.assignmentData) {
            const { varName, previousValue, isNewBox } = lastStepData.assignmentData;
            if (!isNewBox && previousValue !== null) {
                const box = document.getElementById(`box-${varName}`);
                if (box) {
                    box.querySelector('.box-value').textContent = previousValue;
                }
            }
            currentVariables[varName] = previousValue || '';

            // Reverse Python state
            try {
                if (previousValue !== null) {
                    await pyodide.runPythonAsync(`${varName} = ${previousValue}`);
                }
            } catch (e) {
                console.warn('Could not reverse Python state:', e);
            }
        }

        // Reverse loop-enter (remove glass + engine)
        if (lastStepData.glassCreated) {
            if (glassState) {
                await dissolveGlassPane(glassState.glassPaneEl, editor, glassState.frostedMarks, glassState.activeLoopMarks);
                glassState = null;
            }
        }
        if (lastStepData.engineCreated) {
            if (engineRef) {
                await removeEngineBox(engineRef);
                engineRef = null;
            }
        }

        // Reverse loop-exit OR loop-break (re-create glass + engine to go back inside loop)
        if (lastStepData.loopExitData || lastStepData.loopBreakData) {
            const loopInfo = getLoopInfo();
            if (loopInfo) {
                const lastBodyLine = loopInfo.bodyLines[loopInfo.bodyLines.length - 1] || loopInfo.headerLine;

                const needGlass  = lastStepData.loopExitData || lastStepData.loopBreakData.hadGlass;
                const needEngine = lastStepData.loopExitData || lastStepData.loopBreakData.hadEngine;

                if (needGlass)  glassState = showGlassPane(editor, loopInfo.headerLine, lastBodyLine);

                if (needEngine) {
                    const enterStep = executionPlan.find(s => s.type === 'loop-enter');
                    if (enterStep) {
                        if (enterStep.loopType === 'for') {
                            engineRef = injectEngineBox(editor, 'for', loopInfo.headerLine, {
                                iterVar: enterStep.iterVar,
                                iterableName: enterStep.iterableName,
                                items: enterStep.items || []
                            });
                            const lastAssignIdx = findLastIterIndex();
                            if (lastAssignIdx >= 0) updateForEngine(engineRef.element, lastAssignIdx);
                        } else {
                            engineRef = injectEngineBox(editor, 'while', loopInfo.headerLine, {
                                condition: enterStep.condition || ''
                            });
                        }
                    }
                }
            }
        }

        // Highlight current line
        if (currentStep > 0) {
            highlightLine(executionPlan[currentStep - 1].lineNumber);
            showSmartExplanation(currentStep - 1);
        } else {
            if (currentLineMarker !== null) {
                editor.removeLineClass(currentLineMarker, 'wrap', 'step-line-highlight');
            }
            showTeacher("Back to the start. Click 'Next Step' to begin again.");
        }
    }

    updateStepIndicator();
    updateButtons();
};

function findLastIterIndex() {
    // Find the most recent loop-assign in stepHistory
    for (let i = stepHistory.length - 1; i >= 0; i--) {
        if (stepHistory[i].loopAssignData) {
            return stepHistory[i].loopAssignData.iterIndex;
        }
    }
    return -1;
}

// ============ RESET BUTTON ============
document.getElementById('resetBtn').onclick = async () => {
    editor.setValue(tabTemplates[currentTab]);
    setupLineLocking();
    await resetExecution();
};

// ============ HELPER: Get loop info from current code ============
function getLoopInfo() {
    const code = editor.getValue();
    const codeLines = code.split('\n');
    let loopInfo = null;

    for (let i = 0; i < codeLines.length; i++) {
        const trimmed = codeLines[i].trim();
        if (trimmed.startsWith('for ') && trimmed.endsWith(':')) {
            const m = trimmed.match(/^for\s+(\w+)\s+in\s+(\w+)\s*:/);
            if (m) {
                loopInfo = { type: 'for', headerLine: i, iterVar: m[1], iterableName: m[2], bodyLines: [] };
            }
        } else if (trimmed.startsWith('while ') && trimmed.endsWith(':')) {
            const m = trimmed.match(/^while\s+(.+)\s*:/);
            if (m) {
                loopInfo = { type: 'while', headerLine: i, condition: m[1], bodyLines: [] };
            }
        } else if (loopInfo && codeLines[i].match(/^\s+/) && i > loopInfo.headerLine) {
            loopInfo.bodyLines.push(i);
        }
    }

    return loopInfo;
}

// ============ SVG TRAIL SYSTEM (from lvl3) ============
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

// ============ UI HELPERS ============
function highlightLine(lineNum) {
    if (currentLineMarker !== null) {
        editor.removeLineClass(currentLineMarker, 'wrap', 'step-line-highlight');
    }
    editor.addLineClass(lineNum, 'wrap', 'step-line-highlight');
    currentLineMarker = lineNum;
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
    sounds.notification.play().catch(() => { });
}

async function showSmartExplanation(stepIndex) {
    if (!preloadedExplanations[stepIndex]) {
        const step = executionPlan[stepIndex];
        if (step) showTeacher(getFallbackText(step));
        return;
    }

    let explanation = preloadedExplanations[stepIndex].explanation;
    const placeholders = preloadedExplanations[stepIndex].placeholders || [];

    placeholders.forEach(p => {
        if (currentVariables[p]) {
            explanation = explanation.replace(new RegExp(`\\{\\{${p}\\}\\}`, 'g'), currentVariables[p]);
        }
    });

    Object.keys(currentVariables).forEach(v => {
        explanation = explanation.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), currentVariables[v]);
    });

    showTeacher(explanation);
}

function displayError(message) {
    const outputDiv = document.getElementById('output');
    const errorLine = document.createElement('div');
    errorLine.className = 'output-line error';
    errorLine.textContent = `❌ ${message}`;
    outputDiv.appendChild(errorLine);
    gsap.to(errorLine, { opacity: 1, x: 0, duration: 0.5 });
}

function updateStepIndicator() {
    document.getElementById('stepIndicator').textContent =
        isRunning ? `Step ${currentStep}/${totalSteps}` : 'Ready to run...';
}

function updateButtons() {
    document.getElementById('backBtn').disabled = (currentStep === 0);
    document.getElementById('stepBtn').disabled = (currentStep >= totalSteps);
}
