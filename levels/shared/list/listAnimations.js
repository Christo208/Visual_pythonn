/* ===================================
   List Animations - GSAP Animations
   Phase 2 - REVISED Milestones 2-4
   ✅ M2.5: Table Structure Animation (3s)
   ✅ M3&4: Row Highlight Duration + Piano Sounds
   ✅ M2: Fast Back Button (0.3-1s total)
   =================================== */

// ============ SOUND EFFECTS ============
let pencilWriteSound = null;

/**
 * Initialize sound effects (call after DOM loads)
 */
export function initializeListSounds() {
    pencilWriteSound = new Audio('../sounds/pencil-write.wav');
    pencilWriteSound.volume = 0.3;
    console.log('🔊 List sound effects initialized');
}

// ============ PIANO SOUND CONFIGURATION ============
const SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BASE_OCTAVE = 5; // Start from C5
const MAX_OCTAVE = 8;  // Cap at C8
const MIN_OCTAVE = 3;  // For negative indices (future)

// Synth for piano sounds (will be initialized after Tone.js loads)
let pianoSynth = null;

/**
 * Initialize Tone.js synth (call this once on page load)
 */
export function initializePianoSynth() {
    if (typeof Tone === 'undefined') {
        console.warn('Tone.js not loaded - piano sounds disabled');
        return;
    }
    
    pianoSynth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: {
            attack: 0.005,
            decay: 0.1,
            sustain: 0.3,
            release: 0.8
        }
    }).toDestination();
    
    pianoSynth.volume.value = -10; // Slightly quieter
    
    console.log('🎹 Piano synth initialized');
}

/**
 * Play a piano note based on list index (positive direction)
 * @param {number} index - Element index (0, 1, 2, ...)
 */
function playPianoNote(index) {
    if (!pianoSynth) {
        console.warn('Piano synth not initialized');
        return;
    }
    
    try {
        // Calculate note and octave
        const noteIndex = index % SCALE.length;
        const octaveOffset = Math.floor(index / SCALE.length);
        const octave = BASE_OCTAVE + octaveOffset;
        
        // Cap at max octave
        if (octave > MAX_OCTAVE) {
            // Play the max note repeatedly
            const maxNote = `${SCALE[0]}${MAX_OCTAVE}`;
            pianoSynth.triggerAttackRelease(maxNote, '8n');
            return;
        }
        
        const note = `${SCALE[noteIndex]}${octave}`;
        pianoSynth.triggerAttackRelease(note, '8n');
        
        console.log(`🎵 Playing: ${note} (index ${index})`);
        
    } catch (error) {
        console.error('Error playing piano note:', error);
    }
}

/**
 * Play a piano note for negative index (descending from C5)
 * @param {number} reverseIndex - Position from end (0 = last, 1 = second-to-last, ...)
 */
function playPianoNoteNegative(reverseIndex) {
    if (!pianoSynth) return;
    
    try {
        // Descend through scale backwards
        const noteIndex = reverseIndex % SCALE.length;
        const octaveOffset = Math.floor(reverseIndex / SCALE.length);
        const octave = BASE_OCTAVE - octaveOffset;
        
        // Cap at min octave
        if (octave < MIN_OCTAVE) {
            const minNote = `${SCALE[0]}${MIN_OCTAVE}`;
            pianoSynth.triggerAttackRelease(minNote, '8n');
            return;
        }
        
        // Reverse through scale: C, B, A, G, F, E, D
        const reverseNoteIndex = (SCALE.length - noteIndex) % SCALE.length;
        const note = `${SCALE[reverseNoteIndex]}${octave}`;
        pianoSynth.triggerAttackRelease(note, '8n');
        
        console.log(`🎵 Playing (negative): ${note} (reverse index ${reverseIndex})`);
        
    } catch (error) {
        console.error('Error playing negative piano note:', error);
    }
}

/**
 * Calculate highlight duration for element based on speed curve
 * @param {number} index - Element index (0-based)
 * @param {number} totalElements - Total number of elements
 * @returns {number} Highlight duration in seconds
 */
function getHighlightDuration(index, totalElements) {
    const baseHighlight = 2.0;   // First element: 2 seconds highlighted
    const minHighlight = 0.5;    // Minimum highlight: 0.5 seconds
    const decrement = 0.2;       // Decrease by 0.2s per element
    const capAt = 9;             // Cap at index 9 (10th element)
    
    // If beyond cap index, use minimum duration
    if (index >= capAt) {
        return minHighlight;
    }
    
    // Calculate highlight duration with decrement
    const calculatedDuration = baseHighlight - (index * decrement);
    
    // Ensure we never go below minimum
    return Math.max(calculatedDuration, minHighlight);
}

/**
 * Typewriter effect for text
 * @param {HTMLElement} element - Element to apply typewriter to
 * @param {string} text - Text to type
 * @param {number} duration - Total duration in seconds
 * @returns {gsap.core.Timeline} Timeline for the typewriter effect
 */
function typewriterEffect(element, text, duration) {
    const timeline = gsap.timeline();
    const charDelay = duration / text.length;
    
    // Start with empty text
    element.textContent = '';
    
    // Add each character
    for (let i = 0; i < text.length; i++) {
        timeline.call(() => {
            element.textContent = text.substring(0, i + 1);
        }, null, i === 0 ? 0 : `+=${charDelay}`);
    }
    
    return timeline;
}

/**
 * ⭐ NEW M2.5: Table Structure Animation (3 seconds)
 * Animates the table structure appearing with typewriter effects
 * @param {HTMLElement} listContainer - The list container element
 * @param {string} varName - Variable name for typewriter
 * @param {number} itemCount - Number of items (for "N is X")
 * @returns {gsap.core.Timeline} GSAP timeline
 */
