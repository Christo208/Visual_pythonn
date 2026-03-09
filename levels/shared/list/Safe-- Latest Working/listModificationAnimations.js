/* ===================================
   List Modification Animations
   Phase 3 - M9: Modifications (pop, insert, etc.)
   =================================== */

// ✅ CORRECTED IMPORTS - Based on folder structure: levels/shared/list/
import { announcePopResult } from '../speechFeedback.js';
import { logPopDebug, logCoordinates, logTimelineEvent, createDebugMarker, isDebugMode } from '../debugLogging.js';

// ═══════════════════════════════════════════════════════════════════
// TONE.JS SYNTHS (shared with listFactsAnimations.js)
// ═══════════════════════════════════════════════════════════════════

let scanSynth = null;
let chordSynth = null;

/**
 * Initialize scan synth for tick sounds during search
 * Called from lvl7script.js on page load
 */
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
    console.log('🔍 Scan synth initialized (modifications)');
}

/**
 * Initialize chord synth for success/error chords
 * Called from lvl7script.js on page load
 */
export function initializeChordSynth() {
    if (typeof Tone === 'undefined') return;
    chordSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    chordSynth.volume.value = -10;
    console.log('🎵 Chord synth initialized (modifications)');
}

/**
 * Play success chord (1 second duration)
 */
function playSuccessChord() {
    if (!chordSynth) return;
    try {
        chordSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '1s');
    } catch (e) {
        console.error('Success chord error:', e);
    }
}

/**
 * Play error chord (diminished chord)
 */
function playErrorChord() {
    if (!chordSynth) return;
    try {
        chordSynth.triggerAttackRelease(['C5', 'Eb5', 'Gb5', 'A5'], '8n');
    } catch (e) {
        console.error('Error chord error:', e);
    }
}

/**
 * Play scan tick sound
 */
function playScanTick() {
    if (!scanSynth) return;
    try {
        scanSynth.triggerAttackRelease('C6', '32n');
    } catch (error) {
        console.error('Scan tick error:', error);
    }
}

// ⭐ Track pop pill for cleanup
let activePopPill = null;

/**
 * Cleanup any lingering pop animation elements
 * Call this on reset, runCode, or back button
 */
export function cleanupPopElements() {
    if (activePopPill) {
        activePopPill.remove();
        activePopPill = null;
    }

    document.querySelectorAll('.pop-arrow-head').forEach(el => el.remove());
    document.querySelectorAll('.pop-return-pill').forEach(el => el.remove());
    document.querySelectorAll('svg').forEach(svg => {
        if (svg.style.zIndex === '9998') svg.remove();
    });
}

/**
 * ⭐ M9: animatePop(index)
 * 
 * Timeline:
 * t=0.0: Arrow appears at code coordinate + Start 3secscan.wav
 * t=0-2: Arrow travels smooth Bezier curve (DRAMATIC ACCELERATION)
 * t=2.0: Impact! Play pop.wav. Highlight row. Decolor others.
 * t=4.0: Play appears.wav. Extract content as Pill. Fly to startCoords.
 * Final: Remove row, reset others, renumber indices.
 */
