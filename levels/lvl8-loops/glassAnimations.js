/* ===================================
   Level 8: Loops — Glass Pane & Engine Box Animations
   Isolated module for loop-specific visuals
   =================================== */

// ============ GLASS PANE ============

/**
 * Shows the green crystalline glass pane over the loop body lines
 * and frosts everything outside.
 * @param {CodeMirror} editor - The CodeMirror instance
 * @param {number} loopStartLine - First line of the loop (header)
 * @param {number} loopEndLine - Last line of the loop body
 * @returns {object} { glassPaneEl, frostedMarks, activeLoopMarks } for later cleanup
 */
export function showGlassPane(editor, loopStartLine, loopEndLine, depth = 1) {
    const totalLines = editor.lineCount();

    // Add frosted class to lines OUTSIDE the loop
    const frostedMarks = [];
    for (let i = 0; i < totalLines; i++) {
        if (i < loopStartLine || i > loopEndLine) {
            editor.addLineClass(i, 'wrap', 'loop-frosted-line');
            frostedMarks.push(i);
        }
    }

    // Add active syntax palette to loop body lines (including header)
    const activeLoopMarks = [];
    for (let i = loopStartLine; i <= loopEndLine; i++) {
        editor.addLineClass(i, 'wrap', 'loop-active-line');
        editor.addLineClass(i, 'wrap', 'loop-active');
        activeLoopMarks.push(i);
    }

    // Create glass pane overlay positioned over the loop lines
    const startCoords = editor.charCoords({ line: loopStartLine, ch: 0 }, 'local');
    const endCoords = editor.charCoords({ line: loopEndLine, ch: 0 }, 'local');
    const lineHeight = editor.defaultTextHeight();

    const glassPaneEl = document.createElement('div');
    glassPaneEl.className = 'loop-glass-pane';
    if (depth >= 2) glassPaneEl.classList.add(`depth-${Math.min(depth, 3)}`);
    glassPaneEl.style.top = `${startCoords.top}px`;
    glassPaneEl.style.left = '0';
    glassPaneEl.style.right = '0';
    glassPaneEl.style.height = `${(endCoords.top - startCoords.top) + lineHeight + 8}px`;

    // Add to CodeMirror's sizer (so it scrolls with code)
    const sizer = editor.getWrapperElement().querySelector('.CodeMirror-sizer');
    if (sizer) {
        sizer.style.position = 'relative';
        sizer.appendChild(glassPaneEl);

        // Active line cursor (scoped to this glass pane)
        const cursorEl = document.createElement('div');
        cursorEl.className = 'loop-active-cursor';
        cursorEl.style.opacity = '0';
        sizer.appendChild(cursorEl);

        // Attach for cleanup
        glassPaneEl._cursorEl = cursorEl;
    }

    // Fade in
    glassPaneEl.style.opacity = '0';
    gsap.to(glassPaneEl, { opacity: 1, duration: 0.5, ease: 'power2.out' });

    return { glassPaneEl, frostedMarks, activeLoopMarks, cursorEl: glassPaneEl._cursorEl || null };
}

/**
 * Dissolves the glass pane with a gentle fade.
 * @param {HTMLElement} glassPaneEl - The glass pane element
 * @param {CodeMirror} editor - The CodeMirror instance
 * @param {number[]} frostedMarks - Line numbers that were frosted
 * @param {number[]} activeLoopMarks - Line numbers in the active loop range
 * @returns {Promise} Resolves when dissolve animation completes
 */
