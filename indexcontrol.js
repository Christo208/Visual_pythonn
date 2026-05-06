/* ===================================
   Unified Visual Python Editor
   =================================== */

// Register GSAP plugins (Hard-fix for MotionPathPlugin)
try {
    if (typeof gsap !== 'undefined') {
        if (typeof MotionPathPlugin !== 'undefined') {
            gsap.registerPlugin(MotionPathPlugin);
            console.log("🚀 GSAP MotionPathPlugin registered successfully.");
        } else {
            console.warn("⚠️ MotionPathPlugin not found in global scope. Append/Insert animations may skip drawing.");
        }
    }
} catch (e) { console.error("GSAP Plugin Error:", e); }

// ============ LIST VISUALIZER IMPORTS (Level 7 shared modules) ============
import { isListVariable, parseListContents } from './levels/shared/list/listDetector.js';
import { renderListTable, updateListTable } from './levels/shared/list/listRenderer.js';
import {
    animateListCreation,
    reverseListCreation,
    initializePianoSynth,
    initializeListSounds,
    animatePrintElement as animatePrintListElement,
    animatePrintEntireList,
    animatePrintInvalidIndex,
    animateShallowCopy,
    getListAliases
} from './levels/shared/list/listAnimations.js';
import {
    animateLen,
    animateIndex,
    animateCount,
    initializeScanSynth,
    initializeChordSynth,
    cleanupLenCounters,
    cleanupIndexDivs,
    cleanupCountDivs,
    animatePrintString
} from './levels/shared/list/listFactsAnimations.js';
import {
    animatePop,
    cleanupPopElements,
    animateRemove_v1,
    cleanupRemoveElements_v1,
    animateReverse,
    cleanupReverseElements,
    initializeScanSynth as initModScanSynth,
    initializeChordSynth as initModChordSynth,
    animateAppendImproved,
    animateInsert,
    animateClear,
    cleanupClearElements,
    animateSort,
    animateSortMismatch,
    cleanupSortElements
} from './levels/shared/list/listModificationAnimations.js';

// ============ LOOP VISUALS (Level 8) ============
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
} from './levels/lvl8-loops/glassAnimations.js';

// ============ GLOBAL VARIABLES ============
let editor;
let pyodide = null;
let currentStep = 0;
let totalSteps = 0;
let isRunning = false;
let isCompleted = false; // PHASE 3: Completion state (separate from isRunning)
let activeInnerSteps = 0;
let abortSignal = 0;
let animationHistory = [];
let stepAnimations = [];
let executionPlan = [];
let currentVariables = {};
let currentLineMarker = null;
let smartExplanations = [];
let allUserInputs = []; // FIXED BUG 3.1: Track all user inputs for placeholder logic
let isExplainingLoading = false;
let loadingFactInterval = null;

const loadingFacts = [
    "Python reads your code top-to-bottom like a story.",
    "Indentation is Python's way of saying 'this belongs together'.",
    "for loops are like a playlist: one item at a time.",
    "while loops keep going until the condition says 'stop!'.",
    "print() is Python's way of talking to the screen.",
    "Variables are labeled boxes that can hold any kind of treasure.",
    "Lists are flexible—add, remove, shuffle—no problem.",
    "len() just counts how many things are inside.",
    "if/elif/else is Python choosing the first true path.",
    "Errors are Python's way of saying 'wait...something's off.'"
];

// ============ LOOP VISUAL STATE ============
let glassState = null;   // { glassPaneEl, frostedMarks, activeLoopMarks }
let engineRef = null;    // { widget, element }
let loopStepHistory = [];
let loopVisualStack = [];

// ============ LIST VISUALIZER STATE ============
let renderedLists = new Set();
let listAliasMap = new Map(); // primaryName -> [aliases...]
let listStepHistory = [];     // aligns with executed steps (for Back undo)

function formatListForPlaceholder(items) {
    const formatted = items.map(item => {
        const trimmed = String(item);
        const isNum = trimmed !== '' && !isNaN(trimmed);
        const isBool = trimmed === 'True' || trimmed === 'False' || trimmed === 'None';
        return (isNum || isBool) ? trimmed : `"${trimmed}"`;
    });
    return `[${formatted.join(', ')}]`;
}

function resolveListContainer(varName) {
    let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
    if (listContainer) return listContainer;
    const allContainers = document.querySelectorAll('.list-container');
    for (const container of allContainers) {
        const aliases = getListAliases(container);
        if (aliases.includes(varName)) return container;
    }
    return null;
}

function getPrimaryListName(varName) {
    if (listAliasMap.has(varName)) return varName;
    for (const [primary, aliases] of listAliasMap.entries()) {
        if (Array.isArray(aliases) && aliases.includes(varName)) return primary;
    }
    return null;
}

function isAliasName(varName) {
    const primary = getPrimaryListName(varName);
    return !!primary && primary !== varName;
}

async function clearPyodideUserGlobals() {
    if (!pyodide) return;
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

async function resetLoopVisuals() {
    while (loopVisualStack.length > 0) {
        const frame = loopVisualStack.pop();
        if (frame?.glassState?.glassPaneEl) {
            try {
                await dissolveGlassPane(frame.glassState.glassPaneEl, editor,
                    frame.glassState.frostedMarks, frame.glassState.activeLoopMarks);
            } catch (e) { /* ignore */ }
        }
        if (frame?.engineRef) {
            try {
                await removeEngineBox(frame.engineRef);
            } catch (e) { /* ignore */ }
        }
    }

    glassState = null;
    engineRef = null;
    updateActiveLine(editor, null);
}

function showExplanationLoading() {
    const overlay = document.getElementById('explainLoading');
    const factEl = document.getElementById('loadingFact');
    if (!overlay || !factEl) return;

    const factPool = [...loadingFacts];
    for (let i = factPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [factPool[i], factPool[j]] = [factPool[j], factPool[i]];
    }
    let idx = 0;
    factEl.textContent = factPool[idx];
    overlay.classList.remove('hidden');

    if (loadingFactInterval) clearInterval(loadingFactInterval);
    loadingFactInterval = setInterval(() => {
        idx++;
        if (idx >= factPool.length) {
            for (let i = factPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [factPool[i], factPool[j]] = [factPool[j], factPool[i]];
            }
            idx = 0;
        }
        factEl.classList.remove('fade-in');
        void factEl.offsetWidth;
        factEl.textContent = factPool[idx];
        factEl.classList.add('fade-in');
    }, 10000);
}

function hideExplanationLoading() {
    const overlay = document.getElementById('explainLoading');
    if (overlay) overlay.classList.add('hidden');
    if (loadingFactInterval) {
        clearInterval(loadingFactInterval);
        loadingFactInterval = null;
    }
}

// ============ SOUND EFFECTS ============
const sounds = {
    keystroke: new Audio(new URL('levels/sounds/keystroke.wav', import.meta.url).href),
    enter: new Audio(new URL('levels/sounds/enter.wav', import.meta.url).href),
    notification: new Audio(new URL('levels/sounds/notification.wav', import.meta.url).href),
    whoosh: new Audio(new URL('levels/sounds/whoosh.wav', import.meta.url).href),
    machineGear: new Audio(new URL('levels/sounds/gear.mp3', import.meta.url).href),
    inputFail: new Audio(new URL('levels/sounds/inputfail.wav', import.meta.url).href)
};

sounds.keystroke.volume = 0.2;
sounds.enter.volume = 0.4;
sounds.notification.volume = 0.3;
sounds.whoosh.volume = 0.5;
sounds.inputFail.volume = 0.5;
sounds.machineGear.volume = 1.0;
sounds.machineGear.playbackRate = 1.33;

// ============ INITIALIZATION ============
window.onload = async () => {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        mode: "python",
        theme: "monokai",
        lineNumbers: true,
        placeholder: "# Let the coding fun begin...\n# Enter any code you desire",
        readOnly: false
    });

    // Expose editor for inline scripts (e.g. chatbot in indexcontrol.html)
    window.editor = editor;

    editor.setValue('');
    // No line restrictions applied

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

        // Expose for inline scripts + debugging
        window.pyodide = pyodide;

        // Initialize shared List (Level 7) sounds/synths
        initializePianoSynth();
        initializeListSounds();
        initializeScanSynth();
        initializeChordSynth();
        initModScanSynth();
        initModChordSynth();
    } catch (error) {
        output.innerHTML = `<span class="error">❌ Failed to load Python: ${error.message}</span>`;
    }
}

