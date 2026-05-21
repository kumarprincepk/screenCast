const preview = document.getElementById("preview");
const emptyState = document.getElementById("emptyState");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const pauseBtn = document.getElementById("pauseBtn");
const saveBtn = document.getElementById("saveBtn");
const annotationCanvas = document.getElementById("annotationCanvas");
const annotationColor = document.getElementById("annotationColor");
const undoAnnotationBtn = document.getElementById("undoAnnotationBtn");
const clearAnnotationsBtn = document.getElementById("clearAnnotationsBtn");
const applyAnnotationsBtn = document.getElementById("applyAnnotationsBtn");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const timer = document.getElementById("timer");
const fileName = document.getElementById("fileName");
const audioState = document.getElementById("audioState");
const cameraState = document.getElementById("cameraState");
const cameraToggle = document.getElementById("cameraToggle");
const captionState = document.getElementById("captionState");
const captionToggle = document.getElementById("captionToggle");
const liveCaption = document.getElementById("liveCaption");
const transcriptText = document.getElementById("transcriptText");
const saveTranscriptBtn = document.getElementById("saveTranscriptBtn");
const saveCaptionsBtn = document.getElementById("saveCaptionsBtn");
const sharePanel = document.getElementById("sharePanel");
const uploadVideoBtn = document.getElementById("uploadVideoBtn");
const shareVideoBtn = document.getElementById("shareVideoBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const copyEmbedBtn = document.getElementById("copyEmbedBtn");
const copyPackageBtn = document.getElementById("copyPackageBtn");
const uploadEndpoint = document.getElementById("uploadEndpoint");
const embedCode = document.getElementById("embedCode");
const message = document.getElementById("message");

let mediaRecorder = null;
let stream = null;
let displayStream = null;
let cameraStream = null;
let speechRecognition = null;
let recognitionShouldRun = false;
let currentCaption = "";
let transcriptEntries = [];
let activeCaptionStart = 0;
let lastCaptionEnd = 0;
let renderFrameId = 0;
let chunks = [];
let recordingUrl = "";
let recordingName = "";
let recordingBlob = null;
let publicRecordingUrl = "";
let annotationTool = "select";
let annotations = [];
let draftAnnotation = null;
let annotationStart = null;
let canAnnotate = false;
let isApplyingAnnotations = false;
let startedAt = 0;
let elapsedBeforePause = 0;
let timerId = 0;

function setStatus(status) {
    statusText.textContent = status;
    statusPill.classList.toggle("recording", status === "Recording");
    statusPill.classList.toggle("paused", status === "Paused");
}

function setMessage(text, type = "") {
    message.textContent = text;
    message.className = `message ${type}`.trim();
}

function resizeAnnotationCanvas() {
    const rect = annotationCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
    const height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));

    if (annotationCanvas.width !== width || annotationCanvas.height !== height) {
        annotationCanvas.width = width;
        annotationCanvas.height = height;
        drawAnnotationPreview();
    }
}

function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function getElapsedMs() {
    if (mediaRecorder?.state === "recording") {
        return elapsedBeforePause + Date.now() - startedAt;
    }

    return elapsedBeforePause;
}

function updateTimer() {
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
        return;
    }

    timer.textContent = formatTime(elapsedBeforePause + Date.now() - startedAt);
}

