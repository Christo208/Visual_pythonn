/* ===================================
   List Facts Animations - ALL BUGS FIXED
   =================================== */

let scanSynth = null;

export function initializeScanSynth() {
    if (typeof Tone === 'undefined') {
        console.warn('Tone.js not loaded');
        return;
    }
    
    scanSynth = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0.1, release: 0.1 }
    }).toDestination();
    
    scanSynth.volume.value = -15;
    console.log('🔍 Scan synth initialized');
}

let chordSynth = null;   // ⭐ BUG #2: PolySynth for success / error chords

// ⭐ BUG #2: Initialize chord synth — called once from lvl7script.js
export function initializeChordSynth() {
    if (typeof Tone === 'undefined') return;
    chordSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    chordSynth.volume.value = -10;
    console.log('🎵 Chord synth initialized');
}

// ────────────────────────────────────────────────────────────────────
// FIX #2: Chord plays for exactly 1 second (replace line ~33)
// ────────────────────────────────────────────────────────────────────
function playSuccessChord() {
    if (!chordSynth) return;
    try {
        // Play for 1 second total
        chordSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '1s');
    } catch (e) {
        console.error('Success chord error:', e);
    }
}

// ⭐ BUG #1: Diminished / augmented chords for index-not-found error
function playFactsErrorChord(notes) {
    if (!chordSynth) return;
    try {
        chordSynth.triggerAttackRelease(notes, '8n');
    } catch (e) {
        console.error('Error chord error:', e);
    }
}

function playScanTick() {
    if (!scanSynth) return;
    try {
        scanSynth.triggerAttackRelease('C6', '32n');
    } catch (error) {
        console.error('Scan tick error:', error);
    }
}

/* ═══════════════════════════════════════════════════════════════════
   len() ANIMATION - ALL FIXES APPLIED
   ═══════════════════════════════════════════════════════════════════ */

export function animateLen(targetContainer, outputPanel, outputValue, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    const rows = targetContainer.querySelectorAll('.list-row');
    const itemCount = rows.length;
    
    const counterDiv = createLenCounterDiv();
    document.body.appendChild(counterDiv);
    
    if (!window.lenCounterDivs) window.lenCounterDivs = [];
    window.lenCounterDivs.push(counterDiv);
    
    timeline.call(() => {
        positionLenCounterDiv(counterDiv, targetContainer);
    }, null, 0);
    
    timeline.fromTo(counterDiv,
        { opacity: 0, scale: 0.8, x: -20 },
        { opacity: 1, scale: 1, x: 0, duration: 0.5, ease: 'back.out(1.7)' },
        0
    );
    
    if (itemCount === 0) {
        updateCounterValue(counterDiv, 0);
        speakReturning(timeline, 0, 0.8);
        moveToCodePosition(timeline, counterDiv, outputValue, 1.6);
        flyGreenSparkToOutput(timeline, counterDiv, outputPanel, outputValue, 2.4);
        return timeline;
    }
    
    // ✅ FIX: DO NOT append arrow to body
    const arrow = createArrow();
    window.lenCounterDivs.push(arrow);
    
    let currentTime = 0.6;
    
    rows.forEach((row, index) => {
        const counter = index + 1;
        
        timeline.call(() => {
            pointArrowToRow(arrow, counterDiv, row);
            arrow.style.opacity = '1';
        }, null, currentTime);
        
        timeline.fromTo(arrow,
            { strokeDashoffset: 200 },
            { strokeDashoffset: 0, duration: 0.18, ease: 'none' },
            currentTime
        );
        
        timeline.call(() => {
    playScanTick();              // 🔊 RESTORED
    updateCounterValue(counterDiv, counter);
}, null, currentTime + 0.05);

        
        currentTime += 0.18;
    });
    
    timeline.to(arrow, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => arrow.remove()
    }, currentTime);
    
    speakReturning(timeline, itemCount, currentTime + 0.3);
    moveToCodePosition(timeline, counterDiv, outputValue, currentTime + 1.2);
    flyGreenSparkToOutput(timeline, counterDiv, outputPanel, outputValue, currentTime + 2.0);
    
    return timeline;
}


function createLenCounterDiv() {
    const div = document.createElement('div');
    div.className = 'len-counter-div';
    div.innerHTML = `
        <div class="len-label">len()</div>
        <div class="len-value">[0]</div>
    `;
    
    div.style.position = 'fixed';
    div.style.width = '120px';
    div.style.height = '80px';
    div.style.background = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
    div.style.border = '3px solid #d97706';
    div.style.borderRadius = '12px';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.gap = '8px';
    div.style.zIndex = '10000';
    div.style.boxShadow = '0 4px 15px rgba(251, 191, 36, 0.5)';
    div.style.fontFamily = "'Courier New', monospace";
    div.style.opacity = '0';
    div.style.pointerEvents = 'none';
    
    const label = div.querySelector('.len-label');
    label.style.fontSize = '14px';
    label.style.fontWeight = 'bold';
    label.style.color = '#78350f';
    
    const value = div.querySelector('.len-value');
    value.style.fontSize = '18px';
    value.style.fontWeight = 'bold';
    value.style.color = '#ffffff';
    
    return div;
}

