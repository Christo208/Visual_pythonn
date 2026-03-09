/* ============================================
   Expression Evaluator - Phase 0: Core Architecture
   ============================================ */

// ============================================
// GLOBAL STATE
// ============================================
let currentExpression = '';
let currentVariables = {};
let animationQueue = [];

// ============================================
// 1. EXPRESSION TOKENIZER
// ============================================

/**
 * Tokenizes a Python expression into structured tokens
 * @param {string} expr - The expression to tokenize
 * @returns {Array} Array of token objects with type, value, and metadata
 */
function tokenize(expr) {
    const tokens = [];
    let i = 0;
    
    // Remove whitespace
    expr = expr.replace(/\s+/g, '');
    
    while (i < expr.length) {
        const char = expr[i];
        
        // Handle numbers (including decimals)
        if (char >= '0' && char <= '9') {
            let num = '';
            while (i < expr.length && (expr[i] >= '0' && expr[i] <= '9' || expr[i] === '.')) {
                num += expr[i];
                i++;
            }
            tokens.push({
                type: 'number',
                value: num,
                numericValue: parseFloat(num)
            });
            continue;
        }
        
        // Handle parentheses
        if (char === '(' || char === ')') {
            tokens.push({
                type: 'parenthesis',
                value: char,
                precedence: 100 // Highest precedence
            });
            i++;
            continue;
        }
        
        // Handle two-character operators
        if (i < expr.length - 1) {
            const twoChar = expr.substr(i, 2);
            if (twoChar === '**') {
                tokens.push({ type: 'operator', value: '**', precedence: 5, name: 'power' });
                i += 2;
                continue;
            }
            if (twoChar === '//' || twoChar === '==' || twoChar === '!=' || 
                twoChar === '>=' || twoChar === '<=') {
                let precedence = (twoChar === '//' ? 4 : 3);
                tokens.push({ type: 'operator', value: twoChar, precedence, name: 'comparison' });
                i += 2;
                continue;
            }
        }
        
        // Handle single-character operators
        if ('+-*/%><'.includes(char)) {
            let precedence;
            let name;
            if (char === '*' || char === '/' || char === '%') {
                precedence = 4;
                name = 'multiply_divide';
            } else if (char === '+' || char === '-') {
                precedence = 2;
                name = 'add_subtract';
            } else {
                precedence = 3;
                name = 'comparison';
            }
            tokens.push({ type: 'operator', value: char, precedence, name });
            i++;
            continue;
        }
        
        // Handle keywords (and, or, not) and identifiers (variables)
        if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_') {
            let word = '';
            while (i < expr.length && 
                   ((expr[i] >= 'a' && expr[i] <= 'z') || 
                    (expr[i] >= 'A' && expr[i] <= 'Z') || 
                    (expr[i] >= '0' && expr[i] <= '9') || 
                    expr[i] === '_')) {
                word += expr[i];
                i++;
            }
            
            // Check if it's a keyword
            if (word === 'and') {
                tokens.push({ type: 'keyword', value: 'and', precedence: 1, name: 'logical_and' });
            } else if (word === 'or') {
                tokens.push({ type: 'keyword', value: 'or', precedence: 0, name: 'logical_or' });
            } else if (word === 'not') {
                tokens.push({ type: 'keyword', value: 'not', precedence: 6, name: 'logical_not' });
            } else if (word === 'True' || word === 'False') {
                tokens.push({ type: 'boolean', value: word, boolValue: word === 'True' });
            } else {
                // It's a variable
                tokens.push({ type: 'variable', value: word });
            }
            continue;
        }
        
        // Unknown character - skip it
        console.warn(`Unknown character: ${char}`);
        i++;
    }
    
    return tokens;
}

// ============================================
// 2. ANIMATION QUEUE SYSTEM
// ============================================

/**
 * Adds an animation to the queue
 * @param {Object} animation - Animation object with type and parameters
 */
function queueAnimation(animation) {
    animationQueue.push(animation);
    console.log('📋 Queued animation:', animation);
}