export function dissolveGlassPane(glassPaneEl, editor, frostedMarks, activeLoopMarks) {
    return new Promise(resolve => {
        // Remove frosted classes
        if (frostedMarks) {
            frostedMarks.forEach(lineNum => {
                editor.removeLineClass(lineNum, 'wrap', 'loop-frosted-line');
            });
        }

        // Remove loop-active palette classes
        if (activeLoopMarks) {
            activeLoopMarks.forEach(lineNum => {
                editor.removeLineClass(lineNum, 'wrap', 'loop-active-line');
                editor.removeLineClass(lineNum, 'wrap', 'loop-active');
            });
        }

        if (!glassPaneEl) {
            resolve();
            return;
        }

        // Add dissolving animation class
        glassPaneEl.classList.add('dissolving');

        setTimeout(() => {
            if (glassPaneEl.parentNode) {
                glassPaneEl.parentNode.removeChild(glassPaneEl);
            }
            const cursorEl = glassPaneEl._cursorEl || null;
            if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
            resolve();
        }, 800);
    });
}

export function updateActiveLine(editor, lineNum, cursorEl = null) {
    const targetCursor = cursorEl || document.querySelector('.loop-active-cursor:last-of-type');
    if (!targetCursor) return;
    if (lineNum === null) {
        targetCursor.style.opacity = '0';
        return;
    }

    const wrap = editor.getScrollerElement().parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    const coords = editor.charCoords({ line: lineNum, ch: 0 }, 'window');
    const lineH = editor.defaultTextHeight();

    targetCursor.style.top = (coords.top - wrapRect.top) + 'px';
    targetCursor.style.height = lineH + 'px';
    targetCursor.style.opacity = '1';
}


// ============ ENGINE BOX ============

/**
 * Creates and injects an engine box widget above the loop header line.
 * @param {CodeMirror} editor - The CodeMirror instance
 * @param {string} loopType - 'for' or 'while'
 * @param {number} loopHeaderLine - The line number of the loop header
 * @param {object} config - Loop-specific configuration
 *   For 'for': { iterVar: string, iterableName: string, items: string[] }
 *   For 'while': { condition: string }
 * @returns {object} { widget, element } — the CM widget ref and DOM element
 */