// ============ RUN BUTTON ============
document.getElementById('runBtn').onclick = async () => {
    if (isRunning) return;
    isRunning = true;
    isCompleted = false; // PHASE 3: Reset completion state
    currentStep = 0;
    animationHistory = [];
    stepAnimations = [];
    executionPlan = [];
    currentVariables = {};
    smartExplanations = [];
    allUserInputs = []; // Clear previous inputs state on run
    activeInnerSteps = 0;
    abortSignal++;

    // Reset List (Level 7) state + cleanup leftover overlays
    cleanupLenCounters();
    cleanupIndexDivs();
    cleanupCountDivs();
    cleanupPopElements();
    cleanupRemoveElements_v1();
    cleanupReverseElements();
    cleanupSortElements();
    cleanupClearElements();
    renderedLists.clear();
    listAliasMap.clear();
    listStepHistory = [];
    loopStepHistory = [];
    await resetLoopVisuals();
    await clearPyodideUserGlobals();

    editor.setOption("readOnly", true);
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stepBtn').disabled = true;
    document.getElementById('output').textContent = '⏳ Analyzing code...';
    document.getElementById('memoryBank').innerHTML = '';

    isExplainingLoading = true;
    showExplanationLoading();

    const rawLines = editor.getValue().split('\n');

    // Build pure code list for AI (no blanks, no comments) BUT preserve original editor line numbers.
    // This is critical for syncing AI explanations with runtime execution steps.
    const lineItemsForServer = [];
    rawLines.forEach((line, idx) => {
        const t = line.trim();
        if (t && !t.startsWith('#')) lineItemsForServer.push({ lineNumber: idx + 1, code: line });
    });

    // Build recursive execution plan (handles sequential + nested if/elif/else)
    const parsedAST = buildExecutionPlan(rawLines);
    executionPlan = parsedAST.plan;
    totalSteps = executionPlan.length;

    // PRE-FETCH EXPLANATIONS FROM SMART BACKEND
    try {
        console.log("Fetching SMART explanations from backend...");

        // Always talk to the Node backend on port 3000 (frontend may be served from file:// or another port).
        const apiBase =
            (typeof location !== 'undefined' && location && location.hostname)
                ? `${location.protocol}//${location.hostname}:3000`
                : 'http://localhost:3000';

        const response = await fetch(`${apiBase}/generate-smart-tutorial-explanation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullCode: rawLines.join('\n'),
                lineItems: lineItemsForServer,
                mode: 'solution'
            })
        });

        if (!response.ok) throw new Error("API Connection Failed");
        const data = await response.json();

        smartExplanations = data.explanations || [];
        console.log(`✅ Stored ${smartExplanations.length} smart explanations (lineNumber-aware)`);
        console.log("Successfully fetched and cached explanations.");
    } catch (error) {
        console.error("❌ Fetch Error (Is your server.js running on Port 3000?):", error);
        smartExplanations = [];
    } finally {
        isExplainingLoading = false;
        hideExplanationLoading();
        document.getElementById('stepBtn').disabled = false;
    }

    document.getElementById('output').textContent = '';
    updateStepIndicator();
    showTeacher("✅ Code validated! Click 'Next Step' to execute the python lines one by one.");
};

// ============ STEP BUTTON ============
document.getElementById('stepBtn').onclick = async () => {
    if (activeInnerSteps > 0 || !isRunning || isExplainingLoading) return;

    // If we've reached the end, show celebration but don't block navigation
    if (currentStep >= totalSteps) {
        showTeacher("🎉 Excellent! You've learned how Python executes this step-by-step!");
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
        return;
    }

    const stepBtn = document.getElementById('stepBtn');
    stepBtn.disabled = true;

    const step = executionPlan[currentStep];
    stepAnimations[currentStep] = [];
    highlightLine(step.lineNumber);

    const finalizeStep = (listData = null, loopData = null) => {
        // DEBUG: Verify timing - currentVariables should be populated HERE before calling generateStepExplanation
        const varsPopulated = Object.keys(currentVariables).length;
        console.log(`[TIMING DEBUG] finalizeStep called. currentVariables has ${varsPopulated} entries:`, currentVariables);

        listStepHistory.push(listData);
        loopStepHistory.push(loopData);
        generateStepExplanation(step);
        currentStep++;
        updateStepIndicator();
        updateButtons();
        if (currentStep < totalSteps) stepBtn.disabled = false;
    };

    try {
        if (step.type === 'input') {
            await handleInputStatement(step);
            finalizeStep(null, null);
        } else if (step.type === 'if-block') {
            // If we previously injected lines here, remove them first (prevents duplicates on Back->Next)
            if (step.numInjected > 0) {
                executionPlan.splice(currentStep + 1, step.numInjected);
            }

            const branchResult = await executeIfStep(step);
            if (branchResult && branchResult.branchLines && branchResult.branchLines.length > 0) {
                // PHASE 2: Store condition result on step for narration
                step.chosenBranchIndex = branchResult.chosenBranchIndex;
                step.chosenConditionType = branchResult.chosenConditionType;
                step.chosenConditionExpr = branchResult.chosenConditionExpr;
                step.conditionResult = branchResult.conditionResult;

                step.numInjected = branchResult.branchLines.length;
                // INJECT the branch lines into the main plan
                executionPlan.splice(currentStep + 1, 0, ...branchResult.branchLines);
                totalSteps = executionPlan.length;
            } else {
                step.numInjected = 0;
            }

            finalizeStep(null, null);
        } else if (step.type === 'loop-block') {
            const loopData = await executeLoopStep(step);
            finalizeStep(null, loopData);
        } else if (step.type === 'loop-assign') {
            const loopData = await handleLoopAssign(step);
            finalizeStep(null, loopData);
        } else if (step.type === 'while-check') {
            const loopData = await handleWhileCheck(step);
            finalizeStep(null, loopData);
        } else if (step.type === 'loop-back') {
            const loopData = await handleLoopBack(step);
            finalizeStep(null, loopData);
        } else if (step.type === 'loop-exit') {
            const loopData = await handleLoopExit(step);
            finalizeStep(null, loopData);
        } else if (step.type === 'loop-break') {
            const loopData = await handleLoopBreak(step);
            finalizeStep(null, loopData);
        } else if (step.type === 'loop-continue') {
            const loopData = await handleLoopContinue(step);
            finalizeStep(null, loopData);
        } else {
            const listData = await executeLineStepWithLists(step);
            finalizeStep(listData, null);
        }

    } catch (error) {
        if (error && error._handled) {
            await generateErrorExplanation(error, step.code, step.lineNumber);
            isRunning = false;
            stepBtn.disabled = true;
            editor.setOption('readOnly', false);
            updateButtons();
            return;
        }

        await generateErrorExplanation(error, step.code, step.lineNumber);
        stepBtn.disabled = true;
    }
};

// ============ LINE STEP EXECUTION (List-aware wrapper) ============
async function executeLineStepWithLists(step) {
    const makeHandledError = (message) => {
        const err = new Error(message);
        err._handled = true;
        return err;
    };

    // Default to "no special list undo"
    let listDataForUndo = null;

    // PRINT: run Python, extract output, animate (list-aware)
    if (step.type === 'print') {
        try {
            await pyodide.runPythonAsync(step.code);
            const output = await pyodide.runPythonAsync('output_buffer.getvalue()');
            const newOutput = output.split('\n').filter(l => l.trim()).pop() || '';
            await pyodide.runPythonAsync('output_buffer.truncate(0); output_buffer.seek(0)');

            // 1) print(len(list))
            {
                const lenMatch = step.code.match(/print\s*\(\s*len\s*\(\s*(\w+)\s*\)\s*\)/);
                if (lenMatch) {
                    const varName = lenMatch[1];
                    const listContainer = resolveListContainer(varName);
                    if (listContainer) {
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        const action = { type: 'output', element: outputLine, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);

                        document.getElementById('backBtn').disabled = true;

                        await new Promise(resolve => {
                            animateLen(listContainer, outputDiv, newOutput, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        return { isLenStep: true };
                    }
                }
            }

            // 2) print(list.index(...))
            {
                const indexMatch = step.code.match(/print\s*\(\s*(\w+)\.index\s*\(\s*["']?(.+?)["']?(?:\s*,\s*(-?\d+))?(?:\s*,\s*(-?\d+))?\s*\)\s*\)/);
                if (indexMatch) {
                    const varName = indexMatch[1];
                    const searchValue = indexMatch[2];
                    const startParam = indexMatch[3] ? parseInt(indexMatch[3]) : null;
                    const stopParam = indexMatch[4] ? parseInt(indexMatch[4]) : null;
                    const listContainer = resolveListContainer(varName);
                    if (listContainer) {
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        const action = { type: 'output', element: outputLine, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);

                        document.getElementById('backBtn').disabled = true;

                        await new Promise(resolve => {
                            animateIndex(listContainer, searchValue, startParam, stopParam, outputDiv, newOutput, false, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        return { isIndexStep: true };
                    }
                }
            }

            // 3) print(list.count("x"))
            {
                const countMatch = step.code.match(/print\s*\(\s*(\w+)\.count\s*\(\s*["'](.+?)["']\s*\)\s*\)/);
                if (countMatch) {
                    const varName = countMatch[1];
                    const searchValue = countMatch[2];
                    const listContainer = resolveListContainer(varName);
                    if (listContainer) {
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        const action = { type: 'output', element: outputLine, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);

                        document.getElementById('backBtn').disabled = true;

                        await new Promise(resolve => {
                            animateCount(listContainer, searchValue, outputDiv, newOutput, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        return { isCountStep: true };
                    }
                }
            }

            // 4) print(list[index])
            {
                const printElementMatch = step.code.match(/print\s*\(\s*(\w+)\s*\[\s*(-?\d+)\s*\]\s*\)/);
                if (printElementMatch) {
                    const varName = printElementMatch[1];
                    const index = parseInt(printElementMatch[2]);
                    const listContainer = resolveListContainer(varName);
                    if (listContainer) {
                        const rows = listContainer.querySelectorAll('.list-row');
                        const actualIndex = index < 0 ? rows.length + index : index;

                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        const action = { type: 'output', element: outputLine, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);

                        document.getElementById('backBtn').disabled = true;

                        await new Promise(resolve => {
                            animatePrintListElement(listContainer, actualIndex, outputDiv, newOutput, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        return null;
                    }
                }
            }

            // 5) print(list)
            {
                const printListMatch = step.code.match(/print\s*\(\s*(\w+)\s*\)/);
                if (printListMatch) {
                    const varName = printListMatch[1];
                    const listContainer = resolveListContainer(varName);
                    if (listContainer) {
                        const contentCells = listContainer.querySelectorAll('.list-content-cell');
                        const items = Array.from(contentCells).map(cell => {
                            const text = cell.textContent.trim();
                            return text.startsWith('"') ? text.slice(1, -1) : text;
                        });

                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        const action = { type: 'output', element: outputLine, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);

                        document.getElementById('backBtn').disabled = true;

                        await new Promise(resolve => {
                            animatePrintEntireList(listContainer, items, outputDiv, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        return null;
                    }
                }
            }

            // 6) print("string")
            {
                const printStringMatch = step.code.match(/print\s*\(\s*["'].+?["']\s*\)/);
                if (printStringMatch) {
                    const outputDiv = document.getElementById('output');
                    const outputLine = document.createElement('div');
                    outputLine.className = 'output-line';
                    outputLine.textContent = newOutput;
                    outputLine.style.opacity = '1';
                    outputDiv.appendChild(outputLine);

                    const action = { type: 'output', element: outputLine, isNew: true };
                    animationHistory.push(action);
                    stepAnimations[currentStep].push(action);

                    document.getElementById('backBtn').disabled = true;

                    await new Promise(resolve => {
                        animatePrintString(step.code, outputDiv, newOutput, () => resolve());
                    });

                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                    return null;
                }
            }

            // Fallback: old spark print
            await animatePrint(step, newOutput);
            return listDataForUndo;

        } catch (error) {
            // Teach-friendly list errors (like Level 7)
            const isIndexError = error.message && error.message.includes('IndexError');
            if (isIndexError) {
                const printMatch = step.code.match(/print\s*\(\s*(\w+)\s*\[\s*(-?\d+)\s*\]\s*\)/);
                if (printMatch) {
                    const varName = printMatch[1];
                    const index = parseInt(printMatch[2]);
                    const listContainer = resolveListContainer(varName);
                    if (listContainer) {
                        const validIndexCount = listContainer.querySelectorAll('.list-row').length;
                        const outputDiv = document.getElementById('output');
                        const errorLine = document.createElement('div');
                        errorLine.className = 'output-line error';
                        errorLine.textContent = `IndexError: list index out of range`;
                        errorLine.style.opacity = '1';
                        outputDiv.appendChild(errorLine);

                        const action = { type: 'output', element: errorLine, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);

                        document.getElementById('backBtn').disabled = true;

                        await new Promise(resolve => {
                            animatePrintInvalidIndex(listContainer, index, validIndexCount, outputDiv, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        throw makeHandledError('IndexError: list index out of range');
                    }
                }
            }

            const isNotInList = error.message && error.message.includes('not in list');
            if (isNotInList) {
                const indexMatch = step.code.match(/print\s*\(\s*(\w+)\.index\s*\(\s*["'](.+?)["'](?:\s*,\s*(-?\d+))?(?:\s*,\s*(-?\d+))?\s*\)\s*\)/);
                if (indexMatch) {
                    const varName = indexMatch[1];
                    const searchValue = indexMatch[2];
                    const startParam = indexMatch[3] ? parseInt(indexMatch[3]) : null;
                    const stopParam = indexMatch[4] ? parseInt(indexMatch[4]) : null;
                    const listContainer = resolveListContainer(varName);
                    if (listContainer) {
                        const outputDiv = document.getElementById('output');
                        const errorLine = document.createElement('div');
                        errorLine.className = 'output-line error';
                        errorLine.textContent = `ValueError: '${searchValue}' is not in list`;
                        errorLine.style.opacity = '1';
                        outputDiv.appendChild(errorLine);

                        const action = { type: 'output', element: errorLine, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);

                        document.getElementById('backBtn').disabled = true;

                        await new Promise(resolve => {
                            animateIndex(listContainer, searchValue, startParam, stopParam, outputDiv, errorLine, true, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        throw makeHandledError(`ValueError: '${searchValue}' is not in list`);
                    }
                }
            }

            throw error;
        }
    }

    // ASSIGNMENT (list-aware): run Python, capture globals, render lists, animate assignment
    const trimmed = step.code.trim();

    // ----------------------------
    // LIST MODIFICATION SHORTCUTS
    // ----------------------------

    // (M8) Shallow copy / alias creation: b = a or b = a.copy()
    if (step.type === 'assignment') {
        const shallowCopyMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)(?:\.copy\(\))?$/);
        if (shallowCopyMatch) {
            const newVar = shallowCopyMatch[1];
            const sourceVar = shallowCopyMatch[2];
            const existingContainer = resolveListContainer(sourceVar);
            if (existingContainer) {
                await pyodide.runPythonAsync(step.code);

                document.getElementById('backBtn').disabled = true;

                const currentAliases = getListAliases(existingContainer);
                await new Promise(resolve => {
                    animateShallowCopy(existingContainer, newVar, currentAliases, () => resolve());
                });

                const primaryName = existingContainer.dataset.varName;
                const updatedAliases = getListAliases(existingContainer);
                listAliasMap.set(primaryName, updatedAliases);

                // Update placeholders
                try {
                    const pyValue = await pyodide.runPythonAsync(primaryName);
                    const items = parseListContents(pyValue);
                    currentVariables[primaryName] = formatListForPlaceholder(items);
                    currentVariables[newVar] = formatListForPlaceholder(items);
                } catch { }

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                return { shallowCopy: { newVar, primaryName, container: existingContainer } };
            }
        }
    }

    // pop()
    {
        const popMatch = trimmed.match(/(\w+)\.pop\s*\(\s*(?:(-?\d+))?\s*\)/);
        if (popMatch) {
            const varName = popMatch[1];
            const requestedIndex = popMatch[2] ? parseInt(popMatch[2]) : -1;
            const listContainer = resolveListContainer(varName);
            if (listContainer) {
                // coords inside pop(
                let startCoords = { x: 200, y: 200 };
                try {
                    const popIdx = step.code.indexOf('.pop(');
                    if (popIdx !== -1) {
                        const charPos = popIdx + 5;
                        const coords = editor.charCoords({ line: step.lineNumber, ch: charPos }, 'page');
                        startCoords = { x: coords.left, y: coords.top + 10 };
                    }
                } catch { }

                let resultValue = null;
                let isError = false;
                let actualIndex = -1;

                try {
                    const listLen = await pyodide.runPythonAsync(`len(${varName})`);
                    actualIndex = popMatch[2] === undefined ? (listLen - 1) : (requestedIndex < 0 ? listLen + requestedIndex : requestedIndex);
                    const pyResult = await pyodide.runPythonAsync(step.code);
                    resultValue = String(pyResult);
                } catch {
                    isError = true;
                    resultValue = 'IndexError';
                }

                document.getElementById('backBtn').disabled = true;

                await new Promise(resolve => {
                    animatePop(listContainer, actualIndex, null, resultValue, isError, startCoords, () => resolve());
                });

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                if (isError) {
                    throw makeHandledError('IndexError: pop index out of range');
                }

                // PHASE 1 FIX: Update currentVariables before returning
                const varsJs_pop = pyodide.globals.toJs();
                for (let [key, value] of varsJs_pop) {
                    if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                        if (isListVariable(value)) {
                            currentVariables[key] = formatListForPlaceholder(parseListContents(value));
                        } else {
                            currentVariables[key] = String(value);
                        }
                    }
                }

                return { popOperation: { container: listContainer, index: actualIndex, value: resultValue, isError, varName } };
            }
        }
    }

    // append(value) - improved animation (supports string/number literals)
    {
        const appendMatch = trimmed.match(/(\w+)\.append\s*\(\s*(?:["'](.+?)["']|(\d+(?:\.\d+)?))\s*\)/);
        if (appendMatch) {
            const varName = appendMatch[1];
            const newValue = appendMatch[2] !== undefined ? appendMatch[2] : appendMatch[3];
            const listContainer = resolveListContainer(varName);
            if (listContainer) {
                let originCoords = { x: 200, y: 200 };
                try {
                    const appendIdx = step.code.indexOf('.append(');
                    if (appendIdx !== -1) {
                        const charPos = appendIdx + 8;
                        const coords = editor.charCoords({ line: step.lineNumber, ch: charPos }, 'page');
                        originCoords = { x: coords.left, y: coords.top + 10 };
                    }
                } catch { }

                const prevLen = await pyodide.runPythonAsync(`len(${varName})`);
                await pyodide.runPythonAsync(step.code);

                document.getElementById('backBtn').disabled = true;

                await new Promise(resolve => {
                    animateAppendImproved(listContainer, varName, newValue, originCoords, () => resolve());
                });

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                // PHASE 1 FIX: Update currentVariables before returning
                const varsJs_append = pyodide.globals.toJs();
                for (let [key, value] of varsJs_append) {
                    if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                        if (isListVariable(value)) {
                            currentVariables[key] = formatListForPlaceholder(parseListContents(value));
                        } else {
                            currentVariables[key] = String(value);
                        }
                    }
                }

                return { appendOperation: { container: listContainer, varName, prevLen } };
            }
        }
    }

    // remove(value) - supports string/number literals
    {
        const removeMatch = trimmed.match(/(\w+)\.remove\s*\(\s*(?:["'](.+?)["']|(\d+(?:\.\d+)?))\s*\)/);
        if (removeMatch) {
            const varName = removeMatch[1];
            const searchValue = removeMatch[2] !== undefined ? removeMatch[2] : removeMatch[3];
            const listContainer = resolveListContainer(varName);
            if (listContainer) {
                let foundIndex = -1;
                let isError = false;
                try {
                    const isString = removeMatch[2] !== undefined;
                    const checkCode = `${varName}.index(${isString ? `"${searchValue}"` : searchValue})`;
                    foundIndex = await pyodide.runPythonAsync(checkCode);
                    await pyodide.runPythonAsync(step.code);
                } catch {
                    isError = true;
                }

                const outputPanel = document.getElementById('output');
                document.getElementById('backBtn').disabled = true;

                await new Promise(resolve => {
                    animateRemove_v1(listContainer, searchValue, foundIndex, outputPanel, isError, () => resolve());
                });

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                if (isError) {
                    throw makeHandledError(`ValueError: ${searchValue} is not in list`);
                }

                // PHASE 1 FIX: Update currentVariables before returning
                const varsJs_remove = pyodide.globals.toJs();
                for (let [key, value] of varsJs_remove) {
                    if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                        if (isListVariable(value)) {
                            currentVariables[key] = formatListForPlaceholder(parseListContents(value));
                        } else {
                            currentVariables[key] = String(value);
                        }
                    }
                }

                return { removeOperation: { container: listContainer, searchValue, foundIndex, isError, varName } };
            }
        }
    }

    // reverse()
    {
        const reverseMatch = trimmed.match(/(\w+)\.reverse\s*\(\s*\)/);
        if (reverseMatch) {
            const varName = reverseMatch[1];
            const listContainer = resolveListContainer(varName);
            if (listContainer) {
                const currentItems = Array.from(listContainer.querySelectorAll('.list-content-cell')).map(cell => {
                    const valueEl = cell.querySelector('.list-value');
                    return valueEl ? valueEl.textContent : cell.textContent;
                });

                await pyodide.runPythonAsync(step.code);
                const reversedList = await pyodide.runPythonAsync(varName);
                const reversedItems = parseListContents(reversedList);

                document.getElementById('backBtn').disabled = true;

                await new Promise(resolve => {
                    animateReverse(listContainer, varName, currentItems, reversedItems, () => resolve());
                });

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                // PHASE 1 FIX: Update currentVariables before returning
                const varsJs_reverse = pyodide.globals.toJs();
                for (let [key, value] of varsJs_reverse) {
                    if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                        if (isListVariable(value)) {
                            currentVariables[key] = formatListForPlaceholder(parseListContents(value));
                        } else {
                            currentVariables[key] = String(value);
                        }
                    }
                }

                return { reverseOperation: { container: listContainer, varName, originalItems: currentItems } };
            }
        }
    }

    // insert(index, value)
    {
        const insertMatch = trimmed.match(/(\w+)\.insert\s*\(\s*(-?\d+)\s*,\s*(?:["'](.+?)["']|(\d+(?:\.\d+)?))\s*\)/);
        if (insertMatch) {
            const varName = insertMatch[1];
            const insertIndex = parseInt(insertMatch[2]);
            const insertValue = insertMatch[3] !== undefined ? insertMatch[3] : insertMatch[4];
            const listContainer = resolveListContainer(varName);
            if (listContainer) {
                let originCoords = { x: 200, y: 200 };
                try {
                    const insertIdx = step.code.indexOf('.insert(');
                    if (insertIdx !== -1) {
                        const charPos = insertIdx + 8;
                        const coords = editor.charCoords({ line: step.lineNumber, ch: charPos }, 'page');
                        originCoords = { x: coords.left, y: coords.top + 10 };
                    }
                } catch { }

                const listLength = await pyodide.runPythonAsync(`len(${varName})`);
                await pyodide.runPythonAsync(step.code);

                document.getElementById('backBtn').disabled = true;

                await new Promise(resolve => {
                    animateInsert(listContainer, varName, insertIndex, insertValue, listLength, originCoords, () => resolve());
                });

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                // PHASE 1 FIX: Update currentVariables before returning
                const varsJs_insert = pyodide.globals.toJs();
                for (let [key, value] of varsJs_insert) {
                    if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                        if (isListVariable(value)) {
                            currentVariables[key] = formatListForPlaceholder(parseListContents(value));
                        } else {
                            currentVariables[key] = String(value);
                        }
                    }
                }

                return { insertOperation: { container: listContainer, varName, insertIndex, previousLength: listLength } };
            }
        }
    }

    // sort(reverse=?)
    {
        const sortMatch = trimmed.match(/(\w+)\.sort\s*\(\s*(?:reverse\s*=\s*(True|False))?\s*\)/);
        if (sortMatch) {
            const varName = sortMatch[1];
            const isReverse = sortMatch[2] === 'True';
            const listContainer = resolveListContainer(varName);
            if (listContainer) {
                const originalItems = Array.from(listContainer.querySelectorAll('.list-content-cell')).map(cell => {
                    const valueEl = cell.querySelector('.list-value');
                    return valueEl ? valueEl.textContent : cell.textContent;
                });

                document.getElementById('backBtn').disabled = true;

                let isError = false;
                let sortedItems = [];
                try {
                    await pyodide.runPythonAsync(step.code);
                    const sortedList = await pyodide.runPythonAsync(varName);
                    sortedItems = parseListContents(sortedList);
                } catch {
                    isError = true;
                }

                const outputPanel = document.getElementById('output');
                if (isError) {
                    await new Promise(resolve => {
                        animateSortMismatch(listContainer, outputPanel, () => resolve());
                    });
                } else {
                    await new Promise(resolve => {
                        animateSort(listContainer, originalItems, sortedItems, isReverse, () => resolve());
                    });
                }

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                if (isError) {
                    throw makeHandledError('TypeError: list contains non-comparable values');
                }

                // PHASE 1 FIX: Update currentVariables before returning
                const varsJs_sort = pyodide.globals.toJs();
                for (let [key, value] of varsJs_sort) {
                    if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                        if (isListVariable(value)) {
                            currentVariables[key] = formatListForPlaceholder(parseListContents(value));
                        } else {
                            currentVariables[key] = String(value);
                        }
                    }
                }

                return { sortOperation: { container: listContainer, varName, originalItems, isError } };
            }
        }
    }

    // clear()
    {
        const clearMatch = trimmed.match(/(\w+)\.clear\s*\(\s*\)/);
        if (clearMatch) {
            const varName = clearMatch[1];
            const listContainer = resolveListContainer(varName);
            if (listContainer) {
                const originalRows = listContainer.querySelectorAll('.list-row');
                const originalItems = Array.from(originalRows).map(row => {
                    const contentCell = row.querySelector('.list-content-cell');
                    return contentCell ? contentCell.textContent : '';
                });

                document.getElementById('backBtn').disabled = true;

                await new Promise(resolve => {
                    animateClear(listContainer, varName, () => resolve());
                });

                await pyodide.runPythonAsync(step.code);

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                // PHASE 1 FIX: Update currentVariables before returning
                const varsJs_clear = pyodide.globals.toJs();
                for (let [key, value] of varsJs_clear) {
                    if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                        if (isListVariable(value)) {
                            currentVariables[key] = formatListForPlaceholder(parseListContents(value));
                        } else {
                            currentVariables[key] = String(value);
                        }
                    }
                }

                return { clearOperation: { container: listContainer, varName, originalItems } };
            }
        }
    }

    await pyodide.runPythonAsync(step.code);
    const varsJs = pyodide.globals.toJs();
    const memoryBank = document.getElementById('memoryBank');

    currentVariables = {};

    const assignedVarMatch = trimmed.match(/^(\w+)\s*=/);
    const assignedVarName = assignedVarMatch ? assignedVarMatch[1] : null;
    let assignedWasList = false;

    for (let [key, value] of varsJs) {
        if (key.startsWith('_') || ['output_buffer', 'sys', 'io'].includes(key)) continue;

        if (isListVariable(value)) {
            const items = parseListContents(value);
            currentVariables[key] = formatListForPlaceholder(items);

            // Determine the primary list name for this variable (avoid rendering duplicates for aliases)
            let primaryName = getPrimaryListName(key);
            if (!primaryName) {
                listAliasMap.set(key, [key]);
                primaryName = key;
            }

            if (primaryName !== key) {
                if (assignedVarName === key) assignedWasList = true;
                continue;
            }

            let existingContainer = document.querySelector(`.list-container[data-var-name="${primaryName}"]`);

            if (!existingContainer && !renderedLists.has(primaryName)) {
                const headerAliases = (listAliasMap.get(primaryName) || []).filter(a => a !== primaryName);
                const listElement = renderListTable(primaryName, items, memoryBank, headerAliases);
                renderedLists.add(primaryName);
                existingContainer = listElement;

                // Track for Back button removal (new list introduced)
                const action = { type: 'memory', element: listElement, isNew: true };
                animationHistory.push(action);
                stepAnimations[currentStep].push(action);

                document.getElementById('backBtn').disabled = true;

                await new Promise(resolve => {
                    animateListCreation(listElement, items, () => resolve());
                });

                if (currentStep > 0) document.getElementById('backBtn').disabled = false;
            } else if (existingContainer && assignedVarName === primaryName) {
                // List reassignment (not append/pop): update table instantly
                updateListTable(existingContainer, items);
            }

            if (assignedVarName === key) assignedWasList = true;
        } else {
            currentVariables[key] = String(value);
        }
    }

    if (step.type === 'assignment' && !assignedWasList) {
        await animateAssignment(step, currentVariables);
    }

    return listDataForUndo;
}

// ============ LOOP STEP EXECUTION ============
function clonePlanSteps(steps) {
    return steps.map(s => ({
        lineNumber: s.lineNumber,
        code: s.code,
        type: s.type,
        ifStructure: s.ifStructure,
        loopMeta: s.loopMeta
    }));
}

function annotateLoopSteps(steps, loopMeta) {
    if (!Array.isArray(steps) || !loopMeta) return;
    steps.forEach(step => {
        if (!step.enclosingLoopMeta) step.enclosingLoopMeta = loopMeta;
    });
}

function getTargetLoopMeta(step) {
    return step?.enclosingLoopMeta || step?.loopMeta || null;
}

function isStepInLoop(step, loopMeta) {
    if (!step || !loopMeta) return false;
    return step.loopMeta === loopMeta || step.enclosingLoopMeta === loopMeta;
}

function getLoopBodyRange(loopMeta) {
    if (typeof loopMeta.endLine === 'number' && loopMeta.endLine >= loopMeta.headerLine) {
        return { startLine: loopMeta.headerLine, endLine: loopMeta.endLine };
    }

    const bodyLines = (loopMeta.bodyPlan || []).map(s => s.lineNumber);
    if (bodyLines.length === 0) {
        return { startLine: loopMeta.headerLine, endLine: loopMeta.headerLine };
    }
    return {
        startLine: Math.min(...bodyLines),
        endLine: Math.max(...bodyLines)
    };
}

function getLoopDepth() {
    return Math.min(loopVisualStack.length + 1, 3);
}

function pauseLoopVisuals() {
    const top = loopVisualStack[loopVisualStack.length - 1];
    if (!top) return;
    if (top.glassState?.glassPaneEl) top.glassState.glassPaneEl.classList.add('loop-paused');
    if (top.engineRef?.element) top.engineRef.element.classList.add('engine-paused');
}

function resumeLoopVisuals() {
    const top = loopVisualStack[loopVisualStack.length - 1];
    if (!top) return;
    if (top.glassState?.glassPaneEl) top.glassState.glassPaneEl.classList.remove('loop-paused');
    if (top.engineRef?.element) top.engineRef.element.classList.remove('engine-paused');
    if (top.glassState?.cursorEl) updateActiveLine(editor, top.loopMeta?.headerLine ?? null, top.glassState.cursorEl);
}

function hydrateConditionText(condition, variables) {
    if (!condition) return '';
    let hydrated = condition;
    Object.keys(variables || {}).forEach(name => {
        const value = variables[name];
        hydrated = hydrated.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
    });
    return hydrated;
}

function formatPythonLiteral(value) {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}

function makeHandledError(message, original = null) {
    const err = new Error(message);
    err._handled = true;
    if (original) err.originalError = original;
    return err;
}

async function getIterableItems(iterableExpr) {
    if (!pyodide || !iterableExpr) return [];
    let pyValue = null;
    try {
        pyValue = await pyodide.runPythonAsync(`list(${iterableExpr})`);
        const items = pyValue && typeof pyValue.toJs === 'function' ? pyValue.toJs() : Array.from(pyValue || []);
        return Array.isArray(items) ? items : [];
    } catch (e) {
        const message = e?.message || String(e);
        throw makeHandledError(message, e);
    } finally {
        try { if (pyValue && typeof pyValue.destroy === 'function') pyValue.destroy(); } catch { }
    }
}

async function executeLoopStep(step) {
    const loopMeta = step.loopMeta || {};
    const loopData = {
        type: 'loop-block',
        loopMeta,
        glassCreated: false,
        engineCreated: false,
        pausedOuter: false,
        depth: getLoopDepth()
    };

    const loopRange = getLoopBodyRange(loopMeta);

    const topFrame = loopVisualStack[loopVisualStack.length - 1];
    const isSameLoopActive = topFrame && topFrame.loopMeta === loopMeta;

    if (!isSameLoopActive) {
        if (loopVisualStack.length > 0) {
            pauseLoopVisuals();
            loopData.pausedOuter = true;
        }

        let newEngineRef = null;
        let newGlassState = null;

        if (loopMeta.type === 'for') {
            if (!step.loopState) step.loopState = { iterIndex: 0, items: null };
            if (!step.loopState.items) step.loopState.items = await getIterableItems(loopMeta.iterableExpr);

            newEngineRef = injectEngineBox(editor, 'for', loopMeta.headerLine, {
                iterVar: loopMeta.iterVar,
                iterableName: loopMeta.iterableExpr,
                items: step.loopState.items || []
            }, loopData.depth);
            loopData.engineCreated = true;
        } else if (loopMeta.type === 'while') {
            newEngineRef = injectEngineBox(editor, 'while', loopMeta.headerLine, {
                condition: loopMeta.condition || ''
            }, loopData.depth);
            loopData.engineCreated = true;
        }

        newGlassState = showGlassPane(editor, loopMeta.headerLine, loopRange.endLine, loopData.depth);
        loopData.glassCreated = true;

        const frame = { loopMeta, glassState: newGlassState, engineRef: newEngineRef, depth: loopData.depth };
        loopVisualStack.push(frame);
        glassState = newGlassState;
        engineRef = newEngineRef;
    } else {
        glassState = topFrame.glassState;
        engineRef = topFrame.engineRef;
    }

    updateActiveLine(editor, loopMeta.headerLine, glassState?.cursorEl || null);

    const injected = [];

    if (loopMeta.type === 'for') {
        const items = step.loopState.items || [];
        if (step.loopState.iterIndex < items.length) {
            const iterIndex = step.loopState.iterIndex;
            const iterValue = items[iterIndex];

            injected.push({
                lineNumber: loopMeta.headerLine,
                code: `${loopMeta.iterVar} = ${formatPythonLiteral(iterValue)}`,
                type: 'loop-assign',
                iterVar: loopMeta.iterVar,
                iterValue,
                iterIndex,
                enclosingLoopMeta: loopMeta
            });

            const bodySteps = clonePlanSteps(loopMeta.bodyPlan || []);
            annotateLoopSteps(bodySteps, loopMeta);
            injected.push(...bodySteps);

            injected.push({
                lineNumber: loopRange.endLine,
                code: 'loop-back',
                type: 'loop-back',
                toLine: loopMeta.headerLine,
                loopMeta,
                enclosingLoopMeta: loopMeta
            });

            injected.push({
                lineNumber: loopMeta.headerLine,
                code: loopMeta.code || '',
                type: 'loop-block',
                loopMeta,
                loopState: {
                    iterIndex: iterIndex + 1,
                    items
                },
                enclosingLoopMeta: loopMeta
            });
        } else {
            injected.push({
                lineNumber: loopMeta.headerLine,
                code: 'loop-exit',
                type: 'loop-exit',
                loopMeta,
                enclosingLoopMeta: loopMeta
            });
        }
    } else if (loopMeta.type === 'while') {
        const hydrated = hydrateConditionText(loopMeta.condition || '', currentVariables);
        const conditionResult = await evaluateConditionExpression(loopMeta.condition || 'False');

        injected.push({
            lineNumber: loopMeta.headerLine,
            code: hydrated,
            type: 'while-check',
            conditionStr: hydrated,
            conditionResult,
            loopMeta,
            enclosingLoopMeta: loopMeta
        });

        if (conditionResult) {
            const bodySteps = clonePlanSteps(loopMeta.bodyPlan || []);
            annotateLoopSteps(bodySteps, loopMeta);
            injected.push(...bodySteps);
            injected.push({
                lineNumber: loopRange.endLine,
                code: 'loop-back',
                type: 'loop-back',
                toLine: loopMeta.headerLine,
                loopMeta,
                enclosingLoopMeta: loopMeta
            });
            injected.push({
                lineNumber: loopMeta.headerLine,
                code: loopMeta.code || '',
                type: 'loop-block',
                loopMeta,
                enclosingLoopMeta: loopMeta
            });
        } else {
            injected.push({
                lineNumber: loopMeta.headerLine,
                code: 'loop-exit',
                type: 'loop-exit',
                loopMeta,
                enclosingLoopMeta: loopMeta
            });
        }
    }

    if (injected.length > 0) {
        step.numInjected = injected.length;
        executionPlan.splice(currentStep + 1, 0, ...injected);
        totalSteps = executionPlan.length;
    }

    loopData.injectedCount = injected.length;
    return loopData;
}

async function handleLoopAssign(step) {
    updateActiveLine(editor, step.lineNumber, glassState?.cursorEl || null);

    if (engineRef) {
        updateForEngine(engineRef.element, step.iterIndex);
    }

    try {
        pyodide.globals.set('_loop_iter_value', step.iterValue);
        await pyodide.runPythonAsync(`${step.iterVar} = _loop_iter_value`);
    } finally {
        try { pyodide.globals.delete('_loop_iter_value'); } catch { }
    }

    const varName = step.iterVar;
    const varValue = step.iterValue;

    let startX, startY;
    if (engineRef) {
        const currentToken = engineRef.element.querySelector('.token-current');
        if (currentToken) {
            const tokenRect = currentToken.getBoundingClientRect();
            startX = tokenRect.left + tokenRect.width / 2;
            startY = tokenRect.top + tokenRect.height / 2;
        }
    }

    if (!startX) {
        const lineCoords = editor.charCoords({ line: step.lineNumber, ch: 0 }, 'page');
        startX = lineCoords.left;
        startY = lineCoords.top;
    }

    let box = document.getElementById(`box-${varName}`);
    const isNew = !box;
    if (!box) {
        const bank = document.getElementById('memoryBank');
        box = document.createElement('div');
        box.className = 'variable-box';
        box.id = `box-${varName}`;
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${varValue}</span>`;
        bank.appendChild(box);
        const action = { type: 'memory', element: box, isNew: true };
        animationHistory.push(action);
        stepAnimations[currentStep].push(action);
    }

    const loopData = {
        type: 'loop-assign',
        iterVar: varName,
        iterIndex: step.iterIndex,
        previousValue: isNew ? null : box.querySelector('.box-value')?.textContent,
        isNewBox: isNew
    };

    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = String(varValue);
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
            ease: 'power2.out',
            onUpdate: function () {
                const sparkRect = spark.getBoundingClientRect();
                updateTrailParticles(trailParticles, sparkRect.left + sparkRect.width / 2,
                    sparkRect.top + sparkRect.height / 2, startX, startY);
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trailParticles);
                box.querySelector('.box-value').textContent = String(varValue);

                if (isNew) {
                    gsap.to(box, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)', onComplete: resolve });
                } else {
                    box.classList.add('pulse-update');
                    setTimeout(() => box.classList.remove('pulse-update'), 500);
                    resolve();
                }
            }
        });
    });

    currentVariables[varName] = String(varValue);
    return loopData;
}