function animateTableStructure(listContainer, varName, itemCount) {
    const timeline = gsap.timeline();
    
    const header = listContainer.querySelector('.list-header');
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const thead = listContainer.querySelector('thead');
    const nameSection = listContainer.querySelector('.list-name-section');
    const countSection = listContainer.querySelector('.list-count-section');
    const controls = listContainer.querySelector('.list-controls');
    const indexHeader = listContainer.querySelector('.list-header-index');
    const contentHeader = listContainer.querySelector('.list-header-content');
    
    // ============ PHASE 1: Box Outline (0-1s) ============
    // Play pencil-write sound
    timeline.call(() => {
        if (pencilWriteSound) {
            pencilWriteSound.currentTime = 0;
            pencilWriteSound.play().catch(e => console.warn('Sound play failed:', e));
        }
    });
    
    // Animate container appearing (box outline)
    timeline.fromTo(listContainer,
        { 
            opacity: 0, 
            scale: 0.8,
            borderWidth: 0
        },
        { 
            opacity: 1, 
            scale: 1,
            borderWidth: '3px',
            duration: 1.0,
            ease: 'power2.out'
        }
    );
    
    // Show header background
    timeline.fromTo(header,
        { opacity: 0 },
        { opacity: 1, duration: 0.5 },
        '-=0.5'
    );
    
    // ============ PHASE 2: Variable Name (1-2s) ============
    // Typewriter effect for variable name
    timeline.call(() => {
        const mainName = nameSection.querySelector('.list-main-name');
        if (mainName) {
            const typewriterTimeline = typewriterEffect(mainName, varName, 1.0);
            timeline.add(typewriterTimeline, '>');
        }
    });
    
    // Show count section
    timeline.fromTo(countSection,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.3 },
        '-=0.3'
    );
    
    // Show controls
    timeline.fromTo(controls,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.3 },
        '<'
    );
    
    // ============ PHASE 3: Column Headers (2-3s) ============
    // Show table wrapper
    timeline.to(tableWrapper, { 
        opacity: 1, 
        duration: 0.3 
    });
    
    // Show thead background
    timeline.fromTo(thead,
        { opacity: 0 },
        { opacity: 1, duration: 0.3 },
        '<'
    );
    
    // Typewriter for "Index" header
    timeline.call(() => {
        if (indexHeader) {
            const typewriterTimeline = typewriterEffect(indexHeader, 'Index', 0.5);
            timeline.add(typewriterTimeline, '>');
        }
    });
    
    // Typewriter for "Content" header
    timeline.call(() => {
        if (contentHeader) {
            const typewriterTimeline = typewriterEffect(contentHeader, 'Content', 0.5);
            timeline.add(typewriterTimeline, '<');
        }
    });
    
    return timeline;
}

/**
 * ⭐ REVISED M3&4: List Creation with Highlight Duration + Piano Sounds
 * Animates list creation with staggered row appearance
 * Each row: FADE IN + SOUND + HIGHLIGHT for duration (2.0s → 1.8s → 1.6s...)
 * CRITICAL: Only ONE row highlighted at a time
 * 
 * @param {HTMLElement} listContainer - The list container element
 * @param {Array} items - Array of item values
 * @param {Function} onComplete - Callback when animation finishes
 * @returns {gsap.core.Timeline} GSAP timeline for reversal
 */
export function animateListCreation(listContainer, items, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    // Get variable name for typewriter
    const varName = listContainer.dataset.varName || 'list';
    const itemCount = items.length;
    
    // ============ M2.5: Table Structure Animation (3s) ============
    const structureTimeline = animateTableStructure(listContainer, varName, itemCount);
    timeline.add(structureTimeline);
    
    // ============ M3&4: Row Animations ============
    // HARD WAIT: guarantees nothing happens for 3.5s
    timeline.to({}, { duration: 3.5 });

    
    const rows = listContainer.querySelectorAll('.list-row');
    let previousRow = null;
    
    rows.forEach((row, index) => {
        // Calculate highlight duration for this row
        const highlightDuration = getHighlightDuration(index, items.length);
        
        // ============ STEP 1: Fade in + Sound ============
        // Play piano note
        timeline.call(() => {
            playPianoNote(index);
        });
        
        // Fade in the row
        timeline.fromTo(row,
            {
                opacity: 0,
                y: 10,
                scale: 0.95
            },
            {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: 0.2,
                ease: "power2.out"
            },
            '<' // Start with sound
        );
        
        // ============ STEP 2: Remove previous highlight (if exists) ============
        if (previousRow) {
            timeline.to(previousRow, {
                backgroundColor: '',
                duration: 0.15
            }, '<'); // Unhighlight previous row as new row appears
        }
        
        // ============ STEP 3: Highlight current row ============
        timeline.to(row, {
            backgroundColor: '#fff7ae',
            duration: 0.1
        }, '<+=0.05'); // Slight delay for smoothness
        
        // ============ STEP 4: Scroll to view ============
        timeline.call(() => {
            row.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest' 
            });
        }, null, '<');
        
        // ============ STEP 5: Hold highlight for duration ============
        // The highlight stays for the calculated duration (2.0s, 1.8s, 1.6s...)
        timeline.to({}, { duration: highlightDuration });
        
        // Track this row as the previous row for next iteration
        previousRow = row;
    });
    
    // ============ STEP 6: Remove final row's highlight ============
    if (previousRow) {
        timeline.to(previousRow, {
            backgroundColor: '',
            duration: 0.15
        });
    }
    
    return timeline;
}

/**
 * ⭐ REVISED M2: Fast Back Button (0.3-1s total)
 * Reverses list creation animation - ENTIRE LIST disappears in 0.3-1 second
 * @param {HTMLElement} listContainer - The list container element
 * @param {Function} onComplete - Callback when animation finishes
 * @returns {gsap.core.Timeline} GSAP timeline
 */
export function reverseListCreation(listContainer, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            listContainer.remove();
            if (onComplete) onComplete();
        }
    });
    
    const rows = listContainer.querySelectorAll('.list-row');
    const rowCount = rows.length;
    
    // Calculate stagger for even distribution within 0.5s total
    const totalDuration = 0.5; // 0.5 seconds for entire animation
    const staggerDelay = rowCount > 1 ? totalDuration / rowCount : 0;
    
    // Fade out rows bottom-to-top with very fast stagger
    const reversedRows = Array.from(rows).reverse();
    
    timeline.to(reversedRows, {
        opacity: 0,
        y: -15,
        scale: 0.9,
        duration: 0.2,
        stagger: staggerDelay,
        ease: "power2.in"
    });
    
    // Fade out entire container
    timeline.to(listContainer, {
        opacity: 0,
        scale: 0.85,
        duration: 0.3
    }, '-=0.2');
    
    return timeline;
}

/**
 * ⭐ M5: Index Column Toggle Animation
 * Stores ending note and reverses for negative mode
 * Instant cut if toggled during animation
 * 
 * @param {HTMLElement} listContainer - The list container element
 * @param {string} newMode - 'positive' or 'negative'
 * @param {number} itemCount - Number of items in list
 * @param {Function} onComplete - Callback when animation finishes
 * @returns {gsap.core.Timeline} GSAP timeline
 */

