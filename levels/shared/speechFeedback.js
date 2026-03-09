/* ===================================
   Speech Feedback System
   Provides voice narration for animations
   =================================== */

/**
 * Speaks text using Web Speech API
 * @param {string} text - Text to speak
 * @param {Object} options - Voice options
 */
export function speak(text, options = {}) {
    if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported');
        return;
    }

    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);

    // Default options
    utterance.rate = options.rate || 1.0;
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 0.8;
    utterance.lang = options.lang || 'en-US';

    // Select voice if specified
    if (options.voiceName) {
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voices.find(voice =>
            voice.name.includes(options.voiceName)
        );
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
    }

    window.speechSynthesis.speak(utterance);
}

/**
 * Announces pop operation result
 * @param {boolean} isError - Whether it's an error
 * @param {number|null} targetIndex - Index that was popped
 * @param {string} resultValue - The extracted value
 */
export function announcePopResult(isError, targetIndex, resultValue) {
    if (isError) {
        speak("Index Error", { pitch: 0.8, rate: 0.9 });
    } else if (targetIndex === -1 || targetIndex === null) {
        speak(`Returned last element: ${resultValue}`, { rate: 1.1 });
    } else {
        speak(`Returned element at index ${targetIndex}: ${resultValue}`, { rate: 1.1 });
    }
}

/**
 * Stop all speech
 */
export function stopSpeaking() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}

/**
 * Initialize speech synthesis (load voices)
 * Call this on page load
 */
export function initSpeechSynthesis() {
    if ('speechSynthesis' in window) {
        // Load voices
        window.speechSynthesis.getVoices();

        // Some browsers need this event
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
                console.log('✅ Speech voices loaded');
            };
        }
    }
}