export function animatePop(listContainer, targetIndex, outputDiv, resultValue, isError, startCoords, onComplete) {
    // ✅ FIX: Don't cleanup ALL pills here - each operation manages its own elements
    // This prevents multiple pop() operations from interfering with each other


    // ─── VALIDATE startCoords ───────────────────────────────────────────────────
    // startCoords should come from the code editor (left column)
    if (!startCoords || typeof startCoords.x !== 'number' || typeof startCoords.y !== 'number' ||
        (startCoords.x === 0 && startCoords.y === 0)) {
        console.warn('animatePop: startCoords invalid, using fallback');
        // Fallback: estimate position in code editor area (left side)
        startCoords = {
            x: 200, // Code editor is on the left
            y: 200
        };
    }

    // Debug logging
    if (isDebugMode()) {
        logPopDebug('Initialization', {
            targetIndex,
            resultValue,
            isError,
            startCoords
        });
        createDebugMarker(startCoords, 'START', 'green');
    }

    // 1. Setup Elements
    const rows = listContainer.querySelectorAll('.list-row');
    const targetRow = rows[targetIndex];
    const rowCount = rows.length;

    let otherRows = [];
    if (!isError && targetRow) {
        otherRows = Array.from(rows).filter(r => r !== targetRow);
    }

    let arrowSVG = null;
    let arrowHead = null;
    let returnPill = null;

    const timeline = gsap.timeline({
        onComplete: () => {
            if (arrowSVG) arrowSVG.remove();
            if (arrowHead) arrowHead.remove();

            const allRows = listContainer.querySelectorAll('.list-row');
            allRows.forEach(r => {
                r.style.opacity = '1';
                r.style.filter = 'none';
                r.style.backgroundColor = '';
                r.style.transform = '';
            });

            if (!isError && targetRow) {
                targetRow.remove();
                renumberIndicesAfterPop(listContainer);
            }

            if (onComplete) onComplete();
        }
    });

    // ─── Phase 1: Create Arrow (Bezier) ─────────────────────────────────────────

    arrowSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrowSVG.style.position = 'fixed';
    arrowSVG.style.top = '0';
    arrowSVG.style.left = '0';
    arrowSVG.style.width = '100vw';
    arrowSVG.style.height = '100vh';
    arrowSVG.style.pointerEvents = 'none';
    arrowSVG.style.zIndex = '9998';
    document.body.appendChild(arrowSVG);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#a78bfa");      // ✅ Purple stroke
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-dasharray", "5,5");
    path.style.opacity = '0';
    arrowSVG.appendChild(path);

    // ✅ #a78bfa Arrow Head with Dark Text (30px)
    arrowHead = document.createElement('div');
    arrowHead.className = 'pop-arrow-head';
    arrowHead.textContent = isError ? '!' : (targetIndex !== undefined ? targetIndex : '');
    Object.assign(arrowHead.style, {
        position: 'fixed',
        width: '30px',              // ✅ REVERTED to 30px
        height: '30px',             // ✅ REVERTED to 30px
        backgroundColor: '#a78bfa', // ✅ Light purple/indigo
        color: '#1e1b4b',           // ✅ Dark indigo (contrasting)
        clipPath: 'polygon(0% 0%, 100% 50%, 0% 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: '14px',           // ✅ Back to 14px
        zIndex: '9999',
        opacity: '0',
        left: `${startCoords.x}px`,
        top: `${startCoords.y}px`,
        border: '2px solid #1e1b4b', // ✅ Dark border
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
    });
    document.body.appendChild(arrowHead);

    // Logic for Destination Coordinates
    let endX, endY;

    if (isError) {
        const header = listContainer.querySelector('.list-header');
        if (header) {
            const rect = header.getBoundingClientRect();
            endX = rect.left + rect.width / 2;
            endY = rect.top + rect.height / 2;
        } else {
            const rect = listContainer.getBoundingClientRect();
            endX = rect.left + rect.width / 2;
            endY = rect.top + 30;
        }
    } else {
        if (targetRow) {
            const rect = targetRow.getBoundingClientRect();
            endX = rect.left;
            endY = rect.top + rect.height / 2;
        } else {
            const rect = listContainer.getBoundingClientRect();
            endX = rect.left;
            endY = rect.top;
        }
    }

    // ⭐ FIXED Bezier Control Point 
    // Create an arc that curves UPWARD between start and end
    // Start is on the LEFT (code editor), End is on the RIGHT (memory bank)
    const midX = (startCoords.x + endX) / 2;
    const midY = (startCoords.y + endY) / 2;

    // Control point ABOVE the midpoint for a nice upward arc
    const controlX = midX;
    const controlY = Math.min(startCoords.y, endY) - 80; // Arc upward

    // Draw Path
    const d = `M ${startCoords.x} ${startCoords.y} Q ${controlX} ${controlY} ${endX} ${endY}`;
    path.setAttribute("d", d);

    // ─── TIMELINE START ─────────────────────────────────────────────────────────

    timeline.to([arrowHead, path], { opacity: 1, duration: 0.2 }, 0);

    timeline.call(() => {
        try {
            const audio = new Audio('../sounds/3secscan.wav');
            audio.volume = 0.5;
            audio.play().catch(e => console.warn('3secscan.wav play failed', e));
        } catch (e) { console.warn('Audio error', e); }
    }, null, 0);

    // ⭐ DRAMATIC MOVEMENT
    const progressObj = { val: 0 };

    // Phase A: Slow movement (0s to 1s) - moves from 0 to 0.1
    timeline.to(progressObj, {
        val: 0.1,
        duration: 1.0,
        ease: "power1.out",
        onUpdate: updateArrowPosition
    }, 0);

    // Phase B: SUDDEN ACCELERATION (1s to 2s) - moves from 0.1 to 1.0
    timeline.to(progressObj, {
        val: 1,
        duration: 1.0,
        ease: "power4.in",
        onUpdate: updateArrowPosition
    }, 1.0);

    function updateArrowPosition() {
        const t = progressObj.val;
        const invT = 1 - t;
        const x = (invT * invT * startCoords.x) + (2 * invT * t * controlX) + (t * t * endX);
        const y = (invT * invT * startCoords.y) + (2 * invT * t * controlY) + (t * t * endY);

        arrowHead.style.left = `${x}px`;
        arrowHead.style.top = `${y}px`;

        // ⭐ FIXED: Calculate rotation based on tangent to curve
        // Tangent derivative of quadratic Bezier
        const tx = 2 * (1 - t) * (controlX - startCoords.x) + 2 * t * (endX - controlX);
        const ty = 2 * (1 - t) * (controlY - startCoords.y) + 2 * t * (endY - controlY);
        const angle = Math.atan2(ty, tx) * 180 / Math.PI;
        // Triangle already points RIGHT, so just apply the angle directly
        arrowHead.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    }

    // ─── Phase 2: Impact (t=2.0) ────────────────────────────────────────────────
    const impactTime = 2.0;

    timeline.call(() => {
        try {
            const popAudio = new Audio('../sounds/pop.wav');
            popAudio.volume = 0.6;
            popAudio.play().catch(e => console.warn('pop.wav play failed', e));
        } catch (e) { console.warn('Audio error', e); }
    }, null, impactTime);

    if (isError) {
        timeline.to(listContainer, {
            x: "+=10", yoyo: true, repeat: 5, duration: 0.1
        }, impactTime);

        timeline.to(listContainer, { borderColor: 'red', duration: 0.2, yoyo: true, repeat: 1 }, impactTime);

    } else if (targetRow) {
        timeline.to(targetRow, {
            backgroundColor: '#ff9999',
            scale: 1.02,
            duration: 0.2
        }, impactTime);

        if (otherRows.length > 0) {
            timeline.to(otherRows, {
                opacity: 0.3,
                filter: 'grayscale(100%)',
                duration: 0.5
            }, impactTime);
        }
    }

    // ─── Phase 3: Extraction (t=4.0) ────────────────────────────────────────────
    const extractTime = 4.0;

    timeline.call(() => {
        try {
            const appearAudio = new Audio('../sounds/appears.wav');
            appearAudio.volume = 0.6;
            appearAudio.play().catch(e => console.warn('appears.wav play failed', e));
        } catch (e) { console.warn('Audio error', e); }
    }, null, extractTime);

    // ✅ Voice AFTER appears.wav (t=4.3s)
    timeline.call(() => {
        if ('speechSynthesis' in window) {
            let message = '';

            if (isError) {
                message = 'Index Error';
            } else if (targetIndex === undefined || targetIndex === null || targetIndex === -1) {
                message = 'returning last element';  // ✅ "returning" not "returned"
            } else {
                message = `returned element at index ${targetIndex}`;
            }

            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            speechSynthesis.speak(utterance);
        }
    }, null, extractTime + 0.3);

    // Create Return Pill
    returnPill = document.createElement('div');
    returnPill.className = 'list-index-pill pop-return-pill';
    returnPill.textContent = isError ? "IndexError" : formatValueForDisplay(resultValue);
    Object.assign(returnPill.style, {
        position: 'fixed',
        backgroundColor: isError ? '#ef4444' : '#8b5cf6',
        color: 'white',
        padding: '3px 10px',        // ✅ SOLUTION 1: Reduced from 6px 12px
        borderRadius: '8px',        // ✅ SOLUTION 1: Reduced from 12px
        fontFamily: 'monospace',
        fontWeight: 'bold',
        zIndex: 10000,
        opacity: 0,
        left: `${endX}px`,
        top: `${endY}px`,
        // ✅ ADD: Transform for centering
        transform: 'translate(-50%, -50%)',
        transformOrigin: 'center center'
    });
    document.body.appendChild(returnPill);

    activePopPill = returnPill;

    if (isError) {
        timeline.to(returnPill, { opacity: 1, scale: 1.2, duration: 0.3 }, extractTime);

        timeline.to(returnPill, {
            left: startCoords.x,
            top: startCoords.y,
            scale: 1,
            duration: 1.0,
            ease: "power2.out"
        }, extractTime + 0.5);

    } else if (targetRow) {
        const cell = targetRow.querySelector('.list-content-cell');
        if (cell) {
            const cellRect = cell.getBoundingClientRect();
            returnPill.style.left = `${cellRect.left + cellRect.width / 2 - 20}px`;
            returnPill.style.top = `${cellRect.top + cellRect.height / 2 - 15}px`;

            timeline.to(cell, { opacity: 0, duration: 0.1 }, extractTime);
        }

        timeline.to(returnPill, { opacity: 1, scale: 1.2, duration: 0.3 }, extractTime);

        timeline.to(returnPill, {
            left: startCoords.x,
            top: startCoords.y,
            scale: 1,
            duration: 1.0,
            ease: "power2.out",
            // ✅ ADD: Center the pill on coordinates
            xPercent: -50,
            yPercent: -50
        }, extractTime + 0.5);

        // ─── FINAL CLEANUP ──────────────────────────────────────────
        const finalTime = 5.5;

        timeline.to(targetRow, {
            height: 0,
            opacity: 0,
            padding: 0,
            margin: 0,
            borderWidth: 0,
            duration: 0.5
        }, finalTime);

        if (otherRows.length > 0) {
            timeline.to(otherRows, {
                opacity: 1,
                filter: 'none',
                duration: 0.5
            }, finalTime);
        }

        timeline.to([arrowSVG, arrowHead], { opacity: 0, duration: 0.3 }, finalTime);
    }

    return timeline;
}

/**
 * Renumber all indices in the list after a pop operation
 */
function renumberIndicesAfterPop(listContainer) {
    const rows = listContainer.querySelectorAll('.list-row');
    const totalRows = rows.length;

    // Check if we're in negative index mode by looking at the first index cell
    const firstIndexCell = rows[0]?.querySelector('.list-index-cell');
    const isNegativeMode = firstIndexCell && parseInt(firstIndexCell.textContent) < 0;

    rows.forEach((row, newIndex) => {
        const indexCell = row.querySelector('.list-index-cell');
        if (indexCell) {
            if (isNegativeMode) {
                // ✅ CORRECT FORMULA: First=-N, Last=-1
                // For 3 items: 0→-3, 1→-2, 2→-1
                indexCell.textContent = -(totalRows - newIndex);
            } else {
                indexCell.textContent = newIndex;
            }
        }
        row.dataset.originalIndex = newIndex;
    });

    const countSection = listContainer.querySelector('.list-count-section');
    if (countSection) {
        countSection.textContent = `N is ${totalRows}`;
    }
}

// Helper to format values
function formatValueForDisplay(value) {
    const strValue = String(value);
    if (!isNaN(strValue) || strValue === 'True' || strValue === 'False' || strValue === 'None') {
        return strValue;
    }
    return `"${strValue}"`;
}

/* ═══════════════════════════════════════════════════════════════════
   M10: animateRemove_v1(value)
   
   Timeline:
   t=0.0: Search box appears with "remove(value)"
   t=0.5+: Linear search through rows (reused from index() logic)
   FOUND: Green highlight -> Row removal animation -> Renumber
   NOT FOUND: Red blink -> Shake -> ValueError to output
   ═══════════════════════════════════════════════════════════════════ */

// Track remove elements for cleanup
let activeRemoveDiv = null;
let activeRemoveArrow = null;

/**
 * Cleanup any lingering remove animation elements
 */
export function cleanupRemoveElements_v1() {
    if (activeRemoveDiv) {
        activeRemoveDiv.remove();
        activeRemoveDiv = null;
    }
    if (activeRemoveArrow) {
        activeRemoveArrow.remove();
        activeRemoveArrow = null;
    }
    document.querySelectorAll('.remove-search-div').forEach(el => el.remove());
    document.querySelectorAll('.remove-arrow').forEach(el => el.remove());
}

/**
 * M10: animateRemove_v1(value)
 * @param {HTMLElement} listContainer - The list container element
 * @param {string} searchValue - The value to search for and remove
 * @param {number} foundIndex - The index where the value was found (-1 if not found)
 * @param {HTMLElement} outputPanel - The output panel for error messages
 * @param {boolean} isError - Whether the value was not found (ValueError)
 * @param {Function} onComplete - Callback when animation completes
 */