export function injectEngineBox(editor, loopType, loopHeaderLine, config, depth = 1) {
    const engineEl = document.createElement('div');

    if (loopType === 'for') {
        engineEl.className = 'engine-box engine-box-for';
        if (depth >= 2) engineEl.classList.add(`depth-${Math.min(depth, 3)}`);
        engineEl.innerHTML = `
            <div class="engine-box-header">🔄 For-Loop Engine</div>
            <div class="engine-box-row">
                <span class="engine-box-label">Iterable :</span>
                <span class="condition-text">${config.iterableName}</span>
            </div>
            <div class="engine-box-row">
                <span class="engine-box-label">${config.iterVar} ➜</span>
                <div class="token-track" id="engineTokenTrack">
                    ${config.items.map((item, idx) =>
            `<span class="token token-upcoming" data-idx="${idx}">${item}</span>`
        ).join('')}
                </div>
            </div>
        `;
    } else {
        engineEl.className = 'engine-box engine-box-while';
        if (depth >= 2) engineEl.classList.add(`depth-${Math.min(depth, 3)}`);
        engineEl.innerHTML = `
            <div class="engine-box-header">⚡ While-Loop Engine</div>
            <div class="engine-box-row">
                <span class="engine-box-label">Condition :</span>
                <span class="condition-text" id="engineConditionText">${config.condition}</span>
            </div>
            <div class="engine-box-row">
                <span class="engine-box-label">Status :</span>
                <span class="condition-badge badge-evaluating" id="engineStatusBadge">Evaluating...</span>
            </div>
        `;
    }

    // Inject as a CodeMirror line widget
    const widget = editor.addLineWidget(loopHeaderLine, engineEl, {
        coverGutter: false,
        noHScroll: true,
        above: true
    });

    // Animate in
    engineEl.style.opacity = '0';
    engineEl.style.transform = 'translateY(-10px)';
    gsap.to(engineEl, { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.4)' });

    return { widget, element: engineEl };
}

/**
 * Updates the for-loop engine token track.
 * @param {HTMLElement} engineEl - The engine box DOM element
 * @param {number} currentIndex - Index of the current item
 */
export function updateForEngine(engineEl, currentIndex) {
    const tokens = engineEl.querySelectorAll('.token');

    tokens.forEach((token, idx) => {
        token.className = 'token'; // Reset all classes

        if (idx < currentIndex) {
            token.classList.add('token-done');
        } else if (idx === currentIndex) {
            token.classList.add('token-current');
        } else if (idx === currentIndex + 1) {
            token.classList.add('token-next');
        } else {
            token.classList.add('token-upcoming');
        }
    });
}

/**
 * Updates the while-loop engine condition and status badge.
 * @param {HTMLElement} engineEl - The engine box DOM element
 * @param {string} conditionStr - The condition with substituted values (e.g., "3 <= 5")
 * @param {boolean|null} result - true, false, or null (evaluating)
 * @returns {Promise} Resolves after badge animation
 */
export function updateWhileEngine(engineEl, conditionStr, result) {
    return new Promise(resolve => {
        const condText = engineEl.querySelector('#engineConditionText') || engineEl.querySelector('.condition-text');
        const badge = engineEl.querySelector('#engineStatusBadge') || engineEl.querySelector('.condition-badge');

        if (condText) condText.textContent = conditionStr;

        if (badge) {
            // Start with evaluating state
            badge.className = 'condition-badge badge-evaluating';
            badge.textContent = 'Evaluating...';

            if (result === null) {
                resolve();
                return;
            }

            // After 0.8s, resolve to TRUE or FALSE
            setTimeout(() => {
                if (result) {
                    badge.className = 'condition-badge badge-true badge-true-flash';
                    badge.textContent = '✅ TRUE';
                } else {
                    badge.className = 'condition-badge badge-false badge-false-flash';
                    badge.textContent = '❌ FALSE';
                }
                resolve();
            }, 800);
        } else {
            resolve();
        }
    });
}

/**
 * Removes the engine box widget.
 * @param {object} widgetRef - The { widget, element } returned by injectEngineBox
 * @returns {Promise} Resolves after fadeout
 */
export function removeEngineBox(widgetRef) {
    return new Promise(resolve => {
        if (!widgetRef || !widgetRef.widget) {
            resolve();
            return;
        }

        gsap.to(widgetRef.element, {
            opacity: 0,
            y: -10,
            duration: 0.4,
            ease: 'power2.in',
            onComplete: () => {
                try {
                    widgetRef.widget.clear();
                } catch (e) {
                    console.warn('Could not clear engine widget:', e);
                }
                resolve();
            }
        });
    });
}


// ============ LOOP-BACK ARROW ============

/**
 * Animates a glowing arrow arcing upward in the left gutter from fromLine to toLine.
 * Each line it passes sweeps with a brief highlight.
 * @param {CodeMirror} editor - The CodeMirror instance
 * @param {number} fromLine - Bottom of loop body (where arrow starts)
 * @param {number} toLine - Loop header line (where arrow lands)
 * @returns {Promise} Resolves when animation completes
 */
export function animateLoopBack(editor, fromLine, toLine, depth = 1) {
    return new Promise(resolve => {
        const wrapper = editor.getWrapperElement();
        const gutterEl = wrapper.querySelector('.CodeMirror-gutters');
        if (!gutterEl) { resolve(); return; }

        const gutterWidth = gutterEl.getBoundingClientRect().width;

        // Get line coordinates (local to editor)
        const fromCoords = editor.charCoords({ line: fromLine, ch: 0 }, 'local');
        const toCoords = editor.charCoords({ line: toLine, ch: 0 }, 'local');
        const lineHeight = editor.defaultTextHeight();

        const startY = fromCoords.top + lineHeight / 2;
        const endY = toCoords.top + lineHeight / 2;
        const arcX = -15; // How far left the arc goes into the gutter
        const lineX = gutterWidth - 10; // X position along the gutter edge

        // Create SVG for the arrow
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'loop-back-arrow');
        if (depth >= 2) svg.classList.add(`depth-${Math.min(depth, 3)}`);
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = `${gutterWidth + 10}px`;
        svg.style.height = `${Math.abs(startY - endY) + lineHeight + 40}px`;
        svg.style.overflow = 'visible';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '10';

        // Build arc path
        const svgTop = Math.min(startY, endY) - 20;
        svg.style.top = `${svgTop}px`;

        const relStartY = startY - svgTop;
        const relEndY = endY - svgTop;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cpX = arcX; // Control point for the curve
        const d = `M ${lineX} ${relStartY} C ${cpX} ${relStartY}, ${cpX} ${relEndY}, ${lineX} ${relEndY}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#34d399');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('filter', 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.5))');

        // Calculate path length for animation
        svg.appendChild(path);

        // Arrowhead at the end
        const arrowSize = 8;
        const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrowhead.setAttribute('points', `${lineX},${relEndY - arrowSize} ${lineX + arrowSize},${relEndY} ${lineX},${relEndY + arrowSize}`);
        arrowhead.setAttribute('fill', '#34d399');
        arrowhead.setAttribute('opacity', '0');
        svg.appendChild(arrowhead);

        // Add SVG to CodeMirror sizer
        const sizer = wrapper.querySelector('.CodeMirror-sizer');
        if (sizer) {
            sizer.style.position = 'relative';
            sizer.appendChild(svg);
        }

        // Animate the path drawing
        const pathLength = path.getTotalLength();
        path.style.strokeDasharray = pathLength;
        path.style.strokeDashoffset = pathLength;

        const tl = gsap.timeline({
            onComplete: () => {
                // Clean up sweep highlights
                for (let i = fromLine; i >= toLine; i--) {
                    editor.removeLineClass(i, 'wrap', 'line-sweep-highlight');
                }

                // Fade out and remove SVG
                gsap.to(svg, {
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => {
                        if (svg.parentNode) svg.parentNode.removeChild(svg);
                        resolve();
                    }
                });
            }
        });

        // Draw the path over 0.6s
        tl.to(path, {
            strokeDashoffset: 0,
            duration: 0.6,
            ease: 'power1.inOut'
        });

        // Simultaneously sweep lines upward
        const linesToSweep = fromLine - toLine;
        const sweepInterval = linesToSweep > 0 ? 0.6 / linesToSweep : 0.1;

        for (let i = fromLine; i >= toLine; i--) {
            const delay = (fromLine - i) * sweepInterval;
            tl.call(() => {
                editor.addLineClass(i, 'wrap', 'line-sweep-highlight');
                // Remove after brief flash
                setTimeout(() => {
                    editor.removeLineClass(i, 'wrap', 'line-sweep-highlight');
                }, 200);
            }, null, delay);
        }

        // Show arrowhead at end
        tl.to(arrowhead, { opacity: 1, duration: 0.2 }, 0.5);

        // Hold briefly
        tl.to({}, { duration: 0.2 });
    });
}


// ============ BREAK ARROW ============

/**
 * Animates a red arrow arcing LEFT then shooting DOWN-OUT of the glass pane.
 * Called when a `break` statement is hit.
 * @param {CodeMirror} editor
 * @param {number} fromLine - The line containing `break`
 * @param {number} loopBodyEndLine - Last line of the loop body
 * @returns {Promise}
 */
export function animateBreakArrow(editor, fromLine, loopBodyEndLine) {
    return new Promise(resolve => {
        const wrapper = editor.getWrapperElement();
        const gutterEl = wrapper.querySelector('.CodeMirror-gutters');
        if (!gutterEl) { resolve(); return; }

        const gutterWidth = gutterEl.getBoundingClientRect().width;
        const fromCoords = editor.charCoords({ line: fromLine, ch: 0 }, 'local');
        const endCoords  = editor.charCoords({ line: loopBodyEndLine, ch: 0 }, 'local');
        const lineHeight = editor.defaultTextHeight();

        const startY = fromCoords.top + lineHeight / 2;
        const exitY  = endCoords.top + lineHeight + 24; // below glass pane
        const lineX  = gutterWidth - 10;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'loop-back-arrow loop-break-arrow');
        svg.style.cssText = `position:absolute;left:0;overflow:visible;pointer-events:none;z-index:15;`;
        svg.style.top    = `${startY - 10}px`;
        svg.style.width  = `${gutterWidth + 50}px`;
        svg.style.height = `${exitY - startY + 50}px`;

        const relStartY = 10;
        const relEndY   = exitY - startY + 20;

        // Arc left then curve down-and-right to exit below glass pane
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${lineX} ${relStartY} C -20 ${relStartY}, -20 ${relEndY}, ${lineX + 30} ${relEndY}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#ef4444');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('filter', 'drop-shadow(0 0 8px rgba(239,68,68,0.9))');

        // Arrowhead pointing right
        const ah = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const ax = lineX + 30, ay = relEndY, as_ = 8;
        ah.setAttribute('points', `${ax + as_},${ay} ${ax},${ay - as_} ${ax},${ay + as_}`);
        ah.setAttribute('fill', '#ef4444');
        ah.setAttribute('opacity', '0');
        ah.setAttribute('filter', 'drop-shadow(0 0 6px rgba(239,68,68,0.9))');

        svg.appendChild(path);
        svg.appendChild(ah);

        const sizer = wrapper.querySelector('.CodeMirror-sizer');
        if (sizer) { sizer.style.position = 'relative'; sizer.appendChild(svg); }

        const len = path.getTotalLength();
        path.style.strokeDasharray  = len;
        path.style.strokeDashoffset = len;

        const tl = gsap.timeline({
            onComplete: () => {
                gsap.to(svg, {
                    opacity: 0, duration: 0.35,
                    onComplete: () => { if (svg.parentNode) svg.parentNode.removeChild(svg); resolve(); }
                });
            }
        });
        tl.to(path, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' });
        tl.to(ah,   { opacity: 1, duration: 0.2 }, 0.6);
        tl.to({},   { duration: 0.35 });
    });
}


// ============ ENGINE DISINTEGRATE ============

/**
 * Destroys the engine box with a dramatic shudder → red-flash → shatter sequence.
 * Used in place of removeEngineBox when a `break` occurs.
 * @param {object} widgetRef - { widget, element } from injectEngineBox
 * @returns {Promise}
 */
export function disintegrateEngineBox(widgetRef) {
    return new Promise(resolve => {
        if (!widgetRef || !widgetRef.widget) { resolve(); return; }

        const el = widgetRef.element;

        const tl = gsap.timeline({
            onComplete: () => {
                try { widgetRef.widget.clear(); } catch (e) { /* ignore */ }
                resolve();
            }
        });

        // 1. Rapid shudder
        tl.to(el, { x: -5, duration: 0.05, ease: 'none' })
          .to(el, { x:  5, duration: 0.05, ease: 'none' })
          .to(el, { x: -5, duration: 0.05, ease: 'none' })
          .to(el, { x:  5, duration: 0.05, ease: 'none' })
          .to(el, { x:  0, duration: 0.05, ease: 'none' });

        // 2. Red border flash
        tl.call(() => {
            el.style.borderColor = '#ef4444';
            el.style.boxShadow   = '0 0 24px rgba(239,68,68,0.85), inset 0 0 12px rgba(239,68,68,0.3)';
        });
        tl.to({}, { duration: 0.22 });

        // 3. Shatter — expand then collapse with blur
        tl.to(el, { scale: 1.12, duration: 0.1, ease: 'power1.out' })
          .to(el, { scale: 0, opacity: 0, filter: 'blur(10px)', duration: 0.45, ease: 'power3.in' });
    });
}


// ============ CONTINUE ARROW ============

/**
 * Animates an amber arc arrow from `fromLine` back up to `toLine` (the loop header).
 * Visually identical to animateLoopBack but uses amber (#f59e0b) colouring.
 * @param {CodeMirror} editor
 * @param {number} fromLine - Line containing `continue`
 * @param {number} toLine   - Loop header line
 * @returns {Promise}
 */
export function animateContinueArrow(editor, fromLine, toLine) {
    return new Promise(resolve => {
        const wrapper = editor.getWrapperElement();
        const gutterEl = wrapper.querySelector('.CodeMirror-gutters');
        if (!gutterEl) { resolve(); return; }

        const gutterWidth = gutterEl.getBoundingClientRect().width;
        const fromCoords  = editor.charCoords({ line: fromLine, ch: 0 }, 'local');
        const toCoords    = editor.charCoords({ line: toLine,   ch: 0 }, 'local');
        const lineHeight  = editor.defaultTextHeight();

        const startY = fromCoords.top + lineHeight / 2;
        const endY   = toCoords.top   + lineHeight / 2;
        const lineX  = gutterWidth - 10;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'loop-back-arrow loop-continue-arrow');
        svg.style.cssText = `position:absolute;left:0;overflow:visible;pointer-events:none;z-index:10;`;

        const svgTop = Math.min(startY, endY) - 20;
        svg.style.top    = `${svgTop}px`;
        svg.style.width  = `${gutterWidth + 10}px`;
        svg.style.height = `${Math.abs(startY - endY) + lineHeight + 40}px`;

        const relStartY = startY - svgTop;
        const relEndY   = endY   - svgTop;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${lineX} ${relStartY} C -15 ${relStartY}, -15 ${relEndY}, ${lineX} ${relEndY}`);
        path.setAttribute('stroke', '#f59e0b');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('filter', 'drop-shadow(0 0 6px rgba(245,158,11,0.8))');

        const arrowSize = 8;
        const ah = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        ah.setAttribute('points', `${lineX},${relEndY - arrowSize} ${lineX + arrowSize},${relEndY} ${lineX},${relEndY + arrowSize}`);
        ah.setAttribute('fill', '#f59e0b');
        ah.setAttribute('opacity', '0');
        ah.setAttribute('filter', 'drop-shadow(0 0 6px rgba(245,158,11,0.8))');

        svg.appendChild(path);
        svg.appendChild(ah);

        const sizer = wrapper.querySelector('.CodeMirror-sizer');
        if (sizer) { sizer.style.position = 'relative'; sizer.appendChild(svg); }

        const len = path.getTotalLength();
        path.style.strokeDasharray  = len;
        path.style.strokeDashoffset = len;

        const tl = gsap.timeline({
            onComplete: () => {
                for (let i = fromLine; i >= toLine; i--) {
                    editor.removeLineClass(i, 'wrap', 'line-continue-sweep');
                }
                gsap.to(svg, {
                    opacity: 0, duration: 0.3,
                    onComplete: () => { if (svg.parentNode) svg.parentNode.removeChild(svg); resolve(); }
                });
            }
        });

        tl.to(path, { strokeDashoffset: 0, duration: 0.6, ease: 'power1.inOut' });

        // Amber sweep upward
        const linesToSweep  = fromLine - toLine;
        const sweepInterval = linesToSweep > 0 ? 0.6 / linesToSweep : 0.1;
        for (let i = fromLine; i >= toLine; i--) {
            const delay = (fromLine - i) * sweepInterval;
            tl.call(() => {
                editor.addLineClass(i, 'wrap', 'line-continue-sweep');
                setTimeout(() => editor.removeLineClass(i, 'wrap', 'line-continue-sweep'), 200);
            }, null, delay);
        }

        tl.to(ah, { opacity: 1, duration: 0.2 }, 0.5);
        tl.to({},  { duration: 0.2 });
    });
}