/**
 * Executes all animations in the queue sequentially
 */
async function executeAnimationQueue() {
    console.log(`🎬 Starting animation queue (${animationQueue.length} animations)`);
    
    for (let i = 0; i < animationQueue.length; i++) {
        const animation = animationQueue[i];
        await executeAnimation(animation);
        
        // Small delay between animations
        await sleep(500);
    }
    
    console.log('✅ Animation queue completed!');
    animationQueue = []; // Clear queue
}

/**
 * Executes a single animation
 * @param {Object} animation - Animation object
 */
async function executeAnimation(animation) {
    const stepDiv = document.getElementById('stepExplanation');
    
    switch (animation.type) {
        case 'initialize':
            updateStep(`Ready to evaluate: <span class="step-highlight">${animation.expression}</span>`);
            break;
            
        case 'tokenize':
            updateStep(`Parsed expression into ${animation.tokenCount} tokens`);
            console.log('🔍 Tokens:', animation.tokens);
            break;
            
        case 'display':
            displayExpression(animation.tokens);
            updateStep(`Displaying expression with color-coded tokens`);
            break;
            
        case 'fusion':
            // Placeholder for Phase 1
            updateStep(`[Phase 1] Will animate: ${animation.operands[0]} ${animation.operator} ${animation.operands[1]} = ${animation.result}`);
            break;
            
        case 'complete':
            updateStep(`Final result: <span class="step-highlight">${animation.finalResult}</span>`);
            break;
            
        default:
            console.warn('Unknown animation type:', animation.type);
    }
}

/**
 * Helper function to sleep/delay
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 3. UI UPDATE FUNCTIONS
// ============================================

/**
 * Updates the memory bank display with variables
 * @param {Object} variables - Object containing variable name-value pairs
 */
function updateMemoryBank(variables) {
    const memoryDiv = document.getElementById('memoryBank');
    
    if (!variables || Object.keys(variables).length === 0) {
        memoryDiv.innerHTML = '<span class="placeholder">No variables in memory</span>';
        return;
    }
    
    memoryDiv.innerHTML = '';
    
    Object.entries(variables).forEach(([name, value]) => {
        const chip = document.createElement('div');
        chip.className = 'variable-chip';
        chip.innerHTML = `
            <span class="var-name">${name}</span>
            <span class="var-equals">=</span>
            <span class="var-value">${value}</span>
        `;
        memoryDiv.appendChild(chip);
    });
}

/**
 * Displays the expression in the animation canvas with color-coded tokens
 * @param {Array} tokens - Array of token objects
 */
function displayExpression(tokens) {
    const displayDiv = document.getElementById('expressionDisplay');
    displayDiv.innerHTML = '';
    
    tokens.forEach(token => {
        const span = document.createElement('span');
        span.className = `token token-${token.type}`;
        span.textContent = token.value;
        displayDiv.appendChild(span);
    });
}

/**
 * Updates the step explanation text
 * @param {string} text - HTML text to display
 */
function updateStep(text) {
    const stepDiv = document.getElementById('stepExplanation');
    stepDiv.querySelector('.step-text').innerHTML = text;
}

// ============================================
// 4. MAIN EVALUATION ORCHESTRATOR
// ============================================

/**
 * Main function to process and evaluate the expression
 * @param {string} expression - The expression to evaluate
 * @param {Object} variables - Variables and their values
 */
async function evaluateExpression(expression, variables) {
    console.log('🚀 Starting evaluation:', expression);
    
    // Store globally
    currentExpression = expression;
    currentVariables = variables;
    
    // Clear any existing queue
    animationQueue = [];
    
    // Step 1: Initialize
    queueAnimation({
        type: 'initialize',
        expression: expression
    });
    
    // Step 2: Tokenize
    const tokens = tokenize(expression);
    queueAnimation({
        type: 'tokenize',
        tokens: tokens,
        tokenCount: tokens.length
    });
    
    // Step 3: Display with color coding
    queueAnimation({
        type: 'display',
        tokens: tokens
    });
    
    // Step 4: Placeholder for future evaluation
    queueAnimation({
        type: 'complete',
        finalResult: '(Phase 1 will calculate this)'
    });
    
    // Execute all animations
    await executeAnimationQueue();
}