export function animateRemove_v1(listContainer, searchValue, foundIndex, outputPanel, isError, onComplete) {

    const timeline = gsap.timeline({
        onComplete: () => {
            // Cleanup arrow
            if (activeRemoveArrow) {
                activeRemoveArrow.remove();
                activeRemoveArrow = null;
            }

            // Reset all row styles
            const allRows = listContainer.querySelectorAll('.list-row');
            allRows.forEach(r => {
                r.style.opacity = '1';
                r.style.filter = 'none';
                r.style.backgroundColor = '';
                r.style.transform = '';
            });

            if (onComplete) onComplete();
        }
    });

    const rows = listContainer.querySelectorAll('.list-row');
    const itemCount = rows.length;

    // ─── CREATE SEARCH INDICATOR (Indigo Theme) ──────────────────────────────
    const searchDiv = createRemoveIndicator_v1(searchValue);
    document.body.appendChild(searchDiv);
    activeRemoveDiv = searchDiv;

    // Position search div to the left of the list
    timeline.call(() => {
        const containerRect = listContainer.getBoundingClientRect();
        searchDiv.style.left = `${containerRect.left - 200}px`;
        searchDiv.style.top = `${containerRect.top + (containerRect.height / 2) - 42}px`;
    }, null, 0);

    // Animate search div appearance
    timeline.fromTo(searchDiv,
        { opacity: 0, scale: 0.8, x: -20 },
        { opacity: 1, scale: 1, x: 0, duration: 0.5, ease: 'back.out(1.7)' },
        0
    );

    // ─── CREATE ARROW (Indigo) ───────────────────────────────────────────────
    const arrow = createRemoveArrow_v1();
    activeRemoveArrow = arrow;

    let currentTime = 0.6;
    const searchStop = isError ? itemCount : foundIndex + 1; // Search until found or all items

    // ─── LINEAR SEARCH LOOP ──────────────────────────────────────────────────
    for (let i = 0; i < searchStop; i++) {
        const row = rows[i];
        if (!row) continue;

        const contentCell = row.querySelector('.list-content-cell');
        const cellText = contentCell.textContent.trim().replace(/["']/g, '');
        const isMatch = String(cellText).trim() === String(searchValue).trim();

        // Point arrow to row
        timeline.call(() => {
            pointRemoveArrowToRow_v1(arrow, searchDiv, row);
            arrow.style.opacity = '1';
        }, null, currentTime);

        // Animate arrow draw
        timeline.fromTo(arrow.line,
            { strokeDashoffset: 200 },
            { strokeDashoffset: 0, duration: 0.2, ease: 'none' },
            currentTime
        );

        if (isMatch && !isError) {
            // ─── FOUND: Green highlight + Remove ─────────────────────────────
            timeline.call(() => {
                // Play success chord
                try {
                    playSuccessChord();  // Tone.js chord
                } catch (e) { }

                row.style.background = '#86efac';  // Green highlight
            }, null, currentTime + 0.1);

            // Pause for 1 second to show the found element
            currentTime += 1.0;

            // ─── REMOVE ROW ANIMATION ────────────────────────────────────────
            timeline.to(row, {
                height: 0,
                opacity: 0,
                padding: 0,
                margin: 0,
                borderWidth: 0,
                duration: 0.5,
                ease: 'power2.in',
                onComplete: () => {
                    row.remove();
                    renumberIndicesAfterPop(listContainer);
                }
            }, currentTime);

            currentTime += 0.5;

            // Fade out search div
            timeline.to(searchDiv, {
                opacity: 0,
                scale: 0.8,
                duration: 0.3,
                onComplete: () => {
                    searchDiv.remove();
                    activeRemoveDiv = null;
                }
            }, currentTime);

            break; // Stop searching
        } else {
            // ─── NOT MATCH: Yellow flash + Tick sound ───────────────────────
            timeline.call(() => {
                // Play tick sound using Tone.js
                try {
                    playScanTick();  // ✅ Use Tone.js instead of tick.wav
                } catch (e) { }

                row.style.background = '#fff9c4';  // Yellow flash
                setTimeout(() => row.style.background = '', 150);
            }, null, currentTime + 0.1);

            // Move faster through non-matches
            currentTime += 0.18;
        }
    }

    // Fade out arrow
    timeline.to(arrow, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => arrow.remove()
    }, currentTime);

    // ─── ERROR HANDLING: ValueError ──────────────────────────────────────────
    if (isError) {
        const blinkStart = currentTime + 0.3;

        // Change search div to show error
        timeline.call(() => {
            const statusEl = searchDiv.querySelector('.remove-status');
            if (statusEl) {
                statusEl.textContent = 'Not Found!';
                statusEl.style.color = '#ff5252';
            }
        }, null, blinkStart);

        // FIRST RED BLINK
        timeline.call(() => {
            try {
                playErrorChord();  // Tone.js error chord
            } catch (e) { }
        }, null, blinkStart);

        timeline.to(rows, {
            backgroundColor: '#ff0000',
            duration: 0.1,
            stagger: 0,
            ease: 'power2.out'
        }, blinkStart);

        timeline.to(rows, {
            backgroundColor: '',
            duration: 0.1,
            stagger: 0,
            ease: 'power2.in'
        }, blinkStart + 0.1);

        // SECOND RED BLINK
        timeline.to(rows, {
            backgroundColor: '#ff0000',
            duration: 0.1,
            stagger: 0,
            ease: 'power2.out'
        }, blinkStart + 0.3);

        timeline.to(rows, {
            backgroundColor: '',
            duration: 0.1,
            stagger: 0,
            ease: 'power2.in'
        }, blinkStart + 0.4);

        // SHAKE
        timeline.call(() => {
            listContainer.classList.add('error-shake');
            setTimeout(() => listContainer.classList.remove('error-shake'), 500);
        }, null, blinkStart + 0.6);

        // ─── FLY ValueError TO OUTPUT PANEL ──────────────────────────────────
        timeline.call(() => {
            flyValueErrorToOutput(searchDiv, outputPanel, searchValue);
        }, null, blinkStart + 1.0);

        // Fade out search div after error
        timeline.to(searchDiv, {
            opacity: 0,
            scale: 0.8,
            duration: 0.3,
            onComplete: () => {
                searchDiv.remove();
                activeRemoveDiv = null;
            }
        }, blinkStart + 2.0);
    }

    return timeline;
}

/**
 * Create the indigo search indicator for remove()
 */
function createRemoveIndicator_v1(searchValue) {
    const div = document.createElement('div');
    div.className = 'remove-search-div';

    div.innerHTML = `
        <div class="remove-label">remove("${searchValue}")</div>
        <div class="remove-status">Searching...</div>
    `;

    Object.assign(div.style, {
        position: 'fixed',
        width: '180px',
        minHeight: '75px',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',  // Indigo gradient
        border: '3px solid #4338ca',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        zIndex: '10000',
        boxShadow: '0 4px 15px rgba(30, 27, 75, 0.6)',
        fontFamily: "'Courier New', monospace",
        opacity: '0',
        pointerEvents: 'none',
        padding: '10px'
    });

    const label = div.querySelector('.remove-label');
    Object.assign(label.style, {
        fontSize: '13px',
        fontWeight: 'bold',
        color: '#ffffff',  // White text
        textAlign: 'center',
        wordBreak: 'break-word'
    });

    const status = div.querySelector('.remove-status');
    Object.assign(status.style, {
        fontSize: '12px',
        color: '#c7d2fe',  // Light indigo
        fontStyle: 'italic'
    });

    return div;
}

/**
 * Create indigo arrow for remove animation
 */
function createRemoveArrow_v1() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "remove-arrow");
    svg.style.position = 'fixed';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '9999';
    svg.style.overflow = 'visible';

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("stroke", "#1e1b4b");  // Indigo
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-dasharray", "200");
    line.setAttribute("stroke-dashoffset", "200");
    line.setAttribute("marker-end", "url(#remove-arrowhead)");
    svg.appendChild(line);

    // Create arrowhead marker
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "remove-arrowhead");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
    polygon.setAttribute("fill", "#1e1b4b");  // Indigo
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    svg.line = line;
    document.body.appendChild(svg);

    return svg;
}

/**
 * Point arrow from search div to target row
 */
function pointRemoveArrowToRow_v1(arrow, searchDiv, row) {
    const divRect = searchDiv.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    const x1 = divRect.right;
    const y1 = divRect.top + divRect.height / 2;
    const x2 = rowRect.left;
    const y2 = rowRect.top + rowRect.height / 2;

    arrow.line.setAttribute("x1", x1);
    arrow.line.setAttribute("y1", y1);
    arrow.line.setAttribute("x2", x2);
    arrow.line.setAttribute("y2", y2);
}