function formatVttTime(ms) {
    const totalMs = Math.max(0, Math.floor(ms));
    const hours = String(Math.floor(totalMs / 3600000)).padStart(2, "0");
    const minutes = String(Math.floor((totalMs % 3600000) / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((totalMs % 60000) / 1000)).padStart(2, "0");
    const milliseconds = String(totalMs % 1000).padStart(3, "0");

    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function startTimer() {
    startedAt = Date.now();
    timerId = window.setInterval(updateTimer, 250);
    updateTimer();
}

function pauseTimer() {
    elapsedBeforePause += Date.now() - startedAt;
    window.clearInterval(timerId);
}

function resetTimer() {
    elapsedBeforePause = 0;
    startedAt = 0;
    window.clearInterval(timerId);
    timer.textContent = "00:00";
}

function getMimeType() {
    const options = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
    ];

    return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function stopStream() {
    window.cancelAnimationFrame(renderFrameId);
    renderFrameId = 0;

    [stream, displayStream, cameraStream].forEach((activeStream) => {
        activeStream?.getTracks().forEach((track) => track.stop());
    });

    stream = null;
    displayStream = null;
    cameraStream = null;
}

function setRecordingControls(isRecording) {
    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    pauseBtn.disabled = !isRecording;
    cameraToggle.disabled = isRecording;
    captionToggle.disabled = isRecording;
}

function setAnnotationControls() {
    annotationCanvas.classList.toggle("active", canAnnotate && annotationTool !== "select");
    undoAnnotationBtn.disabled = !canAnnotate || annotations.length === 0;
    clearAnnotationsBtn.disabled = !canAnnotate || annotations.length === 0;
    applyAnnotationsBtn.disabled = !canAnnotate || !recordingBlob || annotations.length === 0 || isApplyingAnnotations;

    document.querySelectorAll("[data-tool]").forEach((button) => {
        button.disabled = !canAnnotate;
        button.classList.toggle("active", button.dataset.tool === annotationTool);
    });
}

function getAnnotationPoint(event) {
    const rect = annotationCanvas.getBoundingClientRect();

    return {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
}

function makeShapeAnnotation(type, start, end) {
    const annotation = {
        type,
        color: annotationColor.value,
        lineWidth: 5,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
    };

    if (type === "square") {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        annotation.x2 = start.x + Math.sign(dx || 1) * size;
        annotation.y2 = start.y + Math.sign(dy || 1) * size;
    }

    return annotation;
}

function drawArrow(context, x1, y1, x2, y2, lineWidth) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = Math.max(18, lineWidth * 5);

    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();

    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    context.moveTo(x2, y2);
    context.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    context.stroke();
}

function drawAnnotation(context, annotation, width, height) {
    const x1 = annotation.x1 * width;
    const y1 = annotation.y1 * height;
    const x2 = annotation.x2 * width;
    const y2 = annotation.y2 * height;
    const lineWidth = Math.max(3, annotation.lineWidth * (width / 1280));

    context.save();
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (annotation.type === "arrow") {
        drawArrow(context, x1, y1, x2, y2, lineWidth);
    }

    if (annotation.type === "rectangle" || annotation.type === "square") {
        context.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }

    if (annotation.type === "circle") {
        const radiusX = Math.abs(x2 - x1) / 2;
        const radiusY = Math.abs(y2 - y1) / 2;
        context.beginPath();
        context.ellipse((x1 + x2) / 2, (y1 + y2) / 2, radiusX, radiusY, 0, 0, Math.PI * 2);
        context.stroke();
    }

    if (annotation.type === "text") {
        const fontSize = Math.max(18, 28 * (width / 1280));
        context.font = `800 ${fontSize}px Arial, sans-serif`;
        context.lineWidth = Math.max(3, lineWidth * 0.8);
        context.strokeStyle = "rgba(15, 23, 42, 0.72)";
        context.strokeText(annotation.text, x1, y1);
        context.fillStyle = annotation.color;
        context.fillText(annotation.text, x1, y1);
    }

    context.restore();
}

function drawAnnotationPreview() {
    const context = annotationCanvas.getContext("2d");

    context.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    [...annotations, draftAnnotation].filter(Boolean).forEach((annotation) => {
        drawAnnotation(context, annotation, annotationCanvas.width, annotationCanvas.height);
    });
}

function resetAnnotations() {
    annotations = [];
    draftAnnotation = null;
    annotationStart = null;
    drawAnnotationPreview();
    setAnnotationControls();
}

function setCaption(text) {
    currentCaption = text.trim();
    liveCaption.textContent = currentCaption;
    liveCaption.classList.toggle("hidden", !currentCaption);
}

function resetTranscription() {
    stopTranscription();
    transcriptEntries = [];
    activeCaptionStart = 0;
    lastCaptionEnd = 0;
    setCaption("");
    transcriptText.textContent = "Transcript will appear here during recording.";
    transcriptText.classList.add("emptyTranscript");
    saveTranscriptBtn.disabled = true;
    saveCaptionsBtn.disabled = true;
    captionState.textContent = captionToggle.checked ? "Ready" : "Off";
}

function resetSharing() {
    publicRecordingUrl = "";
    sharePanel.classList.add("disabled");
    uploadVideoBtn.disabled = true;
    shareVideoBtn.disabled = true;
    copyLinkBtn.disabled = true;
    copyEmbedBtn.disabled = true;
    copyPackageBtn.disabled = true;
    embedCode.value = "";
}

function setAnnotationEditMode(isEnabled) {
    canAnnotate = isEnabled;

    if (!isEnabled) {
        annotationTool = "select";
    }

    setAnnotationControls();
}

function updateTranscriptOutput() {
    if (!transcriptEntries.length) {
        transcriptText.textContent = "Transcript will appear here during recording.";
        transcriptText.classList.add("emptyTranscript");
        saveTranscriptBtn.disabled = true;
        saveCaptionsBtn.disabled = true;
        return;
    }

    transcriptText.textContent = transcriptEntries.map((entry) => entry.text).join("\n");
    transcriptText.classList.remove("emptyTranscript");
    transcriptText.scrollTop = transcriptText.scrollHeight;
    saveTranscriptBtn.disabled = false;
    saveCaptionsBtn.disabled = false;
}

function getSpeechRecognitionApi() {
    return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function startTranscription() {
    if (!captionToggle.checked) {
        captionState.textContent = "Off";
        return;
    }

    const SpeechRecognition = getSpeechRecognitionApi();

    if (!SpeechRecognition) {
        captionState.textContent = "Unsupported";
        setMessage("Captions are not supported in this browser, but recording will continue.", "error");
        return;
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = "en-US";
    recognitionShouldRun = true;
    captionState.textContent = "Listening";

    speechRecognition.addEventListener("result", (event) => {
        let interimText = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const text = result[0]?.transcript?.trim() || "";

            if (!text) {
                continue;
            }

            if (!activeCaptionStart) {
                activeCaptionStart = Math.max(lastCaptionEnd, getElapsedMs());
            }

            if (result.isFinal) {
                const end = Math.max(activeCaptionStart + 500, getElapsedMs());
                transcriptEntries.push({
                    text,
                    start: activeCaptionStart,
                    end,
                });
                lastCaptionEnd = end;
                activeCaptionStart = end;
                setCaption(text);
                updateTranscriptOutput();
            } else {
                interimText = text;
            }
        }

        if (interimText) {
            setCaption(interimText);
        }
    });

    speechRecognition.addEventListener("end", () => {
        if (recognitionShouldRun && mediaRecorder?.state !== "inactive") {
            try {
                speechRecognition.start();
            } catch {
                captionState.textContent = "Restarting";
            }
        }
    });

    speechRecognition.addEventListener("error", () => {
        captionState.textContent = "Unavailable";
    });

    try {
        speechRecognition.start();
    } catch {
        captionState.textContent = "Unavailable";
    }
}

function stopTranscription() {
    recognitionShouldRun = false;

    if (speechRecognition) {
        try {
            speechRecognition.stop();
        } catch {
            // Speech recognition may already be stopped by the browser.
        }

        speechRecognition = null;
    }

    setCaption("");
}

function getTranscriptText() {
    return transcriptEntries
        .map((entry) => `[${formatTime(entry.start)}] ${entry.text}`)
        .join("\n");
}

function getCaptionsVtt() {
    const cues = transcriptEntries.map((entry, index) => {
        return [
            String(index + 1),
            `${formatVttTime(entry.start)} --> ${formatVttTime(entry.end)}`,
            entry.text,
        ].join("\n");
    });

    return ["WEBVTT", "", ...cues].join("\n\n");
}

async function downloadTextFile(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));

    try {
        if (chrome.downloads?.download) {
            await chrome.downloads.download({
                url,
                filename,
                saveAs: true,
            });
        } else {
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

function waitForEvent(target, eventName) {
    return new Promise((resolve) => {
        target.addEventListener(eventName, resolve, { once: true });
    });
}

async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
}

async function applyAnnotationsToRecording() {
    if (!recordingBlob || !recordingUrl || !annotations.length) {
        return;
    }

    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const outputChunks = [];
    let frameId = 0;
    let audioContext = null;

    video.src = recordingUrl;
    video.muted = false;
    video.volume = 0;
    video.playsInline = true;
    video.preload = "auto";

    await waitForVideo(video);

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    const outputStream = canvas.captureStream(30);

    try {
        audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        destination.stream.getAudioTracks().forEach((track) => outputStream.addTrack(track));
        await audioContext.resume();
    } catch {
        // The annotated video can still be rendered if audio piping is unavailable.
    }

    const mimeType = getMimeType();
    const annotationRecorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined);

    annotationRecorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size > 0) {
            outputChunks.push(event.data);
        }
    });

    const stopped = waitForEvent(annotationRecorder, "stop");

    const render = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        annotations.forEach((annotation) => {
            drawAnnotation(context, annotation, canvas.width, canvas.height);
        });

        if (!video.ended) {
            frameId = window.requestAnimationFrame(render);
        }
    };

    video.addEventListener("ended", () => {
        window.cancelAnimationFrame(frameId);

        if (annotationRecorder.state !== "inactive") {
            annotationRecorder.stop();
        }
    });

    annotationRecorder.start(1000);
    render();
    await video.play();
    await stopped;

    outputStream.getTracks().forEach((track) => track.stop());
    await audioContext?.close();

    recordingBlob = new Blob(outputChunks, {
        type: annotationRecorder.mimeType || recordingBlob.type || "video/webm",
    });

    URL.revokeObjectURL(recordingUrl);
    recordingUrl = URL.createObjectURL(recordingBlob);
    recordingName = recordingName.replace(/(?:-annotated)?\.webm$/i, "-annotated.webm");
    publicRecordingUrl = "";
    fileName.textContent = recordingName;
    preview.src = recordingUrl;
    preview.load();
    resetAnnotations();
    setAnnotationEditMode(true);
    updateSharing();
}