// ============================================
// 5. MESSAGE LISTENER (from parent window)
// ============================================

window.addEventListener('message', async (event) => {
    console.log('📨 Received message:', event.data);
    
    const { expression, variables, result } = event.data;
    
    // Update memory bank
    updateMemoryBank(variables);
    
    // Start evaluation process
    if (expression) {
        await evaluateExpression(expression, variables);
    }
});

// ============================================
// 6. CLOSE BUTTON
// ============================================

document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
});

// ============================================
// 7. TEST BUTTON (TEMPORARY - Remove after Phase 0 testing)
// ============================================

const testBtn = document.getElementById('testBtn');
if (testBtn) {
    testBtn.addEventListener('click', async () => {
        console.log('🧪 Testing with sample data...');
        
        // Simulate data from Level 6
        const testData = {
            expression: '5 + 3 * 2',
            variables: { x: 5, y: 10, age: 15 },
            result: 11
        };
        
        // Trigger the same logic as postMessage
        updateMemoryBank(testData.variables);
        await evaluateExpression(testData.expression, testData.variables);
    });
}

// ============================================
// 8. INITIALIZATION
// ============================================

console.log('✅ Expression Evaluator (Phase 0) initialized!');
console.log('📊 Tokenizer ready');
console.log('🎬 Animation queue system ready');
console.log('🎨 4-Space UI loaded');
console.log('⏳ Waiting for expression data...');

/* ============================================
   PHASE 1 ADDITIONS - Parts A, B, C
   ADD THESE TO expressionEvaluator.js
   ============================================ */

// ============================================
// PART A: EVALUATION ENGINE
// ============================================

/**
 * Evaluates a simple arithmetic expression with precedence
 * @param {string} expr - Expression to evaluate
 * @param {Object} variables - Variable values to substitute
 * @returns {number|boolean} Result of evaluation
 */


/**
 * Finds the next operation to perform based on precedence
 * @param {Array} tokens - Token array
 * @returns {Object|null} Operation info or null if no operators
 */
function findNextOperation(tokens) {
    let highestPrecedence = -1;
    let operatorIndex = -1;
    
    // Skip parentheses for Phase 1 (will handle in Phase 2)
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'operator' || token.type === 'keyword') {
            if (token.precedence > highestPrecedence) {
                highestPrecedence = token.precedence;
                operatorIndex = i;
            }
        }
    }
    
    if (operatorIndex === -1) return null;
    
    const operator = tokens[operatorIndex];
    
    // For binary operators
    if (operator.value !== 'not') {
        return {
            operatorIndex: operatorIndex,
            operator: operator.value,
            leftOperand: tokens[operatorIndex - 1],
            rightOperand: tokens[operatorIndex + 1],
            precedence: operator.precedence,
            name: operator.name
        };
    } else {
        // For unary 'not'
        return {
            operatorIndex: operatorIndex,
            operator: operator.value,
            leftOperand: null,
            rightOperand: tokens[operatorIndex + 1],
            precedence: operator.precedence,
            name: operator.name
        };
    }
}

/**
 * Performs a single operation and returns the result
 * @param {Object} operation - Operation object from findNextOperation
 * @returns {number|boolean} Result
 */
function performOperation(operation) {
    const { operator, leftOperand, rightOperand } = operation;
    
    // Get numeric/boolean values
    const left = leftOperand ? (leftOperand.numericValue ?? leftOperand.boolValue ?? parseFloat(leftOperand.value)) : null;
    const right = rightOperand.numericValue ?? rightOperand.boolValue ?? parseFloat(rightOperand.value);
    
    switch (operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '**': return Math.pow(left, right);
        case '//': return Math.floor(left / right);
        case '%': return left % right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '==': return left == right;
        case '!=': return left != right;
        case 'and': return left && right;
        case 'or': return left || right;
        case 'not': return !right;
        default: return null;
    }
}