/**
 * Fly ValueError message to output panel
 */
function flyValueErrorToOutput(searchDiv, outputPanel, searchValue) {
    const divRect = searchDiv.getBoundingClientRect();
    const startX = divRect.left + divRect.width / 2;
    const startY = divRect.top + divRect.height / 2;

    const outputRect = outputPanel.getBoundingClientRect();
    let targetX = outputRect.left + 50;
    let targetY = outputRect.top + 20;

    const outputLines = outputPanel.querySelectorAll('.output-line');
    const targetLine = outputLines[outputLines.length - 1];

    if (targetLine) {
        const targetRect = targetLine.getBoundingClientRect();
        targetX = targetRect.left + 30;
        targetY = targetRect.top;
    }

    // Create error spark
    const spark = document.createElement('div');
    spark.className = 'animation-spark error-spark';
    spark.textContent = 'ValueError';
    Object.assign(spark.style, {
        position: 'fixed',
        left: `${startX}px`,
        top: `${startY}px`,
        background: '#ef4444',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '8px',
        fontFamily: "'Courier New', monospace",
        fontWeight: 'bold',
        fontSize: '1.1rem',
        zIndex: '10001',
        boxShadow: '0 0 20px rgba(239, 68, 68, 0.9)',
        pointerEvents: 'none'
    });

    document.body.appendChild(spark);

    gsap.to(spark, {
        left: targetX - 40,
        top: targetY,
        duration: 1.0,
        ease: 'power2.out',
        onComplete: () => {
            spark.remove();
        }
    });
}

/**
 * Renumber indices after row removal (reusing pop logic)
 */
function renumberIndicesAfterRemove(listContainer) {
    renumberIndicesAfterPop(listContainer);
}

/* ===================================
   REVERSE ANIMATION (Circular Lane Model)
   Duration: 2 seconds for any n
   =================================== */

// Track reverse elements for cleanup
let activeReverseIcon = null;
let activeReverseFlyingElements = [];

/**
 * Cleanup any lingering reverse animation elements
 */
export function cleanupReverseElements() {
    if (activeReverseIcon) {
        activeReverseIcon.remove();
        activeReverseIcon = null;
    }
    activeReverseFlyingElements.forEach(el => el.remove());
    activeReverseFlyingElements = [];
    document.querySelectorAll('.reverse-rewind-icon').forEach(el => el.remove());
    document.querySelectorAll('.reverse-flying-content').forEach(el => el.remove());
    document.querySelectorAll('.list-table-wrapper.reverse-animating').forEach(el => {
        el.classList.remove('reverse-animating');
    });
}

/**
 * Animates list.reverse() using circular conveyor belt model
 * @param {HTMLElement} listContainer - The list container element
 * @param {string} listName - Name of the list variable
 * @param {Array} originalItems - Original list items before reverse
 * @param {Array} reversedItems - Reversed list items
 * @param {Function} onComplete - Callback when animation completes
 */
export async function animateReverse(listContainer, listName, originalItems, reversedItems, onComplete) {
    const n = originalItems.length;

    // ============ EDGE CASE: Empty List ============
    if (n === 0) {
        if (onComplete) onComplete();
        return;
    }

    // ============ EDGE CASE: Single Element ============
    if (n === 1) {
        await animateReverseN1(listContainer, onComplete);
        return;
    }

    // ============ MAIN ANIMATION (n >= 2) ============
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const rows = Array.from(listContainer.querySelectorAll('.list-row'));
    const contentCells = rows.map(row => row.querySelector('.list-content-cell'));
    const header = listContainer.querySelector('.list-header');

    // Store original values for each cell
    const originalValues = contentCells.map(cell => {
        const valueEl = cell.querySelector('.list-value');
        return valueEl ? valueEl.textContent : cell.textContent;
    });

    let rewindIcon = null;
    const flyingElements = [];

    const tl = gsap.timeline({
        onComplete: () => {
            cleanup();
            if (onComplete) onComplete();
        }
    });

    // ============ SETUP ============

    // 1. Add grey dimming class
    tableWrapper.classList.add('reverse-animating');

    // 2. Create and show rewind icon
    rewindIcon = document.createElement('div');
    rewindIcon.className = 'reverse-rewind-icon';
    rewindIcon.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23667eea'%3E%3Cpath d='M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z'/%3E%3C/svg%3E" alt="Rewind">`;
    header.style.position = 'relative';
    header.appendChild(rewindIcon);
    activeReverseIcon = rewindIcon;

    tl.to(rewindIcon, { opacity: 1, duration: 0.2 });

    // 3. Play rewind sound
    playSoundReverse('../sounds/rewind.wav');

    // ============ CALCULATE TIMING ============
    // We need to swap pairs from outside-in
    // For n items, we have floor(n/2) swaps
    const numSwaps = Math.floor(n / 2);
    const swapDuration = 2.0 / numSwaps; // Distribute 2 seconds across all swaps

    // ============ PERFORM SWAPS ============
    for (let i = 0; i < numSwaps; i++) {
        const leftIndex = i;
        const rightIndex = n - 1 - i;

        const leftCell = contentCells[leftIndex];
        const rightCell = contentCells[rightIndex];

        const leftRect = leftCell.getBoundingClientRect();
        const rightRect = rightCell.getBoundingClientRect();

        const leftValue = originalValues[leftIndex];
        const rightValue = originalValues[rightIndex];

        // Create flying elements for the swap
        const leftFlying = document.createElement('div');
        leftFlying.className = 'reverse-flying-content';
        leftFlying.textContent = leftValue;
        Object.assign(leftFlying.style, {
            left: leftRect.left + 'px',
            top: leftRect.top + 'px',
            width: leftRect.width + 'px',
            opacity: '0',
            zIndex: '1001'
        });
        document.body.appendChild(leftFlying);
        flyingElements.push(leftFlying);
        activeReverseFlyingElements.push(leftFlying);

        const rightFlying = document.createElement('div');
        rightFlying.className = 'reverse-flying-content';
        rightFlying.textContent = rightValue;
        Object.assign(rightFlying.style, {
            left: rightRect.left + 'px',
            top: rightRect.top + 'px',
            width: rightRect.width + 'px',
            opacity: '0',
            zIndex: '1001'
        });
        document.body.appendChild(rightFlying);
        flyingElements.push(rightFlying);
        activeReverseFlyingElements.push(rightFlying);

        const startTime = i * swapDuration;

        // Fade out original cells and show flying elements
        tl.to([leftCell, rightCell], {
            opacity: 0.3,
            duration: swapDuration * 0.1
        }, startTime);

        tl.to([leftFlying, rightFlying], {
            opacity: 1,
            duration: swapDuration * 0.1
        }, startTime);

        // Highlight both flying elements
        tl.to([leftFlying, rightFlying], {
            backgroundColor: '#fff9c4',
            boxShadow: '0 0 12px rgba(255, 235, 59, 0.8)',
            scale: 1.05,
            duration: swapDuration * 0.1
        }, startTime + swapDuration * 0.1);

        // Calculate arc control points for curved swap
        const midX = (leftRect.left + rightRect.left) / 2;
        const arcHeight = Math.abs(rightRect.top - leftRect.top) * 0.3 + 50;

        // Animate left element going to right position (curve upward)
        tl.to(leftFlying, {
            left: rightRect.left,
            top: rightRect.top,
            duration: swapDuration * 0.6,
            ease: 'power2.inOut',
            motionPath: {
                path: [
                    { x: 0, y: 0 },
                    { x: (rightRect.left - leftRect.left) / 2, y: -arcHeight },
                    { x: rightRect.left - leftRect.left, y: rightRect.top - leftRect.top }
                ],
                type: 'soft'
            }
        }, startTime + swapDuration * 0.2);

        // Animate right element going to left position (curve downward)
        tl.to(rightFlying, {
            left: leftRect.left,
            top: leftRect.top,
            duration: swapDuration * 0.6,
            ease: 'power2.inOut',
            motionPath: {
                path: [
                    { x: 0, y: 0 },
                    { x: (leftRect.left - rightRect.left) / 2, y: arcHeight },
                    { x: leftRect.left - rightRect.left, y: leftRect.top - rightRect.top }
                ],
                type: 'soft'
            }
        }, startTime + swapDuration * 0.2);

        // Dehighlight and fade out flying elements
        tl.to([leftFlying, rightFlying], {
            backgroundColor: 'white',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
            scale: 1,
            opacity: 0,
            duration: swapDuration * 0.15
        }, startTime + swapDuration * 0.8);

        // Update cell contents and fade back in
        tl.call(() => {
            const leftValueEl = leftCell.querySelector('.list-value');
            const rightValueEl = rightCell.querySelector('.list-value');

            if (leftValueEl) leftValueEl.textContent = rightValue;
            else leftCell.textContent = rightValue;

            if (rightValueEl) rightValueEl.textContent = leftValue;
            else rightCell.textContent = leftValue;

            // Update our tracking array for subsequent swaps
            originalValues[leftIndex] = rightValue;
            originalValues[rightIndex] = leftValue;
        }, null, startTime + swapDuration * 0.85);

        tl.to([leftCell, rightCell], {
            opacity: 1,
            duration: swapDuration * 0.1
        }, startTime + swapDuration * 0.9);
    }

    // ============ FINAL CLEANUP ============
    tl.to(rewindIcon, { opacity: 0, duration: 0.15 }, 1.85);

    tl.call(() => {
        tableWrapper.classList.remove('reverse-animating');

        // Reset all cell styles
        contentCells.forEach((cell, idx) => {
            gsap.set(cell, { clearProps: 'all' });
            cell.style.opacity = '1';

            // Ensure final content is correct
            const valueEl = cell.querySelector('.list-value');
            if (valueEl) valueEl.textContent = reversedItems[idx];
            else cell.textContent = reversedItems[idx];
        });
    }, null, 2.0);

    function cleanup() {
        if (rewindIcon) rewindIcon.remove();
        flyingElements.forEach(el => el.remove());
        tableWrapper.classList.remove('reverse-animating');
        activeReverseIcon = null;
        activeReverseFlyingElements = [];

        // Ensure final state is correct
        reversedItems.forEach((item, idx) => {
            const valueEl = contentCells[idx].querySelector('.list-value');
            if (valueEl) valueEl.textContent = item;
            else contentCells[idx].textContent = item;
        });
    }

    return tl;
}