// Track current toggle animation for instant cut
let currentToggleTimeline = null;

export function animateIndexToggle(listContainer, newMode, itemCount, onComplete) {
    // ⭐ CRITICAL: Instant cut if animation in progress
    if (currentToggleTimeline && currentToggleTimeline.isActive()) {
        currentToggleTimeline.kill();
        currentToggleTimeline = null;
    }
    
    const timeline = gsap.timeline({
        onComplete: () => {
            currentToggleTimeline = null;
            if (onComplete) onComplete();
        }
    });
    
    currentToggleTimeline = timeline;
    
    const indexCells = listContainer.querySelectorAll('.list-index-cell');
    const toggleButton = listContainer.querySelector('.list-index-toggle');
    
    // ============ STEP 1: Button Feedback (Simple) ============
    if (toggleButton) {
        timeline.to(toggleButton, {
            scale: 1.15,
            duration: 0.1,
            ease: 'back.out(2)'
        });
        
        timeline.to(toggleButton, {
            scale: 1,
            duration: 0.1
        }, '+=0.05');
    }
    
    // ============ STEP 2: Fade Out Index Cells (Simultaneously) ============
    timeline.to(indexCells, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in'
    }, '<'); // Start with button animation
    
    // ============ STEP 3: Update Index Values (During Fade) ============
    timeline.call(() => {
        indexCells.forEach((cell, index) => {
            if (newMode === 'positive') {
                cell.textContent = index;
            } else {
                const negativeIndex = -(itemCount - index);
                cell.textContent = negativeIndex;
            }
        });
    });
    
    // ============ STEP 4: Rebuild with Reversed Notes ============
    
    // Store ending note from creation (last note played during list creation)
    // Formula: ending note = note for (itemCount - 1)
    const endingNoteIndex = (itemCount - 1) % SCALE.length;
    const endingOctaveOffset = Math.floor((itemCount - 1) / SCALE.length);
    const endingOctave = Math.min(BASE_OCTAVE + endingOctaveOffset, MAX_OCTAVE);
    
    if (newMode === 'negative') {
        // ⭐ NEGATIVE: Bottom-to-top, REVERSE notes (ending → C5)
        const reversedCells = Array.from(indexCells).reverse();
        
        reversedCells.forEach((cell, reverseIndex) => {
            // Calculate reverse note: go backwards from ending note to C5
            const noteOffset = reverseIndex;
            let currentNoteIndex = endingNoteIndex - noteOffset;
            let currentOctave = endingOctave;
            
            // Handle octave wrapping when going backwards
            while (currentNoteIndex < 0) {
                currentNoteIndex += SCALE.length;
                currentOctave--;
            }
            
            // Don't go below BASE_OCTAVE
            if (currentOctave < BASE_OCTAVE) {
                currentOctave = BASE_OCTAVE;
                currentNoteIndex = 0; // C5
            }
            
            const note = `${SCALE[currentNoteIndex]}${currentOctave}`;
            
            // Fade in with sound
            timeline.call(() => {
                if (pianoSynth) {
                    pianoSynth.triggerAttackRelease(note, '8n');
                    console.log(`🎵 Playing (negative): ${note} (reverse index ${reverseIndex})`);
                }
            }, null, reverseIndex === 0 ? '+=0.1' : '+=0.1');
            
            timeline.to(cell, {
                opacity: 1,
                duration: 0.2,
                ease: 'power2.out'
            }, '<');
            
            // Optional highlight flash
            timeline.to(cell, {
                backgroundColor: '#fff9c4',
                duration: 0.1
            }, '<');
            
            timeline.to(cell, {
                backgroundColor: '',
                duration: 0.1
            });
        });
        
    } else {
        // ⭐ POSITIVE: Top-to-bottom, FORWARD notes (C5 → ending)
        indexCells.forEach((cell, index) => {
            // Play piano note (same as list creation)
            timeline.call(() => {
                playPianoNote(index);
            }, null, index === 0 ? '+=0.1' : '+=0.1');
            
            timeline.to(cell, {
                opacity: 1,
                duration: 0.2,
                ease: 'power2.out'
            }, '<');
            
            // Optional highlight flash
            timeline.to(cell, {
                backgroundColor: '#fff9c4',
                duration: 0.1
            }, '<');
            
            timeline.to(cell, {
                backgroundColor: '',
                duration: 0.1
            });
        });
    }
    
    return timeline;
}

/**
 * Placeholder for print animations - Milestone 6
 */
export function animatePrintList(listContainer, outputPanel) {
    console.log('Print animation - Milestone 6');
}

/**
 * ⭐ M6B: Print Single Element Animation
 * Blinks row twice, extracts content, flies to output panel
 * 
 * @param {HTMLElement} listContainer - The list container element
 * @param {number} index - Index of element to print
 * @param {HTMLElement} outputPanel - Output panel element
 * @param {string} value - The value being printed (for display)
 * @param {Function} onComplete - Callback when animation finishes
 * @returns {gsap.core.Timeline} GSAP timeline
 */