// ============================================
// PART B: FUSION ANIMATION
// ============================================

/**
 * Creates fusion animation for an arithmetic operation
 * @param {Object} operation - Operation to animate
 * @param {number} result - Result of the operation
 */
async function animateFusion(operation, result) {
    const displayDiv = document.getElementById('expressionDisplay');
    
    // Get positions of operands and operator in the display
    const tokens = Array.from(displayDiv.querySelectorAll('.token'));
    const operatorElement = tokens[operation.operatorIndex];
    const leftElement = operation.leftOperand ? tokens[operation.operatorIndex - 1] : null;
    const rightElement = tokens[operation.operatorIndex + 1];
    
    // Highlight the operator group in Space 2
    highlightOperatorGroup(operation.name);
    
    // Update step explanation
    const leftVal = leftElement ? leftElement.textContent : '';
    const rightVal = rightElement.textContent;
    const opSymbol = operatorElement.textContent;
    updateStep(`Evaluating: <span class="step-highlight">${leftVal} ${opSymbol} ${rightVal}</span>`);
    
    // Create cloud container
    const cloudContainer = document.createElement('div');
    cloudContainer.className = 'fusion-cloud-container';
    
    // Position cloud over the operation
    const operatorRect = operatorElement.getBoundingClientRect();
    const displayRect = displayDiv.getBoundingClientRect();
    
    cloudContainer.style.left = `${operatorRect.left - displayRect.left - 60}px`;
    cloudContainer.style.top = `${operatorRect.top - displayRect.top - 40}px`;
    
    displayDiv.appendChild(cloudContainer);
    
    // Create overlapping circles for cloud
    for (let i = 0; i < 5; i++) {
        const circle = document.createElement('div');
        circle.className = 'cloud-circle';
        circle.style.animationDelay = `${i * 0.05}s`;
        cloudContainer.appendChild(circle);
    }
    
    // Create SVG trail
    const trail = createFusionTrail(operatorRect);
    
    // Play whoosh sound
    playSound('whoosh');
    
    // Step 1: Cloud appears (0.5s)
    await animateCloudAppear(cloudContainer);
    
    // Step 2: Shake effect (0.3s)
    await animateShake(cloudContainer);
    
    // Step 3: Operator glows yellow (0.4s)
    await animateOperatorGlow(operatorElement);
    
    // Step 4: Cloud disappears (0.5s)
    await animateCloudDisappear(cloudContainer);
    
    // Step 5: Result appears
    await showResult(result, operation, tokens);
    
    // Cleanup
    cloudContainer.remove();
    removeTrail(trail);
    clearOperatorHighlight();
}

/**
 * Animates cloud appearance
 */
async function animateCloudAppear(cloud) {
    return new Promise(resolve => {
        gsap.to(cloud, {
            scale: 1,
            opacity: 1,
            duration: 0.5,
            ease: "back.out(1.5)",
            onComplete: resolve
        });
    });
}

/**
 * Animates shake effect
 */
async function animateShake(cloud) {
    return new Promise(resolve => {
        gsap.to(cloud, {
            rotation: 5,
            duration: 0.1,
            yoyo: true,
            repeat: 3,
            ease: "power1.inOut",
            onComplete: () => {
                gsap.set(cloud, { rotation: 0 });
                resolve();
            }
        });
    });
}

/**
 * Animates operator glow
 */
async function animateOperatorGlow(operatorElement) {
    return new Promise(resolve => {
        // Add glow class
        operatorElement.classList.add('operator-glow');
        
        setTimeout(() => {
            operatorElement.classList.remove('operator-glow');
            resolve();
        }, 400);
    });
}

/**
 * Animates cloud disappearance
 */
async function animateCloudDisappear(cloud) {
    return new Promise(resolve => {
        gsap.to(cloud, {
            scale: 0,
            opacity: 0,
            duration: 0.5,
            ease: "power2.in",
            onComplete: resolve
        });
    });
}