/**
 * Special animation for n=1 (pulse effect)
 */
async function animateReverseN1(listContainer, onComplete) {
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const contentCell = listContainer.querySelector('.list-content-cell');
    const header = listContainer.querySelector('.list-header');

    let rewindIcon = null;

    const tl = gsap.timeline({
        onComplete: () => {
            cleanup();
            if (onComplete) onComplete();
        }
    });

    // Add grey dimming
    tableWrapper.classList.add('reverse-animating');

    // Create and show rewind icon
    rewindIcon = document.createElement('div');
    rewindIcon.className = 'reverse-rewind-icon';
    rewindIcon.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23667eea'%3E%3Cpath d='M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z'/%3E%3C/svg%3E" alt="Rewind">`;
    header.style.position = 'relative';
    header.appendChild(rewindIcon);
    activeReverseIcon = rewindIcon;

    tl.to(rewindIcon, { opacity: 1, duration: 0.2 });

    // Play sound
    playSoundReverse('../sounds/rewind.wav');

    // Pulse 4 times over 2 seconds
    const pulseCount = 4;
    const pulseDuration = 2.0 / pulseCount;

    for (let i = 0; i < pulseCount; i++) {
        tl.to(contentCell, {
            backgroundColor: '#fff9c4',
            boxShadow: '0 0 12px rgba(255, 235, 59, 0.8)',
            scale: 1.08,
            duration: pulseDuration * 0.4
        }, i * pulseDuration);

        tl.to(contentCell, {
            backgroundColor: '',
            boxShadow: '',
            scale: 1,
            duration: pulseDuration * 0.4
        }, i * pulseDuration + pulseDuration * 0.4);
    }

    // Fade out icon
    tl.to(rewindIcon, { opacity: 0, duration: 0.2 }, 1.8);

    tl.call(() => {
        tableWrapper.classList.remove('reverse-animating');
    }, null, 2.0);

    function cleanup() {
        if (rewindIcon) rewindIcon.remove();
        tableWrapper.classList.remove('reverse-animating');
        gsap.set(contentCell, { clearProps: 'all' });
        activeReverseIcon = null;
    }

    return tl;
}

/**
 * Helper function to play sound for reverse animation
 */
function playSoundReverse(src) {
    try {
        const audio = new Audio(src);
        audio.volume = 0.5;
        audio.play().catch(err => console.log('Reverse sound play failed:', err));
    } catch (e) {
        console.warn('Audio error:', e);
    }
}

/* ===================================
   REVERSE ANIMATION - SIMPLIFIED (Circular Lane Model)
   User's requested conveyor-belt visual
   Duration: 2 seconds for any n
   =================================== */

/**
 * Animates list.reverse() as ONE CONTINUOUS CIRCULAR FLOW
 * All text elements move simultaneously with staggered timing
 * Creates a smooth "wave" effect rather than discrete steps
 * @param {HTMLElement} listContainer - The list container element
 * @param {string} listName - Name of the list variable
 * @param {Array} originalItems - Original list items before reverse
 * @param {Array} reversedItems - Reversed list items
 * @param {Function} onComplete - Callback when animation completes
 */