export function animatePrintElement(listContainer, index, outputPanel, value, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    const rows = listContainer.querySelectorAll('.list-row');
    const targetRow = rows[index];
    
    if (!targetRow) {
        console.error(`Row at index ${index} not found`);
        if (onComplete) onComplete();
        return timeline;
    }
    
    const contentCell = targetRow.querySelector('.list-content-cell');
    
    // Get the piano note for this index
    const noteIndex = index % SCALE.length;
    const octaveOffset = Math.floor(index / SCALE.length);
    const octave = Math.min(BASE_OCTAVE + octaveOffset, MAX_OCTAVE);
    const note = `${SCALE[noteIndex]}${octave}`;
    
    // ============ STEP 1: Blink Row Twice (0.6s total) ============
    
    // Blink 1 - Sound at START
    timeline.call(() => {
        if (pianoSynth) {
            pianoSynth.triggerAttackRelease(note, '8n');
            console.log(`🎵 Playing: ${note} for print(index ${index}) - Blink 1`);
        }
    });
    
    timeline.to(targetRow, {
        backgroundColor: '#57f800',
        duration: 0.15,
        ease: 'power2.out'
    }, '<');
    
    timeline.to(targetRow, {
        backgroundColor: '',
        duration: 0.15,
        ease: 'power2.in'
    });
    
    // Blink 2 - Sound at START
    timeline.call(() => {
        if (pianoSynth) {
            pianoSynth.triggerAttackRelease(note, '8n');
            console.log(`🎵 Playing: ${note} for print(index ${index}) - Blink 2`);
        }
    });
    
    timeline.to(targetRow, {
        backgroundColor: '#57f800',
        duration: 0.15,
        ease: 'power2.out'
    }, '<');
    
    timeline.to(targetRow, {
        backgroundColor: '',
        duration: 0.15,
        ease: 'power2.in'
    });
    
    // ============ STEP 2: Extract Element (0.2s) ============
    
    // Get position of content cell
    const cellRect = contentCell.getBoundingClientRect();
    const outputRect = outputPanel.getBoundingClientRect();
    
    // Create flying element (1×1 div with value)
    const flyingElement = document.createElement('div');
    flyingElement.className = 'flying-element';
    flyingElement.textContent = value;
    flyingElement.style.position = 'fixed';
    flyingElement.style.left = `${cellRect.left}px`;
    flyingElement.style.top = `${cellRect.top}px`;
    flyingElement.style.width = `${cellRect.width}px`;
    flyingElement.style.height = `${cellRect.height}px`;
    flyingElement.style.backgroundColor = '#e8f5e9';
    flyingElement.style.border = '2px solid #4caf50';
    flyingElement.style.borderRadius = '8px';
    flyingElement.style.padding = '8px';
    flyingElement.style.fontFamily = "'Courier New', monospace";
    flyingElement.style.fontSize = '16px';
    flyingElement.style.color = '#1b5e20';
    flyingElement.style.display = 'flex';
    flyingElement.style.alignItems = 'center';
    flyingElement.style.justifyContent = 'center';
    flyingElement.style.zIndex = '10000';
    flyingElement.style.boxShadow = '0 4px 15px rgba(76, 175, 80, 0.4)';
    flyingElement.style.opacity = '0';
    
    document.body.appendChild(flyingElement);
    
    // Fade in the flying element
    timeline.to(flyingElement, {
        opacity: 1,
        duration: 0.2,
        ease: 'power2.out'
    });
    
    // ============ STEP 3: Fly to Output Panel (0.5s) ============
    
    // Play whoosh sound
    timeline.call(() => {
        const whooshSound = new Audio('../sounds/whoosh.wav');
        whooshSound.volume = 0.5;
        whooshSound.play().catch(e => console.warn('Whoosh sound failed:', e));
    });
    
    // Calculate target position - find the last output line (the one we just created)
    const outputLines = outputPanel.querySelectorAll('.output-line');
    const targetLine = outputLines[outputLines.length - 1]; // Get the last line
    
    let targetX, targetY;
    
    if (targetLine) {
        // Land exactly on top of the output text line
        const lineRect = targetLine.getBoundingClientRect();
        targetX = lineRect.left;
        targetY = lineRect.top;
    } else {
        // Fallback: use output panel position
        targetX = outputRect.left + 20;
        targetY = outputRect.top + 20;
    }
    
    // Fly with ease-out curve
    timeline.to(flyingElement, {
        left: targetX,
        top: targetY,
        duration: 0.5,
        ease: 'power2.out'
    }, '<');
    
    // Add sparkle trail effect
    timeline.call(() => {
        createSparkleTrail(flyingElement, 0.5);
    }, null, '<');
    
    // ============ STEP 4: Fade Out (0.3s) ============
    // The text already exists in output panel, so just fade out the flying element
    
    timeline.to(flyingElement, {
        opacity: 0,
        scale: 0.8,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
            flyingElement.remove();
        }
    });
    
    return timeline;
}
/* ===================================
   M6A & M6C - NEW ANIMATION FUNCTIONS
   Add these to listAnimations.js after M6B (line 753)
   =================================== */

/**
 * ⭐ M6A: Print Entire List Animation
 * Creates overlay on content column, morphs it to horizontal strip, flies to output
 * 
 * @param {HTMLElement} listContainer - The list container element
 * @param {Array} items - Array of item values
 * @param {HTMLElement} outputPanel - Output panel element
 * @param {Function} onComplete - Callback when animation finishes
 * @returns {gsap.core.Timeline} GSAP timeline
 */
export function animatePrintEntireList(listContainer, items, outputPanel, onComplete) {
    // ✅ FIX: Create overlay BEFORE timeline starts
    const overlay = createContentOverlay(listContainer, items);
    if (!overlay) {
        console.error('Failed to create overlay');
        if (onComplete) onComplete();
        return gsap.timeline();
    }
    document.body.appendChild(overlay);
    
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    // ============ PHASE 1: FADE IN OVERLAY (0.0s - 0.3s) ============
    
    timeline.to(overlay, {
        opacity: 1,
        duration: 0.3,
        ease: 'power2.out'
    }, 0);
    
    // ============ PHASE 2: WHOOSH + MORPH + FLY (0.3s - 1.2s) ============
    
    // Play whoosh sound
    timeline.call(() => {
        const whooshSound = new Audio('../sounds/whoosh.wav');
        whooshSound.volume = 0.5;
        whooshSound.play().catch(e => console.warn('Whoosh sound failed:', e));
    }, null, 0.3);
    
    // Get output target position
    const outputRect = outputPanel.getBoundingClientRect();
    const outputLines = outputPanel.querySelectorAll('.output-line');
    const targetLine = outputLines[outputLines.length - 1];
    
    let targetX, targetY;
    if (targetLine) {
        const lineRect = targetLine.getBoundingClientRect();
        targetX = lineRect.left;
        targetY = lineRect.top;
    } else {
        targetX = outputRect.left + 20;
        targetY = outputRect.top + 20;
    }
    
    // Change overlay to horizontal layout (morph during flight)
    timeline.call(() => {
        overlay.classList.add('morphing');
    }, null, 0.3);
    
    // Morph + fly animation
    timeline.to(overlay, {
        // Position
        left: targetX,
        top: targetY,
        
        // Morph dimensions (vertical → horizontal)
        width: 'auto',
        height: '40px',
        
        // Transform during flight
        scaleY: 0.8,
        scaleX: 1.2,
        rotation: -3,
        
        duration: 0.9,
        ease: 'power2.inOut'
    }, 0.3);
    
    // NOTE: createSparkleTrail already exists in listAnimations.js (line 760)
    // Only add trail if the function is available
    timeline.call(() => {
        if (typeof createSparkleTrail === 'function') {
            createSparkleTrail(overlay, 0.9);
        }
    }, null, 0.3);
    
    // ============ PHASE 3: LAND (1.2s - 1.5s) ============
    
    timeline.to(overlay, {
        rotation: 0,
        scale: 1,
        duration: 0.3,
        ease: 'bounce.out'
    }, 1.2);
    
    // ============ PHASE 4: DISSOLVE (1.5s - 2.0s) ============
    
    timeline.to(overlay, {
        opacity: 0,
        scale: 0.95,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => {
            overlay.remove();
        }
    }, 1.5);
    
    return timeline;
}