function getEmbedCode() {
    const shareUrl = publicRecordingUrl || recordingUrl;

    if (!shareUrl) {
        return "";
    }

    const trackMarkup = transcriptEntries.length ? "\n    <!-- Attach the saved .vtt captions file with a <track> element when hosting this video. -->" : "";

    return `<video controls preload="metadata" width="960" src="${shareUrl}">${trackMarkup}\n</video>`;
}

function getSharePackageText() {
    const shareUrl = publicRecordingUrl || recordingUrl;
    const lines = [
        "Screen Cast recording",
        `Video: ${recordingName || "Not saved yet"}`,
        `Share link: ${shareUrl}`,
        "",
        "Embed:",
        getEmbedCode(),
    ];

    if (transcriptEntries.length) {
        const baseName = recordingName.replace(/\.webm$/i, "");
        lines.push("", `Transcript file: ${baseName}-transcript.txt`);
        lines.push(`Captions file: ${baseName}-captions.vtt`);
    }

    return lines.join("\n");
}

function updateSharing() {
    const hasRecording = Boolean(recordingUrl && recordingBlob);
    sharePanel.classList.toggle("disabled", !hasRecording);
    uploadVideoBtn.disabled = !hasRecording;
    copyLinkBtn.disabled = !hasRecording;
    copyEmbedBtn.disabled = !hasRecording;
    copyPackageBtn.disabled = !hasRecording;
    embedCode.value = hasRecording ? getEmbedCode() : "";

    if (!hasRecording) {
        shareVideoBtn.disabled = true;
        return;
    }

    const file = new File([recordingBlob], recordingName, { type: recordingBlob.type || "video/webm" });
    shareVideoBtn.disabled = !(navigator.canShare?.({ files: [file] }) && navigator.share);
}