export async function animateReverseSimplified(listContainer, listName, originalItems, reversedItems, onComplete) {
    const n = originalItems.length;

    // ============ EDGE CASE: Empty List ============
    if (n === 0) {
        if (onComplete) onComplete();
        return;
    }

    // ============ EDGE CASE: Single Element ============
    if (n === 1) {
        await animateReverseSimplifiedN1(listContainer, onComplete);
        return;
    }

    // ============ MAIN ANIMATION: CONTINUOUS CIRCULAR FLOW ============
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const rows = Array.from(listContainer.querySelectorAll('.list-row'));
    const contentCells = rows.map(row => row.querySelector('.list-content-cell'));
    const header = listContainer.querySelector('.list-header');

    let rewindIcon = null;
    const flyingTexts = [];

    const tl = gsap.timeline({
        onComplete: () => {
            cleanup();
            if (onComplete) onComplete();
        }
    });

    // ============ SETUP ============
    tableWrapper.classList.add('reverse-animating');

    // Create rewind icon
    rewindIcon = document.createElement('div');
    rewindIcon.className = 'reverse-rewind-icon';
    rewindIcon.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23667eea'%3E%3Cpath d='M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z'/%3E%3C/svg%3E" alt="Rewind">`;
    header.style.position = 'relative';
    header.appendChild(rewindIcon);
    activeReverseIcon = rewindIcon;

    tl.to(rewindIcon, { opacity: 1, duration: 0.15 });
    playSoundReverse('../sounds/rewind.wav');

    // ============ GET POSITIONS ============
    const containerRect = listContainer.getBoundingClientRect();
    const rightLaneX = containerRect.right + 40;

    // Calculate row positions
    const rowRects = rows.map(row => row.getBoundingClientRect());

    // ============ CREATE ALL FLYING TEXT ELEMENTS (invisible initially) ============
    // Each element will travel: start position → right lane → final position
    // We create them all upfront, then animate simultaneously with stagger

    const elementData = [];

    for (let i = 0; i < n; i++) {
        const sourceCell = contentCells[i];
        const sourceRect = sourceCell.getBoundingClientRect();
        const valueEl = sourceCell.querySelector('.list-value');
        const textContent = valueEl ? valueEl.textContent : sourceCell.textContent;

        // This element will end up at position (n - 1 - i) in the reversed list
        const finalIndex = n - 1 - i;
        const finalRect = rowRects[finalIndex];

        // Right lane intermediate position (vertical position follows flow)
        const rightY = sourceRect.top;

        // Create flying element
        const flyingText = document.createElement('div');
        flyingText.className = 'reverse-flying-content';
        flyingText.textContent = textContent;
        flyingText.style.position = 'fixed';
        flyingText.style.left = sourceRect.left + 'px';
        flyingText.style.top = sourceRect.top + 'px';
        flyingText.style.opacity = '0';
        flyingText.style.zIndex = '1100';
        flyingText.style.minWidth = '60px';
        flyingText.style.textAlign = 'center';
        flyingText.style.pointerEvents = 'none';

        document.body.appendChild(flyingText);
        flyingTexts.push(flyingText);
        activeReverseFlyingElements.push(flyingText);

        // Hide original text
        if (valueEl) valueEl.style.opacity = '0';
        else sourceCell.style.opacity = '0.3';

        elementData.push({
            element: flyingText,
            sourceRect,
            finalRect,
            rightY,
            textContent,
            sourceIndex: i,
            finalIndex
        });
    }

    // ============ ANIMATE ALL ELEMENTS SIMULTANEOUSLY WITH STAGGER ============
    // Each element follows a smooth path:
    // 1. Fade in (quick)
    // 2. Curve to right lane (smooth arc)
    // 3. Flow down right lane if needed
    // 4. Curve back to final position (smooth arc with highlight)
    // 5. Fade out, reveal final text

    const staggerDelay = 1.3 / n; // Spread stagger across first ~1.3 seconds
    const baseAnimDuration = 1.7; // Each element's journey takes ~1.7 seconds

    elementData.forEach((data, idx) => {
        const startTime = 0.15 + idx * staggerDelay;
        const { element, sourceRect, finalRect, rightY } = data;

        // Calculate control points for smooth bezier curves
        const midX1 = sourceRect.left + (rightLaneX - sourceRect.left) * 0.5;
        const midX2 = rightLaneX + (finalRect.left - rightLaneX) * 0.5;

        // Phase 1: Fade in (0.0s - 0.1s)
        tl.to(element, {
            opacity: 1,
            duration: 0.1,
            ease: 'power1.in'
        }, startTime);

        // Phase 2: Smooth arc to right lane (0.1s - 0.7s)
        tl.to(element, {
            motionPath: {
                path: [
                    { x: sourceRect.left, y: sourceRect.top },
                    { x: midX1, y: sourceRect.top - 20 }, // arc upward slightly
                    { x: rightLaneX, y: rightY }
                ],
                curviness: 1.2
            },
            duration: 0.6,
            ease: 'power1.inOut'
        }, startTime + 0.1);

        // Phase 3: Flow along right lane vertically (0.7s - 1.1s)
        // Elements naturally accumulate at different heights
        const intermediateY = finalRect.top + (idx - data.finalIndex) * 10;
        tl.to(element, {
            y: intermediateY - rightY,
            duration: 0.4,
            ease: 'sine.inOut'
        }, startTime + 0.7);

        // Phase 4: Highlight + diagonal return to final position (1.1s - 1.6s)
        // Highlight starts
        tl.to(element, {
            backgroundColor: '#fff9c4',
            boxShadow: '0 0 12px rgba(255, 235, 59, 0.8)',
            scale: 1.08,
            duration: 0.15,
            ease: 'power2.out'
        }, startTime + 1.1);

        // Smooth diagonal return
        tl.to(element, {
            motionPath: {
                path: [
                    { x: rightLaneX, y: intermediateY },
                    { x: midX2, y: (intermediateY + finalRect.top) / 2 },
                    { x: finalRect.left, y: finalRect.top }
                ],
                curviness: 1.3
            },
            duration: 0.5,
            ease: 'power2.inOut'
        }, startTime + 1.15);

        // Dehighlight
        tl.to(element, {
            backgroundColor: 'white',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
            scale: 1,
            duration: 0.15,
            ease: 'power2.in'
        }, startTime + 1.5);

        // Phase 5: Fade out + reveal final text (1.65s - 1.75s)
        tl.to(element, {
            opacity: 0,
            duration: 0.1
        }, startTime + 1.65);

        // Update final cell text
        tl.call(() => {
            const targetCell = contentCells[data.finalIndex];
            const valueEl = targetCell.querySelector('.list-value');
            if (valueEl) {
                valueEl.textContent = data.textContent;
                valueEl.style.opacity = '1';
            } else {
                targetCell.textContent = data.textContent;
                targetCell.style.opacity = '1';
            }
        }, null, startTime + 1.7);
    });

    // ============ FINAL CLEANUP ============
    tl.to(rewindIcon, { opacity: 0, duration: 0.15 }, 1.85);

    tl.call(() => {
        tableWrapper.classList.remove('reverse-animating');

        // Ensure all cells show final values
        contentCells.forEach((cell, idx) => {
            const valueEl = cell.querySelector('.list-value');
            if (valueEl) {
                valueEl.textContent = reversedItems[idx];
                valueEl.style.opacity = '1';
            }
            cell.style.opacity = '1';
        });
    }, null, 2.0);

    function cleanup() {
        if (rewindIcon) rewindIcon.remove();
        flyingTexts.forEach(el => el.remove());
        tableWrapper.classList.remove('reverse-animating');
        activeReverseIcon = null;
        activeReverseFlyingElements = [];

        // Final state verification
        contentCells.forEach((cell, idx) => {
            const valueEl = cell.querySelector('.list-value');
            if (valueEl) {
                valueEl.textContent = reversedItems[idx];
                valueEl.style.opacity = '1';
            }
        });
    }

    return tl;
}

/**
 * Special animation for n=1 (pulse effect multiple times)
 */
async function animateReverseSimplifiedN1(listContainer, onComplete) {
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const contentCell = listContainer.querySelector('.list-content-cell');
    const header = listContainer.querySelector('.list-header');

    let rewindIcon = null;

    const tl = gsap.timeline({
        onComplete: () => {
            cleanup();
            if (onComplete) onComplete();
        }
    });

    // Add grey dimming
    tableWrapper.classList.add('reverse-animating');

    // Create and show rewind icon
    rewindIcon = document.createElement('div');
    rewindIcon.className = 'reverse-rewind-icon';
    rewindIcon.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23667eea'%3E%3Cpath d='M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z'/%3E%3C/svg%3E" alt="Rewind">`;
    header.style.position = 'relative';
    header.appendChild(rewindIcon);
    activeReverseIcon = rewindIcon;

    tl.to(rewindIcon, { opacity: 1, duration: 0.15 });

    // Play sound
    playSoundReverse('../sounds/rewind.wav');

    // Pulse 6 times over 2 seconds (as requested: multiple times)
    const pulseCount = 6;
    const pulseDuration = 1.8 / pulseCount; // Leave time for fade

    for (let i = 0; i < pulseCount; i++) {
        tl.to(contentCell, {
            backgroundColor: '#fff9c4',
            boxShadow: '0 0 12px rgba(255, 235, 59, 0.8)',
            scale: 1.1,
            duration: pulseDuration * 0.4
        }, 0.15 + i * pulseDuration);

        tl.to(contentCell, {
            backgroundColor: '',
            boxShadow: '',
            scale: 1,
            duration: pulseDuration * 0.4
        }, 0.15 + i * pulseDuration + pulseDuration * 0.5);
    }

    // Fade out icon
    tl.to(rewindIcon, { opacity: 0, duration: 0.1 }, 1.9);

    tl.call(() => {
        tableWrapper.classList.remove('reverse-animating');
    }, null, 2.0);

    function cleanup() {
        if (rewindIcon) rewindIcon.remove();
        tableWrapper.classList.remove('reverse-animating');
        gsap.set(contentCell, { clearProps: 'all' });
        activeReverseIcon = null;
    }

    return tl;
}

// ═══════════════════════════════════════════════════════════════════
// 🆕 IMPROVED APPEND ANIMATION (Pink Theme with Trails)
// ═══════════════════════════════════════════════════════════════════

/**
 * ✨ NEW: animateAppendImproved() - Pink div spawning from code with trails
 * @param {HTMLElement} listContainer - The list container
 * @param {string} listName - Variable name
 * @param {string} valueToAppend - Value being appended
 * @param {Object} originCoords - {x, y} pixel coordinates in code editor
 * @param {Function} onComplete - Callback
 */
