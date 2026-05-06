/* ===================================
   Level 7: Lists - Main Script
   Phase 2: MILESTONE 1 - List Visualization Integration
   =================================== */

// ============ PHASE 2 IMPORTS ============
import { isListVariable, parseListContents } from '../shared/list/listDetector.js';
import { renderListTable } from '../shared/list/listRenderer.js';
import {
    animateListCreation,
    reverseListCreation,
    initializePianoSynth,
    initializeListSounds,
    animatePrintElement,
    animatePrintEntireList,
    animatePrintInvalidIndex,
    animateShallowCopy,          // ⭐ M8 - NEW
    animateAppend,               // ⭐ append() animation
    getListAliases               // ⭐ M8 - NEW
} from '../shared/list/listAnimations.js';

import {
    animateLen,
    animateIndex,
    animateCount,
    initializeScanSynth,
    initializeChordSynth,      // ⭐ BUG #2: chord synth init
    cleanupLenCounters,
    cleanupIndexDivs,
    cleanupCountDivs,
    animatePrintString
} from '../shared/list/listFactsAnimations.js';

// Change this line in lvl7script.js
import {
    animatePop,
    cleanupPopElements,
    animateRemove_v1,
    cleanupRemoveElements_v1,
    animateReverse,              // ⭐ reverse() animation (accurate swap)
    animateReverseSimplified,    // ⭐ reverse() animation (circular lane)
    cleanupReverseElements,      // ⭐ reverse() cleanup
    initializeScanSynth as initModScanSynth,   // Add this alias
    initializeChordSynth as initModChordSynth,  // Add this alias
    animateAppendImproved,       // 🆕 NEW: Improved append with pink trails
    animateInsert,                // 🆕 NEW: Insert animation
    animateClear,                // 🆕 NEW: Clear animation
    cleanupClearElements,        // 🆕 NEW: Clear cleanup
    animateSort,                 // 🆕 M11: Sort animation
    animateSortMismatch,         // 🆕 M11b: Sort mismatch TypeError animation
    cleanupSortElements          // 🆕 M11: Sort cleanup
} from '../shared/list/listModificationAnimations.js';
import { initSpeechSynthesis, stopSpeaking } from '../shared/speechFeedback.js';

// ============ GLOBAL VARIABLES ============
let editor, pyodide = null, currentStep = 0, totalSteps = 0;
let isRunning = false, executionPlan = [];
let currentVariables = {}, currentLineMarker = null, currentTab = 'create';
let preloadedExplanations = [];
let placeholderValues = {};
let stepHistory = [];
let renderedLists = new Set();
let listAliasMap = new Map(); // ⭐ M8: Maps primary list name → array of variable names (aliases)

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
    create: `colors = ["red", "green", "blue"]
print(colors)
print(colors[0])`,

    facts: `fruits = ["apple", "banana", "apple", "cherry"]
print(len(fruits))
print(fruits.count("apple"))
print(fruits.index("banana"))`,


    modify: `numbers = [3, 1, 4]
numbers.append(2)
numbers.sort()
print(numbers)`
};

// ============ INITIALIZATION ============
window.onload = async () => {
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        mode: "python",
        theme: "monokai",
        lineNumbers: true,
        readOnly: "nocursor"
    });

    editor.setValue(tabTemplates.create);
    setupTabSelector();
    setupLineLocking();
    await loadPyodideEnv();
};

// Initialize speech synthesis
initSpeechSynthesis();