/**
 * Creates content overlay positioned over Content column
 * @param {HTMLElement} listContainer - List container
 * @param {Array} items - List items
 * @returns {HTMLElement} Overlay element
 */
function createContentOverlay(listContainer, items) {
    const contentCells = listContainer.querySelectorAll('.list-content-cell');
    
    if (contentCells.length === 0) {
        console.error('No content cells found');
        return null;
    }
    
    // Calculate bounding box of all content cells
    const firstCell = contentCells[0];
    const lastCell = contentCells[contentCells.length - 1];
    
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();
    
    const top = firstRect.top;
    const left = firstRect.left;
    const width = firstRect.width;
    const height = lastRect.bottom - firstRect.top;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'content-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.zIndex = '10000';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    
    // Ensure items is an array
    const itemsArray = Array.isArray(items) ? items : [];
    
    // Populate with items (vertical stack initially)
    if (itemsArray.length === 0) {
        // Empty list
        overlay.innerHTML = '<div class="overlay-item">[]</div>';
    } else {
        overlay.innerHTML = itemsArray.map(item => {
            // Format item (preserve quotes for strings)
            let displayValue = String(item);
            
            // Add quotes if it's a string (not a number or boolean)
            if (typeof item === 'string' && !item.match(/^-?\d+$/) && item !== 'True' && item !== 'False') {
                displayValue = `"${item}"`;
            }
            
            return `<div class="overlay-item">${displayValue}</div>`;
        }).join('');
    }
    
    return overlay;
}

/**
 * ⭐ M6C: Print Invalid Index Error Animation
 * Rapid search → double red blink → shake + error flight
 * 
 * @param {HTMLElement} listContainer - The list container element
 * @param {number} requestedIndex - Index that was requested
 * @param {number} validIndexCount - Actual number of elements
 * @param {HTMLElement} outputPanel - Output panel element
 * @param {Function} onComplete - Callback when animation finishes
 * @returns {gsap.core.Timeline} GSAP timeline
 */
export function animatePrintInvalidIndex(listContainer, requestedIndex, validIndexCount, outputPanel, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    const rows = listContainer.querySelectorAll('.list-row');
    
    // ═══════════════════════════════════════════════════
    // STEP 1: RAPID SEARCH (0.0s - 0.5s)
    // ═══════════════════════════════════════════════════
    
    const searchNotes = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5'];
    const noteDelay = 0.05; // 2× faster than normal (0.1s → 0.05s)
    
    rows.forEach((row, index) => {
        const startTime = index * noteDelay;
        
        // Play note
        timeline.call(() => {
            if (pianoSynth) {
                const note = searchNotes[index % searchNotes.length];
                pianoSynth.triggerAttackRelease(note, '16n'); // Shorter duration
            }
        }, null, startTime);
        
        // Flash index cell (fast)
        const indexCell = row.querySelector('.list-index-cell');
        timeline.to(indexCell, {
            backgroundColor: '#ddff00',
            duration: 0.025,
            ease: 'none'
        }, startTime);
        
        timeline.to(indexCell, {
            backgroundColor: '',
            duration: 0.025,
            ease: 'none'
        }, startTime + 0.025);
    });
    
    // ═══════════════════════════════════════════════════
    // STEP 2: ERROR DISCOVERY - DOUBLE RED BLINK (0.5s - 1.1s)
    // ═══════════════════════════════════════════════════
    
    // Error chords - diminished then augmented
    const errorChord1 = ['C5', 'Eb5', 'Gb5', 'A5'];  // Diminished 7th
    const errorChord2 = ['C5', 'E5', 'G#5'];         // Augmented triad
    
    // FIRST BLINK (0.5s - 0.7s)
    timeline.call(() => {
        playErrorChord(errorChord1);
    }, null, 0.5);
    
    timeline.to(rows, {
        backgroundColor: '#ff0000',
        duration: 0.1,
        stagger: 0,
        ease: 'power2.out'
    }, 0.5);
    
    timeline.to(rows, {
        backgroundColor: '',
        duration: 0.1,
        stagger: 0,
        ease: 'power2.in'
    }, 0.6);
    
    // SECOND BLINK (0.8s - 1.0s)
    timeline.call(() => {
        playErrorChord(errorChord2);
    }, null, 0.8);
    
    timeline.to(rows, {
        backgroundColor: '#f40000',
        duration: 0.1,
        stagger: 0,
        ease: 'power2.out'
    }, 0.8);
    
    timeline.to(rows, {
        backgroundColor: '',
        duration: 0.1,
        stagger: 0,
        ease: 'power2.in'
    }, 0.9);
    
    // ═══════════════════════════════════════════════════
    // STEP 3: SHAKE TABLE + ERROR FLIGHT (1.1s - 2.2s)
    // ═══════════════════════════════════════════════════
    
    // CRITICAL: Reset any transformations before shake
    timeline.to(listContainer, {
        x: 0,
        y: 0,
        duration: 0.05,
        ease: 'none'
    }, 1.1);
    
    // Shake animation (1.15s - 1.55s) - ±10px horizontal + slight vertical
    timeline.to(listContainer, {
        x: -10,
        y: 2,
        duration: 0.05,
        repeat: 7,
        yoyo: true,
        ease: 'power1.inOut'
    }, 1.15);
    
    // Return to original position with elastic
    timeline.to(listContainer, {
        x: 0,
        y: 0,
        duration: 0.15,
        ease: 'elastic.out(1, 0.3)'
    }, 1.55);
    
    // Create error message (friendly format if index is simple)
    let errorMsg;
    if (Math.abs(requestedIndex) < 1000) {
        errorMsg = `Error: Index ${requestedIndex} doesn't exist (list has ${validIndexCount} items)`;
    } else {
        errorMsg = `IndexError: list index out of range`;
    }
    
    // Create error spark (1.7s)
    timeline.call(() => {
        const spark = createErrorSpark(errorMsg);
        
        // Position at table center
        const tableRect = listContainer.getBoundingClientRect();
        spark.style.left = `${tableRect.left + tableRect.width / 2 - 100}px`;
        spark.style.top = `${tableRect.top + tableRect.height / 2}px`;
        
        document.body.appendChild(spark);
    }, null, 1.7);
    
    // Fly error to output (1.7s - 2.2s)
    const outputRect = outputPanel.getBoundingClientRect();
    const outputLines = outputPanel.querySelectorAll('.output-line');
    const targetLine = outputLines[outputLines.length - 1];
    
    let targetX = outputRect.left + 20;
    let targetY = outputRect.top + 20;
    
    if (targetLine) {
        const lineRect = targetLine.getBoundingClientRect();
        targetX = lineRect.left;
        targetY = lineRect.top;
    }
    
    timeline.to('.error-spark', {
        left: targetX,
        top: targetY,
        scale: 1.1,
        duration: 0.5,
        ease: 'power2.out'
    }, 1.7);
    
    // Add sparkle trail (red)
    timeline.call(() => {
        const spark = document.querySelector('.error-spark');
        if (spark) {
            createErrorTrail(spark, 0.5);
        }
    }, null, 1.7);
    
    // Fade out spark (2.2s)
    timeline.to('.error-spark', {
        opacity: 0,
        scale: 0.9,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
            document.querySelector('.error-spark')?.remove();
        }
    }, 2.2);
    
    return timeline;
}