export async function animateAppendImproved(listContainer, listName, valueToAppend, originCoords, onComplete) {
    const tl = gsap.timeline({
        onComplete: () => {
            cleanup();
            if (onComplete) onComplete();
        }
    });

    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const tbody = listContainer.querySelector('.list-table-body');
    const currentRows = tbody.querySelectorAll('.list-row');
    const newIndex = currentRows.length;

    // Create flying pink div
    const flyingDiv = document.createElement('div');
    flyingDiv.className = 'append-flying-value';
    flyingDiv.textContent = valueToAppend;
    flyingDiv.style.left = originCoords.x + 'px';
    flyingDiv.style.top = originCoords.y + 'px';
    document.body.appendChild(flyingDiv);

    // Create SVG trail container
    const trailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    trailSvg.setAttribute('class', 'append-trail-svg');
    document.body.appendChild(trailSvg);

    const trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trailSvg.appendChild(trailPath);

    // Create new row (hidden initially)
    const newRow = document.createElement('tr');
    newRow.className = 'list-row';
    newRow.dataset.originalIndex = newIndex;
    newRow.style.opacity = '0';

    const indexCell = document.createElement('td');
    indexCell.className = 'list-index-cell';
    indexCell.textContent = newIndex;

    const contentCell = document.createElement('td');
    contentCell.className = 'list-content-cell';

    const valueSpan = document.createElement('span');
    valueSpan.className = 'list-value';
    valueSpan.textContent = '';
    contentCell.appendChild(valueSpan);

    newRow.appendChild(indexCell);
    newRow.appendChild(contentCell);
    tbody.appendChild(newRow);

    const targetRect = contentCell.getBoundingClientRect();

    // Fade in flying div
    tl.to(flyingDiv, {
        opacity: 1,
        duration: 0.2
    });

    // Play whoosh sound
    tl.call(() => {
        const audio = new Audio('../sounds/whoosh.wav');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Sound error:', e));
    }, null, 0.2);

    // Calculate bezier path
    const startX = originCoords.x;
    const startY = originCoords.y;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    const controlX = (startX + endX) / 2;
    const controlY = startY - 100;

    const pathString = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
    trailPath.setAttribute('d', pathString);

    // Animate path drawing
    const pathLength = trailPath.getTotalLength();
    trailPath.style.strokeDasharray = pathLength;
    trailPath.style.strokeDashoffset = pathLength;

    tl.to(trailPath, {
        strokeDashoffset: 0,
        duration: 0.8,
        ease: 'power2.inOut'
    }, 0.2);

    // Create sparkle particles
    const sparkleCount = 12;
    const sparkles = [];

    for (let i = 0; i < sparkleCount; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'append-sparkle';
        document.body.appendChild(sparkle);
        sparkles.push(sparkle);

        const point = trailPath.getPointAtLength((i / sparkleCount) * pathLength);
        sparkle.style.left = point.x + 'px';
        sparkle.style.top = point.y + 'px';
        sparkle.style.opacity = '0';

        tl.to(sparkle, {
            opacity: 1,
            scale: 1.5,
            duration: 0.1
        }, 0.2 + (i / sparkleCount) * 0.6);

        tl.to(sparkle, {
            opacity: 0,
            scale: 0.5,
            duration: 0.2
        }, 0.3 + (i / sparkleCount) * 0.6);
    }

    // Move flying div along path
    tl.to(flyingDiv, {
        motionPath: {
            path: pathString,
            align: pathString,
            autoRotate: false
        },
        duration: 0.8,
        ease: 'power2.inOut'
    }, 0.2);

    // Fade out flying div
    tl.to(flyingDiv, {
        opacity: 0,
        scale: 0.8,
        duration: 0.2
    }, 0.9);

    // Fade in new row
    tl.to(newRow, {
        opacity: 1,
        duration: 0.2
    }, 0.9);

    // Reveal value
    tl.call(() => {
        valueSpan.textContent = valueToAppend;
    }, null, 1.0);

    // Play append sound
    tl.call(() => {
        const audio = new Audio('../sounds/append.wav');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Sound error:', e));
    }, null, 1.0);

    // Fade out trail
    tl.to(trailPath, {
        opacity: 0,
        duration: 0.3
    }, 1.0);

    // Update count
    const countSection = listContainer.querySelector('.list-count-section');
    if (countSection) {
        tl.call(() => {
            countSection.textContent = `N is ${newIndex + 1}`;
        }, null, 1.1);
    }

    function cleanup() {
        flyingDiv?.remove();
        trailSvg?.remove();
        sparkles.forEach(s => s.remove());
    }
}

// ═══════════════════════════════════════════════════════════════════
// 🆕 INSERT ANIMATION (Musical Search Counter)
// ═══════════════════════════════════════════════════════════════════

/**
 * ✨ NEW: animateInsert() - 5-phase insert with musical counter
 * @param {HTMLElement} listContainer - The list container
 * @param {string} listName - Variable name
 * @param {number} insertIndex - Index to insert at (can be +ve or -ve)
 * @param {string} valueToInsert - Value being inserted
 * @param {number} listLength - Current list length before insert
 * @param {Object} originCoords - {x, y} coordinates of value in code
 * @param {Function} onComplete - Callback
 */
export async function animateInsert(listContainer, listName, insertIndex, valueToInsert, listLength, originCoords, onComplete) {
    const tl = gsap.timeline({
        onComplete: () => {
            cleanup();
            if (onComplete) onComplete();
        }
    });

    const rows = Array.from(listContainer.querySelectorAll('.list-row'));
    const tbody = listContainer.querySelector('.list-table-body');

    // Calculate actual target index
    let targetIndex;
    let displayText;
    let edgeCase = null;

    if (insertIndex >= 0) {
        if (insertIndex >= listLength) {
            targetIndex = listLength;
            edgeCase = insertIndex === listLength ? 'n' : 'n+';
            displayText = edgeCase;
        } else {
            targetIndex = insertIndex;
            displayText = String(insertIndex);
        }
    } else {
        const normalizedIndex = listLength + insertIndex;
        if (normalizedIndex < 0) {
            targetIndex = 0;
            edgeCase = 'n-';
            displayText = edgeCase;
        } else {
            targetIndex = normalizedIndex;
            displayText = String(insertIndex);
        }
    }

    const isForwardSearch = insertIndex >= 0;
    const searchDirection = isForwardSearch ? 1 : -1;

    // PHASE 1: Musical Search
    const searchDiv = document.createElement('div');
    searchDiv.className = 'insert-search-div';

    const label = document.createElement('div');
    label.className = 'insert-search-label';
    label.textContent = `Find ${displayText}`;

    const valueDiv = document.createElement('div');
    valueDiv.className = 'insert-search-value';
    valueDiv.textContent = '0';

    searchDiv.appendChild(label);
    searchDiv.appendChild(valueDiv);
    document.body.appendChild(searchDiv);

    const headerRect = listContainer.querySelector('.list-header').getBoundingClientRect();
    searchDiv.style.left = (headerRect.left - 160) + 'px';
    searchDiv.style.top = (headerRect.top + 10) + 'px';

    tl.to(searchDiv, {
        opacity: 1,
        duration: 0.3
    });

    // Initialize Tone.js synth
    await Tone.start();
    const synth = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 }
    }).toDestination();

    const notesAscending = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6'];
    const notesDescending = ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3'];
    const notes = isForwardSearch ? notesAscending : notesDescending;

    const searchSteps = isForwardSearch ?
        Math.min(targetIndex, rows.length - 1) :
        Math.max(listLength - 1 - targetIndex, 0);

    const stepDuration = 0.3;
    let currentValue = isForwardSearch ? 0 : listLength - 1;

    for (let step = 0; step <= searchSteps; step++) {
        const rowIndex = isForwardSearch ? step : listLength - 1 - step;
        const row = rows[rowIndex];

        if (row) {
            tl.call(() => {
                rows.forEach(r => r.classList.remove('insert-searching'));
                row.classList.add('insert-searching');
            }, null, step * stepDuration);

            tl.call(() => {
                valueDiv.textContent = edgeCase || currentValue;

                const noteIndex = step % notes.length;
                synth.triggerAttackRelease(notes[noteIndex], '16n');
            }, null, step * stepDuration);

            currentValue += searchDirection;
        }
    }

    const searchEndTime = (searchSteps + 1) * stepDuration;

    tl.call(() => {
        rows.forEach(r => r.classList.remove('insert-searching'));
    }, null, searchEndTime);

    // PHASE 2: Grey out rows above target
    tl.call(() => {
        for (let i = 0; i < targetIndex; i++) {
            if (rows[i]) {
                rows[i].classList.add('insert-locked');
            }
        }
    }, null, searchEndTime + 0.1);

    // PHASE 3: Shift rows down & create gap
    const gapRow = document.createElement('tr');
    gapRow.className = 'list-row insert-gap-row';
    gapRow.innerHTML = '<td class="list-index-cell"></td><td class="list-content-cell"></td>';
    gapRow.style.opacity = '0';

    if (targetIndex >= rows.length) {
        tbody.appendChild(gapRow);
    } else {
        tbody.insertBefore(gapRow, rows[targetIndex]);
    }

    tl.to(gapRow, {
        opacity: 1,
        duration: 0.3
    }, searchEndTime + 0.3);

    const rowsToShift = Array.from(tbody.querySelectorAll('.list-row')).filter((r, idx) =>
        idx > targetIndex && !r.classList.contains('insert-gap-row')
    );

    const shiftStartTime = searchEndTime + 0.4;

    if (rowsToShift.length > 0) {
        const shiftDistance = gapRow.offsetHeight;

        tl.to(rowsToShift, {
            y: shiftDistance,
            duration: 0.8,
            ease: 'power2.inOut',
            stagger: 0.05
        }, shiftStartTime);
    }

    // PHASE 4: Drop value into gap (pink trail)
    const dropStartTime = shiftStartTime + 0.9;

    const gapCell = gapRow.querySelector('.list-content-cell');
    const gapRect = gapCell.getBoundingClientRect();

    const flyingDiv = document.createElement('div');
    flyingDiv.className = 'append-flying-value';
    flyingDiv.textContent = valueToInsert;
    flyingDiv.style.left = originCoords.x + 'px';
    flyingDiv.style.top = originCoords.y + 'px';
    document.body.appendChild(flyingDiv);

    const trailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    trailSvg.setAttribute('class', 'append-trail-svg');
    document.body.appendChild(trailSvg);

    const trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trailSvg.appendChild(trailPath);

    const pathString = `M ${originCoords.x} ${originCoords.y} Q ${(originCoords.x + gapRect.left) / 2} ${originCoords.y - 80} ${gapRect.left + gapRect.width / 2} ${gapRect.top + gapRect.height / 2}`;
    trailPath.setAttribute('d', pathString);

    const pathLength = trailPath.getTotalLength();
    trailPath.style.strokeDasharray = pathLength;
    trailPath.style.strokeDashoffset = pathLength;

    tl.to(flyingDiv, {
        opacity: 1,
        duration: 0.2
    }, dropStartTime);

    tl.call(() => {
        const audio = new Audio('../sounds/whoosh.wav');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Sound error:', e));
    }, null, dropStartTime);

    tl.to(trailPath, {
        strokeDashoffset: 0,
        duration: 0.6,
        ease: 'power2.inOut'
    }, dropStartTime + 0.2);

    tl.to(flyingDiv, {
        motionPath: {
            path: pathString,
            align: pathString
        },
        duration: 0.6,
        ease: 'power2.inOut'
    }, dropStartTime + 0.2);

    tl.to(flyingDiv, {
        opacity: 0,
        scale: 0.8,
        duration: 0.2
    }, dropStartTime + 0.7);

    tl.call(() => {
        const valueSpan = document.createElement('span');
        valueSpan.className = 'list-value';
        valueSpan.textContent = valueToInsert;
        gapCell.appendChild(valueSpan);

        gapRow.classList.remove('insert-gap-row');
        gapRow.dataset.originalIndex = targetIndex;

        const audio = new Audio('../sounds/append.wav');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Sound error:', e));
    }, null, dropStartTime + 0.8);

    tl.to(trailPath, {
        opacity: 0,
        duration: 0.3
    }, dropStartTime + 0.8);

    // PHASE 5: Renumber indices
    const renumberStartTime = dropStartTime + 1.0;

    tl.call(() => {
        const allRows = Array.from(tbody.querySelectorAll('.list-row'));
        allRows.forEach((row, idx) => {
            const indexCell = row.querySelector('.list-index-cell');
            if (indexCell) {
                gsap.to(indexCell, {
                    textContent: idx,
                    duration: 0.3,
                    snap: { textContent: 1 }
                });
            }
            row.dataset.originalIndex = idx;
        });

        const countSection = listContainer.querySelector('.list-count-section');
        if (countSection) {
            countSection.textContent = `N is ${listLength + 1}`;
        }
    }, null, renumberStartTime);

    // Cleanup
    tl.to(searchDiv, {
        opacity: 0,
        duration: 0.3
    }, renumberStartTime + 0.2);

    tl.call(() => {
        // ✅ FIX: Get ALL rows including newly inserted one
        const allRows = Array.from(tbody.querySelectorAll('.list-row'));
        allRows.forEach(r => {
            r.classList.remove('insert-locked', 'insert-searching');
            gsap.set(r, { clearProps: 'y' });
            // ✅ CRITICAL: Ensure row is visible
            r.style.opacity = '1';
            r.style.transform = 'none';
        });

        synth.dispose();
    }, null, renumberStartTime + 0.5);

    function cleanup() {
        searchDiv?.remove();
        flyingDiv?.remove();
        trailSvg?.remove();
        
        try {
            synth.dispose();
        } catch (e) {
            // Synth may already be disposed
        }

        // ✅ FIX: Clear ALL rows including newly inserted one
        const allRows = Array.from(tbody.querySelectorAll('.list-row'));
        allRows.forEach(r => {
            r.classList.remove('insert-locked', 'insert-searching');
            gsap.set(r, { clearProps: 'all' });
            // ✅ CRITICAL: Force visibility
            r.style.opacity = '1';
            r.style.transform = 'none';
            r.style.filter = 'none';
        });
    }
}