// ============ PYODIDE LOADING ============
async function loadPyodideEnv() {
    if (pyodide) return;
    const output = document.getElementById('output');
    output.textContent = '⏳ Loading Python...';

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
        // Initialize Facts sounds (index, count, len)
        initializeScanSynth();
        initializeChordSynth();

        // NEW: Initialize Modification sounds (remove)
        initModScanSynth();
        initModChordSynth();

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

// ============ LINE LOCKING SETUP ============
function setupLineLocking() {
    editor.getAllMarks().forEach(mark => mark.clear());

    if (currentTab === 'create') {
        lockPrintKeyword();
    } else if (currentTab === 'facts') {
        for (let i = 0; i < editor.lineCount(); i++) {
            editor.markText(
                { line: i, ch: 0 },
                { line: i, ch: editor.getLine(i).length },
                { readOnly: true, atomic: true, className: 'cm-locked' }
            );
        }
    } else if (currentTab === 'modify') {
        lockAllExceptAppendValue();
    }
}

function lockPrintKeyword() {
    for (let i = 0; i < editor.lineCount(); i++) {
        const line = editor.getLine(i);
        const match = line.match(/print\s*\(/);

        if (match) {
            const start = match.index;
            editor.markText(
                { line: i, ch: start },
                { line: i, ch: start + 6 },
                { readOnly: true, atomic: true, className: 'cm-locked' }
            );

            const closeParen = line.lastIndexOf(')');
            if (closeParen > -1) {
                editor.markText(
                    { line: i, ch: closeParen },
                    { line: i, ch: closeParen + 1 },
                    { readOnly: true, atomic: true, className: 'cm-locked' }
                );
            }
        }
    }
}

function lockAllExceptAppendValue() {
    for (let i = 0; i < editor.lineCount(); i++) {
        const line = editor.getLine(i);

        if (line.includes('.append(')) {
            const appendStart = line.indexOf('.append(');
            const openParen = line.indexOf('(', appendStart);
            const closeParen = line.indexOf(')', openParen);

            if (appendStart > 0) {
                editor.markText(
                    { line: i, ch: 0 },
                    { line: i, ch: openParen + 1 },
                    { readOnly: true, atomic: true, className: 'cm-locked' }
                );
            }

            if (closeParen > -1) {
                editor.markText(
                    { line: i, ch: closeParen },
                    { line: i, ch: line.length },
                    { readOnly: true, atomic: true, className: 'cm-locked' }
                );
            }
        } else {
            editor.markText(
                { line: i, ch: 0 },
                { line: i, ch: line.length },
                { readOnly: true, atomic: true, className: 'cm-locked' }
            );
        }
    }
}

// ============ RESET EXECUTION ============
async function resetExecution() {
    currentStep = 0;
    executionPlan = [];
    currentVariables = {};
    preloadedExplanations = [];
    placeholderValues = {};
    stepHistory = [];
    renderedLists.clear();
    listAliasMap.clear(); // ⭐ M8: Clear alias tracking

    document.getElementById('memoryBank').innerHTML = '';
    document.getElementById('output').textContent = '>> Click "Run Code" to start...';
    isRunning = false;

    document.getElementById('runBtn').disabled = false;
    document.getElementById('stepBtn').disabled = true;
    document.getElementById('backBtn').disabled = true;

    updateStepIndicator();

    if (currentLineMarker) {
        currentLineMarker.clear();
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
    cleanupLenCounters();          // ✅ REMOVE len() DIV + ARROW
    cleanupIndexDivs();            // ✅ REMOVE index() DIV + ARROW
    cleanupCountDivs();            // ✅ REMOVE count() DIV + ARROW
    cleanupPopElements();          // ✅ REMOVE pop() PILL + ARROW
    cleanupReverseElements();      // ✅ REMOVE reverse() ELEMENTS
    cleanupSortElements();         // ✅ REMOVE sort() ELEMENTS
    if (isRunning || !pyodide && !(await loadPyodideEnv())) return;

    isRunning = true;
    currentStep = 0;
    executionPlan = [];
    currentVariables = {};
    placeholderValues = {};
    preloadedExplanations = [];
    stepHistory = [];
    renderedLists.clear();
    listAliasMap.clear(); // ⭐ M8: Clear alias tracking

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
            `);
        } catch (e) {
            console.warn('Could not clear Pyodide globals:', e);
        }
    }

    const fullCode = editor.getValue();
    const lines = fullCode.split('\n').filter(l => l.trim());

    try {
        executionPlan = lines.map((line, idx) => {
            const trimmed = line.trim();
            return {
                lineNumber: idx,
                code: line,
                type: trimmed.includes('print(') ? 'print' : 'assignment'
            };
        });

        totalSteps = executionPlan.length;
        updateStepIndicator();

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
                preloadedExplanations = generateFallbackExplanations(lines);
            }
        } catch (error) {
            preloadedExplanations = generateFallbackExplanations(lines);
        }

        showTeacher("✅ Code validated! Click 'Next Step' to execute line by line.");

    } catch (error) {
        displayError(`Code validation failed: ${error.message}`);
        isRunning = false;
        document.getElementById('runBtn').disabled = false;
    }
};

function generateFallbackExplanations(lines) {
    return lines.map((line, idx) => ({
        step: idx,
        line: line,
        explanation: line.includes('print(')
            ? `Python displays the result on the screen!`
            : `Python executes: ${line}`,
        placeholders: [],
        type: line.includes('print(') ? 'print' : 'assignment'
    }));
}

// ============ STEP BUTTON ============
document.getElementById('stepBtn').onclick = async () => {
    if (currentStep >= totalSteps) return;

    const stepBtn = document.getElementById('stepBtn');
    stepBtn.disabled = true;

    const step = executionPlan[currentStep];
    const stepData = {
        lineNumber: step.lineNumber,
        outputElements: [],
        variableElements: []
    };

    try {
        highlightLine(step.lineNumber);

        // ⭐ M8: DETECT SHALLOW COPY ASSIGNMENT (Updated with Transitive Detection)
        if (step.type === 'assignment') {
            const shallowCopyMatch = step.code.match(/^(\w+)\s*=\s*(\w+)(?:\.copy\(\))?$/);

            if (shallowCopyMatch) {
                const [_, newVar, sourceVar] = shallowCopyMatch;

                // First, check if sourceVar is a primary rendered list
                let existingContainer = document.querySelector(
                    `.list-container[data-var-name="${sourceVar}"]`
                );

                // If not found by primary name, check if sourceVar is an existing alias
                if (!existingContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const container of allContainers) {
                        const aliases = getListAliases(container);
                        if (aliases.includes(sourceVar)) {
                            existingContainer = container;
                            break;
                        }
                    }
                }

                if (existingContainer) {
                    console.log(`🎬 M8: Shallow copy detected: ${newVar} = ${sourceVar}`);

                    const currentAliases = getListAliases(existingContainer);
                    const primaryName = currentAliases[0] || existingContainer.dataset.varName;

                    // Track this assignment in the global map
                    if (!listAliasMap.has(primaryName)) {
                        listAliasMap.set(primaryName, [...currentAliases]);
                    }
                    if (!listAliasMap.get(primaryName).includes(newVar)) {
                        listAliasMap.get(primaryName).push(newVar);
                    }

                    // ⚠️ CRITICAL FIX: Execute the assignment in Python so newVar exists in namespace
                    try {
                        await pyodide.runPythonAsync(step.code);
                    } catch (error) {
                        console.error('Failed to execute shallow copy assignment:', error);
                    }

                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // Animate shallow copy addition to header
                    await new Promise(resolve => {
                        animateShallowCopy(existingContainer, newVar, currentAliases, () => resolve());
                    });

                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    // Update variable state in JS
                    const pyValue = await pyodide.runPythonAsync(primaryName);
                    currentVariables[newVar] = pyValue;

                    stepData.shallowCopy = {
                        newVar: newVar,
                        sourceVar: sourceVar,
                        primaryName: primaryName,
                        container: existingContainer
                    };

                    // Finalize Step
                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();
                    if (currentStep < totalSteps) stepBtn.disabled = false;
                    return; // Skip normal list rendering section
                }
            }
        }

        // ⭐ DETECT pop() CALLS (before normal execution)
        {
            const popMatch = step.code.match(/(\w+)\.pop\s*\(\s*(?:(-?\d+))?\s*\)/);

            if (popMatch) {
                const varName = popMatch[1];
                let popIndex = popMatch[2] ? parseInt(popMatch[2]) : -1; // Default to -1 (last) if empty

                // Resolve container
                let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                if (!listContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const c of allContainers) {
                        if (getListAliases(c).includes(varName)) { listContainer = c; break; }
                    }
                }

                if (listContainer) {
                    // ✅ CRITICAL FIX: Calculate exact position INSIDE pop() parentheses
                    let startCoords = { x: 0, y: 0 };
                    try {
                        const lineText = step.code;

                        // Find .pop( in the line
                        const popIndex = lineText.indexOf('.pop(');
                        if (popIndex !== -1) {
                            // Position is right after the opening parenthesis
                            const charPos = popIndex + 5; // '.pop(' is 5 chars

                            // Get screen coordinates from CodeMirror
                            const coords = editor.charCoords({
                                line: step.lineNumber,
                                ch: charPos
                            }, 'page'); // Use 'page' for document coordinates

                            startCoords = {
                                x: coords.left,
                                y: coords.top + 10 // Slight vertical offset
                            };

                            console.log(`✅ Pop startCoords: (${startCoords.x}, ${startCoords.y}) from line ${step.lineNumber}, ch ${charPos}`);
                        }
                    } catch (e) {
                        console.warn('Could not get cursor coords, using fallback', e);
                        // Fallback to left side of screen
                        startCoords = { x: 200, y: 200 };
                    }

                    // 2. Execute Pyodide (Get result or error)
                    let resultValue = null;
                    let isError = false;
                    let actualIndex = -1;

                    try {
                        // We need to resolve the actual index if it was -1 (pop last)
                        // before mutating, so we know which row to act on
                        const listLen = await pyodide.runPythonAsync(`len(${varName})`);

                        if (popMatch[2] === undefined) {
                            // empty pop() -> last index
                            actualIndex = listLen - 1;
                        } else {
                            // specific index -> handle negatives
                            actualIndex = popIndex < 0 ? listLen + popIndex : popIndex;
                        }

                        // Run pop
                        const pyResult = await pyodide.runPythonAsync(step.code);
                        resultValue = String(pyResult);

                    } catch (error) {
                        isError = true;
                        resultValue = "IndexError"; // or whatever error
                        console.log("Pop Error:", error);
                    }

                    // If NO error, but index out of bounds checking (safety)
                    if (!isError) {
                        const rows = listContainer.querySelectorAll('.list-row');
                        if (actualIndex < 0 || actualIndex >= rows.length) {
                            // This shouldn't happen if Pyodide succeeded, 
                            // but implies mismatch in visualized vs python state
                            console.warn("Visual/Python sync issue on pop");
                        }
                    }

                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // 3. Animate
                    await new Promise(resolve => {
                        animatePop(
                            listContainer,
                            actualIndex, // The visual row index to target
                            null,        // outputDiv (not printing here, just modifying)
                            resultValue,
                            isError,
                            startCoords,
                            () => resolve()
                        );
                    });

                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    // 4. Update Step Data/History
                    // We need to store state to support "Back" button recreation
                    // For pop, "back" means inserting the element back.
                    stepData.popOperation = {
                        varName,
                        value: resultValue,
                        index: actualIndex,
                        isError,
                        container: listContainer
                    };

                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();

                    if (currentStep >= totalSteps) {
                        setTimeout(() => {
                            showTeacher(isError ? "❌ Oops! Index out of range." : "✨ Element popped!");
                            document.getElementById('runBtn').disabled = false;
                            isRunning = false;
                        }, 1000);
                    }
                    if (currentStep < totalSteps) stepBtn.disabled = false;
                    return;
                }
            }
        }

        // ⭐ DETECT append() CALLS (IMPROVED VERSION with pink trails)
        {
            const appendMatch = step.code.match(/(\w+)\.append\s*\(\s*(?:["'](.+?)["']|(\d+(?:\.\d+)?))\s*\)/);

            if (appendMatch) {
                const varName = appendMatch[1];
                const newValue = appendMatch[2] !== undefined ? appendMatch[2] : appendMatch[3]; // string or number

                // resolve container (primary name OR alias)
                let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                if (!listContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const c of allContainers) {
                        if (getListAliases(c).includes(varName)) { listContainer = c; break; }
                    }
                }

                if (listContainer) {
                    // 🆕 NEW: Get coordinates of value in code editor
                    let originCoords = { x: 200, y: 200 }; // fallback
                    try {
                        // Find where the value appears in the code
                        const valueStartPos = step.code.indexOf('(') + 1;
                        const coords = editor.charCoords({
                            line: step.lineNumber,
                            ch: valueStartPos
                        }, 'page');

                        originCoords = {
                            x: coords.left,
                            y: coords.top
                        };
                    } catch (e) {
                        console.warn('Could not get value coords for append, using fallback', e);
                    }

                    // run in Python first so internal state is consistent
                    await pyodide.runPythonAsync(step.code);

                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // 🆕 NEW: Use improved append animation
                    await new Promise(resolve => {
                        animateAppendImproved(
                            listContainer,
                            varName,
                            newValue,
                            originCoords, // ← Pass coordinates
                            () => resolve()
                        );
                    });

                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    stepData.appendOperation = { varName, value: newValue, container: listContainer };

                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();

                    if (currentStep >= totalSteps) {
                        setTimeout(() => {
                            showTeacher("✨ Item appended to the list!");
                            document.getElementById('runBtn').disabled = false;
                            isRunning = false;
                        }, 1000);
                    }
                    if (currentStep < totalSteps) stepBtn.disabled = false;
                    return; // skip normal execution
                }
            }
        }

        // ⭐ DETECT remove() CALLS
        {
            const removeMatch = step.code.match(/(\w+)\.remove\s*\(\s*(?:["'](.+?)["']|(-?\d+(?:\.\d+)?))\s*\)/);

            if (removeMatch) {
                const varName = removeMatch[1];
                const searchValue = removeMatch[2] || removeMatch[3]; // String or number

                // Resolve container
                let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                if (!listContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const c of allContainers) {
                        if (getListAliases(c).includes(varName)) {
                            listContainer = c;
                            break;
                        }
                    }
                }

                if (listContainer) {
                    // Calculate start coordinates (inside .remove( parentheses)
                    let startCoords = { x: 0, y: 0 };
                    try {
                        const removeIndex = step.code.indexOf('.remove(');
                        if (removeIndex !== -1) {
                            const charPos = removeIndex + 8; // '.remove(' is 8 chars
                            const coords = editor.charCoords({
                                line: step.lineNumber,
                                ch: charPos
                            }, 'page');

                            startCoords = {
                                x: coords.left,
                                y: coords.top + 10
                            };
                        }
                    } catch (e) {
                        console.warn('Could not get cursor coords for remove, using fallback', e);
                        startCoords = { x: 200, y: 200 };
                    }

                    // Execute Python and detect success/error
                    let foundIndex = -1;
                    let isError = false;

                    try {
                        // Check if value exists before removing
                        const isString = typeof searchValue === 'string' && removeMatch[2] !== undefined;
                        const checkCode = `${varName}.index(${isString ? `"${searchValue}"` : searchValue})`;
                        foundIndex = await pyodide.runPythonAsync(checkCode);

                        // Now execute the actual remove
                        await pyodide.runPythonAsync(step.code);

                        console.log(`✅ remove() found "${searchValue}" at index ${foundIndex}`);
                    } catch (error) {
                        isError = true;
                        console.log(`❌ remove() failed: "${searchValue}" not found`);
                    }

                    // Get output panel
                    const outputPanel = document.getElementById('output');

                    // Disable controls during animation
                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // Animate the remove operation
                    await new Promise(resolve => {
                        animateRemove_v1(
                            listContainer,
                            searchValue,
                            foundIndex,
                            outputPanel,
                            isError,
                            () => resolve()
                        );
                    });

                    // Re-enable controls
                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    // Track operation for back button
                    stepData.removeOperation = {
                        container: listContainer,
                        searchValue: searchValue,
                        foundIndex: foundIndex,
                        isError: isError,
                        varName: varName
                    };

                    // Finalize step
                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();
                    if (currentStep < totalSteps) stepBtn.disabled = false;

                    return; // Skip normal execution
                }
            }
        }

        // ⭐ DETECT reverse() CALLS
        {
            const reverseMatch = step.code.match(/(\w+)\.reverse\s*\(\s*\)/);

            if (reverseMatch) {
                const varName = reverseMatch[1];

                // Resolve container (primary name OR alias)
                let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                if (!listContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const c of allContainers) {
                        if (getListAliases(c).includes(varName)) {
                            listContainer = c;
                            break;
                        }
                    }
                }

                if (listContainer) {
                    // Get current state BEFORE reversing
                    const currentItems = Array.from(listContainer.querySelectorAll('.list-content-cell'))
                        .map(cell => {
                            const valueEl = cell.querySelector('.list-value');
                            return valueEl ? valueEl.textContent : cell.textContent;
                        });

                    // Execute Python reverse
                    await pyodide.runPythonAsync(step.code);

                    // Get reversed items from Python
                    const reversedList = await pyodide.runPythonAsync(varName);
                    const reversedItems = parseListContents(reversedList);

                    console.log(`🔄 reverse() detected: ${varName}`, { currentItems, reversedItems });

                    // Disable controls during animation
                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // ⭐ Accurate Reverse animation (Swap)
                    await new Promise(resolve => {
                        animateReverse(
                            listContainer,
                            varName,
                            currentItems,
                            reversedItems,
                            () => resolve()
                        );
                    });

                    /* 
                    // ⭐ Simplified Reverse animation (Circular Lane)
                    await new Promise(resolve => {
                        animateReverseSimplified(
                            listContainer,
                            varName,
                            currentItems,
                            reversedItems,
                            () => resolve()
                        );
                    });
                    */

                    // Re-enable controls
                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    // Track operation for back button
                    stepData.reverseOperation = {
                        container: listContainer,
                        originalItems: currentItems,
                        reversedItems: reversedItems,
                        varName: varName
                    };

                    // Finalize step
                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();

                    if (currentStep >= totalSteps) {
                        setTimeout(() => {
                            showTeacher("🔄 List reversed successfully!");
                            document.getElementById('runBtn').disabled = false;
                            isRunning = false;
                        }, 500);
                    }
                    if (currentStep < totalSteps) stepBtn.disabled = false;

                    return; // Skip normal execution
                }
            }
        }

        // ⭐ 🆕 NEW: DETECT insert() CALLS
        {
            const insertMatch = step.code.match(/(\w+)\.insert\s*\(\s*(-?\d+)\s*,\s*(?:["'](.+?)["']|(\d+(?:\.\d+)?))\s*\)/);

            if (insertMatch) {
                const varName = insertMatch[1];
                const insertIndex = parseInt(insertMatch[2]);
                const insertValue = insertMatch[3] !== undefined ? insertMatch[3] : insertMatch[4]; // string or number

                // Resolve container (primary name OR alias)
                let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                if (!listContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const c of allContainers) {
                        if (getListAliases(c).includes(varName)) {
                            listContainer = c;
                            break;
                        }
                    }
                }

                if (listContainer) {
                    // Get current list length BEFORE insert
                    const currentLength = listContainer.querySelectorAll('.list-row').length;

                    // 🆕 Get coordinates of value in code editor
                    let originCoords = { x: 200, y: 200 }; // fallback
                    try {
                        // Find the comma after the index, then the value starts
                        const commaPos = step.code.indexOf(',', step.code.indexOf('('));
                        const valueStartPos = commaPos + 1;

                        // Skip whitespace to find actual value
                        let actualPos = valueStartPos;
                        while (actualPos < step.code.length && /\s/.test(step.code[actualPos])) {
                            actualPos++;
                        }

                        const coords = editor.charCoords({
                            line: step.lineNumber,
                            ch: actualPos
                        }, 'page');

                        originCoords = {
                            x: coords.left,
                            y: coords.top
                        };
                    } catch (e) {
                        console.warn('Could not get value coords for insert, using fallback', e);
                    }

                    // Execute Python insert
                    await pyodide.runPythonAsync(step.code);

                    console.log(`🎯 insert() detected: ${varName}.insert(${insertIndex}, ${insertValue})`);

                    // Disable controls during animation
                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // Animate insert
                    await new Promise(resolve => {
                        animateInsert(
                            listContainer,
                            varName,
                            insertIndex,
                            insertValue,
                            currentLength,
                            originCoords,
                            () => resolve()
                        );
                    });

                    // Re-enable controls
                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    // Track operation for back button
                    stepData.insertOperation = {
                        container: listContainer,
                        varName: varName,
                        insertIndex: insertIndex,
                        insertValue: insertValue,
                        previousLength: currentLength
                    };

                    // Finalize step
                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();

                    if (currentStep >= totalSteps) {
                        setTimeout(() => {
                            showTeacher("🎯 Item inserted successfully!");
                            document.getElementById('runBtn').disabled = false;
                            isRunning = false;
                        }, 500);
                    }
                    if (currentStep < totalSteps) stepBtn.disabled = false;

                    return; // Skip normal execution
                }
            }
        }

        // ⭐ 🆕 M11: DETECT sort() CALLS
        {
            // Match: varName.sort() or varName.sort(reverse=True) or varName.sort(reverse=False)
            const sortMatch = step.code.match(/(\w+)\.sort\s*\(\s*(?:reverse\s*=\s*(True|False))?\s*\)/);

            if (sortMatch) {
                const varName = sortMatch[1];
                const isReverse = sortMatch[2] === 'True';

                // Resolve container (primary name OR alias)
                let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                if (!listContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const c of allContainers) {
                        if (getListAliases(c).includes(varName)) {
                            listContainer = c;
                            break;
                        }
                    }
                }

                if (listContainer) {
                    // Capture items BEFORE sort
                    const originalItems = Array.from(listContainer.querySelectorAll('.list-content-cell'))
                        .map(cell => {
                            const valueEl = cell.querySelector('.list-value');
                            return valueEl ? valueEl.textContent : cell.textContent;
                        });

                    // Disable controls during animation
                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // Try to execute sort in Python
                    let isError = false;
                    let sortedItems = [];

                    try {
                        await pyodide.runPythonAsync(step.code);
                        const sortedList = await pyodide.runPythonAsync(varName);
                        sortedItems = parseListContents(sortedList);
                        console.log(`🔃 sort() detected: ${varName}`, { isReverse, originalItems, sortedItems });
                    } catch (error) {
                        isError = true;
                        console.log(`❌ sort() TypeError: ${varName}`, error);
                    }

                    const outputPanel = document.getElementById('output');

                    if (isError) {
                        // ─── Mismatch animation (TypeError) ───────────────────────────────
                        await new Promise(resolve => {
                            animateSortMismatch(
                                listContainer,
                                outputPanel,
                                () => resolve()
                            );
                        });
                    } else {
                        // ─── Normal sort animation ─────────────────────────────────────────
                        await new Promise(resolve => {
                            animateSort(
                                listContainer,
                                originalItems,
                                sortedItems,
                                isReverse,
                                () => resolve()
                            );
                        });
                    }

                    // Re-enable controls
                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    // Track for back button
                    stepData.sortOperation = {
                        container: listContainer,
                        varName: varName,
                        originalItems: originalItems,
                        sortedItems: sortedItems,
                        isReverse: isReverse,
                        isError: isError
                    };

                    // Finalize step
                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();

                    if (currentStep >= totalSteps) {
                        setTimeout(() => {
                            const msg = isError
                                ? '❌ TypeError: Cannot sort lists with mixed data types!'
                                : (isReverse ? '🔃 List sorted in descending order!' : '🔃 List sorted in ascending order!');
                            showTeacher(msg);
                            document.getElementById('runBtn').disabled = false;
                            isRunning = false;
                        }, 500);
                    }
                    if (currentStep < totalSteps) stepBtn.disabled = false;

                    return; // Skip normal execution
                }
            }
        }

        // ⭐ 🆕 NEW: DETECT clear() CALLS
        {
            const clearMatch = step.code.match(/(\w+)\.clear\s*\(\s*\)/);

            if (clearMatch) {
                const varName = clearMatch[1];

                // Resolve container
                let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                if (!listContainer) {
                    const allContainers = document.querySelectorAll('.list-container');
                    for (const c of allContainers) {
                        if (getListAliases(c).includes(varName)) {
                            listContainer = c;
                            break;
                        }
                    }
                }

                if (listContainer) {
                    // Store original items for back button
                    const originalRows = listContainer.querySelectorAll('.list-row');
                    const originalItems = Array.from(originalRows).map(row => {
                        const contentCell = row.querySelector('.list-content-cell');
                        return contentCell ? contentCell.textContent : '';
                    });

                    console.log(`🧹 clear() detected: ${varName}`);

                    // Disable controls during animation
                    document.getElementById('backBtn').disabled = true;
                    document.getElementById('stepBtn').disabled = true;

                    // Animate clear
                    await new Promise(resolve => {
                        animateClear(
                            listContainer,
                            varName,
                            () => resolve()
                        );
                    });

                    // Execute Python clear AFTER animation
                    await pyodide.runPythonAsync(step.code);

                    // Re-enable controls
                    if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                    // Track operation for back button
                    stepData.clearOperation = {
                        container: listContainer,
                        varName: varName,
                        originalItems: originalItems
                    };

                    // Finalize step
                    stepHistory.push(stepData);
                    await showSmartExplanation(currentStep);
                    currentStep++;
                    updateStepIndicator();
                    updateButtons();

                    if (currentStep >= totalSteps) {
                        setTimeout(() => {
                            showTeacher("🧹 List cleared successfully!");
                            document.getElementById('runBtn').disabled = false;
                            isRunning = false;
                        }, 500);
                    }
                    if (currentStep < totalSteps) stepBtn.disabled = false;

                    return; // Skip normal execution
                }
            }
        }

        // ============================================
        // NORMAL EXECUTION & VARIABLE UPDATES
        // ============================================
        if (step.type === 'assignment' || step.type === 'modification') {
            await pyodide.runPythonAsync(step.code);
            const varsJs = pyodide.globals.toJs();
            const memoryBank = document.getElementById('memoryBank');

            currentVariables = {};

            for (let [key, value] of varsJs) {
                if (!key.startsWith('_') && !['output_buffer', 'sys', 'io'].includes(key)) {
                    if (isListVariable(value)) {
                        const items = parseListContents(value);

                        if (step.type === 'assignment' && !renderedLists.has(key)) {
                            // ⭐ M8 UPDATED: Pass aliases to renderer
                            const aliases = listAliasMap.get(key) || [];
                            const listElement = renderListTable(key, items, memoryBank, aliases);

                            stepData.variableElements.push(listElement);
                            renderedLists.add(key);

                            document.getElementById('backBtn').disabled = true;
                            document.getElementById('stepBtn').disabled = true;

                            await new Promise(resolve => {
                                animateListCreation(listElement, items, () => resolve());
                            });

                            if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        }
                    } else {
                        currentVariables[key] = String(value);
                    }
                }
            }
        }

        // ============================================
        // PRINT HANDLING
        // ============================================
        if (step.type === 'print') {
            try {
                await pyodide.runPythonAsync(step.code);
                const output = await pyodide.runPythonAsync('output_buffer.getvalue()');
                const newOutput = output.split('\n').filter(l => l.trim()).pop() || '';
                await pyodide.runPythonAsync('output_buffer.truncate(0); output_buffer.seek(0)');

                placeholderValues['RESULT'] = newOutput;

                // ═══════════════════════════════════════════════════
                // ⭐ NEW: DETECT len() CALLS
                // ═══════════════════════════════════════════════════
                const lenMatch = step.code.match(/print\s*\(\s*len\s*\(\s*(\w+)\s*\)\s*\)/);

                if (lenMatch) {
                    const varName = lenMatch[1];

                    // FIX 4: Check for list container by primary name OR alias
                    let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);

                    // If not found by primary name, check aliases
                    if (!listContainer) {
                        const allContainers = document.querySelectorAll('.list-container');
                        for (const container of allContainers) {
                            const aliases = getListAliases(container);
                            if (aliases.includes(varName)) {
                                listContainer = container;
                                break;
                            }
                        }
                    }

                    if (listContainer) {
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        // Disable buttons during animation
                        document.getElementById('backBtn').disabled = true;
                        document.getElementById('stepBtn').disabled = true;

                        await new Promise(resolve => {
                            animateLen(listContainer, outputDiv, newOutput, () => resolve());
                        });

                        // Re-enable Back button
                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                        stepData.outputElements.push(outputLine);

                        // ⭐ Mark this step as len() for back button cleanup
                        stepData.isLenStep = true;

                        // Skip to step finalization (jump past other print checks)
                        stepHistory.push(stepData);
                        await showSmartExplanation(currentStep);
                        currentStep++;
                        updateStepIndicator();
                        updateButtons();

                        if (currentStep >= totalSteps) {
                            setTimeout(() => {
                                showTeacher("🎉 Excellent! len() counted all elements!");
                                document.getElementById('runBtn').disabled = false;
                                isRunning = false;
                            }, 2000);
                        }

                        if (currentStep < totalSteps) stepBtn.disabled = false;
                        return; // Exit early, skip other print handlers
                    }
                }

                // PART 2: Update indexMatch block to ONLY handle SUCCESS (lines 605-671)
                // Change line 634 from checking newOutput to just setting isError = false
                // ────────────────────────────────────────────────────────────────────

                // This makes quotes optional: ["']?(.+?)["']?
                const indexMatch = step.code.match(/print\s*\(\s*(\w+)\.index\s*\(\s*["']?(.+?)["']?(?:\s*,\s*(-?\d+))?(?:\s*,\s*(-?\d+))?\s*\)\s*\)/);

                if (indexMatch) {
                    const varName = indexMatch[1];
                    const searchValue = indexMatch[2];
                    const startParam = indexMatch[3] ? parseInt(indexMatch[3]) : null;
                    const stopParam = indexMatch[4] ? parseInt(indexMatch[4]) : null;

                    // Check for list container by primary name OR alias
                    let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);

                    if (!listContainer) {
                        const allContainers = document.querySelectorAll('.list-container');
                        for (const container of allContainers) {
                            const aliases = getListAliases(container);
                            if (aliases.includes(varName)) {
                                listContainer = container;
                                break;
                            }
                        }
                    }

                    if (listContainer) {
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';

                        // ⭐ FIX: If we reach here, Python succeeded (no error thrown)
                        const isError = false;  // Always false - errors handled in catch block

                        outputLine.textContent = newOutput;  // The index number
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        document.getElementById('backBtn').disabled = true;
                        document.getElementById('stepBtn').disabled = true;

                        await new Promise(resolve => {
                            animateIndex(listContainer, searchValue, startParam, stopParam, outputDiv, newOutput, isError, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                        stepData.outputElements.push(outputLine);
                        stepData.isIndexStep = true;

                        stepHistory.push(stepData);
                        await showSmartExplanation(currentStep);
                        currentStep++;
                        updateStepIndicator();
                        updateButtons();

                        if (currentStep >= totalSteps) {
                            setTimeout(() => {
                                showTeacher("🎯 Found it using index()!");
                                document.getElementById('runBtn').disabled = false;
                                isRunning = false;
                            }, 2000);
                        }

                        if (currentStep < totalSteps) stepBtn.disabled = false;
                        return;
                    }
                }

                // ═══════════════════════════════════════════════════
                // ⭐ NEW: DETECT count() CALLS
                // ═══════════════════════════════════════════════════
                const countMatch = step.code.match(/print\s*\(\s*(\w+)\.count\s*\(\s*["'](.+?)["']\s*\)\s*\)/);

                if (countMatch) {
                    const varName = countMatch[1];
                    const searchValue = countMatch[2];

                    // FIX 4: Check for list container by primary name OR alias
                    let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);

                    // If not found by primary name, check aliases
                    if (!listContainer) {
                        const allContainers = document.querySelectorAll('.list-container');
                        for (const container of allContainers) {
                            const aliases = getListAliases(container);
                            if (aliases.includes(varName)) {
                                listContainer = container;
                                break;
                            }
                        }
                    }

                    if (listContainer) {
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        document.getElementById('backBtn').disabled = true;
                        document.getElementById('stepBtn').disabled = true;

                        await new Promise(resolve => {
                            animateCount(listContainer, searchValue, outputDiv, newOutput, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;

                        stepData.outputElements.push(outputLine);
                        stepData.isCountStep = true; // Mark for back button cleanup

                        stepHistory.push(stepData);
                        await showSmartExplanation(currentStep);
                        currentStep++;
                        updateStepIndicator();
                        updateButtons();

                        if (currentStep >= totalSteps) {
                            setTimeout(() => {
                                const count = parseInt(newOutput);
                                const msg = count === 0 ? "🔍 No matches found!" :
                                    count === 1 ? "✨ Found 1 match!" :
                                        `✨ Found ${count} matches!`;
                                showTeacher(msg);
                                document.getElementById('runBtn').disabled = false;
                                isRunning = false;
                            }, 2000);
                        }

                        if (currentStep < totalSteps) stepBtn.disabled = false;
                        return;
                    }
                }

                const printElementMatch = step.code.match(/print\s*\(\s*(\w+)\s*\[\s*(-?\d+)\s*\]\s*\)/);
                const printListMatch = step.code.match(/print\s*\(\s*(\w+)\s*\)/);

                if (printElementMatch) {
                    const varName = printElementMatch[1];
                    const index = parseInt(printElementMatch[2]);
                    const listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);

                    if (listContainer) {
                        const rows = listContainer.querySelectorAll('.list-row');
                        let actualIndex = index < 0 ? rows.length + index : index;

                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        document.getElementById('backBtn').disabled = true;
                        document.getElementById('stepBtn').disabled = true;

                        await new Promise(resolve => {
                            animatePrintElement(listContainer, actualIndex, outputDiv, newOutput, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        stepData.outputElements.push(outputLine);
                    }
                } else if (printListMatch) {
                    const varName = printListMatch[1];
                    const listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);

                    if (listContainer) {
                        const contentCells = listContainer.querySelectorAll('.list-content-cell');
                        const items = Array.from(contentCells).map(cell => {
                            let text = cell.textContent.trim();
                            return text.startsWith('"') ? text.slice(1, -1) : text;
                        });

                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        document.getElementById('backBtn').disabled = true;
                        document.getElementById('stepBtn').disabled = true;

                        await new Promise(resolve => {
                            animatePrintEntireList(listContainer, items, outputDiv, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        stepData.outputElements.push(outputLine);
                    }
                } else {
                    // ⭐ NEW: Check for print("string") pattern
                    const printStringMatch = step.code.match(/print\s*\(\s*["'].+?["']\s*\)/);

                    if (printStringMatch) {
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputLine.style.opacity = '1';
                        outputDiv.appendChild(outputLine);

                        document.getElementById('backBtn').disabled = true;
                        document.getElementById('stepBtn').disabled = true;

                        await new Promise(resolve => {
                            animatePrintString(step.code, outputDiv, newOutput, () => resolve());
                        });

                        if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                        stepData.outputElements.push(outputLine);
                    } else {
                        // Default output
                        const outputDiv = document.getElementById('output');
                        const outputLine = document.createElement('div');
                        outputLine.className = 'output-line';
                        outputLine.textContent = newOutput;
                        outputDiv.appendChild(outputLine);
                        gsap.to(outputLine, { opacity: 1, x: 0, duration: 0.5 });
                        stepData.outputElements.push(outputLine);
                    }
                }

                // ────────────────────────────────────────────────────────────────────
                // PART 1: Replace the catch block (lines 830-862)
                // ────────────────────────────────────────────────────────────────────

            } catch (error) {
                // Handle IndexError (already exists)
                const isIndexError = error.message && error.message.includes('IndexError');
                if (isIndexError) {
                    const printMatch = step.code.match(/print\s*\(\s*(\w+)\s*\[\s*(-?\d+)\s*\]\s*\)/);
                    if (printMatch) {
                        const varName = printMatch[1];
                        const index = parseInt(printMatch[2]);
                        const listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);

                        if (listContainer) {
                            const validIndexCount = listContainer.querySelectorAll('.list-row').length;
                            const outputDiv = document.getElementById('output');
                            const errorLine = document.createElement('div');
                            errorLine.className = 'output-line error';
                            errorLine.textContent = `IndexError: list index out of range`;
                            errorLine.style.opacity = '1';
                            outputDiv.appendChild(errorLine);

                            document.getElementById('backBtn').disabled = true;
                            document.getElementById('stepBtn').disabled = true;

                            await new Promise(resolve => {
                                animatePrintInvalidIndex(listContainer, index, validIndexCount, outputDiv, () => resolve());
                            });

                            if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                            stepData.outputElements.push(errorLine);
                        }
                    }
                }
                // ⭐ NEW: Handle ValueError for .index() not found
                else if (error.message && error.message.includes('not in list')) {
                    const indexMatch = step.code.match(/print\s*\(\s*(\w+)\.index\s*\(\s*["'](.+?)["'](?:\s*,\s*(-?\d+))?(?:\s*,\s*(-?\d+))?\s*\)\s*\)/);

                    if (indexMatch) {
                        const varName = indexMatch[1];
                        const searchValue = indexMatch[2];
                        const startParam = indexMatch[3] ? parseInt(indexMatch[3]) : null;
                        const stopParam = indexMatch[4] ? parseInt(indexMatch[4]) : null;

                        // Find list container
                        let listContainer = document.querySelector(`.list-container[data-var-name="${varName}"]`);
                        if (!listContainer) {
                            const allContainers = document.querySelectorAll('.list-container');
                            for (const container of allContainers) {
                                const aliases = getListAliases(container);
                                if (aliases.includes(varName)) {
                                    listContainer = container;
                                    break;
                                }
                            }
                        }

                        if (listContainer) {
                            const outputDiv = document.getElementById('output');
                            const errorLine = document.createElement('div');
                            errorLine.className = 'output-line error';
                            errorLine.textContent = `ValueError: '${searchValue}' is not in list`;
                            errorLine.style.opacity = '1';
                            outputDiv.appendChild(errorLine);

                            document.getElementById('backBtn').disabled = true;
                            document.getElementById('stepBtn').disabled = true;

                            // ⭐ Call animation with isError = true
                            await new Promise(resolve => {
                                animateIndex(listContainer, searchValue, startParam, stopParam, outputDiv, errorLine, true, () => resolve());
                            });

                            if (currentStep > 0) document.getElementById('backBtn').disabled = false;
                            stepData.outputElements.push(errorLine);
                            stepData.isIndexStep = true;
                        }
                    }
                }
                else {
                    displayError(error.message);
                }
            }

        }

        stepHistory.push(stepData);
        await showSmartExplanation(currentStep);
        currentStep++;
        updateStepIndicator();
        updateButtons();

        if (currentStep >= totalSteps) {
            setTimeout(() => {
                showTeacher("🎉 Excellent! Try switching tabs!");
                document.getElementById('runBtn').disabled = false;
                isRunning = false;
            }, 8000);
        }

        if (currentStep < totalSteps) stepBtn.disabled = false;

    } catch (error) {
        displayError(`Error: ${error.message}`);
        isRunning = false;
    }
};

// ============ BACK BUTTON (M8 INTEGRATED) ============
document.getElementById('backBtn').onclick = async () => {
    if (currentStep === 0) return;

    document.getElementById('backBtn').disabled = true;
    document.getElementById('stepBtn').disabled = true;

    currentStep--;
    const lastStepData = stepHistory.pop();

    if (lastStepData) {
        // ⭐ FIX: If going back from len() step, cleanup counter divs
        if (lastStepData.isLenStep) {
            cleanupLenCounters();
        }

        // ⭐ NEW: Cleanup index() divs
        if (lastStepData.isIndexStep) {
            cleanupIndexDivs();
        }

        // ⭐ NEW: Cleanup count() divs
        if (lastStepData.isCountStep) {
            cleanupCountDivs();
        }

        // ⭐ M8: Handle shallow copy reversal (Refined Header logic)
        if (lastStepData.shallowCopy) {
            const { newVar, primaryName, container } = lastStepData.shallowCopy;
            console.log(`🔙 M8: Reversing shallow copy: ${newVar} (Alias of ${primaryName})`);

            // Remove alias from internal map
            if (listAliasMap.has(primaryName)) {
                const aliases = listAliasMap.get(primaryName);
                const idx = aliases.indexOf(newVar);
                if (idx > -1) aliases.splice(idx, 1);
            }

            // Reconstruct the header list (excluding the one being removed)
            const remainingAliases = getListAliases(container).filter(a => a !== newVar);
            const nameSection = container.querySelector('.list-name-section');
            nameSection.innerHTML = '';

            if (remainingAliases.length === 1) {
                // Only original name left
                const mainName = document.createElement('span');
                mainName.className = 'list-main-name';
                mainName.textContent = remainingAliases[0];
                nameSection.appendChild(mainName);
            } else if (remainingAliases.length > 1) {
                // Multiple aliases still exist
                const mainName = document.createElement('span');
                mainName.className = 'list-main-name';
                mainName.textContent = remainingAliases.join(', ');
                nameSection.appendChild(mainName);

                const arrow = document.createElement('span');
                arrow.className = 'list-alias-arrow';
                arrow.textContent = ' ↗';
                nameSection.appendChild(arrow);
            }

            // Update data attributes for consistency
            container.dataset.aliases = JSON.stringify(remainingAliases);
            delete currentVariables[newVar];
        }

        // ⭐ POP back-button: Restore the popped row (NO REVERSE ANIMATION)
        if (lastStepData.popOperation) {
            // ⭐ First, cleanup any pop pills!
            cleanupPopElements();

            const { container, index, value, isError, varName } = lastStepData.popOperation;
            if (!isError && container) {
                // ⭐ CRITICAL: Also restore in Python state so next pop() works correctly
                try {
                    // Format value for Python insertion
                    const isNum = !isNaN(value) && value !== '';
                    const isBool = value === 'True' || value === 'False' || value === 'None';
                    const pyValue = (isNum || isBool) ? value : `"${value}"`;

                    // Insert the element back at the original index
                    await pyodide.runPythonAsync(`${varName}.insert(${index}, ${pyValue})`);
                    console.log(`🔙 Restored ${varName}[${index}] = ${pyValue} in Python`);
                } catch (e) {
                    console.warn('Failed to restore Python state:', e);
                }

                // ⭐ VISUAL: Restore the row
                const tbody = container.querySelector('.list-table-body');
                const rows = container.querySelectorAll('.list-row');

                // Create Row (instant, no animation)
                const row = document.createElement('tr');
                row.className = 'list-row';
                row.dataset.originalIndex = index;

                // Check if current mode is negative indices
                const firstIndexCell = rows[0]?.querySelector('.list-index-cell');
                const isNegativeMode = firstIndexCell && parseInt(firstIndexCell.textContent) < 0;

                const indexCell = document.createElement('td');
                indexCell.className = 'list-index-cell';
                indexCell.textContent = index;

                const contentCell = document.createElement('td');
                contentCell.className = 'list-content-cell';
                // Format value for display
                const isNum = !isNaN(value) && value !== '';
                const isBool = value === 'True' || value === 'False' || value === 'None';
                contentCell.textContent = (isNum || isBool) ? value : `"${value}"`;

                row.appendChild(indexCell);
                row.appendChild(contentCell);

                // ✅ CRITICAL FIX: Ensure row is FULLY VISIBLE
                row.style.opacity = '1';
                row.style.transform = 'none';
                row.style.height = 'auto';
                row.style.backgroundColor = '';
                row.style.filter = 'none';
                row.style.padding = '';
                row.style.margin = '';
                row.style.borderWidth = '';

                // Insert at correct position (instant)
                if (index >= rows.length) {
                    tbody.appendChild(row);
                } else {
                    tbody.insertBefore(row, rows[index]);
                }

                // ⭐ Renumber ALL indices after restoration
                const allRows = container.querySelectorAll('.list-row');
                allRows.forEach((r, newIdx) => {
                    const iCell = r.querySelector('.list-index-cell');
                    if (iCell) {
                        if (isNegativeMode) {
                            // ✅ CORRECT FORMULA: First=-N, Last=-1
                            iCell.textContent = -(allRows.length - newIdx);
                        } else {
                            iCell.textContent = newIdx;
                        }
                    }
                    r.dataset.originalIndex = newIdx;

                    // ✅ ENSURE ALL ROWS ARE VISIBLE
                    r.style.opacity = '1';
                    r.style.transform = 'none';
                    r.style.filter = 'none';
                    r.style.backgroundColor = '';
                    r.style.height = 'auto';
                });

                // Update header count
                const countSection = container.querySelector('.list-count-section');
                if (countSection) countSection.textContent = `N is ${allRows.length}`;
            }
        }

        // ⭐ APPEND back-button: remove the last row with a slide-out
        if (lastStepData.appendOperation) {
            const { container: appendContainer } = lastStepData.appendOperation;
            const rows = appendContainer.querySelectorAll('.list-row');
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
            // update header count
            const countSection = appendContainer.querySelector('.list-count-section');
            if (countSection) countSection.textContent = `N is ${rows.length - 1}`;
        }

        // ⭐ REMOVE back-button: Restore the removed row (if it wasn't an error)
        if (lastStepData.removeOperation) {
            cleanupRemoveElements_v1(); // Clean up any lingering search divs/arrows

            const { container, searchValue, foundIndex, isError, varName } = lastStepData.removeOperation;

            if (!isError && container && foundIndex >= 0) {
                // Restore in Python state
                try {
                    const isNum = !isNaN(searchValue) && searchValue !== '';
                    const pyValue = isNum ? searchValue : `"${searchValue}"`;

                    await pyodide.runPythonAsync(`${varName}.insert(${foundIndex}, ${pyValue})`);
                    console.log(`🔙 Restored ${varName}[${foundIndex}] = ${pyValue} in Python after remove undo`);
                } catch (e) {
                    console.warn('Failed to restore Python state for remove:', e);
                }

                // Visual restoration (similar to pop restoration)
                const tbody = container.querySelector('.list-table-body');
                const rows = container.querySelectorAll('.list-row');

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

                // Insert at correct position
                if (foundIndex >= rows.length) {
                    tbody.appendChild(row);
                } else {
                    tbody.insertBefore(row, rows[foundIndex]);
                }

                // Renumber all indices
                const allRows = container.querySelectorAll('.list-row');
                allRows.forEach((r, newIdx) => {
                    const iCell = r.querySelector('.list-index-cell');
                    if (iCell) iCell.textContent = newIdx;
                    r.dataset.originalIndex = newIdx;

                    // Ensure visible
                    r.style.opacity = '1';
                    r.style.transform = 'none';
                    r.style.filter = 'none';
                    r.style.backgroundColor = '';
                    r.style.height = 'auto';
                });

                // Update header count
                const countSection = container.querySelector('.list-count-section');
                if (countSection) countSection.textContent = `N is ${allRows.length}`;
            }
        }

        // ⭐ REVERSE back-button: Restore original order with quick fade
        if (lastStepData.reverseOperation) {
            cleanupReverseElements(); // Clean up any lingering elements

            const { container, originalItems, varName } = lastStepData.reverseOperation;

            if (container) {
                // Restore Python state by reversing back
                try {
                    await pyodide.runPythonAsync(`${varName}.reverse()`);
                    console.log(`🔙 Reversed ${varName} back to original order in Python`);
                } catch (e) {
                    console.warn('Failed to restore Python state for reverse:', e);
                }

                // Visual restoration with quick fade
                const contentCells = container.querySelectorAll('.list-content-cell');

                // Fade out
                await new Promise(resolve => {
                    gsap.to(contentCells, {
                        opacity: 0,
                        duration: 0.2,
                        onComplete: () => {
                            // Update content to original order
                            contentCells.forEach((cell, idx) => {
                                const valueEl = cell.querySelector('.list-value');
                                if (valueEl) valueEl.textContent = originalItems[idx];
                                else cell.textContent = originalItems[idx];
                            });

                            // Fade in
                            gsap.to(contentCells, {
                                opacity: 1,
                                duration: 0.2,
                                onComplete: resolve
                            });
                        }
                    });
                });
            }
        }

        // ⭐ INSERT back-button: Smooth fade restoration
        if (lastStepData.insertOperation) {
            const { container, varName, insertIndex, insertValue, previousLength } = lastStepData.insertOperation;

            if (container) {
                // Restore Python state by removing the inserted element
                try {
                    // Calculate actual index (handle negative indices)
                    let actualIndex = insertIndex;
                    if (insertIndex < 0) {
                        const normalizedIndex = previousLength + insertIndex;
                        actualIndex = normalizedIndex < 0 ? 0 : normalizedIndex;
                    } else if (insertIndex > previousLength) {
                        actualIndex = previousLength;
                    } else {
                        actualIndex = insertIndex;
                    }

                    await pyodide.runPythonAsync(`del ${varName}[${actualIndex}]`);
                    console.log(`🔙 Removed inserted element at ${varName}[${actualIndex}] in Python`);
                } catch (e) {
                    console.warn('Failed to restore Python state for insert:', e);
                }

                // Visual restoration with quick fade
                const allRows = container.querySelectorAll('.list-row');

                // Fade out
                await new Promise(resolve => {
                    gsap.to(allRows, {
                        opacity: 0,
                        duration: 0.2,
                        onComplete: () => {
                            // Remove the inserted row (at actualIndex)
                            let actualIndex = insertIndex;
                            if (insertIndex < 0) {
                                const normalizedIndex = previousLength + insertIndex;
                                actualIndex = normalizedIndex < 0 ? 0 : normalizedIndex;
                            } else if (insertIndex > previousLength) {
                                actualIndex = previousLength;
                            }

                            if (allRows[actualIndex]) {
                                allRows[actualIndex].remove();
                            }

                            // Renumber remaining rows
                            const remainingRows = container.querySelectorAll('.list-row');
                            remainingRows.forEach((row, idx) => {
                                const indexCell = row.querySelector('.list-index-cell');
                                if (indexCell) indexCell.textContent = idx;
                                row.dataset.originalIndex = idx;
                            });

                            // Update count
                            const countSection = container.querySelector('.list-count-section');
                            if (countSection) {
                                countSection.textContent = `N is ${remainingRows.length}`;
                            }

                            // Fade in
                            gsap.to(remainingRows, {
                                opacity: 1,
                                duration: 0.2,
                                onComplete: resolve
                            });
                        }
                    });
                });
            }
        }

        // ⭐ M11: SORT back-button: fade content out → restore original order → fade in
        if (lastStepData.sortOperation) {
            cleanupSortElements();

            const { container, varName, originalItems, isError } = lastStepData.sortOperation;

            if (container && !isError) {
                // Restore Python state
                try {
                    // Re-assign original order to restore Python state
                    const itemsStr = originalItems.map(item => {
                        const stripped = item.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
                        const isNum = !isNaN(stripped) && stripped !== '';
                        const isBool = stripped === 'True' || stripped === 'False' || stripped === 'None';
                        return (isNum || isBool) ? stripped : `"${stripped}"`;
                    }).join(', ');
                    await pyodide.runPythonAsync(`${varName} = [${itemsStr}]`);
                    console.log(`🔙 Restored unsorted ${varName} in Python`);
                } catch (e) {
                    console.warn('Failed to restore Python state for sort back:', e);
                }

                // Visual: fade cells out → update text → fade in
                const contentCells = container.querySelectorAll('.list-content-cell');

                await new Promise(resolve => {
                    gsap.to(contentCells, {
                        opacity: 0,
                        duration: 0.25,
                        onComplete: () => {
                            contentCells.forEach((cell, idx) => {
                                cell.style.backgroundColor = '';
                                const valueEl = cell.querySelector('.list-value');
                                const val = originalItems[idx] !== undefined ? originalItems[idx] : '';
                                if (valueEl) {
                                    valueEl.textContent = val;
                                    valueEl.style.visibility = 'visible';
                                    valueEl.style.color = '';
                                    valueEl.style.fontWeight = '';
                                } else {
                                    cell.textContent = val;
                                    cell.style.color = '';
                                    cell.style.fontWeight = '';
                                }
                            });
                            gsap.to(contentCells, { opacity: 1, duration: 0.25, onComplete: resolve });
                        }
                    });
                });
            }
        }

        // ⭐ CLEAR back-button: Fade rows back in
        if (lastStepData.clearOperation) {
            cleanupClearElements();

            const { container, varName, originalItems } = lastStepData.clearOperation;

            if (container && originalItems && originalItems.length > 0) {
                // Restore Python state
                try {
                    const itemsStr = originalItems.map(item => {
                        const isNum = !isNaN(item) && item !== '' && !item.includes('"');
                        return isNum ? item : item;
                    }).join(', ');
                    await pyodide.runPythonAsync(`${varName} = [${itemsStr}]`);
                    console.log(`🔙 Restored ${varName} in Python`);
                } catch (e) {
                    console.warn('Failed to restore Python state for clear:', e);
                }

                // Visual restoration with fade
                const tbody = container.querySelector('.list-table-body');

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

                // Fade in all rows
                const restoredRows = container.querySelectorAll('.list-row');
                await new Promise(resolve => {
                    gsap.to(restoredRows, {
                        opacity: 1,
                        duration: 0.4,
                        stagger: 0.05,
                        onComplete: resolve
                    });
                });

                // Update count
                const countSection = container.querySelector('.list-count-section');
                if (countSection) {
                    countSection.textContent = `N is ${originalItems.length}`;
                }
            }
        }

        // Standard Reversal for output and variables
        lastStepData.outputElements.forEach(el => {
            gsap.to(el, { opacity: 0, x: -20, duration: 0.3, onComplete: () => el.remove() });
        });

        for (const el of lastStepData.variableElements) {
            if (el.classList && el.classList.contains('list-container')) {
                const varName = el.dataset.varName;
                if (varName) renderedLists.delete(varName);
                await new Promise(resolve => reverseListCreation(el, () => resolve()));
            } else {
                gsap.to(el, { opacity: 0, scale: 0.5, duration: 0.3, onComplete: () => el.remove() });
            }
        }

        if (currentStep > 0) {
            highlightLine(executionPlan[currentStep - 1].lineNumber);
            showSmartExplanation(currentStep - 1);
        } else {
            if (currentLineMarker) currentLineMarker.clear();
            showTeacher("Back to the start. Click 'Next Step' to begin again.");
        }
    }

    updateStepIndicator();
    updateButtons();
};

document.getElementById('resetBtn').onclick = async () => {
    cleanupLenCounters();          // ✅ REMOVE len() DIV + ARROW
    cleanupIndexDivs();            // ✅ REMOVE index() DIV + ARROW
    cleanupCountDivs();            // ✅ REMOVE count() DIV + ARROW
    cleanupPopElements();          // ✅ REMOVE pop() PILL + ARROW
    cleanupRemoveElements_v1();    // ✅ REMOVE remove() SEARCH DIV + ARROW
    cleanupReverseElements();      // ✅ REMOVE reverse() ELEMENTS
    cleanupClearElements();        // ✅ REMOVE clear() MESSAGE
    editor.setValue(tabTemplates[currentTab]);
    setupLineLocking();
    await resetExecution();
};


function displayError(message) {
    const outputDiv = document.getElementById('output');
    const errorLine = document.createElement('div');
    errorLine.className = 'output-line error';
    errorLine.textContent = `❌ ${message}`;
    outputDiv.appendChild(errorLine);
    gsap.to(errorLine, { opacity: 1, x: 0, duration: 0.5 });
}

function highlightLine(lineNum) {
    if (currentLineMarker) currentLineMarker.clear();
    currentLineMarker = editor.markText(
        { line: lineNum, ch: 0 },
        { line: lineNum, ch: editor.getLine(lineNum).length },
        { className: 'CodeMirror-activeline-background' }
    );
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

async function showSmartExplanation(stepIndex) {
    if (!preloadedExplanations[stepIndex]) return;
    let explanation = preloadedExplanations[stepIndex].explanation;
    const placeholders = preloadedExplanations[stepIndex].placeholders || [];

    placeholders.forEach(p => {
        if (placeholderValues[p]) {
            explanation = explanation.replace(new RegExp(`\\{\\{${p}\\}\\}`, 'g'), placeholderValues[p]);
        }
    });

    Object.keys(currentVariables).forEach(v => {
        explanation = explanation.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), currentVariables[v]);
    });

    showTeacher(explanation);
}

function updateStepIndicator() {
    document.getElementById('stepIndicator').textContent =
        isRunning ? `Step ${currentStep}/${totalSteps}` : 'Ready to run...';
}

function updateButtons() {
    document.getElementById('backBtn').disabled = (currentStep === 0);
    document.getElementById('stepBtn').disabled = (currentStep >= totalSteps);
}