function positionLenCounterDiv(counterDiv, targetContainer) {
    const containerRect = targetContainer.getBoundingClientRect();
    const left = containerRect.left - 140;
    const top = containerRect.top + (containerRect.height / 2) - 40;
    
    counterDiv.style.left = `${left}px`;
    counterDiv.style.top = `${top}px`;
}

function updateCounterValue(counterDiv, value) {
    // Ensure numeric content (no brackets) and perfect centering
    const valueElement = counterDiv.querySelector('.len-value');
    if (valueElement) {
        // If the value element contains inner span, use it; else create one
        let inner = valueElement.querySelector('.len-value-text');
        if (!inner) {
            inner = document.createElement('span');
            inner.className = 'len-value-text';
            // clear whatever was there and append
            valueElement.textContent = '';
            valueElement.appendChild(inner);
        }
        inner.textContent = String(value);

        // Force centered layout and prevent vertical clipping
        valueElement.style.display = 'flex';
        valueElement.style.alignItems = 'center';
        valueElement.style.justifyContent = 'center';
        valueElement.style.width = '100%';
        valueElement.style.height = '100%';
        inner.style.lineHeight = '1';
        inner.style.fontSize = '24px';
        inner.style.fontWeight = '700';
        inner.style.color = '#ffffff';

        // pop animation
        gsap.fromTo(inner,
            { scale: 1.18 },
            { scale: 1, duration: 0.16, ease: 'back.out(2)' }
        );
    }
}


function createArrow() {
    // Ensure a full-screen SVG overlay exists and is appended to document.body
    let svg = document.getElementById('trailSvg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', 'trailSvg');
        svg.setAttribute('width', window.innerWidth);
        svg.setAttribute('height', window.innerHeight);
        svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
        svg.style.position = 'fixed';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100vw';
        svg.style.height = '100vh';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '99999';
        svg.style.overflow = 'visible';
        document.body.appendChild(svg);

        // keep responsive size on resize
        window.addEventListener('resize', () => {
            svg.setAttribute('width', window.innerWidth);
            svg.setAttribute('height', window.innerHeight);
            svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
        });
    } else {
        // ensure it's at body top-level and visible
        if (svg.parentNode !== document.body) document.body.appendChild(svg);
        svg.style.zIndex = '99999';
        svg.style.pointerEvents = 'none';
        svg.style.overflow = 'visible';
    }

    // Ensure defs/marker exist inside that svg
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.appendChild(defs);
    }

    if (!document.getElementById('arrowhead-len')) {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead-len');
        marker.setAttribute('markerWidth', '12');
        marker.setAttribute('markerHeight', '12');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3, 0 6');
        polygon.setAttribute('fill', '#f59e0b');

        marker.appendChild(polygon);
        defs.appendChild(marker);
    }

    // Create the visible line element (always visible)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', '#f59e0b');
    line.setAttribute('stroke-width', '4');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-dasharray', '200');
    line.setAttribute('stroke-dashoffset', '200');
    line.setAttribute('marker-end', 'url(#arrowhead-len)');
    line.style.opacity = '1';
    line.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))';

    svg.appendChild(line);
    return line;
}



function pointArrowToRow(arrow, counterDiv, row) {
    if (!arrow) return;
    
    const counterRect = counterDiv.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    
    const x1 = counterRect.right;
    const y1 = counterRect.top + (counterRect.height / 2);
    const x2 = rowRect.left;
    const y2 = rowRect.top + (rowRect.height / 2);
    
    arrow.setAttribute('x1', x1);
    arrow.setAttribute('y1', y1);
    arrow.setAttribute('x2', x2);
    arrow.setAttribute('y2', y2);
}

function speakReturning(timeline, count, startTime) {
    timeline.call(() => {
        const message = count === 0 ? "Returning zero" : `Returning ${count}`;
        
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    }, null, startTime);
}

function moveToCodePosition(timeline, counterDiv, outputValue, startTime) {
    timeline.call(() => {
        const editorElement = document.querySelector('.CodeMirror');
        if (!editorElement) return;

        const lines = editorElement.querySelectorAll('.CodeMirror-line');
        let lenLine = null;

        for (let line of lines) {
            if (line.textContent.includes('len(')) {
                lenLine = line;
                break;
            }
        }
        if (!lenLine) return;

        const lineRect = lenLine.getBoundingClientRect();
        const lenMatch = lenLine.textContent.match(/len\s*\(\s*\w+\s*\)/);
        if (!lenMatch) return;

        const lenText = lenMatch[0];
        const lenStartIndex = lenLine.textContent.indexOf(lenText);

        const charWidth = 9.6;
        const textWidth = lenText.length * charWidth;

        const targetX = lineRect.left + (lenStartIndex * charWidth);
        const targetY = lineRect.top;

        const label = counterDiv.querySelector('.len-label');
        const value = counterDiv.querySelector('.len-value');

        // Hide label
        if (label) label.style.display = 'none';

        // 🔥 CRITICAL FIX 🔥
        // Switch from column layout to single-line inline layout
        counterDiv.style.flexDirection = 'row';
        counterDiv.style.alignItems = 'center';
        counterDiv.style.justifyContent = 'center';

        value.textContent = outputValue;
        value.style.display = 'flex';
        value.style.alignItems = 'center';
        value.style.justifyContent = 'center';
        value.style.lineHeight = '1';

        gsap.to(counterDiv, {
    width: `${textWidth + 12}px`,
    height: '20px',
    left: targetX,
    top: targetY,
    duration: 0.6,
    ease: 'power2.out'
});

    }, null, startTime);
}