/**
 * Shows the result and morphs the expression
 */
async function showResult(result, operation, tokens) {
    // Remove old tokens (left operand, operator, right operand)
    const startIndex = operation.leftOperand ? operation.operatorIndex - 1 : operation.operatorIndex;
    const count = operation.leftOperand ? 3 : 2;
    
    for (let i = 0; i < count; i++) {
        const token = tokens[startIndex];
        if (token) {
            await new Promise(resolve => {
                gsap.to(token, {
                    scale: 0,
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => {
                        token.remove();
                        resolve();
                    }
                });
            });
        }
    }
    
    // Create result token
    const resultToken = document.createElement('span');
    const resultType = typeof result === 'boolean' ? 'boolean' : 'number';
    resultToken.className = `token token-${resultType}`;
    resultToken.textContent = result;
    resultToken.style.transform = 'scale(0)';
    resultToken.style.opacity = '0';
    
    // Insert at the position where operator was
    const displayDiv = document.getElementById('expressionDisplay');
    if (tokens[startIndex]) {
        displayDiv.insertBefore(resultToken, tokens[startIndex]);
    } else {
        displayDiv.appendChild(resultToken);
    }
    
    // Animate result appearance
    return new Promise(resolve => {
        gsap.to(resultToken, {
            scale: 1,
            opacity: 1,
            duration: 0.5,
            ease: "back.out(1.7)",
            onComplete: () => {
                updateStep(`Result: <span class="step-highlight">${result}</span>`);
                resolve();
            }
        });
    });
}

/**
 * Creates SVG trail for fusion animation
 */
function createFusionTrail(operatorRect) {
    const svg = document.getElementById('trailSvg') || createTrailSVG();
    const particles = [];
    
    const centerX = operatorRect.left + operatorRect.width / 2;
    const centerY = operatorRect.top + operatorRect.height / 2;
    
    for (let i = 0; i < 10; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', 4);
        circle.setAttribute('fill', '#fbbf24');
        circle.setAttribute('opacity', 0.8);
        circle.setAttribute('cx', centerX);
        circle.setAttribute('cy', centerY);
        svg.appendChild(circle);
        
        // Animate particles outward
        const angle = (i / 10) * Math.PI * 2;
        const distance = 50;
        const endX = centerX + Math.cos(angle) * distance;
        const endY = centerY + Math.sin(angle) * distance;
        
        gsap.to(circle, {
            attr: { cx: endX, cy: endY, r: 2 },
            opacity: 0,
            duration: 0.8,
            ease: "power2.out"
        });
        
        particles.push(circle);
    }
    
    return particles;
}

/**
 * Creates SVG element for trails if it doesn't exist
 */
function createTrailSVG() {
    let svg = document.getElementById('trailSvg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'trailSvg';
        svg.style.position = 'fixed';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '9999';
        document.body.appendChild(svg);
    }
    return svg;
}

/**
 * Removes trail particles
 */
function removeTrail(particles) {
    setTimeout(() => {
        particles.forEach(p => p.remove());
    }, 1000);
}

// ============================================
// PART C: UI INTEGRATION
// ============================================

/**
 * Highlights the active operator group in Space 2
 */
function highlightOperatorGroup(operatorName) {
    // Clear previous highlights
    clearOperatorHighlight();
    
    const operatorGroups = document.querySelectorAll('.op-group');
    
    // Map operator names to their group index
    const groupMap = {
        'power': 1,
        'multiply_divide': 2,
        'add_subtract': 3,
        'comparison': 4,
        'logical_not': 5,
        'logical_and': 6,
        'logical_or': 7
    };
    
    const groupIndex = groupMap[operatorName];
    if (groupIndex !== undefined && operatorGroups[groupIndex]) {
        operatorGroups[groupIndex].classList.add('op-group-active');
    }
}

/**
 * Clears operator group highlighting
 */
function clearOperatorHighlight() {
    document.querySelectorAll('.op-group-active').forEach(el => {
        el.classList.remove('op-group-active');
    });
}