async function handleWhileCheck(step) {
    updateActiveLine(editor, step.lineNumber, glassState?.cursorEl || null);
    if (engineRef) {
        await updateWhileEngine(engineRef.element, step.conditionStr, step.conditionResult);
    }
    return {
        type: 'while-check',
        conditionStr: step.conditionStr,
        conditionResult: step.conditionResult
    };
}

async function handleLoopBack(step) {
    const loopMeta = step.loopMeta || {};
    const fromLine = step.lineNumber;
    const toLine = step.toLine !== undefined ? step.toLine : loopMeta.headerLine;

    const depth = loopVisualStack[loopVisualStack.length - 1]?.depth || 1;
    await animateLoopBack(editor, fromLine, toLine, depth);
    updateActiveLine(editor, toLine, glassState?.cursorEl || null);

    return { type: 'loop-back', fromLine, toLine };
}

async function handleLoopExit(step) {
    const frame = loopVisualStack.pop();
    if (frame?.glassState) {
        await dissolveGlassPane(frame.glassState.glassPaneEl, editor,
            frame.glassState.frostedMarks, frame.glassState.activeLoopMarks);
    }
    if (frame?.engineRef) {
        await removeEngineBox(frame.engineRef);
    }

    const top = loopVisualStack[loopVisualStack.length - 1] || null;
    glassState = top ? top.glassState : null;
    engineRef = top ? top.engineRef : null;
    if (top) {
        resumeLoopVisuals();
        updateActiveLine(editor, top.loopMeta?.headerLine ?? null, top.glassState?.cursorEl || null);
    } else {
        updateActiveLine(editor, null);
    }

    return { type: 'loop-exit', loopMeta: step.loopMeta, depth: frame?.depth || 1 };
}

async function handleLoopContinue(step) {
    const loopMeta = getTargetLoopMeta(step);
    if (!loopMeta) throw makeHandledError('SyntaxError: continue outside loop');

    updateActiveLine(editor, step.lineNumber, glassState?.cursorEl || null);

    let loopBackIndex = -1;
    for (let idx = currentStep + 1; idx < executionPlan.length; idx++) {
        const nextStep = executionPlan[idx];
        if (nextStep.type === 'loop-back' && nextStep.loopMeta === loopMeta) {
            loopBackIndex = idx;
            break;
        }
    }

    let removedSteps = [];
    const insertIndex = currentStep + 1;
    if (loopBackIndex !== -1 && loopBackIndex > insertIndex) {
        removedSteps = executionPlan.splice(insertIndex, loopBackIndex - insertIndex);
        totalSteps = executionPlan.length;
    }

    await animateContinueArrow(editor, step.lineNumber, loopMeta.headerLine);
    updateActiveLine(editor, loopMeta.headerLine, glassState?.cursorEl || null);

    return {
        type: 'loop-continue',
        loopMeta,
        removedSteps,
        insertIndex
    };
}