function flyGreenSparkToOutput(timeline, counterDiv, outputPanel, outputValue, startTime) {
    timeline.call(() => {
        const counterRect = counterDiv.getBoundingClientRect();
        const startX = counterRect.left + counterRect.width / 2;
        const startY = counterRect.top + counterRect.height / 2;

        const outputRect = outputPanel.getBoundingClientRect();
        const outputLines = outputPanel.querySelectorAll('.output-line');
        const targetLine = outputLines[outputLines.length - 1];

        // Default landing coordinates inside output panel
        let targetX = outputRect.left + 50;
        let targetY = outputRect.top + 20;

        if (targetLine) {
            const lineRect = targetLine.getBoundingClientRect();

            // ⭐ Ensure the printed line has breathing room on the left so numbers aren't clipped
            // Add modest left padding on the output line itself (persistent)
            const existingPad = parseFloat(window.getComputedStyle(targetLine).paddingLeft || '0');
            const desiredPad = Math.max(existingPad, 30); // at least 30px
            targetLine.style.paddingLeft = `${desiredPad}px`;

            // Place the spark to land near the visible text (slightly to the right of left edge)
            targetX = lineRect.left + desiredPad + 6; // small offset to sit after padding
            targetY = lineRect.top;
        }

        const spark = document.createElement('div');
        spark.className = 'animation-spark';
        spark.textContent = outputValue;
        spark.style.position = 'fixed';
        spark.style.left = `${startX}px`;
        spark.style.top = `${startY}px`;
        spark.style.background = '#4ade80';
        spark.style.color = 'white';
        spark.style.padding = '8px 16px';
        spark.style.borderRadius = '8px';
        spark.style.fontFamily = "'Courier New', monospace";
        spark.style.fontWeight = 'bold';
        spark.style.fontSize = '1.1rem';
        spark.style.zIndex = '10001';
        spark.style.boxShadow = '0 0 20px rgba(74, 222, 128, 0.9)';
        spark.style.pointerEvents = 'none';

        document.body.appendChild(spark);

        // Build trail particles
        const trailParticles = createDirectionalTrail(startX, startY, targetX, targetY);

        try {
            const whoosh = new Audio(new URL('../../sounds/whoosh.wav', import.meta.url).href);
            whoosh.volume = 0.5;
            whoosh.play().catch(e => console.warn('Whoosh failed:', e));
        } catch (e) {}

        gsap.to(spark, {
            left: targetX - 40,
            top: targetY,
            duration: 1.2,
            ease: 'power2.out',
            onUpdate: function() {
                const sparkRect = spark.getBoundingClientRect();
                updateTrailParticles(trailParticles,
                    sparkRect.left + sparkRect.width / 2,
                    sparkRect.top + sparkRect.height / 2,
                    startX, startY
                );
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trailParticles);
                // keep counterDiv visible until cleanup by back action
            }
        });

    }, null, startTime);
}