/**
 * Play error chord (multiple notes simultaneously)
 * @param {Array} notes - Array of note strings
 */
function playErrorChord(notes) {
    if (typeof Tone === 'undefined' || !pianoSynth) return;
    
    try {
        // Create polyphonic synth for chord
        const chordSynth = new Tone.PolySynth(Tone.Synth).toDestination();
        chordSynth.volume.value = -8; // Slightly quieter
        chordSynth.triggerAttackRelease(notes, '8n');
    } catch (error) {
        console.warn('Error playing chord:', error);
    }
}

/**
 * Create error spark element
 * @param {string} errorMsg - Error message text
 * @returns {HTMLElement} Error spark element
 */
function createErrorSpark(errorMsg) {
    const spark = document.createElement('div');
    spark.className = 'error-spark';
    spark.textContent = errorMsg;
    
    // Styling
    spark.style.position = 'fixed';
    spark.style.background = 'linear-gradient(135deg, #ff5252 0%, #d32f2f 100%)';
    spark.style.color = 'white';
    spark.style.padding = '8px 16px';
    spark.style.borderRadius = '8px';
    spark.style.fontFamily = "'Courier New', monospace";
    spark.style.fontWeight = 'bold';
    spark.style.fontSize = '14px';
    spark.style.zIndex = '10000';
    spark.style.boxShadow = '0 0 20px rgba(255, 82, 82, 0.9)';
    spark.style.border = '2px solid #d32f2f';
    spark.style.whiteSpace = 'nowrap';
    spark.style.pointerEvents = 'none';
    spark.style.opacity = '1';
    
    return spark;
}

/**
 * Create red sparkle trail for error spark
 * @param {HTMLElement} element - Element to trail
 * @param {number} duration - Duration in seconds
 */
function createErrorTrail(element, duration) {
    const trailCount = 8;
    const interval = (duration * 1000) / trailCount;
    
    let sparkleIndex = 0;
    const sparkleInterval = setInterval(() => {
        if (sparkleIndex >= trailCount) {
            clearInterval(sparkleInterval);
            return;
        }
        
        const rect = element.getBoundingClientRect();
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle-particle error';
        sparkle.style.position = 'fixed';
        sparkle.style.left = `${rect.left + rect.width / 2}px`;
        sparkle.style.top = `${rect.top + rect.height / 2}px`;
        sparkle.style.width = '8px';
        sparkle.style.height = '8px';
        sparkle.style.backgroundColor = '#ff5252';
        sparkle.style.borderRadius = '50%';
        sparkle.style.zIndex = '9999';
        sparkle.style.pointerEvents = 'none';
        sparkle.style.boxShadow = '0 0 10px #ff5252';
        
        document.body.appendChild(sparkle);
        
        // Fade out and remove
        gsap.to(sparkle, {
            opacity: 0,
            scale: 0,
            duration: 0.5,
            ease: 'power2.out',
            onComplete: () => sparkle.remove()
        });
        
        sparkleIndex++;
    }, interval);
}
/* ===================================
   M8 - Shallow Copy Animation
   Add to listAnimations.js after M6C
   =================================== */

/**
 * ⭐ M8: Animate Shallow Copy (Alias Creation)
 * Updates existing table header to show multiple variable names pointing to same list
 * 
 * @param {HTMLElement} listContainer - The existing list container
 * @param {string} newAliasName - Name of new alias variable
 * @param {Array<string>} existingAliases - Array of existing variable names (including original)
 * @param {Function} onComplete - Callback when animation finishes
 * @returns {gsap.core.Timeline} GSAP timeline
 */
export function animateShallowCopy(listContainer, newAliasName, existingAliases, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => {
            if (onComplete) onComplete();
        }
    });
    
    const header = listContainer.querySelector('.list-header');
    const nameSection = listContainer.querySelector('.list-name-section');
    
    // ════════════════════════════════════════════════════
    // PHASE 1: Glow Animation (0.0s - 0.8s)
    // ════════════════════════════════════════════════════
    
    // Golden glow to indicate "connection being made"
    timeline.to(header, {
        boxShadow: '0 0 25px rgba(255, 193, 7, 0.9)',
        duration: 0.4,
        ease: 'power2.out'
    }, 0);
    
    timeline.to(header, {
        boxShadow: '0 0 0px rgba(255, 193, 7, 0)',
        duration: 0.4,
        ease: 'power2.in'
    }, 0.4);
    
    // Play connection sound
    timeline.call(() => {
        playConnectionSound();
    }, null, 0);
    
    // ════════════════════════════════════════════════════
    // PHASE 2: Update Header with New Alias (0.8s - 2.0s)
    // ════════════════════════════════════════════════════
    
    // Store reference to new element for animation
    let newElement = null;
    
    timeline.call(() => {
        newElement = updateHeaderWithAlias(listContainer, newAliasName, existingAliases);
    }, null, 0.8);
    
    // Animate new alias appearing (use callback to ensure element exists)
    timeline.call(() => {
        if (newElement) {
            gsap.fromTo(newElement, 
                { opacity: 0, x: -10 },
                { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' }
            );
        }
    }, null, 0.8);
    
    // ════════════════════════════════════════════════════
    // PHASE 3: Teacher Explanation (2.0s - 5.0s)
    // ════════════════════════════════════════════════════
    
    timeline.call(() => {
        showShallowCopyExplanation(newAliasName, existingAliases);
    }, null, 2.0);
    
    return timeline;
}