async function handleLoopBreak(step) {
    const loopMeta = getTargetLoopMeta(step);
    if (!loopMeta) throw makeHandledError('SyntaxError: break outside loop');

    updateActiveLine(editor, step.lineNumber, glassState?.cursorEl || null);

    const loopRange = getLoopBodyRange(loopMeta);
    if (glassState?.glassPaneEl) {
        glassState.glassPaneEl.classList.add('break-flash');
        setTimeout(() => {
            if (glassState?.glassPaneEl) glassState.glassPaneEl.classList.remove('break-flash');
        }, 250);
    }

    let removedSteps = [];
    const insertIndex = currentStep + 1;
    let idx = insertIndex;
    while (idx < executionPlan.length && isStepInLoop(executionPlan[idx], loopMeta)) {
        removedSteps.push(executionPlan[idx]);
        idx++;
    }
    if (removedSteps.length > 0) {
        executionPlan.splice(insertIndex, removedSteps.length);
        totalSteps = executionPlan.length;
    }

    await animateBreakArrow(editor, step.lineNumber, loopRange.endLine);

    const frame = loopVisualStack.pop();
    if (frame?.engineRef) {
        await disintegrateEngineBox(frame.engineRef);
    }
    if (frame?.glassState) {
        await dissolveGlassPane(frame.glassState.glassPaneEl, editor,
            frame.glassState.frostedMarks, frame.glassState.activeLoopMarks);
    }

    const top = loopVisualStack[loopVisualStack.length - 1] || null;
    glassState = top ? top.glassState : null;
    engineRef = top ? top.engineRef : null;
    if (top) {
        resumeLoopVisuals();
        updateActiveLine(editor, top.loopMeta?.headerLine ?? null, top.glassState?.cursorEl || null);
    } else {
        updateActiveLine(editor, null);
    }

    return {
        type: 'loop-break',
        loopMeta,
        depth: frame?.depth || 1,
        removedSteps,
        insertIndex
    };
}

// ============ LIST UNDO (Back button) ============
async function undoListStep(stepData) {
    if (!stepData) return;

    // Facts overlays (len/index/count) are cleaned up in the Back handler already,
    // but keep this as a safety net if we ever call undoListStep() directly.
    if (stepData.isLenStep) cleanupLenCounters();
    if (stepData.isIndexStep) cleanupIndexDivs();
    if (stepData.isCountStep) cleanupCountDivs();

    // Shallow copy undo: remove alias name from header + Python globals
    if (stepData.shallowCopy) {
        const { newVar, primaryName, container } = stepData.shallowCopy;

        // Remove alias variable from Python state (best-effort)
        try {
            await pyodide.runPythonAsync(`del ${newVar}`);
        } catch { }

        // Remove alias from internal map
        if (listAliasMap.has(primaryName)) {
            const aliases = listAliasMap.get(primaryName) || [];
            listAliasMap.set(primaryName, aliases.filter(a => a !== newVar));
        }

        if (container) {
            const remainingAliases = getListAliases(container).filter(a => a !== newVar);
            const nameSection = container.querySelector('.list-name-section');
            if (nameSection) {
                nameSection.innerHTML = '';
                if (remainingAliases.length === 1) {
                    const mainName = document.createElement('span');
                    mainName.className = 'list-main-name';
                    mainName.textContent = remainingAliases[0];
                    nameSection.appendChild(mainName);
                } else if (remainingAliases.length > 1) {
                    const mainName = document.createElement('span');
                    mainName.className = 'list-main-name';
                    mainName.textContent = remainingAliases.join(', ');
                    nameSection.appendChild(mainName);

                    const arrow = document.createElement('span');
                    arrow.className = 'list-alias-arrow';
                    arrow.textContent = ' ↗';
                    nameSection.appendChild(arrow);
                }
            }

            container.dataset.aliases = JSON.stringify(remainingAliases);
        }
    }

    // pop() undo: restore popped row (only if it actually succeeded)
    if (stepData.popOperation) {
        cleanupPopElements();

        const { container, index, value, isError, varName } = stepData.popOperation;
        if (!isError && container) {
            // Restore Python state
            try {
                const isNum = !isNaN(value) && value !== '';
                const isBool = value === 'True' || value === 'False' || value === 'None';
                const pyValue = (isNum || isBool) ? value : `"${value}"`;
                await pyodide.runPythonAsync(`${varName}.insert(${index}, ${pyValue})`);
            } catch { }

            // Restore DOM row
            const tbody = container.querySelector('.list-table-body');
            const rows = container.querySelectorAll('.list-row');
            if (tbody) {
                const row = document.createElement('tr');
                row.className = 'list-row';
                row.dataset.originalIndex = index;

                const firstIndexCell = rows[0]?.querySelector('.list-index-cell');
                const isNegativeMode = firstIndexCell && parseInt(firstIndexCell.textContent) < 0;

                const indexCell = document.createElement('td');
                indexCell.className = 'list-index-cell';
                indexCell.textContent = index;

                const contentCell = document.createElement('td');
                contentCell.className = 'list-content-cell';
                const isNum = !isNaN(value) && value !== '';
                const isBool = value === 'True' || value === 'False' || value === 'None';
                contentCell.textContent = (isNum || isBool) ? value : `"${value}"`;

                row.appendChild(indexCell);
                row.appendChild(contentCell);

                row.style.opacity = '1';
                row.style.transform = 'none';
                row.style.height = 'auto';
                row.style.filter = 'none';

                if (index >= rows.length) tbody.appendChild(row);
                else tbody.insertBefore(row, rows[index]);

                // Renumber all rows
                const allRows = container.querySelectorAll('.list-row');
                allRows.forEach((r, newIdx) => {
                    const iCell = r.querySelector('.list-index-cell');
                    if (iCell) {
                        if (isNegativeMode) iCell.textContent = -(allRows.length - newIdx);
                        else iCell.textContent = newIdx;
                    }
                    r.dataset.originalIndex = newIdx;
                    r.style.opacity = '1';
                    r.style.transform = 'none';
                    r.style.filter = 'none';
                    r.style.backgroundColor = '';
                    r.style.height = 'auto';
                });

                // Update count header
                const countSection = container.querySelector('.list-count-section');
                if (countSection) countSection.textContent = `N is ${allRows.length}`;
            }
        }
    }

    // append() undo: remove the last row + restore Python
    if (stepData.appendOperation) {
        const { container, varName } = stepData.appendOperation;
        if (container) {
            try {
                await pyodide.runPythonAsync(`${varName}.pop()`);
            } catch { }

            const rows = container.querySelectorAll('.list-row');
            const lastRow = rows[rows.length - 1];
            if (lastRow) {
                await new Promise(resolve => {
                    gsap.to(lastRow, {
                        opacity: 0,
                        y: 20,
                        duration: 0.3,
                        ease: 'power2.in',
                        onComplete: () => { lastRow.remove(); resolve(); }
                    });
                });
            }

            const remainingRows = container.querySelectorAll('.list-row');
            const countSection = container.querySelector('.list-count-section');
            if (countSection) countSection.textContent = `N is ${remainingRows.length}`;
        }
    }

    // remove() undo: reinsert removed row (only if it succeeded)
    if (stepData.removeOperation) {
        cleanupRemoveElements_v1();

        const { container, searchValue, foundIndex, isError, varName } = stepData.removeOperation;
        if (!isError && container && foundIndex >= 0) {
            // Restore Python state
            try {
                const isNum = !isNaN(searchValue) && searchValue !== '';
                const pyValue = isNum ? searchValue : `"${searchValue}"`;
                await pyodide.runPythonAsync(`${varName}.insert(${foundIndex}, ${pyValue})`);
            } catch { }

            // Visual restoration
            const tbody = container.querySelector('.list-table-body');
            const rows = container.querySelectorAll('.list-row');
            if (tbody) {
                const row = document.createElement('tr');
                row.className = 'list-row';
                row.dataset.originalIndex = foundIndex;

                const indexCell = document.createElement('td');
                indexCell.className = 'list-index-cell';
                indexCell.textContent = foundIndex;

                const contentCell = document.createElement('td');
                contentCell.className = 'list-content-cell';
                const isNum = !isNaN(searchValue) && searchValue !== '';
                contentCell.textContent = isNum ? searchValue : `"${searchValue}"`;

                row.appendChild(indexCell);
                row.appendChild(contentCell);
                row.style.opacity = '1';
                row.style.transform = 'none';
                row.style.height = 'auto';

                if (foundIndex >= rows.length) tbody.appendChild(row);
                else tbody.insertBefore(row, rows[foundIndex]);

                // Renumber all indices
                const allRows = container.querySelectorAll('.list-row');
                allRows.forEach((r, newIdx) => {
                    const iCell = r.querySelector('.list-index-cell');
                    if (iCell) iCell.textContent = newIdx;
                    r.dataset.originalIndex = newIdx;
                    r.style.opacity = '1';
                    r.style.transform = 'none';
                    r.style.filter = 'none';
                    r.style.backgroundColor = '';
                    r.style.height = 'auto';
                });

                const countSection = container.querySelector('.list-count-section');
                if (countSection) countSection.textContent = `N is ${allRows.length}`;
            }
        }
    }

    // reverse() undo: reverse back + restore original order visually
    if (stepData.reverseOperation) {
        cleanupReverseElements();

        const { container, originalItems, varName } = stepData.reverseOperation;
        if (container) {
            try {
                await pyodide.runPythonAsync(`${varName}.reverse()`);
            } catch { }

            const contentCells = container.querySelectorAll('.list-content-cell');
            await new Promise(resolve => {
                gsap.to(contentCells, {
                    opacity: 0,
                    duration: 0.2,
                    onComplete: () => {
                        contentCells.forEach((cell, idx) => {
                            const valueEl = cell.querySelector('.list-value');
                            const v = originalItems[idx] !== undefined ? originalItems[idx] : '';
                            if (valueEl) valueEl.textContent = v;
                            else cell.textContent = v;
                        });
                        gsap.to(contentCells, { opacity: 1, duration: 0.2, onComplete: resolve });
                    }
                });
            });
        }
    }

    // insert() undo: remove the inserted row + restore Python
    if (stepData.insertOperation) {
        const { container, varName, insertIndex, previousLength } = stepData.insertOperation;
        if (container) {
            // Compute actualIndex the same way Python does
            let actualIndex = insertIndex;
            if (insertIndex < 0) {
                const normalizedIndex = previousLength + insertIndex;
                actualIndex = normalizedIndex < 0 ? 0 : normalizedIndex;
            } else if (insertIndex > previousLength) {
                actualIndex = previousLength;
            }

            try {
                await pyodide.runPythonAsync(`del ${varName}[${actualIndex}]`);
            } catch { }

            const allRows = container.querySelectorAll('.list-row');
            await new Promise(resolve => {
                gsap.to(allRows, {
                    opacity: 0,
                    duration: 0.2,
                    onComplete: () => {
                        const rowsNow = container.querySelectorAll('.list-row');
                        if (rowsNow[actualIndex]) rowsNow[actualIndex].remove();

                        const remainingRows = container.querySelectorAll('.list-row');
                        remainingRows.forEach((row, idx) => {
                            const indexCell = row.querySelector('.list-index-cell');
                            if (indexCell) indexCell.textContent = idx;
                            row.dataset.originalIndex = idx;
                        });

                        const countSection = container.querySelector('.list-count-section');
                        if (countSection) countSection.textContent = `N is ${remainingRows.length}`;

                        gsap.to(remainingRows, { opacity: 1, duration: 0.2, onComplete: resolve });
                    }
                });
            });
        }
    }

    // sort() undo: restore original order (only if sort succeeded)
    if (stepData.sortOperation) {
        cleanupSortElements();

        const { container, varName, originalItems, isError } = stepData.sortOperation;
        if (container && !isError) {
            // Restore Python state
            try {
                const itemsStr = originalItems.map(item => {
                    const stripped = String(item).replace(/^"|"$/g, '').replace(/^'|'$/g, '');
                    const isNum = stripped !== '' && !isNaN(stripped);
                    const isBool = stripped === 'True' || stripped === 'False' || stripped === 'None';
                    return (isNum || isBool) ? stripped : `"${stripped}"`;
                }).join(', ');
                await pyodide.runPythonAsync(`${varName} = [${itemsStr}]`);
            } catch { }

            const contentCells = container.querySelectorAll('.list-content-cell');
            await new Promise(resolve => {
                gsap.to(contentCells, {
                    opacity: 0,
                    duration: 0.25,
                    onComplete: () => {
                        contentCells.forEach((cell, idx) => {
                            cell.style.backgroundColor = '';
                            cell.style.color = '';
                            cell.style.fontWeight = '';

                            const valueEl = cell.querySelector('.list-value');
                            const v = originalItems[idx] !== undefined ? originalItems[idx] : '';
                            if (valueEl) {
                                valueEl.textContent = v;
                                valueEl.style.visibility = 'visible';
                                valueEl.style.color = '';
                                valueEl.style.fontWeight = '';
                            } else {
                                cell.textContent = v;
                            }
                        });
                        gsap.to(contentCells, { opacity: 1, duration: 0.25, onComplete: resolve });
                    }
                });
            });
        }
    }

    // clear() undo: repopulate the list + restore Python
    if (stepData.clearOperation) {
        cleanupClearElements();

        const { container, varName, originalItems } = stepData.clearOperation;
        if (container && originalItems && originalItems.length > 0) {
            // Restore Python state
            try {
                const itemsStr = originalItems.map(item => {
                    const raw = String(item).trim();
                    const unquoted = raw.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
                    const isNum = unquoted !== '' && !isNaN(unquoted);
                    const isBool = unquoted === 'True' || unquoted === 'False' || unquoted === 'None';
                    return (isNum || isBool) ? unquoted : `"${unquoted}"`;
                }).join(', ');
                await pyodide.runPythonAsync(`${varName} = [${itemsStr}]`);
            } catch { }

            const tbody = container.querySelector('.list-table-body');
            if (tbody) {
                tbody.innerHTML = '';

                originalItems.forEach((item, idx) => {
                    const row = document.createElement('tr');
                    row.className = 'list-row';
                    row.dataset.originalIndex = idx;

                    const indexCell = document.createElement('td');
                    indexCell.className = 'list-index-cell';
                    indexCell.textContent = idx;

                    const contentCell = document.createElement('td');
                    contentCell.className = 'list-content-cell';
                    contentCell.textContent = item;

                    row.appendChild(indexCell);
                    row.appendChild(contentCell);
                    row.style.opacity = '0';

                    tbody.appendChild(row);
                });

                const restoredRows = container.querySelectorAll('.list-row');
                await new Promise(resolve => {
                    gsap.to(restoredRows, {
                        opacity: 1,
                        duration: 0.4,
                        stagger: 0.05,
                        onComplete: resolve
                    });
                });

                const countSection = container.querySelector('.list-count-section');
                if (countSection) countSection.textContent = `N is ${originalItems.length}`;
            }
        }
    }
}

// ============ LOOP UNDO (Back button) ============
async function undoLoopStep(stepData) {
    if (!stepData) return;

    if ((stepData.type === 'loop-break' || stepData.type === 'loop-continue')
        && Array.isArray(stepData.removedSteps) && stepData.removedSteps.length > 0) {
        executionPlan.splice(stepData.insertIndex, 0, ...stepData.removedSteps);
        totalSteps = executionPlan.length;
    }

    if (stepData.type === 'loop-assign') {
        const { iterVar, previousValue, isNewBox, iterIndex } = stepData;
        if (!isNewBox && previousValue !== null) {
            const box = document.getElementById(`box-${iterVar}`);
            if (box) box.querySelector('.box-value').textContent = previousValue;
        }

        if (engineRef && typeof iterIndex === 'number' && iterIndex > 0) {
            updateForEngine(engineRef.element, iterIndex - 1);
        }

        try {
            if (previousValue !== null) {
                await pyodide.runPythonAsync(`${iterVar} = ${JSON.stringify(previousValue)}`);
            }
        } catch (e) {
            console.warn('Could not restore loop variable:', e);
        }
    }

    if (stepData.type === 'loop-block') {
        if (stepData.glassCreated || stepData.engineCreated) {
            const frame = loopVisualStack.pop();
            if (frame?.glassState) {
                await dissolveGlassPane(frame.glassState.glassPaneEl, editor,
                    frame.glassState.frostedMarks, frame.glassState.activeLoopMarks);
            }
            if (frame?.engineRef) {
                await removeEngineBox(frame.engineRef);
            }
        }

        const top = loopVisualStack[loopVisualStack.length - 1] || null;
        glassState = top ? top.glassState : null;
        engineRef = top ? top.engineRef : null;
        if (stepData.pausedOuter) resumeLoopVisuals();
    }

    if ((stepData.type === 'loop-exit' || stepData.type === 'loop-break') && stepData.loopMeta) {
        const loopMeta = stepData.loopMeta;
        const loopRange = getLoopBodyRange(loopMeta);
        const depth = stepData.depth || getLoopDepth();

        if (loopVisualStack.length > 0) pauseLoopVisuals();

        let newEngineRef = null;
        if (loopMeta.type === 'for') {
            const items = await getIterableItems(loopMeta.iterableExpr);
            newEngineRef = injectEngineBox(editor, 'for', loopMeta.headerLine, {
                iterVar: loopMeta.iterVar,
                iterableName: loopMeta.iterableExpr,
                items
            }, depth);
        } else if (loopMeta.type === 'while') {
            newEngineRef = injectEngineBox(editor, 'while', loopMeta.headerLine, {
                condition: loopMeta.condition || ''
            }, depth);
        }

        const newGlassState = showGlassPane(editor, loopMeta.headerLine, loopRange.endLine, depth);
        loopVisualStack.push({ loopMeta, glassState: newGlassState, engineRef: newEngineRef, depth });

        glassState = newGlassState;
        engineRef = newEngineRef;
        updateActiveLine(editor, loopMeta.headerLine, newGlassState?.cursorEl || null);
    }
}