function createDirectionalTrail(startX, startY, endX, endY) {
    const svg = document.getElementById('trailSvg');
    const particles = [];
    const color = '#4ade80';
    
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

export function cleanupLenCounters() {
    if (window.lenCounterDivs) {
        window.lenCounterDivs.forEach(element => {
            if (element && element.remove) {
                element.remove();
            }
        });
        window.lenCounterDivs = [];
    }
}

/* ═══════════════════════════════════════════════════════════════════
   REGULAR print() ANIMATION (Level 3 style)
   ═══════════════════════════════════════════════════════════════════ */

export function animatePrintString(codeText, outputPanel, outputValue, onComplete) {
    // Extract the string from print("Hi") or print('Hi')
    const stringMatch = codeText.match(/print\s*\(\s*["'](.+?)["']\s*\)/);
    if (!stringMatch) {
        if (onComplete) onComplete();
        return;
    }
    
    const printedString = stringMatch[1];
    
    // Find print( in code editor
    const editorElement = document.querySelector('.CodeMirror');
    if (!editorElement) {
        if (onComplete) onComplete();
        return;
    }
    
    const lines = editorElement.querySelectorAll('.CodeMirror-line');
    let printLine = null;
    
    for (let line of lines) {
        if (line.textContent.includes('print(')) {
            printLine = line;
            break;
        }
    }
    
    if (!printLine) {
        if (onComplete) onComplete();
        return;
    }
    
    const lineRect = printLine.getBoundingClientRect();
    const printMatch = printLine.textContent.match(/print\s*\(/);
    if (!printMatch) {
        if (onComplete) onComplete();
        return;
    }
    
    const printStartIndex = printLine.textContent.indexOf(printMatch[0]);
    const charWidth = 9.6;
    
    const startX = lineRect.left + (printStartIndex * charWidth) + 50;
    const startY = lineRect.top + 10;
    
    const outputRect = outputPanel.getBoundingClientRect();
    const outputLines = outputPanel.querySelectorAll('.output-line');
    const targetLine = outputLines[outputLines.length - 1];
    
    let targetX = outputRect.left + 50;
    let targetY = outputRect.top + 20;
    
    if (targetLine) {
        const targetRect = targetLine.getBoundingClientRect();
        targetX = targetRect.left + 30;
        targetY = targetRect.top;
    }
    
    // Create green spark
    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = printedString;
    spark.style.position = 'fixed';
    spark.style.left = `${startX}px`;
    spark.style.top = `${startY}px`;
    spark.style.background = '#4ade80';
    spark.style.color = 'white';
    spark.style.padding = '8px 16px';
    spark.style.borderRadius = '8px';
    spark.style.fontFamily = "'Courier New', monospace";
    spark.style.fontWeight = 'bold';
    spark.style.fontSize = '1.1rem';
    spark.style.zIndex = '10001';
    spark.style.boxShadow = '0 0 20px rgba(74, 222, 128, 0.9)';
    spark.style.pointerEvents = 'none';
    
    document.body.appendChild(spark);
    
    const trailParticles = createDirectionalTrail(startX, startY, targetX, targetY);
    
    try {
        const whoosh = new Audio(new URL('../../sounds/whoosh.wav', import.meta.url).href);
        whoosh.volume = 0.5;
        whoosh.play().catch(e => console.warn('Whoosh failed:', e));
    } catch (e) {}
    
    gsap.to(spark, {
        left: targetX - 40,
        top: targetY,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: function() {
            const sparkRect = spark.getBoundingClientRect();
            updateTrailParticles(trailParticles, 
                sparkRect.left + sparkRect.width / 2,
                sparkRect.top + sparkRect.height / 2,
                startX, startY
            );
        },
        onComplete: () => {
            spark.remove();
            removeTrail(trailParticles);
            if (onComplete) onComplete();
        }
    });
}


/* ═══════════════════════════════════════════════════════════════════
   index() ANIMATION - Search for first occurrence
   ═══════════════════════════════════════════════════════════════════ */


// FIX #1 & #2: index() animation with proper error handling and 1-sec pause
// Replace entire animateIndex function (lines 635-801)
// ────────────────────────────────────────────────────────────────────
export function animateIndex(targetContainer, searchValue, startIdx, stopIdx, outputPanel, outputValue, isError, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    const rows = targetContainer.querySelectorAll('.list-row');
    const itemCount = rows.length;
    
    // Calculate search range
    const searchStart = startIdx !== null ? Math.max(0, startIdx < 0 ? itemCount + startIdx : startIdx) : 0;
    const searchStop = stopIdx !== null ? Math.min(itemCount, stopIdx < 0 ? itemCount + stopIdx : stopIdx) : itemCount;
    
    // FIX #1: DEBUG - Log the search range
    console.log('🔍 index() search:', { searchStart, searchStop, itemCount, rowCount: rows.length });
    
    // Create search indicator div
    const searchDiv = createSearchIndicator(searchValue, searchStart, searchStop, itemCount);
    document.body.appendChild(searchDiv);
    
    if (!window.indexSearchDivs) window.indexSearchDivs = [];
    window.indexSearchDivs.push(searchDiv);
    
    // Position search div
    timeline.call(() => {
        positionSearchDiv(searchDiv, targetContainer);
    }, null, 0);
    
    // Animate search div appearance
    timeline.fromTo(searchDiv,
        { opacity: 0, scale: 0.8, x: -20 },
        { opacity: 1, scale: 1, x: 0, duration: 0.5, ease: 'back.out(1.7)' },
        0
    );
    
    // Create arrow
    const arrow = createArrow();
    window.indexSearchDivs.push(arrow);
    
    let currentTime = 0.6;
    let foundIndex = -1;
    
    // FIX #2: Scan rows with faster non-match speed, 1-sec pause on match
    for (let i = searchStart; i < searchStop; i++) {
        const row = rows[i];
        if (!row) {
            console.warn(`⚠️ Row ${i} not found in DOM`);
            continue;
        }
        
        const contentCell = row.querySelector('.list-content-cell');
        const cellText = contentCell.textContent.trim().replace(/["']/g, '');
        // ADD THIS LINE:
        console.log('🔍 Row', i, ':', { cellText, searchValue, type: typeof cellText, searchType: typeof searchValue });
        /* Inside animateIndex loop (around line 500) */

// 1. Convert both to strings and trim to ensure a clean comparison
const isMatch = String(cellText).trim() === String(searchValue).trim();

// 2. Update the log to help you debug type differences
console.log(`🔍 Comparing: UI("${cellText}") vs Search("${searchValue}") - Match: ${isMatch}`);
        
        // Point arrow to row
        timeline.call(() => {
            pointArrowToRow(arrow, searchDiv, row);
            arrow.style.opacity = '1';
        }, null, currentTime);
        
        // Animate arrow draw
        timeline.fromTo(arrow,
            { strokeDashoffset: 200 },
            { strokeDashoffset: 0, duration: 0.2, ease: 'none' },
            currentTime
        );
        
        if (isMatch) {
            // GREEN GLOW - Match found!
            foundIndex = i;
            timeline.call(() => {
                playScanTick();
                playSuccessChord();  // FIX #2: Chord for 1 second
                row.style.background = '#86efac';
            }, null, currentTime + 0.1);
            
            // FIX #2: PAUSE for exactly 1 second (chord duration)
            currentTime += 1.0;
            
            // Fade green AFTER the pause
            timeline.call(() => {
                row.style.background = '';
            }, null, currentTime);
            
            break; // Stop searching
        } else {
            // FIX #2: Faster yellow flash for non-matches
            timeline.call(() => {
                playScanTick();
                row.style.background = '#fff9c4';
                setTimeout(() => row.style.background = '', 150);
            }, null, currentTime + 0.1);
            
            // FIX #2: Move faster through non-matches (0.18s instead of 0.25s)
            currentTime += 0.18;
        }
    }
    
    // Fade out arrow
    timeline.to(arrow, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => arrow.remove()
    }, currentTime);
    
    // FIX #1: Build rows array BEFORE error check to ensure it's populated
    const rowsToAnimate = [];
    for (let i = searchStart; i < searchStop; i++) {
        if (rows[i]) rowsToAnimate.push(rows[i]);
    }
    
    // FIX #1: Add debug logging
    console.log('🔴 Error animation:', { 
        isError, 
        foundIndex, 
        rowsToAnimate: rowsToAnimate.length,
        searchRange: [searchStart, searchStop]
    });
    
    if (isError || foundIndex === -1) {
        // FIX #1: NOT FOUND - M6C-style error sequence
        const blinkStart = currentTime + 0.5;
        
        speakIndexNotFound(timeline, currentTime + 0.3);
        
        // FIX #1: Ensure we have rows to animate
        if (rowsToAnimate.length === 0) {
            console.error('❌ No rows to animate for error!');
            // Skip blinks, go straight to error output
            moveSearchToCodePosition(timeline, searchDiv, outputValue, blinkStart, "ValueError");
            flyRedSparkToOutput(timeline, searchDiv, outputPanel, outputValue, blinkStart + 0.8);
        } else {
            // FIRST RED BLINK + chord
            timeline.call(() => {
                playFactsErrorChord(['C5', 'Eb5', 'Gb5', 'A5']);
            }, null, blinkStart);
            
            timeline.to(rowsToAnimate, {
                backgroundColor: '#ff0000',
                duration: 0.1,
                stagger: 0,
                ease: 'power2.out'
            }, blinkStart);
            
            timeline.to(rowsToAnimate, {
                backgroundColor: '',
                duration: 0.1,
                stagger: 0,
                ease: 'power2.in'
            }, blinkStart + 0.1);
            
            // SECOND RED BLINK + chord
            timeline.call(() => {
                playFactsErrorChord(['C5', 'E5', 'G#5']);
            }, null, blinkStart + 0.3);
            
            timeline.to(rowsToAnimate, {
                backgroundColor: '#ff0000',
                duration: 0.1,
                stagger: 0,
                ease: 'power2.out'
            }, blinkStart + 0.3);
            
            timeline.to(rowsToAnimate, {
                backgroundColor: '',
                duration: 0.1,
                stagger: 0,
                ease: 'power2.in'
            }, blinkStart + 0.4);
            
            // SHAKE
            timeline.call(() => {
                targetContainer.classList.add('shaking');
                setTimeout(() => targetContainer.classList.remove('shaking'), 400);
            }, null, blinkStart + 0.6);
            
            // Error output
            moveSearchToCodePosition(timeline, searchDiv, outputValue, blinkStart + 1.2, "ValueError");
            flyRedSparkToOutput(timeline, searchDiv, outputPanel, outputValue, blinkStart + 2.0);
        }
    } else {
        // FOUND - Success animation
        speakIndexFound(timeline, foundIndex, currentTime + 0.3);
        moveSearchToCodePosition(timeline, searchDiv, outputValue, currentTime + 1.3, String(foundIndex));
        flyGreenSparkToOutput(timeline, searchDiv, outputPanel, String(foundIndex), currentTime + 2.1);
    }
    
    return timeline;
}


function createSearchIndicator(searchValue, startIdx, stopIdx, itemCount) {
    const div = document.createElement('div');
    div.className = 'index-search-div';
    
    // Show search range if specified
    let rangeText = '';
    if (startIdx > 0 || stopIdx < itemCount) {
        rangeText = ` [${startIdx}:${stopIdx}]`;
    }
    
    div.innerHTML = `
        <div class="index-label">index("${searchValue}")${rangeText}</div>
        <div class="index-status">Searching...</div>
    `;
    
    div.style.position = 'fixed';
    div.style.width = '180px';
    div.style.minHeight = '85px';
    div.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)';
    div.style.border = '3px solid #7c3aed';
    div.style.borderRadius = '12px';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.gap = '6px';
    div.style.zIndex = '10000';
    div.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.5)';
    div.style.fontFamily = "'Courier New', monospace";
    div.style.opacity = '0';
    div.style.pointerEvents = 'none';
    div.style.padding = '10px';
    
    const label = div.querySelector('.index-label');
    label.style.fontSize = '13px';
    label.style.fontWeight = 'bold';
    label.style.color = '#e9d5ff';
    label.style.textAlign = 'center';
    label.style.wordBreak = 'break-word';
    
    const status = div.querySelector('.index-status');
    status.style.fontSize = '12px';
    status.style.color = '#ffffff';
    status.style.fontStyle = 'italic';
    
    return div;
}

function positionSearchDiv(searchDiv, targetContainer) {
    const containerRect = targetContainer.getBoundingClientRect();
    const left = containerRect.left - 200;
    const top = containerRect.top + (containerRect.height / 2) - 42;
    
    searchDiv.style.left = `${left}px`;
    searchDiv.style.top = `${top}px`;
}

function speakIndexFound(timeline, foundIndex, startTime) {
    timeline.call(() => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
        const indexWord = foundIndex < words.length ? words[foundIndex] : String(foundIndex);
        const message = `Found at index ${indexWord}`;
        
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    }, null, startTime);
}

function speakIndexNotFound(timeline, startTime) {
    timeline.call(() => {
        const message = "Not found in list";
        
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    }, null, startTime);
}

function moveSearchToCodePosition(timeline, searchDiv, targetText, startTime, returnValue) {
    timeline.call(() => {
        const editorElement = document.querySelector('.CodeMirror');
        if (!editorElement) return;
        
        const lines = editorElement.querySelectorAll('.CodeMirror-line');
        let targetLine = null;
        
        for (let line of lines) {
            if (line.textContent.includes('.index(')) {
                targetLine = line;
                break;
            }
        }
        
        if (!targetLine) return;
        
        const lineRect = targetLine.getBoundingClientRect();
        const lineText = targetLine.textContent;

// ✅ USE THIS in listFactsAnimations.js (inside moveSearchToCodePosition)
const indexMatch = lineText.match(/\.index\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/);
if (!indexMatch) return;

const functionText = indexMatch[0];  // e.g., "fruits.index("banana")"
const startIndex = lineText.indexOf(functionText);
const charWidth = 9.6;
const textWidth = functionText.length * charWidth;

const targetX = lineRect.left + (startIndex * charWidth);
        const targetY = lineRect.top;
        
        // UPDATE CONTENT TO SHOW ONLY RETURN VALUE
        searchDiv.innerHTML = `<div class="index-value-only">${returnValue}</div>`;
        
        const valueDiv = searchDiv.querySelector('.index-value-only');
        if (valueDiv) {
            valueDiv.style.fontSize = '16px';
            valueDiv.style.fontWeight = 'bold';
            valueDiv.style.color = '#ffffff';
        }
        
        // Shrink and move to code position
        searchDiv.style.flexDirection = 'row';
        searchDiv.style.gap = '4px';
        searchDiv.style.alignItems = 'center';
        searchDiv.style.justifyContent = 'center';
        searchDiv.style.minHeight = 'auto';  // Remove min-height constraint
        
        gsap.to(searchDiv, {
    left: targetX+5,
    top: targetY,
    width: `${textWidth + 12}px`,   // ✅ FIX: Calculated width
    height: '20px',
    padding: '0 12px',               // ✅ FIX: No top padding
    borderRadius: '12px',
    
    // Layout
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    
    // Text
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#ffffff',
    
    // Overrides
    minHeight: 'auto',
    maxHeight: '24px',
    minWidth: 'auto',
    
    duration: 0.6,
    ease: 'power2.out'
});
        
    }, null, startTime);
}

function flyRedSparkToOutput(timeline, searchDiv, outputPanel, errorMessage, startTime) {
    timeline.call(() => {
        const divRect = searchDiv.getBoundingClientRect();
        const startX = divRect.left + divRect.width / 2;
        const startY = divRect.top + divRect.height / 2;
        
        const outputRect = outputPanel.getBoundingClientRect();
        const outputLines = outputPanel.querySelectorAll('.output-line');
        const targetLine = outputLines[outputLines.length - 1];
        
        let targetX = outputRect.left + 50;
        let targetY = outputRect.top + 20;
        
        if (targetLine) {
            const targetRect = targetLine.getBoundingClientRect();
            const existingPad = parseFloat(window.getComputedStyle(targetLine).paddingLeft || '0');
            const desiredPad = Math.max(existingPad, 30);
            targetLine.style.paddingLeft = `${desiredPad}px`;
            targetX = targetRect.left + desiredPad + 6;
            targetY = targetRect.top;
        }
        
        const spark = document.createElement('div');
        spark.className = 'animation-spark error-spark';
        spark.textContent = 'ValueError';
        spark.style.position = 'fixed';
        spark.style.left = `${startX}px`;
        spark.style.top = `${startY}px`;
        spark.style.background = '#ff5252';
        spark.style.color = 'white';
        spark.style.padding = '8px 16px';
        spark.style.borderRadius = '8px';
        spark.style.fontFamily = "'Courier New', monospace";
        spark.style.fontWeight = 'bold';
        spark.style.fontSize = '1.1rem';
        spark.style.zIndex = '10001';
        spark.style.boxShadow = '0 0 20px rgba(255, 82, 82, 0.9)';
        spark.style.pointerEvents = 'none';
        
        document.body.appendChild(spark);
        
        const trailParticles = createDirectionalTrail(startX, startY, targetX, targetY, '#ff5252');
        
        gsap.to(spark, {
            left: targetX - 40,
            top: targetY,
            duration: 1.2,
            ease: 'power2.out',
            onUpdate: function() {
                const sparkRect = spark.getBoundingClientRect();
                updateTrailParticles(trailParticles,
                    sparkRect.left + sparkRect.width / 2,
                    sparkRect.top + sparkRect.height / 2,
                    startX, startY
                );
            },
            onComplete: () => {
                spark.remove();
                removeTrail(trailParticles);
            }
        });
        
    }, null, startTime);
}

export function cleanupIndexDivs() {
    if (window.indexSearchDivs) {
        window.indexSearchDivs.forEach(element => {
            if (element && element.remove) {
                element.remove();
            }
        });
        window.indexSearchDivs = [];
    }
}

/* ═══════════════════════════════════════════════════════════════════
   count() ANIMATION - Count all occurrences
   ═══════════════════════════════════════════════════════════════════ */

// FIX #2: count() animation with 1-sec pause on each match
// Replace entire animateCount function (lines 1054-1160)
// ────────────────────────────────────────────────────────────────────
export function animateCount(targetContainer, searchValue, outputPanel, outputValue, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    const rows = targetContainer.querySelectorAll('.list-row');
    const itemCount = rows.length;
    
    // Find all matching indices
    const matchIndices = [];
    rows.forEach((row, index) => {
        const contentCell = row.querySelector('.list-content-cell');
        const cellText = contentCell.textContent.trim().replace(/["']/g, '');
        if (cellText === searchValue) {
            matchIndices.push(index);
        }
    });
    
    const matchCount = matchIndices.length;
    
    // Create counter div
    const counterDiv = createCounterDiv(searchValue);
    document.body.appendChild(counterDiv);
    
    if (!window.countCounterDivs) window.countCounterDivs = [];
    window.countCounterDivs.push(counterDiv);
    
    // Position counter div
    timeline.call(() => {
        positionCounterDiv(counterDiv, targetContainer);
    }, null, 0);
    
    // Animate counter div appearance
    timeline.fromTo(counterDiv,
        { opacity: 0, scale: 0.8, x: -20 },
        { opacity: 1, scale: 1, x: 0, duration: 0.5, ease: 'back.out(1.7)' },
        0
    );
    
    // Create arrow
    const arrow = createArrow();
    window.countCounterDivs.push(arrow);
    
    let currentTime = 0.6;
    let currentCount = 0;
    
    // FIX #2: Scan ALL rows with proper timing
    rows.forEach((row, index) => {
        const isMatch = matchIndices.includes(index);
        
        // Point arrow to row
        timeline.call(() => {
            pointArrowToRow(arrow, counterDiv, row);
            arrow.style.opacity = '1';
        }, null, currentTime);
        
        // Animate arrow draw
        timeline.fromTo(arrow,
            { strokeDashoffset: 200 },
            { strokeDashoffset: 0, duration: 0.2, ease: 'none' },
            currentTime
        );
        
        if (isMatch) {
            // FIX #2: GREEN GLOW with 1-second pause
            currentCount++;
            timeline.call(() => {
                playScanTick();
                playSuccessChord();  // FIX #2: 1-second chord
                row.style.background = '#86efac';
                updateCountValue(counterDiv, currentCount);
            }, null, currentTime + 0.1);
            
            // FIX #2: PAUSE for 1 second on match
            currentTime += 1.0;
            
            // Fade green AFTER pause
            timeline.call(() => {
                row.style.background = '';
            }, null, currentTime);
            
        } else {
            // FIX #2: Faster yellow flash for non-matches
            timeline.call(() => {
                playScanTick();
                row.style.background = '#fff9c4';
                setTimeout(() => row.style.background = '', 150);
            }, null, currentTime + 0.1);
            
            // FIX #2: Move faster through non-matches
            currentTime += 0.18;
        }
    });
    
    // Fade out arrow
    timeline.to(arrow, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => arrow.remove()
    }, currentTime);
    
    // Speak result
    speakCountResult(timeline, matchCount, currentTime + 0.3);
    
    // Move to code position
    moveCountToCodePosition(timeline, counterDiv, outputValue, currentTime + 1.3, String(matchCount));
    
    // Fly green spark to output
    flyGreenSparkToOutput(timeline, counterDiv, outputPanel, String(matchCount), currentTime + 2.1);
    
    return timeline;
}

function createCounterDiv(searchValue) {
    const div = document.createElement('div');
    div.className = 'count-counter-div';
    
    div.innerHTML = `
        <div class="count-label">count("${searchValue}")</div>
        <div class="count-value">[0]</div>
    `;
    
    div.style.position = 'fixed';
    div.style.width = '160px';
    div.style.minHeight = '80px';
    div.style.background = 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)';
    div.style.border = '3px solid #be185d';
    div.style.borderRadius = '12px';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.gap = '8px';
    div.style.zIndex = '10000';
    div.style.boxShadow = '0 4px 15px rgba(236, 72, 153, 0.5)';
    div.style.fontFamily = "'Courier New', monospace";
    div.style.opacity = '0';
    div.style.pointerEvents = 'none';
    div.style.padding = '10px';
    
    const label = div.querySelector('.count-label');
    label.style.fontSize = '12px';
    label.style.fontWeight = 'bold';
    label.style.color = '#fce7f3';
    label.style.textAlign = 'center';
    label.style.wordBreak = 'break-word';
    
    const value = div.querySelector('.count-value');
    value.style.fontSize = '18px';
    value.style.fontWeight = 'bold';
    value.style.color = '#ffffff';
    
    return div;
}

function positionCounterDiv(counterDiv, targetContainer) {
    const containerRect = targetContainer.getBoundingClientRect();
    const left = containerRect.left - 180;
    const top = containerRect.top + (containerRect.height / 2) - 40;
    
    counterDiv.style.left = `${left}px`;
    counterDiv.style.top = `${top}px`;
}

function updateCountValue(counterDiv, value) {
    const valueElement = counterDiv.querySelector('.count-value');
    if (valueElement) {
        let inner = valueElement.querySelector('.count-value-text');
        if (!inner) {
            inner = document.createElement('span');
            inner.className = 'count-value-text';
            valueElement.textContent = '';
            valueElement.appendChild(inner);
        }
        inner.textContent = `[${value}]`;
        
        valueElement.style.display = 'flex';
        valueElement.style.alignItems = 'center';
        valueElement.style.justifyContent = 'center';
        valueElement.style.width = '100%';
        valueElement.style.height = '100%';
        inner.style.lineHeight = '1';
        inner.style.fontSize = '24px';
        inner.style.fontWeight = '700';
        inner.style.color = '#ffffff';
        
        gsap.fromTo(inner,
            { scale: 1.18 },
            { scale: 1, duration: 0.16, ease: 'back.out(2)' }
        );
    }
}

function speakCountResult(timeline, matchCount, startTime) {
    timeline.call(() => {
        let message;
        if (matchCount === 0) {
            message = "Found zero matches";
        } else if (matchCount === 1) {
            message = "Found one match";
        } else {
            const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
            const countWord = matchCount < words.length ? words[matchCount] : String(matchCount);
            message = `Found ${countWord} matches`;
        }
        
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    }, null, startTime);
}


function moveCountToCodePosition(timeline, searchDiv, targetText, startTime, returnValue) {
    timeline.call(() => {
        const editorElement = document.querySelector('.CodeMirror');
        if (!editorElement) return;
        
        const lines = editorElement.querySelectorAll('.CodeMirror-line');
        let targetLine = null;
        
        for (let line of lines) {
            if (line.textContent.includes('.count(')) {
                targetLine = line;
                break;
            }
        }
        
        if (!targetLine) return;
        
        const lineRect = targetLine.getBoundingClientRect();
        const lineText = targetLine.textContent;
        
        // ✅ FIX: Find FULL function call text
        const indexMatch = lineText.match(/\w+\.count\s*\([^)]+\)/);
        if (!indexMatch) return;
        
        const functionText = indexMatch[0];
        const startIndex = lineText.indexOf(functionText);
        const charWidth = 9.6;
        const textWidth = functionText.length * charWidth;
        
        const targetX = lineRect.left + (startIndex * charWidth);
        const targetY = lineRect.top;
        
        // Update content to show only value
        searchDiv.innerHTML = returnValue;
        
        // ✅ FIX: Animate ALL properties together
        gsap.to(searchDiv, {
            left: targetX,
            top: targetY,                      // No offset - will use padding: 0
            width: `${textWidth + 12}px`,      // ✅ Match function width
            height: '20px',
            padding: '0 12px',                 // ✅ No top/bottom padding
            borderRadius: '12px',
            
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#ffffff',
            
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            
            minHeight: 'auto',
            maxHeight: '24px',
            minWidth: 'auto',
            
            duration: 0.6,
            ease: 'power2.out'
        });
        
    }, null, startTime);
}


export function cleanupCountDivs() {
    if (window.countCounterDivs) {
        window.countCounterDivs.forEach(element => {
            if (element && element.remove) {
                element.remove();
            }
        });
        window.countCounterDivs = [];
    }
}