/**
 * Plays a sound effect
 */
function playSound(soundName) {
    const soundElement = document.getElementById(`sound${soundName.charAt(0).toUpperCase() + soundName.slice(1)}`);
    if (soundElement) {
        soundElement.currentTime = 0;
        soundElement.play().catch(e => console.warn(`${soundName} sound failed:`, e));
    }
}

// ============================================
// MODIFIED: Main Evaluation Orchestrator
// REPLACE the existing evaluateExpression function
// ============================================

/**
 * Main function to process and evaluate the expression (UPDATED FOR PHASE 1)
 */
async function evaluateExpression(expression, variables) {
    console.log('🚀 Starting evaluation (Phase 1):', expression);
    
    currentExpression = expression;
    currentVariables = variables;
    animationQueue = [];
    
    // Step 1: Initialize
    queueAnimation({
        type: 'initialize',
        expression: expression
    });
    
    // Step 2: Tokenize
    let tokens = tokenize(expression);
    queueAnimation({
        type: 'tokenize',
        tokens: tokens,
        tokenCount: tokens.length
    });
    
    // Step 3: Display with color coding
    queueAnimation({
        type: 'display',
        tokens: tokens
    });
    
    // Execute initial animations
    await executeAnimationQueue();
    
    // Step 4: Substitute variables (if any)
    tokens = await substituteVariables(tokens, variables);
    
    // Step 5: Evaluate step by step
    while (true) {
        const operation = findNextOperation(tokens);
        if (!operation) break;
        
        // Calculate result
        const result = performOperation(operation);
        
        // Animate the fusion
        await animateFusion(operation, result);
        
        // Update tokens array
        const startIndex = operation.leftOperand ? operation.operatorIndex - 1 : operation.operatorIndex;
        const count = operation.leftOperand ? 3 : 2;
        
        // Create new result token
        const resultToken = {
            type: typeof result === 'boolean' ? 'boolean' : 'number',
            value: String(result),
            numericValue: typeof result === 'number' ? result : undefined,
            boolValue: typeof result === 'boolean' ? result : undefined
        };
        
        // Replace tokens
        tokens.splice(startIndex, count, resultToken);
        
        await sleep(300);
    }
    
    // Step 6: Final result
    const finalResult = tokens[0]?.value || tokens[0]?.numericValue || tokens[0]?.boolValue;
    updateStep(`✅ Final result: <span class="step-highlight">${finalResult}</span>`);
    
    console.log('✅ Evaluation complete!');
}

/**
 * Substitutes variables with their values (animated)
 */
async function substituteVariables(tokens, variables) {
    const newTokens = [];
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        if (token.type === 'variable' && variables[token.value] !== undefined) {
            const value = variables[token.value];
            const numValue = parseFloat(value);
            
            // Show substitution animation
            updateStep(`Substituting <span class="step-highlight">${token.value}</span> with <span class="step-highlight">${value}</span>`);
            
            // Flash the variable in memory bank
            const varBox = document.getElementById(`box-${token.value}`);
            if (varBox) {
                gsap.to(varBox, {
                    boxShadow: '0 0 30px rgba(251, 191, 36, 0.8)',
                    duration: 0.3,
                    yoyo: true,
                    repeat: 1
                });
            }
            
            await sleep(400);
            
            newTokens.push({
                type: 'number',
                value: String(value),
                numericValue: isNaN(numValue) ? undefined : numValue
            });
        } else {
            newTokens.push(token);
        }
    }
    
    // Update display with substituted values
    displayExpression(newTokens);
    await sleep(500);
    
    return newTokens;
}

// ============================================
// MODIFIED: Execute Animation Function
// UPDATE the executeAnimation function to handle new types
// ============================================

// ADD these cases to the existing switch statement in executeAnimation():

/*
case 'fusion':
    await animateFusion(animation.operation, animation.result);
    break;

case 'substitute':
    updateStep(`Substituting ${animation.variable} = ${animation.value}`);
    break;
*/