/**
 * ⭐ NEW: animateClear()
 * Timeline:
 * - Highlight and pop each row sequentially (fast for large lists)
 * - Play cleaned.wav (stop after 2s)
 * - Show "List is now cleared✨" message (fade in/out)
 */
export function animateClear(listContainer, varName, onComplete) {
    const rows = Array.from(listContainer.querySelectorAll('.list-row'));
    const rowCount = rows.length;
    
    if (rowCount === 0) {
        if (onComplete) onComplete();
        return;
    }

    const timePerRow = Math.max(200, 2000 / rowCount);
    const totalClearTime = (rowCount - 1) * (timePerRow / 1000); // Time for n-1 rows
    
    const timeline = gsap.timeline({
        onComplete: () => {
            const countSection = listContainer.querySelector('.list-count-section');
            if (countSection) countSection.textContent = 'N is 0';
            if (onComplete) onComplete();
        }
    });

    // Process first n-1 rows (remove completely)
    for (let idx = 0; idx < rowCount - 1; idx++) {
        const row = rows[idx];
        const startTime = idx * (timePerRow / 1000);
        
        // Pop sound
        timeline.call(() => {
            const popAudio = new Audio('../sounds/pop.wav');
            popAudio.volume = 0.4;
            popAudio.play().catch(() => {});
        }, null, startTime);

        // Highlight
        timeline.to(row, { backgroundColor: '#ff9999', duration: 0.1 }, startTime);

        // Fade content
        timeline.to(row.querySelectorAll('td'), { opacity: 0, duration: 0.2 }, startTime + 0.1);

        // Collapse row
        timeline.to(row, { height: 0, padding: 0, margin: 0, borderWidth: 0, duration: 0.2 }, startTime + 0.3);

        // Remove row from DOM so table visibly has n-1 rows
        timeline.call(() => {
            row.remove();
        }, null, startTime + 0.5);
    }

    // LAST ROW special handling
    const lastRow = rows[rowCount - 1];
    const lastRowTime = totalClearTime;
    const lastCells = lastRow.querySelectorAll('td');
    const messageEl = document.createElement('div');
    messageEl.className = 'clear-completion-message';
    messageEl.textContent = 'List is now cleared✨';
    messageEl.style.opacity = '0';
    messageEl.style.transform = 'scale(0.8)';

    // Highlight + pop
    timeline.call(() => {
        const popAudio = new Audio('../sounds/pop.wav');
        popAudio.volume = 0.4;
        popAudio.play().catch(() => {});
    }, null, lastRowTime);

    timeline.to(lastRow, { backgroundColor: '#ff9999', duration: 0.1 }, lastRowTime);

    // Fade content (row stays)
    timeline.to(lastCells, { opacity: 0, duration: 0.2 }, lastRowTime + 0.1);

    // 0.4s delay, then cleaned.wav + message
    const messageTime = lastRowTime + 0.5;

    timeline.call(() => {
        // Play cleaned.wav
        const audio = new Audio('../sounds/cleaned.wav');
        audio.volume = 0.6;
        audio.play().catch(e => console.warn('cleaned.wav failed', e));
        setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 2000);

        // Clear cells and merge
        lastCells.forEach(c => c.textContent = '');
        lastCells[0].setAttribute('colspan', '2');
        lastCells[1].style.display = 'none';

        // Force white background so message appears on clean, non-highlighted row
        lastRow.style.backgroundColor = '#ffffff';

        // Add message
        lastCells[0].appendChild(messageEl);

        // Show cell and message container
        gsap.set(lastCells[0], { opacity: 1 });
    }, null, messageTime);

    // Message fade in/out (single line)
    timeline.to(messageEl, { opacity: 1, scale: 1, duration: 0.4 }, messageTime);
    timeline.to(messageEl, { opacity: 0, duration: 0.4 }, messageTime + 2.0);

    // Collapse and remove last row after message fades
    timeline.to(lastRow, {
        height: 0,
        padding: 0,
        margin: 0,
        borderWidth: 0,
        duration: 0.3
    }, messageTime + 2.4);
    timeline.call(() => {
        lastRow.remove();
        const countSection = listContainer.querySelector('.list-count-section');
        if (countSection) countSection.textContent = 'N is 0';
    }, null, messageTime + 2.7);

    return timeline;
}
/**
 * Cleanup clear animation elements
 */
export function cleanupClearElements() {
    document.querySelectorAll('.clear-completion-message').forEach(el => el.remove());
}