// ============ ASSIGNMENT ANIMATION ============
async function animateAssignment(step, variables) {
    const varMatch = step.code.match(/(\w+)\s*=\s*(.+)/);
    if (!varMatch) return;

    const varName = varMatch[1];
    const varValue = variables[varName];

    const lineCoords = editor.charCoords({ line: step.lineNumber, ch: 0 }, "page");

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

    const trail = createDirectionalTrail(startX, startY, endX, endY, false);
    sounds.whoosh.currentTime = 0;
    sounds.whoosh.play().catch(() => { });

    await new Promise(resolve => {
        gsap.to(spark, {
            left: endX - 40, top: endY, duration: 1.2, ease: "power2.out",
            onUpdate: () => {
                const rect = spark.getBoundingClientRect();
                updateTrailParticles(trail, rect.left + rect.width / 2, rect.top + rect.height / 2, startX, startY);
            },
            onComplete: () => {
                gsap.to(spark, {
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => spark.remove()
                });
                removeTrail(trail);
                gsap.to(box, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", onComplete: resolve });

                const action = { type: 'memory', element: box, isNew: true };
                animationHistory.push(action);
                stepAnimations[currentStep].push(action);
            }
        });
    });
}

// ============ INPUT HANDLING ============
function isValidIntInput(value) {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const num = Number(trimmed);
    return !isNaN(num) && Number.isInteger(num);
}

async function handleInputStatement(step) {
    const inputMatch = step.code.match(/(\w+)\s*=\s*(int\()?input\(\s*["']?(.*?)["']?\s*\)\)?/);
    if (!inputMatch) return;

    const varName = inputMatch[1];
    const hasInt = !!inputMatch[2];
    const promptText = inputMatch[3] || "Enter value:";
    const userInput = await showInteractiveInput(promptText);

    allUserInputs.push(userInput);

    if (hasInt && !isValidIntInput(userInput)) {
        await animateInputToMemoryWithMachine(varName, userInput, hasInt, false);
        return;
    }

    pyodide.globals.set('_temp_input', userInput);
    let cleanCode = step.code.replace(/input\(\s*(?:(["']).*?\1|[^)]*)\s*\)/, "_temp_input");
    await pyodide.runPythonAsync(cleanCode);
    const value = pyodide.globals.get(varName).toString();
    currentVariables[varName] = value;

    if (hasInt) {
        await animateInputToMemoryWithMachine(varName, value, hasInt, true);
    } else {
        await animateInputToMemory(varName, value);
    }

    // ============ PHASE 2: PLAN PRUNING ============
    // When input changes (e.g., after Back button), remove any previously INJECTED branch lines
    // (but keep the if-block itself so it can be re-evaluated with the new input)
    if (currentStep + 1 < executionPlan.length) {
        const nextStep = executionPlan[currentStep + 1];
        if (nextStep && nextStep.type === 'if-block' && nextStep.numInjected > 0) {
            console.log(`[PHASE 2 PRUNING] Input changed. Removing ${nextStep.numInjected} previously injected branch lines.`);
            executionPlan.splice(currentStep + 2, nextStep.numInjected);
            nextStep.numInjected = 0;
            totalSteps = executionPlan.length;
        }
    }
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
            sounds.keystroke.play().catch(() => { });
        });

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inputField.value.trim()) {
                const value = inputField.value.trim();
                sounds.enter.play().catch(() => { });
                inputField.disabled = true;

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
    let box = document.getElementById(`box-${varName}`);
    let isNewBox = false;

    if (!box) {
        box = document.createElement('div');
        box.className = 'variable-box';
        box.id = `box-${varName}`;
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${value}</span>`;
        bank.appendChild(box);
        isNewBox = true;
    } else {
        box.querySelector('.box-value').textContent = value;
    }

    const targetRect = box.getBoundingClientRect();
    const startX = inputRect.left + inputRect.width / 2;
    const startY = inputRect.top + inputRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    const trail = createDirectionalTrail(startX, startY, endX, endY, false);
    sounds.whoosh.play().catch(() => { });

    await new Promise(resolve => {
        gsap.to(spark, {
            left: endX - 40, top: endY, duration: 1.2, ease: "none",
            onUpdate: () => {
                const rect = spark.getBoundingClientRect();
                updateTrailParticles(trail, rect.left + rect.width / 2, rect.top + rect.height / 2, startX, startY);
            },
            onComplete: () => {
                gsap.to(spark, {
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => spark.remove()
                });
                removeTrail(trail);
                gsap.to(box, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", onComplete: resolve });

                if (isNewBox) {
                    const action = { type: 'memory', element: box, isNew: true };
                    animationHistory.push(action);
                    stepAnimations[currentStep].push(action);
                }
            }
        });
    });
}

// ============ INT MACHINE GENERATOR ============
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

// ============ MACHINE ANIMATION ============
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
    let box = document.getElementById(`box-${varName}`);
    let isNewBox = false;

    if (!box) {
        box = document.createElement('div');
        box.id = `box-${varName}`;
        bank.appendChild(box);
        isNewBox = true;
    }

    if (!hasInt) {
        box.className = 'variable-box string-box';
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${value}</span>`;
        const targetRect = box.getBoundingClientRect();
        const trail = createDirectionalTrail(textCenterX, inputRect.top + inputRect.height / 2,
            targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2, false);
        sounds.whoosh.play().catch(() => { });

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
                    gsap.to(box, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", onComplete: resolve });

                    if (isNewBox) {
                        const action = { type: 'memory', element: box, isNew: true };
                        animationHistory.push(action);
                        stepAnimations[currentStep].push(action);
                    }
                }
            });
        });
    } else {
        box.className = 'variable-box number-box';
        box.innerHTML = `<span class="box-label">${varName}</span><span class="box-value">${value}</span>`;
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
        sounds.whoosh.play().catch(() => { });

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
            sounds.machineGear.play().catch(() => { });

            const tl = gsap.timeline();
            tl.to('.gear-1', { rotation: 720, duration: 3, ease: "none", transformOrigin: "center" }, 0)
                .to('.gear-2', { rotation: -720, duration: 3, ease: "none", transformOrigin: "center" }, 0)
                .to('.machine-body', { boxShadow: '0 0 50px rgba(16, 185, 129, 0.9)', duration: 0.6, yoyo: true, repeat: 2 }, 0.5)
                .call(() => {
                    sounds.notification.currentTime = 0;
                    sounds.notification.play().catch(() => { });
                }, null, 3);
            await tl;

            spark.className = 'animation-spark spark-number';
            spark.textContent = value;
            spark.style.left = `${outputX - 40}px`;
            spark.style.top = `${outputY}px`;
            spark.style.opacity = '1';
            sounds.enter.play().catch(() => { });

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
                        gsap.to(box, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", onComplete: resolve });

                        if (isNewBox) {
                            const action = { type: 'memory', element: box, isNew: true };
                            animationHistory.push(action);
                            stepAnimations[currentStep].push(action);
                        }
                    }
                });
            });
        } else {
            sounds.machineGear.currentTime = 0;
            sounds.machineGear.play().catch(() => { });

            const tl = gsap.timeline();
            tl.to('.gear-1', { rotation: 45, duration: 0.15, yoyo: true, repeat: 19, ease: "power2.out", transformOrigin: "center" }, 0)
                .to('.gear-2', { rotation: -45, duration: 0.15, yoyo: true, repeat: 19, ease: "power2.out", transformOrigin: "center" }, 0)
                .to('.machine-body', { boxShadow: '0 0 50px rgba(239, 68, 68, 0.9)', x: '+=5', duration: 0.1, yoyo: true, repeat: 29 }, 0.3)
                .call(() => {
                    sounds.inputFail.currentTime = 0;
                    sounds.inputFail.play().catch(() => { });
                }, null, 3);
            await tl;

            await new Promise((resolve, reject) => {
                gsap.to(spark, {
                    left: intakeX - 150, top: intakeY - 80, rotation: 720, opacity: 0, duration: 0.8, ease: "power2.out",
                    onComplete: () => {
                        spark.remove(); machine.remove(); box.remove();
                        reject(new Error(`ValueError: invalid literal for int() with base 10: '${value}'`));
                    }
                });
            });
        }
    }
}

// ============ PRINT ANIMATION ============
async function animatePrint(step, text) {
    const match = step.code.match(/print\((.*)\)/);
    if (!match) return;

    const printStartCh = step.code.indexOf('print(');
    const parts = parsePrintContent(match[1], printStartCh);

    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = 'output-line';
    line.textContent = text;
    output.appendChild(line);

    const lineRect = line.getBoundingClientRect();
    const positions = calculatePartPositions(parts, lineRect);

    if (parts.length > 0) sounds.whoosh.play().catch(() => { });

    await Promise.all(parts.map((part, idx) => createAndAnimateSpark(part, positions[idx], step.lineNumber)));

    await new Promise(resolve => {
        // Use fromTo for full control over the entrance without CSS interference
        gsap.fromTo(line,
            { opacity: 0, x: -20 },
            { opacity: 1, x: 0, duration: 0.5, ease: "power2.out", onComplete: resolve }
        );

        const action = { type: 'output', element: line, isNew: true };
        animationHistory.push(action);
        stepAnimations[currentStep].push(action);
    });
}

// ============ HELPERS (PARSING, POSITIONS, TRAILS) ============
function parsePrintContent(content, printStartCh) {
    const parts = [];
    let current = '', inQuote = false, quoteChar = '';

    let baseOffset = printStartCh !== -1 ? printStartCh + 6 : 6;
    let wordStartIdx = -1;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
            current = '';
            wordStartIdx = i;
        }
        else if (char === quoteChar && inQuote) {
            inQuote = false;
            parts.push({
                type: 'string',
                value: current,
                source: 'editor',
                startCh: baseOffset + wordStartIdx
            });
            current = '';
            wordStartIdx = -1;
        }
        else if (char === ',' && !inQuote) {
            if (current.trim()) {
                const v = current.trim();
                parts.push({
                    type: 'variable',
                    value: currentVariables[v] || v,
                    varName: v,
                    source: 'memory',
                    startCh: baseOffset + wordStartIdx
                });
                current = '';
                wordStartIdx = -1;
            }
        }
        else if (inQuote || char !== ' ') {
            if (wordStartIdx === -1) wordStartIdx = i;
            current += char;
        }
    }
    if (current.trim()) {
        const v = current.trim();
        parts.push({
            type: 'variable',
            value: currentVariables[v] || v,
            varName: v,
            source: 'memory',
            startCh: baseOffset + wordStartIdx
        });
    }
    return parts;
}

// FIXED BUG 4: Matches the explicit CSS padding parameters from animation-spark
function calculatePartPositions(parts, lineRect) {
    const positions = [];
    const temp = document.createElement('div');

    temp.className = 'animation-spark spark-variable';
    temp.style.position = 'absolute';
    temp.style.visibility = 'hidden';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);

    // Start exactly at the text beginning (with a tiny aesthetic margin)
    let currentX = lineRect.left + 5;

    parts.forEach(part => {
        positions.push({ x: currentX, y: lineRect.top + lineRect.height / 2 });
        temp.textContent = part.value;
        // Grab the explicit offset that includes all CSS padding and borders, plus a tiny margin gap
        currentX += temp.offsetWidth + 8;
    });

    temp.remove();
    return positions;
}

