/**
 * dashboard.js — VerVis Frontend Logic
 *
 * When the webcam starts, the app enters fullscreen mode:
 * - Video fills the entire screen (CSS only — no browser fullscreen API)
 * - Detected gesture appears as a subtitle at the bottom
 * - A stop button exits back to the dashboard
 * * (Text-to-Speech permanently removed for maximum performance)
 */

document.addEventListener("DOMContentLoaded", () => {

  // ─── Local Edge Translation Dictionary (0ms Latency) ──────────
  const GESTURE_DICTIONARY = {
    "fr": {
      "stop": "Arrêt",
      "Hey there!": "Salut !",
      "Good afternoon": "Bon après-midi"
    },
    "sw": {
      "stop": "Simama",
      "Hey there!": "Hujambo!",
      "Good afternoon": "Mchana mwema"
    }
  };

  // ─── Element refs ─────────────────────────────────────────────────────────────
  const micStatus         = document.getElementById("micStatus");
  const transcriptOutput  = document.getElementById("transcriptOutput");

  const speechBtns = [
    document.getElementById("speechToTextBtn"),
    document.getElementById("speechToTextBtnMain"),
  ].filter(Boolean);

  const fullscreenModal    = document.getElementById("fullscreen-text-modal");
  const fullscreenTextP    = document.getElementById("fullscreen-text-p");
  const closeFullscreenBtn = document.getElementById("close-fullscreen-text-btn");

  // ─── Fullscreen text helpers (speech translation only) ───────────────────────
  function showFullscreenText(text) {
    if (fullscreenTextP && fullscreenModal) {
      fullscreenTextP.textContent = text;
      fullscreenModal.style.display = "flex";
    }
  }

  function hideFullscreenText() {
    if (fullscreenModal) fullscreenModal.style.display = "none";
  }

  if (fullscreenModal && closeFullscreenBtn) {
    closeFullscreenBtn.addEventListener("click", hideFullscreenText);
    fullscreenModal.addEventListener("click", (e) => {
      if (e.target === fullscreenModal) hideFullscreenText();
    });
  }

  // ── slOutput state helper ─────────────────────────────────────────────────────
  const slOutput = document.getElementById("slOutput");

  function setSlOutput(text, state = "idle") {
    if (!slOutput) return;
    slOutput.textContent = text;
    slOutput.classList.remove("detecting", "confirmed");
    if (state === "detecting") slOutput.classList.add("detecting");
    if (state === "confirmed") slOutput.classList.add("confirmed");
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Speech Recognition & Translation
  // ═══════════════════════════════════════════════════════════════════════════════

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    if (micStatus) micStatus.textContent = "Speech recognition not supported in this browser.";
  } else {
    const recognition = new SpeechRecognition();
    recognition.continuous     = false;
    recognition.interimResults = true;

    let preferredLanguage  = localStorage.getItem("preferredLanguage")  || "en";
    let responsePreference = localStorage.getItem("responsePreference") || "text";

    window.addEventListener("languageChanged", () => {
      preferredLanguage = localStorage.getItem("preferredLanguage") || "en";
    });
    window.addEventListener("responsePreferenceChanged", () => {
      responsePreference = localStorage.getItem("responsePreference") || "text";
    });

    let isProcessing      = false;
    let recognitionActive = false;

    recognition.onstart = () => {
      recognitionActive = true;
      if (micStatus)        micStatus.textContent       = "Listening... speak now!";
      if (transcriptOutput) transcriptOutput.textContent = "";
    };
    recognition.onend = () => {
      recognitionActive = false;
      if (micStatus) micStatus.textContent = "Click 'Translate to text' to speak again.";
    };
    recognition.onerror = (e) => {
      recognitionActive = false;
      if (micStatus) micStatus.textContent = "Error: " + e.error;
    };

    recognition.onresult = async (event) => {
      let transcript = "";
      let isFinal    = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      if (!isFinal) {
        if (transcriptOutput) transcriptOutput.textContent = transcript + " ⏳";
        return;
      }
      if (isProcessing) return;
      isProcessing = true;

      if (micStatus)        micStatus.textContent       = "Translating...";
      if (transcriptOutput) transcriptOutput.textContent = transcript;
      speechBtns.forEach(btn => (btn.disabled = true));

      try {
        // 🚨 Grab the fresh language setting right before sending
        const currentLang = localStorage.getItem("preferredLanguage") || "en";

        const response = await fetch("/translate", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ 
             text: transcript, 
             target_lang: currentLang 
          }),
        });
        
        const data = await response.json();
        const translatedText = data.translated_text || "No translation available";

        if (responsePreference === "text" || responsePreference === "both") {
          showFullscreenText(translatedText);
        }
      } catch (err) {
        if (transcriptOutput) transcriptOutput.textContent = "Translation error: " + err;
      } finally {
        if (micStatus) micStatus.textContent = "Click 'Translate to text' to speak again.";
        speechBtns.forEach(btn => (btn.disabled = false));
        isProcessing = false;
      }
    }; // <--- THIS WAS THE MISSING BRACKET THAT BROKE YOUR CODE!

    speechBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (!recognitionActive) recognition.start();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Real-time Sign Language (CSS fullscreen + subtitle)
  // ═══════════════════════════════════════════════════════════════════════════════

  const POLL_INTERVAL_MS = 300;
  const CONFIRM_FRAMES   = 1;     // Trigger instantly
  const COOLDOWN_MS      = 1500;  // 1.5 seconds visual lock

  const slBtn                 = document.getElementById("translateSLBtn");
  const slModal               = document.getElementById("slSourceModal");
  const closeModalBtn         = document.getElementById("closeModalBtn");
  const useWebcamBtn          = document.getElementById("useWebcamBtn");

  let fsOverlay    = null;
  let fsVideo      = null;
  let fsSubtitle   = null;
  let fsStopBtn    = null;

  let videoStream      = null;
  let pollTimer        = null;
  let isCoolingDown    = false;
  let isFetchPending   = false;
  let candidateGesture = null;
  let candidateCount   = 0;

  function buildFullscreenUI() {
    if (fsOverlay) return;

    fsOverlay = document.createElement("div");
    fsOverlay.id = "sl-fullscreen";
    fsOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: #000;
      z-index: 500;
      display: none;
    `;

    fsVideo = document.createElement("video");
    fsVideo.autoplay    = true;
    fsVideo.playsInline = true;
    fsVideo.muted       = true;
    fsVideo.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
      transform-origin: center center;
      display: block;
      background: #000;
    `;

    fsSubtitle = document.createElement("div");
    fsSubtitle.id = "sl-subtitle";
    fsSubtitle.style.cssText = `
      position: absolute;
      bottom: 72px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.68);
      color: #fff;
      font-family: 'Syne', 'Georgia', sans-serif;
      font-size: clamp(26px, 5vw, 52px);
      font-weight: 700;
      padding: 10px 36px;
      border-radius: 10px;
      text-align: center;
      white-space: nowrap;
      max-width: 90vw;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
      transition: opacity 0.18s ease;
      pointer-events: none;
      letter-spacing: 0.01em;
    `;

    fsStopBtn = document.createElement("button");
    fsStopBtn.innerHTML = "&#10005;&nbsp; Stop";
    fsStopBtn.style.cssText = `
      position: absolute;
      top: 18px;
      right: 18px;
      background: rgba(220, 50, 80, 0.88);
      color: #fff;
      border: none;
      border-radius: 100px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 22px;
      cursor: pointer;
      z-index: 10;
    `;
    fsStopBtn.addEventListener("click", stopFullscreen);

    fsOverlay.appendChild(fsVideo);
    fsOverlay.appendChild(fsSubtitle);
    fsOverlay.appendChild(fsStopBtn);
    document.body.appendChild(fsOverlay);
  }

  let subtitleTimer = null;

  function showSubtitle(text, state = "detecting") {
    if (!fsSubtitle) return;
    fsSubtitle.textContent = text;

    if (state === "confirmed") {
      fsSubtitle.style.color           = "#00e5a0";
      fsSubtitle.style.background      = "rgba(0,0,0,0.78)";
      fsSubtitle.style.fontSize        = "clamp(36px, 7vw, 68px)";
    } else {
      fsSubtitle.style.color           = "rgba(255,255,255,0.82)";
      fsSubtitle.style.background      = "rgba(0,0,0,0.55)";
      fsSubtitle.style.fontSize        = "clamp(22px, 4vw, 40px)";
    }

    fsSubtitle.style.opacity = "1";

    clearTimeout(subtitleTimer);
    if (state === "detecting") {
      subtitleTimer = setTimeout(() => {
        if (fsSubtitle) fsSubtitle.style.opacity = "0";
      }, 2000);
    }
  }

  function hideSubtitle() {
    clearTimeout(subtitleTimer);
    if (fsSubtitle) fsSubtitle.style.opacity = "0";
  }

  function openFullscreen(stream) {
    buildFullscreenUI();
    fsVideo.srcObject = stream;
    fsOverlay.style.display = "block";
    hideSubtitle();
    fsVideo.play().catch(() => {});
  }

  function stopFullscreen() {
    stopPolling();
    if (fsOverlay)  fsOverlay.style.display = "none";
    if (fsVideo) {
      fsVideo.pause();
      fsVideo.srcObject = null;
    }
    hideSubtitle();

    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }

    candidateGesture = null;
    candidateCount   = 0;
    isCoolingDown    = false;
    isFetchPending   = false;

    setSlOutput("Sign language translation will appear here...", "idle");
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function captureFrame(videoEl) {
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const size = Math.min(videoEl.videoWidth, videoEl.videoHeight, 640);
    canvas.width = size;
    canvas.height = size;

    const startX = (videoEl.videoWidth - size) / 2;
    const startY = (videoEl.videoHeight - size) / 2;

    ctx.drawImage(
      videoEl,
      startX, startY, size, size, 
      0, 0, size, size            
    );

    return canvas.toDataURL("image/jpeg", 0.85);
  }

  if (slBtn)         slBtn.addEventListener("click",         () => { if (slModal) slModal.style.display = "flex"; });
  if (closeModalBtn) closeModalBtn.addEventListener("click", () => { if (slModal) slModal.style.display = "none"; });

  if (useWebcamBtn) {
    useWebcamBtn.addEventListener("click", async () => {
      if (slModal) slModal.style.display = "none";
      setSlOutput("Starting webcam...", "idle");

      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        openFullscreen(videoStream);

        if (fsVideo.readyState >= 2) {
          startRealtimeLoop(fsVideo);
        } else {
          fsVideo.addEventListener("loadeddata", () => startRealtimeLoop(fsVideo), { once: true });
        }

      } catch (err) {
        console.error("Webcam error:", err);
        setSlOutput("Unable to access webcam. Check permissions.", "idle");
      }
    });
  }

  function startRealtimeLoop(videoEl) {
    stopPolling();
    console.log("✅ Fast Real-time loop started!");

    pollTimer = setInterval(async () => {
      if (isCoolingDown || isFetchPending) return;

      const image = captureFrame(videoEl);
      if (!image) return;

      isFetchPending = true;
      let result;

      try {
        const res = await fetch("/predict", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ image }),
        });
        result = await res.json();
      } catch (err) {
        console.error("Predict error:", err);
        isFetchPending = false;
        return;
      }

      isFetchPending = false;

      if (result.error || !result.prediction) {
        return;
      }

      const gesture    = result.prediction;
      const confidence = result.confidence || 0;

      showSubtitle(gesture, "detecting");

      if (confidence < 0.01) {
        return; 
      }

      if (gesture === candidateGesture) {
        candidateCount++;
      } else {
        candidateGesture = gesture;
        candidateCount   = 1;
      }

      // ── Confirmed: TRANSLATE ON THE FLY ─────────────────────────────────────
      if (candidateCount >= CONFIRM_FRAMES) {
        candidateGesture = null;
        candidateCount   = 0;
        isCoolingDown    = true; 

        // 🚨 GET THE CURRENT SETTINGS LANGUAGE
        const currentLang = localStorage.getItem("preferredLanguage") || "en";
        let finalOutput = gesture;

        // ⚡ INSTANT LOCAL TRANSLATION (No API Lag!)
        if (currentLang !== "en" && GESTURE_DICTIONARY[currentLang]) {
            finalOutput = GESTURE_DICTIONARY[currentLang][gesture] || gesture;
        }

        showSubtitle(finalOutput, "confirmed");
        setSlOutput(`✅ ${finalOutput}`, "confirmed");

        setTimeout(() => {
          isCoolingDown = false;
          hideSubtitle();
          setSlOutput("Ready — hold a gesture to translate.", "idle");
        }, COOLDOWN_MS);
      }

    }, POLL_INTERVAL_MS);
  }

  window.addEventListener("beforeunload", stopFullscreen);

});