/**
 * Updates header to show all aliases (handles multi-alias scenario)
 * @param {HTMLElement} listContainer - List container
 * @param {string} newAlias - New alias name being added
 * @param {Array<string>} existingAliases - Existing variable names
 * @returns {HTMLElement} The newly created element (for animation)
 */
function updateHeaderWithAlias(listContainer, newAlias, existingAliases) {
    const nameSection = listContainer.querySelector('.list-name-section');
    
    // Clear current content
    nameSection.innerHTML = '';
    
    // Combine all aliases (existing + new)
    const allAliases = [...existingAliases, newAlias];
    
    // Store all aliases in dataset for future reference
    listContainer.dataset.aliases = JSON.stringify(allAliases);
    
    let newElement = null;
    
    // ════════════════════════════════════════════════════
    // MULTI-ALIAS HANDLING
    // ════════════════════════════════════════════════════
    
    if (allAliases.length <= 3) {
        // ✅ INLINE MODE: Show all names (2-3 aliases)
        const mainName = document.createElement('span');
        mainName.className = 'list-main-name';
        mainName.textContent = allAliases.join(', ');
        nameSection.appendChild(mainName);
        
        // Add arrow indicator
        const arrow = document.createElement('span');
        arrow.className = 'list-alias-arrow';
        arrow.textContent = ' ↗';
        arrow.title = 'These variables all point to the same list';
        arrow.style.opacity = '0'; // Start hidden for animation
        nameSection.appendChild(arrow);
        
        newElement = arrow; // Return arrow for animation
        
    } else {
        // ✅ COMPACT MODE: Show "name1 +N more" (4+ aliases)
        const mainName = document.createElement('span');
        mainName.className = 'list-main-name';
        mainName.textContent = allAliases[0]; // Show first name
        nameSection.appendChild(mainName);
        
        // Add "+N more" badge
        const moreBadge = document.createElement('span');
        moreBadge.className = 'list-alias-more';
        moreBadge.textContent = ` +${allAliases.length - 1} more`;
        moreBadge.title = `All aliases: ${allAliases.join(', ')}`;
        moreBadge.style.opacity = '0'; // Start hidden for animation
        
        // Add info icon
        const infoIcon = document.createElement('span');
        infoIcon.className = 'list-alias-info';
        infoIcon.textContent = ' ⓘ';
        moreBadge.appendChild(infoIcon);
        
        nameSection.appendChild(moreBadge);
        
        // Add arrow
        const arrow = document.createElement('span');
        arrow.className = 'list-alias-arrow';
        arrow.textContent = ' ↗';
        nameSection.appendChild(arrow);
        
        // Add hover tooltip for full list
        createAliasTooltip(moreBadge, allAliases);
        
        newElement = moreBadge; // Return badge for animation
    }
    
    return newElement;
}

/**
 * Creates tooltip showing all alias names
 * @param {HTMLElement} element - Element to attach tooltip to
 * @param {Array<string>} aliases - All alias names
 */
function createAliasTooltip(element, aliases) {
    let tooltip = null;
    
    element.addEventListener('mouseenter', () => {
        tooltip = document.createElement('div');
        tooltip.className = 'alias-tooltip';
        tooltip.innerHTML = `
            <strong>All aliases:</strong><br>
            ${aliases.map(name => `• ${name}`).join('<br>')}
        `;
        
        const rect = element.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;
        
        document.body.appendChild(tooltip);
        
        // Fade in
        gsap.fromTo(tooltip, 
            { opacity: 0, y: -5 },
            { opacity: 1, y: 0, duration: 0.2 }
        );
    });
    
    element.addEventListener('mouseleave', () => {
        if (tooltip) {
            gsap.to(tooltip, {
                opacity: 0,
                duration: 0.2,
                onComplete: () => tooltip.remove()
            });
        }
    });
}

/**
 * Shows teacher explanation for shallow copy
 * @param {string} newAlias - New alias name
 * @param {Array<string>} existingAliases - Existing names
 */
function showShallowCopyExplanation(newAlias, existingAliases) {
    const teacherBubble = document.getElementById('teacherBubble');
    const teacherText = document.getElementById('teacherText');
    
    if (!teacherBubble || !teacherText) return;
    
    const allNames = [...existingAliases, newAlias];
    
    let message;
    if (allNames.length === 2) {
        message = `<strong>${allNames[0]}</strong> and <strong>${allNames[1]}</strong> both point to the <strong>same list</strong> in memory! Changing one will change the other.`;
    } else {
        message = `All ${allNames.length} variables (<strong>${allNames.join(', ')}</strong>) point to the <strong>same list</strong>! They're aliases, not copies.`;
    }
    
    teacherText.innerHTML = message;
    teacherBubble.classList.add('show');
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
        teacherBubble.classList.remove('show');
    }, 4000);
}

/**
 * Plays connection sound (soft chime)
 */
function playConnectionSound() {
    try {
        // Reuse piano synth for a soft connection chime
        if (pianoSynth) {
            pianoSynth.triggerAttackRelease('E5', '8n');
            setTimeout(() => {
                pianoSynth.triggerAttackRelease('A5', '8n');
            }, 100);
        }
    } catch (error) {
        console.warn('Connection sound failed:', error);
    }
}

/**
 * Helper: Get all current aliases for a list container
 * @param {HTMLElement} listContainer - List container element
 * @returns {Array<string>} Array of alias names
 */
export function getListAliases(listContainer) {
    const aliasesData = listContainer.dataset.aliases;
    if (aliasesData) {
        try {
            return JSON.parse(aliasesData);
        } catch (e) {
            console.warn('Failed to parse aliases:', e);
        }
    }
    
    // Fallback: extract from varName attribute
    const varName = listContainer.dataset.varName;
    return varName ? [varName] : [];
}