function waitForVideo(video) {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        video.addEventListener("loadedmetadata", resolve, { once: true });
    });
}

async function createComposedStream(screenStream, webcamStream, shouldDrawCaptions) {
    if (!webcamStream && !shouldDrawCaptions) {
        return screenStream;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const screenVideo = document.createElement("video");
    const cameraVideo = webcamStream ? document.createElement("video") : null;

    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenVideo.playsInline = true;

    if (cameraVideo) {
        cameraVideo.srcObject = webcamStream;
        cameraVideo.muted = true;
        cameraVideo.playsInline = true;
    }

    await Promise.all([screenVideo.play(), cameraVideo?.play()].filter(Boolean));
    await Promise.all([waitForVideo(screenVideo), cameraVideo ? waitForVideo(cameraVideo) : null].filter(Boolean));

    const screenTrackSettings = screenStream.getVideoTracks()[0].getSettings();
    canvas.width = screenTrackSettings.width || screenVideo.videoWidth || 1920;
    canvas.height = screenTrackSettings.height || screenVideo.videoHeight || 1080;

    const drawContainedVideo = (video, x, y, width, height) => {
        const videoRatio = (video.videoWidth || width) / (video.videoHeight || height);
        const boxRatio = width / height;
        let drawWidth = width;
        let drawHeight = height;
        let drawX = x;
        let drawY = y;

        if (videoRatio > boxRatio) {
            drawHeight = width / videoRatio;
            drawY = y + (height - drawHeight) / 2;
        } else {
            drawWidth = height * videoRatio;
            drawX = x + (width - drawWidth) / 2;
        }

        context.drawImage(video, drawX, drawY, drawWidth, drawHeight);
    };

    const render = () => {
        context.fillStyle = "#101827";
        context.fillRect(0, 0, canvas.width, canvas.height);
        drawContainedVideo(screenVideo, 0, 0, canvas.width, canvas.height);

        if (webcamStream) {
            const cameraWidth = Math.max(260, canvas.width * 0.2);
            const cameraHeight = cameraWidth * 0.5625;
            const margin = Math.max(24, canvas.width * 0.018);
            const cameraX = canvas.width - cameraWidth - margin;
            const cameraY = canvas.height - cameraHeight - margin;

            context.save();
            context.lineWidth = Math.max(4, canvas.width * 0.004);
            context.strokeStyle = "#ffffff";
            context.fillStyle = "#101827";
            context.fillRect(cameraX, cameraY, cameraWidth, cameraHeight);
            drawContainedVideo(cameraVideo, cameraX, cameraY, cameraWidth, cameraHeight);
            context.strokeRect(cameraX, cameraY, cameraWidth, cameraHeight);
            context.restore();
        }

        if (shouldDrawCaptions && currentCaption) {
            const fontSize = Math.max(28, canvas.width * 0.018);
            const maxTextWidth = canvas.width * 0.72;
            const words = currentCaption.split(/\s+/);
            const lines = [];
            let line = "";

            context.font = `700 ${fontSize}px Arial, sans-serif`;

            words.forEach((word) => {
                const nextLine = line ? `${line} ${word}` : word;

                if (context.measureText(nextLine).width > maxTextWidth && line) {
                    lines.push(line);
                    line = word;
                } else {
                    line = nextLine;
                }
            });

            if (line) {
                lines.push(line);
            }

            const visibleLines = lines.slice(-2);
            const lineHeight = fontSize * 1.35;
            const paddingX = fontSize * 0.7;
            const paddingY = fontSize * 0.45;
            const boxWidth = Math.min(
                maxTextWidth + paddingX * 2,
                Math.max(...visibleLines.map((text) => context.measureText(text).width)) + paddingX * 2,
            );
            const boxHeight = visibleLines.length * lineHeight + paddingY * 2;
            const boxX = (canvas.width - boxWidth) / 2;
            const boxY = canvas.height - boxHeight - Math.max(28, canvas.height * 0.045);

            context.fillStyle = "rgba(15, 23, 42, 0.82)";
            context.fillRect(boxX, boxY, boxWidth, boxHeight);
            context.fillStyle = "#ffffff";
            context.textAlign = "center";
            context.textBaseline = "middle";

            visibleLines.forEach((text, index) => {
                context.fillText(text, canvas.width / 2, boxY + paddingY + lineHeight * index + lineHeight / 2);
            });
        }

        renderFrameId = window.requestAnimationFrame(render);
    };

    render();

    const composedStream = canvas.captureStream(30);
    screenStream.getAudioTracks().forEach((track) => composedStream.addTrack(track));

    return composedStream;
}

async function saveRecording() {
    if (!recordingUrl) {
        return;
    }

    if (chrome.downloads?.download) {
        await chrome.downloads.download({
            url: recordingUrl,
            filename: recordingName,
            saveAs: true,
        });
    } else {
        const link = document.createElement("a");
        link.href = recordingUrl;
        link.download = recordingName;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
}

async function startRecording() {
    try {
        if (recordingUrl) {
            URL.revokeObjectURL(recordingUrl);
        }

        chunks = [];
        recordingUrl = "";
        recordingName = "";
        recordingBlob = null;
        publicRecordingUrl = "";
        setAnnotationEditMode(false);
        resetAnnotations();
        preview.controls = false;
        preview.muted = true;
        preview.removeAttribute("src");
        preview.load();
        saveBtn.disabled = true;
        fileName.textContent = "Recording in progress";
        resetTimer();
        resetTranscription();
        resetSharing();
        setMessage("Select Entire Screen if you want recording to continue while switching tabs or windows.");

        cameraState.textContent = cameraToggle.checked ? "Requesting" : "Off";
        captionState.textContent = captionToggle.checked ? "Starting" : "Off";

        displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: 30,
                displaySurface: "monitor",
            },
            audio: true,
        });

        if (cameraToggle.checked) {
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });
                cameraState.textContent = "Included";
            } catch {
                cameraState.textContent = "Unavailable";
                setMessage("Camera could not be included, so the screen recording will continue without it.", "error");
            }
        }

        stream = await createComposedStream(displayStream, cameraStream, captionToggle.checked);
        preview.srcObject = stream;
        emptyState.classList.add("hidden");
        audioState.textContent = displayStream.getAudioTracks().length ? "Included" : "Not included";
        startTranscription();

        displayStream.getVideoTracks()[0].addEventListener("ended", () => {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
        });

        const mimeType = getMimeType();
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

        mediaRecorder.addEventListener("dataavailable", (event) => {
            if (event.data?.size > 0) {
                chunks.push(event.data);
            }
        });

        mediaRecorder.addEventListener("stop", async () => {
            window.clearInterval(timerId);
            stopTranscription();
            stopStream();
            preview.srcObject = null;
            setRecordingControls(false);
            pauseBtn.textContent = "Pause";
            cameraState.textContent = cameraToggle.checked ? "Ready" : "Off";
            captionState.textContent = captionToggle.checked ? "Ready" : "Off";
            setStatus("Ready");

            recordingBlob = new Blob(chunks, {
                type: mediaRecorder.mimeType || "video/webm",
            });
            recordingName = `screen-cast-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
            recordingUrl = URL.createObjectURL(recordingBlob);
            fileName.textContent = recordingName;
            saveBtn.disabled = false;
            preview.src = recordingUrl;
            preview.controls = true;
            preview.muted = false;
            preview.load();
            emptyState.classList.add("hidden");
            setAnnotationEditMode(true);
            resizeAnnotationCanvas();
            updateSharing();

            try {
                await saveRecording();
                setMessage("Recording is ready and the save dialog was opened.", "success");
            } catch (error) {
                setMessage(error.message || "Recording is ready, but saving failed. Use Save Again.", "error");
            }
        });

        mediaRecorder.start(1000);
        setRecordingControls(true);
        setStatus("Recording");
        startTimer();
    } catch (error) {
        stopTranscription();
        stopStream();
        setRecordingControls(false);
        setStatus("Ready");
        cameraState.textContent = cameraToggle.checked ? "Ready" : "Off";
        captionState.textContent = captionToggle.checked ? "Ready" : "Off";
        setMessage(error.message || "Could not start recording.", "error");
        fileName.textContent = "Not recorded yet";
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        setStatus("Saving");
        setMessage("Preparing the video file...");
        stopBtn.disabled = true;
        pauseBtn.disabled = true;

        try {
            mediaRecorder.requestData();
        } catch {
            // Some browsers reject requestData while the recorder is settling.
        }

        try {
            mediaRecorder.stop();
        } catch (error) {
            stopTranscription();
            stopStream();
            preview.srcObject = null;
            emptyState.classList.remove("hidden");
            setRecordingControls(false);
            setStatus("Ready");
            setMessage(error.message || "Could not stop recording.", "error");
        }
    }
}

function togglePause() {
    if (!mediaRecorder) {
        return;
    }

    if (mediaRecorder.state === "recording") {
        mediaRecorder.pause();
        pauseTimer();
        stopTranscription();
        pauseBtn.textContent = "Resume";
        setStatus("Paused");
        captionState.textContent = captionToggle.checked ? "Paused" : "Off";
        setMessage("Recording is paused.");
        return;
    }

    if (mediaRecorder.state === "paused") {
        mediaRecorder.resume();
        startTimer();
        startTranscription();
        pauseBtn.textContent = "Pause";
        setStatus("Recording");
        setMessage("Recording resumed.");
    }
}

startBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
pauseBtn.addEventListener("click", togglePause);
document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
        annotationTool = button.dataset.tool;
        setAnnotationControls();
    });
});
annotationCanvas.addEventListener("pointerdown", (event) => {
    if (!canAnnotate || annotationTool === "select") {
        return;
    }

    resizeAnnotationCanvas();
    annotationCanvas.setPointerCapture(event.pointerId);
    annotationStart = getAnnotationPoint(event);

    if (annotationTool === "text") {
        const text = window.prompt("Text to show on the video");

        if (text?.trim()) {
            annotations.push({
                type: "text",
                text: text.trim(),
                color: annotationColor.value,
                lineWidth: 5,
                x1: annotationStart.x,
                y1: annotationStart.y,
                x2: annotationStart.x,
                y2: annotationStart.y,
            });
            drawAnnotationPreview();
            setAnnotationControls();
        }

        annotationStart = null;
        return;
    }

    draftAnnotation = makeShapeAnnotation(annotationTool, annotationStart, annotationStart);
    drawAnnotationPreview();
});
annotationCanvas.addEventListener("pointermove", (event) => {
    if (!canAnnotate || !annotationStart || annotationTool === "select" || annotationTool === "text") {
        return;
    }

    draftAnnotation = makeShapeAnnotation(annotationTool, annotationStart, getAnnotationPoint(event));
    drawAnnotationPreview();
});
annotationCanvas.addEventListener("pointerup", (event) => {
    if (!canAnnotate || !annotationStart || !draftAnnotation || annotationTool === "text") {
        return;
    }

    const end = getAnnotationPoint(event);
    const distance = Math.hypot(end.x - annotationStart.x, end.y - annotationStart.y);

    if (distance > 0.01) {
        annotations.push(makeShapeAnnotation(annotationTool, annotationStart, end));
    }

    draftAnnotation = null;
    annotationStart = null;
    drawAnnotationPreview();
    setAnnotationControls();
});
annotationCanvas.addEventListener("pointercancel", () => {
    draftAnnotation = null;
    annotationStart = null;
    drawAnnotationPreview();
});
undoAnnotationBtn.addEventListener("click", () => {
    annotations.pop();
    drawAnnotationPreview();
    setAnnotationControls();
});
clearAnnotationsBtn.addEventListener("click", resetAnnotations);
applyAnnotationsBtn.addEventListener("click", async () => {
    try {
        isApplyingAnnotations = true;
        applyAnnotationsBtn.textContent = "Applying";
        setAnnotationControls();
        setMessage("Applying annotations to the video...");
        await applyAnnotationsToRecording();
        setMessage("Annotations were applied to the video.", "success");
    } catch (error) {
        setMessage(error.message || "Could not apply annotations.", "error");
    } finally {
        isApplyingAnnotations = false;
        applyAnnotationsBtn.textContent = "Apply to Video";
        setAnnotationControls();
    }
});
window.addEventListener("resize", resizeAnnotationCanvas);
saveBtn.addEventListener("click", async () => {
    try {
        await saveRecording();
        setMessage("Save dialog opened again.", "success");
    } catch (error) {
        setMessage(error.message || "Could not save the recording.", "error");
    }
});
saveTranscriptBtn.addEventListener("click", async () => {
    try {
        const name = recordingName.replace(/\.webm$/i, "") || `screen-cast-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        await downloadTextFile(`${name}-transcript.txt`, getTranscriptText(), "text/plain");
        setMessage("Transcript save dialog opened.", "success");
    } catch (error) {
        setMessage(error.message || "Could not save the transcript.", "error");
    }
});
saveCaptionsBtn.addEventListener("click", async () => {
    try {
        const name = recordingName.replace(/\.webm$/i, "") || `screen-cast-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        await downloadTextFile(`${name}-captions.vtt`, getCaptionsVtt(), "text/vtt");
        setMessage("Captions save dialog opened.", "success");
    } catch (error) {
        setMessage(error.message || "Could not save captions.", "error");
    }
});
shareVideoBtn.addEventListener("click", async () => {
    try {
        const file = new File([recordingBlob], recordingName, { type: recordingBlob.type || "video/webm" });

        if (!navigator.canShare?.({ files: [file] }) || !navigator.share) {
            setMessage("Native file sharing is not available in this browser. Use Copy Link or Copy Embed.", "error");
            return;
        }

        await navigator.share({
            title: "Screen Cast recording",
            text: "Screen Cast recording",
            files: [file],
        });
        setMessage("Share dialog opened.", "success");
    } catch (error) {
        if (error.name !== "AbortError") {
            setMessage(error.message || "Could not share the recording.", "error");
        }
    }
});
copyLinkBtn.addEventListener("click", async () => {
    try {
        await copyToClipboard(publicRecordingUrl || recordingUrl);
        setMessage(publicRecordingUrl ? "Public share link copied." : "Local preview link copied. Upload first for an internet-shareable link.", "success");
    } catch (error) {
        setMessage(error.message || "Could not copy the preview link.", "error");
    }
});
uploadVideoBtn.addEventListener("click", async () => {
    if (!recordingBlob) {
        return;
    }

    try {
        uploadVideoBtn.disabled = true;
        uploadVideoBtn.textContent = "Uploading";
        setMessage("Uploading recording...");

        const response = await fetch(uploadEndpoint.value.trim(), {
            method: "POST",
            headers: {
                "Content-Type": recordingBlob.type || "video/webm",
                "X-File-Name": recordingName,
            },
            body: recordingBlob,
        });

        if (!response.ok) {
            throw new Error(`Upload failed with ${response.status}`);
        }

        const data = await response.json();

        if (!data.url) {
            throw new Error("Upload response did not include a public URL.");
        }

        publicRecordingUrl = data.url;
        updateSharing();
        await copyToClipboard(publicRecordingUrl);
        setMessage("Public share link copied.", "success");
    } catch (error) {
        setMessage(error.message || "Could not upload the recording.", "error");
    } finally {
        uploadVideoBtn.textContent = "Upload Link";
        uploadVideoBtn.disabled = !recordingBlob;
    }
});
copyEmbedBtn.addEventListener("click", async () => {
    try {
        await copyToClipboard(getEmbedCode());
        setMessage("Embed code copied.", "success");
    } catch (error) {
        setMessage(error.message || "Could not copy embed code.", "error");
    }
});
copyPackageBtn.addEventListener("click", async () => {
    try {
        await copyToClipboard(getSharePackageText());
        setMessage("Sharing package copied.", "success");
    } catch (error) {
        setMessage(error.message || "Could not copy the sharing package.", "error");
    }
});

window.addEventListener("beforeunload", () => {
    stopTranscription();
    stopStream();
    if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
    }
});

resizeAnnotationCanvas();
setAnnotationControls();