async function createAndAnimateSpark(part, targetPos, lineNumber) {
    let startX, startY, isGold;

    if (part.source === 'editor') {
        const safeStartCh = part.startCh || 0;
        const coords = editor.charCoords({ line: lineNumber, ch: safeStartCh }, "page");
        startX = coords.left;
        startY = coords.top;
        isGold = false;
    } else {
        const box = document.getElementById(`box-${part.varName}`);
        if (!box) return;
        const rect = box.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
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

    const trail = createDirectionalTrail(startX, startY, targetPos.x, targetPos.y, isGold);

    return new Promise(resolve => {
        gsap.to(spark, {
            left: targetPos.x - 40, top: targetPos.y, duration: 1.2, ease: "none",
            onUpdate: () => {
                const rect = spark.getBoundingClientRect();
                updateTrailParticles(trail, rect.left + rect.width / 2, rect.top + rect.height / 2, startX, startY);
            },
            onComplete: () => {
                gsap.to(spark, {
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => spark.remove()
                });
                removeTrail(trail);
                resolve();
            }
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

// ============ PHASE 1: DYNAMIC NARRATION INJECTION ============
/**
 * PHASE 1 IMPLEMENTATION: generateDynamicNarration
 * Generates explanations LIVE during step execution instead of using pre-fetched static array.
 * Pulls ACTUAL list values from currentVariables after Pyodide execution.
 * 
 * Fixes Error 1 (Stale State): Now uses post-execution state, not pre-computed values.
 * 
 * CRITICAL: This function MUST be called AFTER executeLineStepWithLists updates currentVariables.
 * Verify timing: finalizeStep calls generateStepExplanation after currentVariables is populated.
 */
function generateDynamicNarration(step) {
    try {
        const code = step.code.trim();
        const lineNum = step.lineNumber + 1;

        // DEBUG: Verify currentVariables has been populated
        const debugVarState = Object.keys(currentVariables).length;

        // PHASE 1: Check step.type FIRST to catch if-blocks, input, print before regex matching

        // 0) If-block execution: MUST be checked FIRST to avoid regex confusion
        if (step.type === 'if-block') {
            // PHASE 2: Include condition evaluation result in narration
            if (step.chosenConditionType && step.conditionResult) {
                const isTrue = step.conditionResult === 'true' || step.chosenConditionType === 'else';
                const result = isTrue ? 'True' : 'False';
                console.log(`[PHASE 2 DEBUG] If-block condition result: ${step.chosenConditionExpr} → ${result}`);

                if (step.chosenConditionType === 'else') {
                    return `Line ${lineNum}: All previous conditions were False, so the else block executes.`;
                } else {
                    return `Line ${lineNum}: Condition "${step.chosenConditionExpr}" evaluated to True, so this block executes.`;
                }
            }

            // Fallback if PHASE 2 didn't populate the result
            console.log(`[PHASE 1 DEBUG] If-block at line ${lineNum}: Phase 2 data not available`);
            return `Line ${lineNum}: Python evaluated the condition.`;
        }

        // 1) Input handling: MUST be checked BEFORE simple assignment (input also has = syntax)
        if (step.type === 'input') {
            const varMatch = code.match(/(\w+)\s*=\s*input\s*\(/);
            if (varMatch) {
                const varName = varMatch[1];
                const storedValue = currentVariables[varName] !== undefined ? currentVariables[varName] : 'user input';
                console.log(`[PHASE 1 DEBUG] Input statement ${varName}: state=${storedValue}`);
                return `Line ${lineNum}: Stored your input in ${varName}. Value: ${storedValue}`;
            }
            return `Line ${lineNum}: Python stored your input in memory!`;
        }

        // 2) Print statement: MUST be checked before assignment patterns
        if (step.type === 'print' || code.includes('print(')) {
            console.log(`[PHASE 1 DEBUG] Print statement at line ${lineNum}`);
            return `Line ${lineNum}: Python printed the value to the screen!`;
        }

        // 3) NOW process assignment patterns (list methods, list creation, simple vars)

        // List Method Calls: extract list variable and method
        const listMethodMatch = code.match(/(\w+)\.(append|pop|remove|insert|clear|sort|reverse|extend)\s*\(/i);
        if (listMethodMatch) {
            const listVar = listMethodMatch[1];
            const method = listMethodMatch[2].toLowerCase();
            const currentState = currentVariables[listVar] || '[]';

            console.log(`[PHASE 1 DEBUG] List method '${method}' on ${listVar}: state=${currentState}`);

            if (method === 'append') {
                const appendMatch = code.match(/\.append\s*\(\s*(.+?)\s*\)/);
                const appended = appendMatch ? appendMatch[1] : 'value';
                return `Line ${lineNum}: Added ${appended} to ${listVar}. Now: ${currentState}`;
            } else if (method === 'pop') {
                return `Line ${lineNum}: Removed the last item from ${listVar}. Now: ${currentState}`;
            } else if (method === 'remove') {
                const removeMatch = code.match(/\.remove\s*\(\s*(.+?)\s*\)/);
                const removed = removeMatch ? removeMatch[1] : 'value';
                return `Line ${lineNum}: Removed ${removed} from ${listVar}. Now: ${currentState}`;
            } else if (method === 'insert') {
                const insertMatch = code.match(/\.insert\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
                const index = insertMatch ? insertMatch[1] : 'index';
                const value = insertMatch ? insertMatch[2] : 'value';
                return `Line ${lineNum}: Inserted ${value} at position ${index} in ${listVar}. Now: ${currentState}`;
            } else if (method === 'clear') {
                return `Line ${lineNum}: Cleared all items from ${listVar}. Now: ${currentState}`;
            } else if (method === 'sort') {
                return `Line ${lineNum}: Sorted ${listVar} in ascending order. Now: ${currentState}`;
            } else if (method === 'reverse') {
                return `Line ${lineNum}: Reversed ${listVar}. Now: ${currentState}`;
            } else if (method === 'extend') {
                const extendMatch = code.match(/\.extend\s*\(\s*(.+?)\s*\)/);
                const extended = extendMatch ? extendMatch[1] : '[]';
                return `Line ${lineNum}: Extended ${listVar} with ${extended}. Now: ${currentState}`;
            }
        }

        // List Assignment: detect new list creation/reassignment
        const assignmentMatch = code.match(/(\w+)\s*=\s*\[.*?\]/);
        if (assignmentMatch) {
            const varName = assignmentMatch[1];
            const currentState = currentVariables[varName] || '[]';
            console.log(`[PHASE 1 DEBUG] List assignment ${varName}: state=${currentState}`);
            return `Line ${lineNum}: Created or updated ${varName}. Now: ${currentState}`;
        }

        // Variable Assignment: detect simple variable assignment (NOT input, NOT list)
        const simpleAssignMatch = code.match(/(\w+)\s*=\s*(.+)/);
        if (simpleAssignMatch && !code.includes('[') && !code.includes('input(')) {
            const varName = simpleAssignMatch[1];
            const currentState = currentVariables[varName] !== undefined ? currentVariables[varName] : '';
            console.log(`[PHASE 1 DEBUG] Simple assignment ${varName}: state=${currentState}`);
            return `Line ${lineNum}: Stored ${varName} = ${currentState}`;
        }

        // Fallback: acknowledge step completion with variable count for debugging
        console.warn(`[PHASE 1 DEBUG] No pattern matched for: "${code}". Variables available: ${debugVarState}`);
        return `Line ${lineNum} executed!`;

    } catch (e) {
        console.error("Error in generateDynamicNarration:", e, "Step:", step);
        return `Line ${step.lineNumber + 1} executed!`;
    }
}

// ============ PHASE 4: MERGE LOGIC + AI EXPLANATIONS ============
/**
 * STRICT 1:1 LINE SYNC GUARANTEE:
 * Line N shows the explanation for Line N.
 * No heuristics. No fallbacks to index.
 * If AI explanation exists for the line, use it with live variable hydration.
 * Otherwise, use dynamic narration.
 */
function generateStepExplanation(step) {
    try {
        const lineNum = step.lineNumber + 1;
        const dynamicExpl = generateDynamicNarration(step);
        let finalMessage = "";

        // *** DEBUG LOGGING ***
        console.log(`\n[PHASE 4 SEARCH] Looking for line ${lineNum}`);
        console.log(`[PHASE 4 SEARCH] smartExplanations.length = ${smartExplanations.length}`);

        // STRICT MATCHING: Look for explanation with matching lineNumber (mapped from executionPlan)
        const bestAI = smartExplanations.find(e => {
            const matches = e.lineNumber === lineNum;
            console.log(`[PHASE 4 SEARCH] Step ${e.step}: e.lineNumber=${e.lineNumber} vs lineNum=${lineNum} → ${matches}`);
            return matches;
        });

        if (bestAI && bestAI.explanation) {
            // AI explanation exists for this line -> USE IT
            console.log(`[PHASE 4 SYNC] Line ${lineNum} → ✅ AI explanation FOUND (Step ${bestAI.step})`);
            console.log(`[PHASE 4 SYNC] Explanation: "${bestAI.explanation.substring(0, 80)}..."`);

            let aiTemplate = bestAI.explanation;

            // Hydrate {{varName}} placeholders with LIVE post-op values
            aiTemplate = aiTemplate.replace(/{{([a-zA-Z0-9_]+)}}/g, (match, varName) => {
                if (currentVariables[varName] !== undefined) {
                    const hydratedVal = currentVariables[varName];
                    console.log(`[PHASE 4 HYDRATE] {{${varName}}} → ${hydratedVal}`);
                    return `**${hydratedVal}**`;
                }
                return match;
            });

            // Hydrate {{USER_INPUT_X}} placeholders
            aiTemplate = aiTemplate.replace(/{{USER_INPUT_(\d+)}}/g, (match, idx) => {
                const parsedIdx = parseInt(idx);
                if (allUserInputs[parsedIdx] !== undefined) {
                    const inputVal = allUserInputs[parsedIdx];
                    console.log(`[PHASE 4 HYDRATE] {{USER_INPUT_${parsedIdx}}} → ${inputVal}`);
                    return `**${inputVal}**`;
                }
                return match;
            });

            finalMessage = aiTemplate;
            console.log(`[PHASE 4 SYNC] Line ${lineNum} → AI explanation (hydrated)\n`);
        } else {
            // No AI explanation for this line -> Fall back to dynamic narration
            finalMessage = dynamicExpl;
            console.log(`[PHASE 4 SYNC] Line ${lineNum} → Dynamic narration (no AI explanation)\n`);
        }

        // Final UI push
        showTeacher(finalMessage);

    } catch (e) {
        console.error("Fusion Engine Error:", e);
        showTeacher(`Line ${step.lineNumber + 1} executed! Check memory bank for updates.`);
    }
}

async function generateErrorExplanation(error, code, line = null) {
    const output = document.getElementById('output');
    output.innerHTML = `<span class="error">❌ Error: ${error.message}</span>`;
    showTeacher("🔍 Check your syntax and try again!");
    if (line !== null) highlightErrorLine(line);
}

// ============ NAVIGATION ============
document.getElementById('backBtn').onclick = async () => {
    if (currentStep > 0) {
        abortSignal++;
        activeInnerSteps = 0;

        // Immediate Cleanup
        removeIfTree();
        removeBrainThoughtBox();
        removeStaticThoughtTrail();
        cleanupLenCounters();
        cleanupIndexDivs();
        cleanupCountDivs();
        cleanupPopElements();
        cleanupRemoveElements_v1();
        cleanupReverseElements();
        cleanupSortElements();
        cleanupClearElements();
        const mainStepBtn = document.getElementById('stepBtn');
        mainStepBtn.classList.remove('pulse-highlight');
        mainStepBtn.disabled = false;

        currentStep--;

        // Phase 5 Cleanup: If we move back to an IF-block, we should "un-splice" the branch
        const stepUnderReview = executionPlan[currentStep];
        if (stepUnderReview.type === 'if-block' && stepUnderReview.numInjected > 0) {
            executionPlan.splice(currentStep + 1, stepUnderReview.numInjected);
            stepUnderReview.numInjected = 0;
            totalSteps = executionPlan.length;
        }
        if (stepUnderReview.type === 'loop-block' && stepUnderReview.numInjected > 0) {
            executionPlan.splice(currentStep + 1, stepUnderReview.numInjected);
            stepUnderReview.numInjected = 0;
            totalSteps = executionPlan.length;
        }

        const lastListData = listStepHistory.pop();
        if (lastListData) {
            await undoListStep(lastListData);
        }

        const lastLoopData = loopStepHistory.pop();
        if (lastLoopData) {
            await undoLoopStep(lastLoopData);
        }

        reverseLastAnimation();
        updateStepIndicator();
        updateButtons();
        showTeacher(`Back to Step ${currentStep}.`);

        if (currentStep > 0) {
            highlightLine(executionPlan[currentStep - 1].lineNumber);
        } else if (currentLineMarker) {
            currentLineMarker.clear();
            currentLineMarker = null;
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
                if (action.isNew) {
                    if (action.type === 'memory' && action.element?.classList?.contains('list-container')) {
                        const varName = action.element.dataset.varName;
                        if (varName) renderedLists.delete(varName);
                    }
                    action.element.remove();
                }
            }
        });
        animationHistory.pop();
    });
}

document.getElementById('resetBtn').onclick = () => location.reload();

// ============ HELPERS ============
function highlightLine(lineNum) {
    if (currentLineMarker) currentLineMarker.clear();
    currentLineMarker = editor.markText({ line: lineNum, ch: 0 }, { line: lineNum, ch: editor.getLine(lineNum).length }, { className: 'step-line-highlight' });
    editor.scrollIntoView({ line: lineNum, ch: 0 }, 50);

    const topFrame = loopVisualStack[loopVisualStack.length - 1];
    if (topFrame?.loopMeta && glassState?.cursorEl) {
        const range = getLoopBodyRange(topFrame.loopMeta);
        if (lineNum >= range.startLine && lineNum <= range.endLine) {
            updateActiveLine(editor, lineNum, glassState.cursorEl);
        }
    }
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
    sounds.notification.play().catch(() => { });
}

function updateStepIndicator() {
    document.getElementById('stepIndicator').textContent = isRunning ? `Step ${currentStep}/${totalSteps}` : 'Ready to run...';
}

// ============ PHASE 3: COMPLETION CELEBRATION ============

function updateButtons() {
    document.getElementById('backBtn').disabled = (currentStep === 0);
    // Keep Step button enabled even at the end so users can trigger celebration or see state
    document.getElementById('stepBtn').disabled = (activeInnerSteps > 0 || !isRunning);

    if (currentStep >= totalSteps && !isCompleted) {
        isCompleted = true;
        // FIXED BUG: 5-Second delay so the final explanation doesn't get overwritten!
        setTimeout(() => {
            // Only show if we are STILL at the end and haven't stepped back
            if (currentStep >= totalSteps && isRunning) {
                showTeacher("🎉 Excellent! You've learned how Python executes this step-by-step!");
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                }
            }
        }, 5000);
    } else if (currentStep < totalSteps) {
        isCompleted = false;
    }
}

// ==============================================
// LEVEL 6: IF-STATEMENT ENGINE
// ==============================================

// ============ RECURSIVE EXECUTION PLAN BUILDER ============
function buildExecutionPlan(lines, startIdx = 0, baseIndent = 0) {
    const getIndentWidth = (text) => {
        const m = text.match(/^(\s*)/);
        if (!m) return 0;
        let width = 0;
        for (const ch of m[1]) {
            width += ch === '\t' ? 4 : 1;
        }
        return width;
    };

    const stripInlineComment = (text) => {
        let inSingle = false;
        let inDouble = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === "'" && !inDouble) inSingle = !inSingle;
            else if (ch === '"' && !inSingle) inDouble = !inDouble;
            else if (ch === '#' && !inSingle && !inDouble) {
                return text.slice(0, i);
            }
        }
        return text;
    };

    const plan = [];
    let i = startIdx;

    while (i < lines.length) {
        const line = lines[i];
        const strippedLine = stripInlineComment(line);
        const trimmed = strippedLine.trim();

        if (!trimmed || trimmed.startsWith('#')) { i++; continue; }

        const indent = getIndentWidth(line);
        if (indent < baseIndent) break;

        if (indent === baseIndent && trimmed.match(/^for\b/)) {
            const forMatch = trimmed.match(/^for\s+(\w+)\s+in\s+(.+)\s*:/);
            const iterVar = forMatch ? forMatch[1] : null;
            const iterableExpr = forMatch ? forMatch[2].trim() : null;

            // Find first body line indent
            let bodyStart = i + 1;
            while (bodyStart < lines.length) {
                const bodyTrimmed = stripInlineComment(lines[bodyStart]).trim();
                if (bodyTrimmed && !bodyTrimmed.startsWith('#')) break;
                bodyStart++;
            }

            let bodyPlan = [];
            let newI = bodyStart;
            let bodyEndLine = i;

            if (bodyStart < lines.length) {
                const bodyIndent = getIndentWidth(lines[bodyStart]);
                if (bodyIndent > baseIndent) {
                    const subRes = buildExecutionPlan(lines, bodyStart, bodyIndent);
                    bodyPlan = subRes.plan;
                    newI = subRes.newI;
                    bodyEndLine = subRes.newI - 1;
                }
            }

            plan.push({
                lineNumber: i,
                code: line,
                type: 'loop-block',
                loopMeta: {
                    type: 'for',
                    headerLine: i,
                    iterVar,
                    iterableExpr,
                    bodyPlan,
                    endLine: bodyEndLine
                }
            });
            i = newI;
        } else if (indent === baseIndent && trimmed.match(/^while\b/)) {
            const whileMatch = trimmed.match(/^while\s+(.+)\s*:/);
            const condition = whileMatch ? whileMatch[1].trim() : null;

            let bodyStart = i + 1;
            while (bodyStart < lines.length) {
                const bodyTrimmed = stripInlineComment(lines[bodyStart]).trim();
                if (bodyTrimmed && !bodyTrimmed.startsWith('#')) break;
                bodyStart++;
            }

            let bodyPlan = [];
            let newI = bodyStart;
            let bodyEndLine = i;
            if (bodyStart < lines.length) {
                const bodyIndent = getIndentWidth(lines[bodyStart]);
                if (bodyIndent > baseIndent) {
                    const subRes = buildExecutionPlan(lines, bodyStart, bodyIndent);
                    bodyPlan = subRes.plan;
                    newI = subRes.newI;
                    bodyEndLine = subRes.newI - 1;
                }
            }

            plan.push({
                lineNumber: i,
                code: line,
                type: 'loop-block',
                loopMeta: {
                    type: 'while',
                    headerLine: i,
                    condition,
                    bodyPlan,
                    endLine: bodyEndLine
                }
            });
            i = newI;
        } else if (indent === baseIndent && trimmed.match(/^if\b/)) {
            const ifStructure = { hasIf: true, startLine: i, conditions: [] };
            let currentType = 'if';
            let currentCond = trimmed.replace(/^if\b/, '').replace(/:$/, '').trim();
            let condStartLine = i;
            i++;

            while (i < lines.length) {
                let peek = i;
                while (peek < lines.length) {
                    const peekTrim = stripInlineComment(lines[peek]).trim();
                    if (peekTrim && !peekTrim.startsWith('#')) break;
                    peek++;
                }
                if (peek >= lines.length) { i = peek; break; }

                const peekIndent = getIndentWidth(lines[peek]);
                const peekTrimmed = stripInlineComment(lines[peek]).trim();

                if (peekIndent > baseIndent) {
                    // Sub-block — collect recursively
                    const subRes = buildExecutionPlan(lines, peek, peekIndent);
                    ifStructure.conditions.push({
                        type: currentType,
                        condition: currentCond,
                        lineNum: condStartLine,
                        block: subRes.plan.map(s => ({
                            code: s.code,
                            lineNum: s.lineNumber,
                            type: s.type,
                            ifStructure: s.ifStructure,
                            loopMeta: s.loopMeta
                        }))
                    });
                    i = subRes.newI;
                } else if (peekIndent === baseIndent && (peekTrimmed.match(/^elif\b/) || peekTrimmed.startsWith('else:'))) {
                    // Ensure previous branch is sealed
                    if (ifStructure.conditions.length === 0 ||
                        ifStructure.conditions[ifStructure.conditions.length - 1].lineNum !== condStartLine) {
                        ifStructure.conditions.push({ type: currentType, condition: currentCond, lineNum: condStartLine, block: [] });
                    }
                    if (peekTrimmed.match(/^elif\b/)) {
                        currentType = 'elif';
                        currentCond = peekTrimmed.replace(/^elif\b/, '').replace(/:$/, '').trim();
                    } else {
                        currentType = 'else';
                        currentCond = 'True';
                    }
                    condStartLine = peek;
                    i = peek + 1;
                } else {
                    // Back to same/lower indent not elif/else — if-block ends
                    if (ifStructure.conditions.length === 0 ||
                        ifStructure.conditions[ifStructure.conditions.length - 1].lineNum !== condStartLine) {
                        ifStructure.conditions.push({ type: currentType, condition: currentCond, lineNum: condStartLine, block: [] });
                    }
                    break;
                }
            }
            ifStructure.endLine = i - 1;
            plan.push({ lineNumber: ifStructure.startLine, code: lines[ifStructure.startLine], type: 'if-block', ifStructure });
        } else {
            if (indent === baseIndent && trimmed.match(/^break\b/)) {
                plan.push({ lineNumber: i, code: line, type: 'loop-break' });
                i++;
                continue;
            }
            if (indent === baseIndent && trimmed.match(/^continue\b/)) {
                plan.push({ lineNumber: i, code: line, type: 'loop-continue' });
                i++;
                continue;
            }
            plan.push({
                lineNumber: i,
                code: line,
                type: trimmed.includes('input(') ? 'input' : trimmed.includes('print(') ? 'print' : 'assignment'
            });
            i++;
        }
    }
    return { plan, newI: i };
}

// ============ BLACKING ANIMATION ============
async function doBlackingAnimation() {
    const panels = document.querySelectorAll('.panel');
    const body = document.body;
    await Promise.all([...panels].map(p => gsap.to(p, { opacity: 0, duration: 0.8 })));
    await gsap.to(body, { background: '#8b5cf6', duration: 0.5 });
    await gsap.to(body, { background: '#000000', duration: 0.8 });
}

// ============ REVERSE BLACKING ANIMATION ============
async function reverseBlackingAnimation() {
    const panels = document.querySelectorAll('.panel');
    const body = document.body;
    await gsap.to(body, { background: '#8b5cf6', duration: 0.8 });
    await gsap.to(body, { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', duration: 0.5 });
    await Promise.all([...panels].map(p => gsap.to(p, { opacity: 1, duration: 0.8 })));
}

// ============ BUILD 4-COLUMN IF-TREE ============
async function buildIfTree(ifStructure) {
    const existing = document.getElementById('ifTreeContainer');
    if (existing) existing.remove();

    const treeContainer = document.createElement('div');
    treeContainer.id = 'ifTreeContainer';
    treeContainer.style.cssText = `
        position:fixed;top:50%;right:5%;transform:translateY(-50%);
        width:64%;height:80%;max-height:80vh;z-index:10001;
    `;
    document.body.appendChild(treeContainer);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    treeContainer.appendChild(svg);

    const brain = document.createElement('div');
    brain.id = 'brainNode';
    brain.style.cssText = `
        position:absolute;left:45px;top:50%;transform:translateY(-50%);
        width:80px;height:80px;background:white;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:2.5rem;box-shadow:0 0 20px rgba(255,255,255,0.5);opacity:0;z-index:2;
    `;
    brain.textContent = '🧠';
    treeContainer.appendChild(brain);
    await gsap.to(brain, { opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.7)' });
    await new Promise(r => setTimeout(r, 300));

    const numBranches = ifStructure.conditions.length;
    const gap = 40;             // Fixed gap between branches
    const col2X = 225, col3X = 425, col4X = 675;

    // ===== PRE-RENDER PASS: Measure actual content heights =====
    const measurements = [];
    for (let i = 0; i < numBranches; i++) {
        const condition = ifStructure.conditions[i];
        const codeContent = getFullBlockCode(condition.block);
        const blockLabel = condition.type === 'if' ? 'if block'
            : condition.type === 'elif' ? 'elif block' : 'else block';

        // Create invisible temporary block to measure
        const tempBlock = document.createElement('div');
        tempBlock.style.cssText = `
            position:fixed;visibility:hidden;left:-9999px;top:-9999px;
            width:300px;padding:15px 20px;background:rgba(255,255,255,0.05);
            border:2px solid white;border-radius:12px;color:white;
            font-family:'Courier New',monospace;font-size:13px;
            display:flex;flex-direction:column;
        `;

        // Temp header
        const tempHeader = document.createElement('div');
        tempHeader.style.cssText = `
            font-weight:900;font-size:16px;margin-bottom:10px;color:#a78bfa;
            text-transform:uppercase;letter-spacing:1px;flex-shrink:0;
        `;
        tempHeader.textContent = blockLabel;
        tempBlock.appendChild(tempHeader);

        // Temp content
        const tempContent = document.createElement('div');
        tempContent.style.cssText = `
            color:#10b981;line-height:1.5;
            white-space:pre-wrap;word-break:break-word;
        `;
        tempContent.textContent = codeContent;
        tempBlock.appendChild(tempContent);

        document.body.appendChild(tempBlock);

        // Measure actual height and calculate dynamic block height
        const contentHeight = tempBlock.offsetHeight;
        const blockHeight = Math.min(contentHeight + 20, 300);  // +20 for safety, capped at 300px
        measurements.push(blockHeight);

        tempBlock.remove();
    }

    // ===== Calculate total spacing and start position =====
    let totalHeight = measurements.reduce((a, b) => a + b, 0) + (numBranches - 1) * gap;
    let startY = (treeContainer.clientHeight - totalHeight) / 2;
    startY = Math.max(startY, 40);  // Ensure minimum space from top

    // ===== POSITIONING PASS: Build tree with measured heights =====
    let currentY = startY;

    for (let i = 0; i < numBranches; i++) {
        const condition = ifStructure.conditions[i];
        const branchY = currentY;
        const blockHeight = measurements[i];

        // Keyword node (if/elif/else)
        const kwNode = document.createElement('div');
        kwNode.className = 'tree-keyword-node';
        kwNode.style.cssText = `
            position:absolute;left:${col2X}px;top:${branchY + 60}px;
            padding:12px 20px;background:rgba(255,255,255,0.15);border:2px solid white;
            border-radius:25px;color:white;font-family:'Courier New',monospace;
            font-size:16px;font-weight:bold;text-align:center;opacity:0;z-index:2;
            box-shadow:0 0 0 transparent;
        `;
        kwNode.textContent = condition.type;
        treeContainer.appendChild(kwNode);
        await gsap.to(kwNode, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
        drawCurvedEdge(svg, 45 + 40, treeContainer.clientHeight / 2, col2X, branchY + 72);
        await new Promise(r => setTimeout(r, 200));

        // Condition node
        const condNode = document.createElement('div');
        condNode.className = 'tree-condition-node';
        condNode.style.cssText = `
            position:absolute;left:${col3X}px;top:${branchY + 50}px;
            padding:15px 20px;background:rgba(255,255,255,0.1);border:2px solid white;
            border-radius:12px;color:white;font-family:'Courier New',monospace;
            font-size:14px;text-align:center;min-width:150px;opacity:0;z-index:2;
            box-shadow:0 0 0 transparent;
        `;
        condNode.innerHTML = condition.type === 'else'
            ? `<div style="font-weight:bold;margin-bottom:5px;">Condition</div><div style="font-size:12px;opacity:0.8;">no condition</div>`
            : `<div style="font-weight:bold;margin-bottom:5px;">Condition</div><div style="color:#4ade80;">${condition.condition}</div>`;
        treeContainer.appendChild(condNode);
        await gsap.to(condNode, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' });

        const kwRect = kwNode.getBoundingClientRect();
        const cRect = condNode.getBoundingClientRect();
        const ctRect = treeContainer.getBoundingClientRect();
        drawCurvedEdge(svg,
            kwRect.right - ctRect.left, kwRect.top + kwRect.height / 2 - ctRect.top,
            cRect.left - ctRect.left, cRect.top + cRect.height / 2 - ctRect.top);
        await new Promise(r => setTimeout(r, 200));

        // Code block node with internal scrolling (dynamic height)
        const blockLabel = condition.type === 'if' ? 'if block'
            : condition.type === 'elif' ? 'elif block' : 'else block';
        const codeContent = getFullBlockCode(condition.block);
        const codeBlock = document.createElement('div');
        codeBlock.className = 'tree-code-block';
        codeBlock.style.cssText = `
            position:absolute;left:${col4X}px;top:${branchY + 20}px;
            width:300px;height:${blockHeight}px;
            padding:15px 20px;background:rgba(255,255,255,0.05);border:2px solid white;
            border-radius:12px;color:white;font-family:'Courier New',monospace;
            font-size:13px;opacity:0;z-index:2;
            box-shadow:0 0 0 transparent;
            display:flex;flex-direction:column;overflow:hidden;
        `;

        // Create header (always visible, doesn't scroll)
        const header = document.createElement('div');
        header.style.cssText = `
            font-weight:900;font-size:16px;margin-bottom:10px;color:#a78bfa;
            text-transform:uppercase;letter-spacing:1px;flex-shrink:0;
        `;
        header.textContent = blockLabel;
        codeBlock.appendChild(header);

        // Create scrollable code content area
        const scrollContent = document.createElement('div');
        scrollContent.style.cssText = `
            color:#10b981;line-height:1.5;overflow-y:auto;flex:1;
            white-space:pre-wrap;word-break:break-word;padding-right:8px;
        `;
        scrollContent.textContent = codeContent;
        codeBlock.appendChild(scrollContent);

        treeContainer.appendChild(codeBlock);
        await gsap.to(codeBlock, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' });

        const cbRect = codeBlock.getBoundingClientRect();
        drawCurvedEdge(svg,
            cRect.right - ctRect.left, cRect.top + cRect.height / 2 - ctRect.top,
            cbRect.left - ctRect.left, cbRect.top + cbRect.height / 2 - ctRect.top);

        // Advance to next branch position with dynamic spacing
        currentY += blockHeight + gap;
        await new Promise(r => setTimeout(r, 250));
    }
}

function drawCurvedEdge(svg, x1, y1, x2, y2) {
    const midX = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${y1}, ${midX} ${(y1 + y2) / 2} T ${x2} ${y2}`);
    path.setAttribute('stroke', 'white');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('opacity', '0');
    svg.appendChild(path);
    gsap.to(path, { attr: { opacity: 0.4 }, duration: 0.4, ease: 'power2.out' });
}

async function removeIfTree() {
    const tc = document.getElementById('ifTreeContainer');
    if (!tc) return;
    await gsap.to(tc, { opacity: 0, duration: 0.5 });
    tc.remove();
}

// ============ BRAIN THOUGHT BOX ============
async function createBrainThoughtBox() {
    // Draw the dotted thought trail from brain → box before box appears
    await createStaticThoughtTrail();
    await new Promise(r => setTimeout(r, 200));

    const thoughtBox = document.createElement('div');
    thoughtBox.id = 'brainThoughtBox';
    thoughtBox.style.cssText = `
        position:fixed;left:80px;top:calc(50% - 45px);transform:translateY(-50%);
        width:350px;min-height:150px;padding:20px 25px;
        background:#000;border:3px solid #fbbf24;border-radius:16px;
        box-shadow:0 0 20px rgba(251,191,36,0.6);z-index:10002;
        color:white;font-family:'Segoe UI',sans-serif;font-size:14px;line-height:1.6;opacity:0;
    `;
    thoughtBox.innerHTML = `
        <div id="brainThoughtContent" style="opacity:1;margin-bottom:15px;"></div>
        <button id="continueThinkingBtn" style="
            width:100%;padding:12px 20px;
            background:linear-gradient(135deg,#8b5cf6 0%,#6d28d9 100%);
            color:white;border:none;border-radius:8px;font-size:14px;
            font-weight:bold;cursor:pointer;font-family:'Courier New',monospace;
            text-transform:uppercase;letter-spacing:1px;
        ">CONTINUE THINKING</button>
    `;
    document.body.appendChild(thoughtBox);
    await gsap.to(thoughtBox, { opacity: 1, duration: 0.8 });
    gsap.to(thoughtBox, {
        boxShadow: '0 0 40px rgba(251,191,36,1)',
        duration: 1, yoyo: true, repeat: -1, ease: 'power1.inOut'
    });
}

function removeBrainThoughtBox() {
    const box = document.getElementById('brainThoughtBox');
    if (!box) return;
    // Also clean up the dotted thought trail
    removeStaticThoughtTrail();
    gsap.to(box, { opacity: 0, duration: 0.5, onComplete: () => box.remove() });
}

async function updateBrainThought(message) {
    const content = document.getElementById('brainThoughtContent');
    if (!content) return;
    await gsap.to(content, { opacity: 0, duration: 0.3 });
    content.innerHTML = message;
    await gsap.to(content, { opacity: 1, duration: 0.3 });
}

// ============ SKIP ANIMATION ENGINE ============
let skipAnimationSignal = null; // Resolves when "Skip" is clicked

function createSkipButton(onSkip) {
    const btn = document.createElement('button');
    btn.id = 'skipAnimationBtn';
    btn.style.cssText = `
        position:fixed;bottom:30px;left:30px;padding:15px 30px;
        background:rgba(139, 92, 246, 0.2);backdrop-filter:blur(10px);
        color:white;border:2px solid #8b5cf6;border-radius:12px;
        font-family:'Segoe UI',sans-serif;font-weight:bold;
        font-size:14px;cursor:pointer;z-index:99999;
        transition:all 0.3s;letter-spacing:1px;
        opacity:0;transform:translateY(20px);
    `;
    btn.innerHTML = `<span style="margin-right:8px;">⏭️</span> SKIP ANIMATION`;

    document.body.appendChild(btn);
    gsap.to(btn, { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)' });

    btn.onmouseenter = () => {
        btn.style.background = '#8b5cf6';
        btn.style.boxShadow = '0 0 20px rgba(139, 92, 246, 0.6)';
    };
    btn.onmouseleave = () => {
        btn.style.background = 'rgba(139, 92, 246, 0.2)';
        btn.style.boxShadow = 'none';
    };
    btn.onclick = () => {
        if (onSkip) onSkip();
        gsap.to(btn, { opacity: 0, y: 20, duration: 0.3, onComplete: () => btn.remove() });
    };
    return btn;
}

function removeSkipButton() {
    const btn = document.getElementById('skipAnimationBtn');
    if (btn) {
        gsap.to(btn, { opacity: 0, y: 20, duration: 0.3, onComplete: () => btn.remove() });
    }
}

function waitForContinueThinking() {
    const localSignal = abortSignal;
    return new Promise(resolve => {
        const btn = document.getElementById('continueThinkingBtn');
        if (!btn) { resolve(); return; }
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';

        // Skip listener
        const skipInterval = setInterval(() => {
            if (skipAnimationSignal) {
                clearInterval(skipInterval);
                clearInterval(check);
                btn.removeEventListener('click', handler);
                resolve('skip');
            }
        }, 50);

        const check = setInterval(() => {
            if (localSignal !== abortSignal) {
                clearInterval(check);
                clearInterval(skipInterval);
                resolve();
            }
        }, 100);

        const handler = () => {
            clearInterval(check);
            clearInterval(skipInterval);
            sounds.enter.play().catch(() => { });
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.removeEventListener('click', handler);
            resolve();
        };
        btn.addEventListener('click', handler);
    });
}

function getInitialThoughtMessage(ifStructure) {
    const n = ifStructure.conditions.length;
    const hasElse = ifStructure.conditions.some(c => c.type === 'else');
    return `
        <p style="margin-bottom:12px;">🧠 <strong>Brain's job:</strong> Check each condition in order.</p>
        <p style="margin-bottom:12px;">✨ <strong>The rule:</strong> Execute the <em>first</em> TRUE condition's block.</p>
        <p style="color:#fbbf24;margin-top:15px;">Ready to evaluate ${n} condition${n > 1 ? 's' : ''}${hasElse ? ' (else catches the rest)' : ''}...</p>
    `;
}

// ============ CONDITION EVALUATION ============
async function evaluateConditionExpression(expr) {
    try {
        // We let Pyodide handle the evaluation directly using its current memory state.
        // This avoids the bug where strings like "13" were converted to ints during substitution.
        const res = await pyodide.runPythonAsync(`bool(${expr})`);
        return res;
    } catch (e) {
        const message = e?.message || String(e);
        throw makeHandledError(message, e);
    }
}

async function executeIfStep(step) {
    const localSignal = abortSignal;
    document.getElementById('backBtn').disabled = true;

    // Reset skip signal
    skipAnimationSignal = false;
    let skipBtn = null;

    try {
        // 1. Blackout
        await doBlackingAnimation();
        if (localSignal !== abortSignal) return null;

        // --- SKIP BUTTON APPEARS ---
        skipBtn = createSkipButton(() => {
            skipAnimationSignal = true;
        });

        // 2. Build the 4-column visual tree
        await buildIfTree(step.ifStructure);
        if (localSignal !== abortSignal) return null;
        if (skipAnimationSignal) throw 'skip';

        // 3. Brain thought box
        await createBrainThoughtBox();
        if (localSignal !== abortSignal) return null;
        if (skipAnimationSignal) throw 'skip';

        await updateBrainThought(getInitialThoughtMessage(step.ifStructure));
        const waitInit = await waitForContinueThinking();
        if (waitInit === 'skip' || skipAnimationSignal) throw 'skip';
        if (localSignal !== abortSignal) return null;

        // 4. Evaluate conditions interactively
        const chosenBranch = await evaluateConditionsWithThought(step.ifStructure);
        if (chosenBranch === -3 || skipAnimationSignal) throw 'skip';
        if (localSignal !== abortSignal) return null;

        // 5. Cleanup and return will happen in Success Path

        // 6. Return chosen block's lines AND the condition result to the main Step engine
        if (chosenBranch >= 0) {
            const chosenBlock = step.ifStructure.conditions[chosenBranch].block;
            const chosenCondition = step.ifStructure.conditions[chosenBranch];
            const branchLines = chosenBlock.map(blockItem => ({
                code: blockItem.code,
                lineNumber: blockItem.lineNum,
                type: blockItem.type,
                ifStructure: blockItem.ifStructure,
                loopMeta: blockItem.loopMeta
            }));
            const enclosingLoop = getTargetLoopMeta(step);
            if (enclosingLoop) annotateLoopSteps(branchLines, enclosingLoop);
            return {
                branchLines,
                // PHASE 2: Track which condition was chosen for narration
                chosenBranchIndex: chosenBranch,
                chosenConditionType: chosenCondition.type,
                chosenConditionExpr: chosenCondition.condition,
                conditionResult: chosenBranch === step.ifStructure.conditions.findIndex(c => c.type === 'else') ? 'all-previous-false' : 'true'
            };
        }
        return null;
    } catch (e) {
        if (e === 'skip') {
            console.log("⏩ Animation skipped by user. Determining branch result...");
            let cb = -1;
            for (let i = 0; i < step.ifStructure.conditions.length; i++) {
                const c = step.ifStructure.conditions[i];
                const res = c.type === 'else' ? true : await evaluateConditionExpression(c.condition);
                if (res) { cb = i; break; }
            }
            if (cb >= 0) {
                const bl = step.ifStructure.conditions[cb].block;
                const cond = step.ifStructure.conditions[cb];
                const branchLines = bl.map(i => ({
                    code: i.code,
                    lineNumber: i.lineNum,
                    type: i.type,
                    ifStructure: i.ifStructure,
                    loopMeta: i.loopMeta
                }));
                const enclosingLoop = getTargetLoopMeta(step);
                if (enclosingLoop) annotateLoopSteps(branchLines, enclosingLoop);
                return {
                    branchLines,
                    chosenBranchIndex: cb,
                    chosenConditionType: cond.type,
                    chosenConditionExpr: cond.condition,
                    conditionResult: 'true'
                };
            }
            return null;
        } else {
            console.error('If execution error:', e);
            throw e;
        }
    } finally {
        removeSkipButton();
        removeBrainThoughtBox();
        await removeIfTree();
        await reverseBlackingAnimation();
        document.getElementById('backBtn').disabled = false;
    }
}

async function evaluateConditionsWithThought(ifStructure) {
    const localSignal = abortSignal;
    for (let i = 0; i < ifStructure.conditions.length; i++) {
        const condition = ifStructure.conditions[i];

        await updateBrainThought(`
            <p style="margin-bottom:10px;">🔍 <strong>Checking condition ${i + 1}/${ifStructure.conditions.length}:</strong></p>
            <p style="font-size:16px;color:#fbbf24;margin:12px 0;font-family:'Courier New',monospace;">${condition.condition}</p>
            <p style="color:#94a3b8;">Click Continue to evaluate...</p>
        `);
        const wait1 = await waitForContinueThinking();
        if (wait1 === 'skip' || skipAnimationSignal) return -3;
        if (localSignal !== abortSignal) return -2;

        await highlightConditionNode(i);
        await animateElectricity(i);

        await updateBrainThought(`
            <p style="color:#fbbf24;font-size:16px;">⚙️ Evaluating condition...</p>
            <p style="color:#94a3b8;margin-top:8px;">Click Continue to see the result.</p>
        `);
        const wait2 = await waitForContinueThinking();
        if (wait2 === 'skip' || skipAnimationSignal) return -3;
        if (localSignal !== abortSignal) return -2;

        const result = condition.type === 'else' ? true : await evaluateConditionExpression(condition.condition);
        await transformToButton(i, result, condition);
        await colorPathFlow(i, result ? 'green' : 'red');

        await updateBrainThought(`
            <p style="font-size:24px;font-weight:bold;color:${result ? '#10b981' : '#ef4444'};margin:15px 0;text-align:center;">
                ${result ? '✅ TRUE!' : '❌ FALSE!'}
            </p>
            <p style="color:#e2e8f0;">${result ? '🎉 This block will execute!' : '⏭️ Checking next condition...'}</p>
        `);
        const wait3 = await waitForContinueThinking();
        if (wait3 === 'skip' || skipAnimationSignal) return -3;
        if (localSignal !== abortSignal) return -2;

        if (result) {
            const toDissolve = ifStructure.conditions.map((_, j) => j).filter(j => j !== i);
            if (toDissolve.length > 0) await dissolvePaths(toDissolve);
            await updateBrainThought(`<p style="font-size:20px;color:#10b981;text-align:center;margin:15px 0;">✅ Correct block chosen!</p>`);
            const wait4 = await waitForContinueThinking();
            if (wait4 === 'skip' || skipAnimationSignal) return -3;
            if (localSignal !== abortSignal) return -2;
            return i;
        }
    }

    await updateBrainThought(`<p style="font-size:20px;color:#ef4444;text-align:center;margin:15px 0;">⚠️ All conditions FALSE — no block executes.</p>`);
    const waitEnd = await waitForContinueThinking();
    if (waitEnd === 'skip' || skipAnimationSignal) return -3;
    await dissolvePaths(ifStructure.conditions.map((_, j) => j));
    return -1;
}

// ============ TREE NODE HELPERS ============
function getBranchNodes(branchIndex) {
    const tc = document.getElementById('ifTreeContainer');
    if (!tc) return null;
    const keywords = tc.querySelectorAll('.tree-keyword-node');
    const conditions = tc.querySelectorAll('.tree-condition-node');
    const codeBlocks = tc.querySelectorAll('.tree-code-block');
    if (branchIndex >= keywords.length) return null;
    return {
        keyword: keywords[branchIndex],
        condition: conditions[branchIndex],
        codeBlock: codeBlocks[branchIndex]
    };
}

function getBranchEdges(branchIndex) {
    const svg = document.querySelector('#ifTreeContainer svg');
    if (!svg) return null;
    const paths = svg.querySelectorAll('path');
    const start = branchIndex * 3;
    return {
        brainToKeyword: paths[start],
        keywordToCondition: paths[start + 1],
        conditionToCode: paths[start + 2]
    };
}

async function transformToButton(branchIndex, isTrue, condition) {
    const nodes = getBranchNodes(branchIndex);
    if (!nodes) return;

    const color = isTrue ? '#10b981' : '#ef4444';
    const label = isTrue ? 'TRUE' : 'FALSE';
    nodes.condition.innerHTML = '';

    // ── Reset container: kill yellow glow from highlightConditionNode ──
    // The container was given boxShadow + borderColor by highlightConditionNode.
    // We wipe those inline styles so only the button inside is visible.
    gsap.killTweensOf(nodes.condition);
    nodes.condition.style.boxShadow = 'none';
    nodes.condition.style.border = 'none';
    nodes.condition.style.background = 'transparent';
    nodes.condition.style.padding = '0';

    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = `
        width:100%;padding:20px 30px;background:${color};border:3px solid white;
        border-radius:12px;color:white;font-family:'Courier New',monospace;
        font-size:24px;font-weight:bold;cursor:pointer;transition:all 0.3s;
    `;
    button.addEventListener('mouseenter', () => { button.style.transform = 'scale(1.05)'; });
    button.addEventListener('mouseleave', () => { button.style.transform = 'scale(1)'; });
    button.addEventListener('click', () => openExpressionEvaluator(condition, isTrue));
    nodes.condition.appendChild(button);

    if (isTrue) {
        const pulse = gsap.timeline({ repeat: -1 });
        pulse.to(button, { background: '#059669', duration: 1, ease: 'power1.inOut' });
        pulse.to(button, { background: '#10b981', duration: 1, ease: 'power1.inOut' });
        nodes.condition.pulseTimeline = pulse;
    }
}

function openExpressionEvaluator(condition, result) {
    const data = { expression: condition.condition, variables: currentVariables, result };
    // Path is relative to indexcontrol.html at /visualpython/indexcontrol.html
    const popup = window.open('levels/shared/expressionEvaluator.html', 'ExpressionEvaluator',
        'width=700,height=500,scrollbars=yes,resizable=yes');
    if (popup) {
        popup.addEventListener('load', () => popup.postMessage(data, '*'));
        setTimeout(() => popup.postMessage(data, '*'), 500);
    } else {
        alert('Popup blocked! Please allow popups for this site.');
    }
}

async function colorPathFlow(branchIndex, color) {
    const nodes = getBranchNodes(branchIndex);
    const edges = getBranchEdges(branchIndex);
    if (!nodes || !edges) return;
    const hex = color === 'green' ? '#10b981' : '#ef4444';
    const tl = gsap.timeline();
    if (edges.brainToKeyword) tl.to(edges.brainToKeyword, { attr: { stroke: hex, opacity: 1 }, duration: 0.3 });
    tl.to(nodes.keyword, { borderColor: hex, boxShadow: `0 4px 15px ${hex}`, duration: 0.3 }, '-=0.1');
    if (edges.keywordToCondition) tl.to(edges.keywordToCondition, { attr: { stroke: hex, opacity: 1 }, duration: 0.3 });
    if (edges.conditionToCode) tl.to(edges.conditionToCode, { attr: { stroke: hex, opacity: 1 }, duration: 0.3 });
    if (color === 'green') tl.to(nodes.codeBlock, { borderColor: hex, boxShadow: `0 0 40px ${hex}`, duration: 0.5, ease: 'power2.out' });
    else tl.to(nodes.codeBlock, { borderColor: hex, boxShadow: `0 4px 15px ${hex}`, duration: 0.3 });
    await tl;
}

async function dissolvePaths(branchIndices) {
    if (!branchIndices || branchIndices.length === 0) return;
    const allEl = [];
    branchIndices.forEach(idx => {
        const nodes = getBranchNodes(idx);
        const edges = getBranchEdges(idx);
        if (nodes) {
            if (nodes.condition.pulseTimeline) nodes.condition.pulseTimeline.kill();
            allEl.push(nodes.keyword, nodes.condition, nodes.codeBlock);
        }
        if (edges) allEl.push(edges.brainToKeyword, edges.keywordToCondition, edges.conditionToCode);
    });

    // Particle burst: 8 white dots explode outward from each element's centre
    const burstParticles = [];
    allEl.filter(Boolean).forEach(el => {
        if (!el || !el.getBoundingClientRect) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (let k = 0; k < 8; k++) {
            const p = document.createElement('div');
            p.style.cssText = `
                position:fixed;width:6px;height:6px;background:white;
                border-radius:50%;left:${cx}px;top:${cy}px;
                z-index:99999;pointer-events:none;
            `;
            document.body.appendChild(p);
            const angle = (Math.PI * 2 * k) / 8;
            const dist = 50 + Math.random() * 50;
            burstParticles.push({
                el: p,
                tx: cx + Math.cos(angle) * dist,
                ty: cy + Math.sin(angle) * dist
            });
        }
    });

    // Animate bursts and fade original elements simultaneously
    const tl = gsap.timeline();
    tl.to(allEl.filter(Boolean), { opacity: 0, duration: 0.5 }, 0);
    burstParticles.forEach(p => {
        tl.to(p.el, {
            left: p.tx, top: p.ty, opacity: 0,
            duration: 0.8, ease: 'power2.out',
            onComplete: () => p.el.remove()
        }, 0);
    });
    await tl;

    allEl.filter(Boolean).forEach(el => { if (el && el.remove) el.remove(); });
}

function getFullBlockCode(block, indent = "") {
    return block.map(item => {
        if (item.type === 'if-block' && item.ifStructure) {
            let res = indent + item.code.trim() + "\n";
            item.ifStructure.conditions.forEach(cond => {
                if (cond.type !== 'if') res += indent + cond.type + (cond.condition !== 'True' ? " " + cond.condition : "") + ":\n";
                res += getFullBlockCode(cond.block, indent + "    ") + "\n";
            });
            return res.trimEnd();
        }
        return indent + item.code.trim();
    }).join('\n');
}

function waitForNextStep() {
    const localSignal = abortSignal;
    return new Promise(resolve => {
        const btn = document.getElementById('stepBtn');
        btn.disabled = false;
        btn.classList.add('pulse-highlight');

        // Skip listener
        const skipInterval = setInterval(() => {
            if (skipAnimationSignal) {
                clearInterval(skipInterval);
                clearInterval(check);
                btn.classList.remove('pulse-highlight');
                btn.removeEventListener('click', handler);
                resolve('skip');
            }
        }, 50);

        const check = setInterval(() => {
            if (localSignal !== abortSignal) {
                clearInterval(check);
                clearInterval(skipInterval);
                btn.classList.remove('pulse-highlight');
                resolve();
            }
        }, 100);

        const handler = () => {
            clearInterval(check);
            clearInterval(skipInterval);
            btn.classList.remove('pulse-highlight');
            btn.disabled = true;
            btn.removeEventListener('click', handler);
            resolve();
        };
        btn.addEventListener('click', handler);
    });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ============ HIGHLIGHT CONDITION NODE (YELLOW GLOW) ============
async function highlightConditionNode(branchIndex) {
    const nodes = getBranchNodes(branchIndex);
    if (!nodes) return;
    await gsap.to(nodes.condition, {
        boxShadow: '0 0 30px rgba(234, 179, 8, 0.9)',
        borderColor: '#fbbf24',
        duration: 0.5,
        ease: 'power2.out'
    });
}

// ============ ANIMATE ELECTRICITY (BRAIN → KEYWORD → CONDITION) ============
async function animateElectricity(branchIndex) {
    const nodes = getBranchNodes(branchIndex);
    const edges = getBranchEdges(branchIndex);
    if (!nodes || !edges) return;

    const brain = document.getElementById('brainNode');
    if (!brain) return;
    const brainRect = brain.getBoundingClientRect();
    const treeContainer = document.getElementById('ifTreeContainer');
    const containerRect = treeContainer.getBoundingClientRect();

    const kwRect = nodes.keyword.getBoundingClientRect();
    const cRect = nodes.condition.getBoundingClientRect();

    // Create yellow electric spark
    const spark = document.createElement('div');
    spark.style.cssText = `
        position:absolute;width:12px;height:12px;background:#fbbf24;
        border-radius:50%;box-shadow:0 0 20px #fbbf24;z-index:10;
        left:${(brainRect.left + brainRect.width / 2) - containerRect.left}px;
        top:${brainRect.top + brainRect.height / 2 - containerRect.top}px;
    `;
    treeContainer.appendChild(spark);

    const kwX = kwRect.left + kwRect.width / 2 - containerRect.left;
    const kwY = kwRect.top + kwRect.height / 2 - containerRect.top;
    const cX = cRect.left - containerRect.left;
    const cY = cRect.top + cRect.height / 2 - containerRect.top;

    const tl = gsap.timeline();
    // Segment 1: Brain → Keyword
    tl.to(spark, { left: kwX, top: kwY, duration: 0.4, ease: 'power2.inOut' });
    // Segment 2: Keyword → Condition
    tl.to(spark, { left: cX, top: cY, duration: 0.4, ease: 'power2.inOut' });
    // Light up edges as spark passes
    if (edges.brainToKeyword) tl.to(edges.brainToKeyword, { attr: { opacity: 1, stroke: '#fbbf24' }, duration: 0.3 }, 0);
    if (edges.keywordToCondition) tl.to(edges.keywordToCondition, { attr: { opacity: 1, stroke: '#fbbf24' }, duration: 0.3 }, 0.4);
    await tl;
    spark.remove();
}

// ============ THOUGHT TRAIL (BRAIN → THOUGHT BOX) ============
async function createStaticThoughtTrail() {
    const brain = document.getElementById('brainNode');
    if (!brain) return;

    const brainRect = brain.getBoundingClientRect();
    const brainX = brainRect.left + brainRect.width / 2;
    const brainY = brainRect.top + brainRect.height / 2;

    // Target: top-right corner of the thought box (box is fixed at left:80px, width:350px)
    const boxX = 430;
    const boxY = window.innerHeight / 2 - 120;
    const midX = (brainX + boxX) / 2;
    const midY = (brainY + boxY) / 2 - 80; // stepper arc

    const svg = document.getElementById('trailSvg');
    if (!svg) return;

    const numParticles = 12;
    const particles = [];
    for (let i = 0; i < numParticles; i++) {
        const t = i / (numParticles - 1);
        // Quadratic bezier
        const x = Math.pow(1 - t, 2) * brainX + 2 * (1 - t) * t * midX + Math.pow(t, 2) * boxX;
        const y = Math.pow(1 - t, 2) * brainY + 2 * (1 - t) * t * midY + Math.pow(t, 2) * boxY;
        const size = 2 + (i / numParticles) * 5; // Smaller size to prevent overlap

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', size);
        circle.setAttribute('fill', 'white');
        circle.setAttribute('opacity', '0');
        circle.classList.add('thought-trail-particle');
        svg.appendChild(circle);
        particles.push({ element: circle, delay: i * 0.015 }); // Faster rapid-fire
    }

    // Stagger each dot appearing
    for (const p of particles) {
        await new Promise(r => setTimeout(r, p.delay * 1000));
        gsap.to(p.element, { attr: { opacity: 0.8 }, duration: 0.3, ease: 'power2.out' });
    }
}

function removeStaticThoughtTrail() {
    const particles = document.querySelectorAll('.thought-trail-particle');
    gsap.to([...particles], {
        attr: { opacity: 0 },
        duration: 0.5,
        onComplete: () => particles.forEach(p => p.remove())
    });
}