/**
 * ⭐ append() ANIMATION — 3-second timeline
 *   t=0.0  green spark appears bottom-left of table
 *   t=0.5  blank row slides in (index only), yellow blink ×2
 *   t=1.5  spark flies into the new row's content cell
 *   t=2.5  spark fades, value text fades in
 *   t=3.0  done → onComplete()
 *
 * @param {HTMLElement} listContainer  – .list-container DOM node
 * @param {string}      newValue       – raw value (quotes added if string)
 * @param {Function}    onComplete     – callback when finished
 * @returns {gsap.core.Timeline}
 */
export function animateAppend(listContainer, newValue, onComplete) {
    const timeline = gsap.timeline({
        onComplete: () => { if (onComplete) onComplete(); }
    });

    const tbody = listContainer.querySelector('.list-table-body');
    const existingRows = listContainer.querySelectorAll('.list-row');
    const newIndex = existingRows.length;

    // Format value
    const displayValue = formatAppendValue(newValue);

    // ─── STEP 1 (NEW): GREEN SPARK appears to LEFT of target index row ───
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const tableRect = tableWrapper.getBoundingClientRect();
    
    // Calculate position: left of the new index row (which doesn't exist yet)
    // Position it where index N would be
    let sparkTop;
    if (existingRows.length === 0) {
        // Empty list - position next to where index 0 would be
        const headerRect = listContainer.querySelector('.list-table thead').getBoundingClientRect();
        sparkTop = headerRect.bottom + 20; // Below header
    } else {
        // Position below last row
        const lastRow = existingRows[existingRows.length - 1];
        const lastRowRect = lastRow.getBoundingClientRect();
        sparkTop = lastRowRect.bottom + 8;
    }
    
    const spark = document.createElement('div');
    spark.textContent = displayValue;
    spark.style.position = 'fixed';
    spark.style.left = `${tableRect.left - 80}px`;  // FIX: To the LEFT of table
    spark.style.top = `${sparkTop}px`;               // FIX: Aligned with new row position
    spark.style.background = '#4ade80';
    spark.style.color = 'white';
    spark.style.padding = '8px 16px';
    spark.style.borderRadius = '8px';
    spark.style.fontFamily = "'Courier New', monospace";
    spark.style.fontWeight = 'bold';
    spark.style.fontSize = '16px';
    spark.style.zIndex = '10001';
    spark.style.boxShadow = '0 0 20px rgba(74, 222, 128, 0.9)';
    spark.style.opacity = '0';
    spark.style.pointerEvents = 'none';
    document.body.appendChild(spark);

    // Spark fade in (t = 0.0)
    timeline.to(spark, { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0);
    
    // STEP 1: PAUSE for 1 second while spark is visible (t = 0.3 → 1.3)
    // This matches the pause in index()/count() for consistency
    
    // ─── STEP 2: BUILD THE NEW ROW (hidden) at t = 1.3 ───
    const newRow = document.createElement('tr');
    newRow.className = 'list-row';
    newRow.dataset.originalIndex = String(newIndex);
    newRow.style.opacity = '0';
    newRow.style.transform = 'translateY(20px)';

    const idxCell = document.createElement('td');
    idxCell.className = 'list-index-cell';
    idxCell.textContent = String(newIndex);

    const contentCell = document.createElement('td');
    contentCell.className = 'list-content-cell';
    // Content stays empty until spark arrives

    newRow.appendChild(idxCell);
    newRow.appendChild(contentCell);
    
    timeline.call(() => {
        tbody.appendChild(newRow);
    }, null, 1.3);

    // ─── STEP 3: ROW SLIDE-IN + YELLOW BLINK ×2 (t = 1.5) ───
    timeline.call(() => {
        try {
            const snd = new Audio('../sounds/append.wav');
            snd.volume = 0.6;
            snd.play().catch(() => {});
        } catch (_) {}
    }, null, 1.5);

    timeline.fromTo(newRow,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)' },
        1.5
    );

    // Blink 1
    timeline.to(newRow, { backgroundColor: '#fff9c4', duration: 0.1 }, 1.95);
    timeline.to(newRow, { backgroundColor: '', duration: 0.1 }, 2.05);
    // Blink 2
    timeline.to(newRow, { backgroundColor: '#fff9c4', duration: 0.1 }, 2.15);
    timeline.to(newRow, { backgroundColor: '', duration: 0.1 }, 2.25);

    // ─── STEP 4: SPARK FLIES FROM LEFT INTO THE ROW (t = 2.5 → 3.5) ───
    timeline.call(() => {
        const cellRect = contentCell.getBoundingClientRect();
        const targetX = cellRect.left + cellRect.width / 2 - 40;
        const targetY = cellRect.top + cellRect.height / 2 - 15;

        // Lighten spark as it flies
        spark.style.background = '#e8f5e9';
        spark.style.color = '#1b5e20';

        gsap.to(spark, {
            left: targetX,
            top: targetY,
            duration: 1.0,
            ease: 'power2.inOut'
        });
    }, null, 2.5);

    // ─── STEP 5: SPARK FADE + TEXT REVEAL (t = 3.5) ───
    timeline.call(() => {
        // Fade spark out
        gsap.to(spark, {
            opacity: 0,
            scale: 0.5,
            duration: 0.5,
            ease: 'power2.in',
            onComplete: () => spark.remove()
        });

        // Insert value and fade in
        const valSpan = document.createElement('span');
        valSpan.className = 'list-value';
        valSpan.textContent = displayValue;
        valSpan.style.opacity = '0';
        contentCell.appendChild(valSpan);

        gsap.to(valSpan, { opacity: 1, duration: 0.5, ease: 'power2.out' });

        // Update N counter
        const countSection = listContainer.querySelector('.list-count-section');
        if (countSection) countSection.textContent = `N is ${newIndex + 1}`;
    }, null, 3.5);

    return timeline;
}


// ─── helper: format value the same way listRenderer does ───
// Helper function (keep this as is)
function formatAppendValue(value) {
    const s = String(value);
    if (!isNaN(s) || s === 'True' || s === 'False') return s;
    if (s === 'None') return 'None';
    return `"${s}"`;
}

export function animatePop(listContainer, index) {
    console.log('Pop animation - Milestone 9');
}

export function animateSort(listContainer, newOrder) {
    console.log('Sort animation - Milestone 9');
}