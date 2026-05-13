const preview = document.getElementById("preview");
const emptyState = document.getElementById("emptyState");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const pauseBtn = document.getElementById("pauseBtn");
const saveBtn = document.getElementById("saveBtn");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const timer = document.getElementById("timer");
const fileName = document.getElementById("fileName");
const audioState = document.getElementById("audioState");
const message = document.getElementById("message");

let mediaRecorder = null;
let stream = null;
let chunks = [];
let recordingUrl = "";
let recordingName = "";
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

function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function updateTimer() {
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
        return;
    }

    timer.textContent = formatTime(elapsedBeforePause + Date.now() - startedAt);
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
    if (!stream) {
        return;
    }

    stream.getTracks().forEach((track) => track.stop());
    stream = null;
}

function setRecordingControls(isRecording) {
    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    pauseBtn.disabled = !isRecording;
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
        saveBtn.disabled = true;
        fileName.textContent = "Recording in progress";
        resetTimer();
        setMessage("Select Entire Screen if you want recording to continue while switching tabs or windows.");

        stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: 30,
                displaySurface: "monitor",
            },
            audio: true,
        });

        preview.srcObject = stream;
        emptyState.classList.add("hidden");
        audioState.textContent = stream.getAudioTracks().length ? "Included" : "Not included";

        stream.getVideoTracks()[0].addEventListener("ended", () => {
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
            stopStream();
            preview.srcObject = null;
            emptyState.classList.remove("hidden");
            setRecordingControls(false);
            pauseBtn.textContent = "Pause";
            setStatus("Ready");

            const blob = new Blob(chunks, {
                type: mediaRecorder.mimeType || "video/webm",
            });
            recordingName = `screen-cast-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
            recordingUrl = URL.createObjectURL(blob);
            fileName.textContent = recordingName;
            saveBtn.disabled = false;

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
        stopStream();
        setRecordingControls(false);
        setStatus("Ready");
        setMessage(error.message || "Could not start recording.", "error");
        fileName.textContent = "Not recorded yet";
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        setStatus("Saving");
        setMessage("Preparing the video file...");
        mediaRecorder.stop();
    }
}

function togglePause() {
    if (!mediaRecorder) {
        return;
    }

    if (mediaRecorder.state === "recording") {
        mediaRecorder.pause();
        pauseTimer();
        pauseBtn.textContent = "Resume";
        setStatus("Paused");
        setMessage("Recording is paused.");
        return;
    }

    if (mediaRecorder.state === "paused") {
        mediaRecorder.resume();
        startTimer();
        pauseBtn.textContent = "Pause";
        setStatus("Recording");
        setMessage("Recording resumed.");
    }
}

startBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
pauseBtn.addEventListener("click", togglePause);
saveBtn.addEventListener("click", async () => {
    try {
        await saveRecording();
        setMessage("Save dialog opened again.", "success");
    } catch (error) {
        setMessage(error.message || "Could not save the recording.", "error");
    }
});

window.addEventListener("beforeunload", () => {
    stopStream();
    if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
    }
});
