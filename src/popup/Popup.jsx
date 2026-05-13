import { useEffect, useRef, useState } from "react";

export default function Popup() {
    const [recording, setRecording] = useState(false);
    const [videoUrl, setVideoUrl] = useState("");

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    const webcamVideoRef = useRef(null);
    const webcamStreamRef = useRef(null);

    // START WEBCAM
    const startWebcam = async () => {
        try {
            const webcamStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
            });

            webcamStreamRef.current = webcamStream;

            if (webcamVideoRef.current) {
                webcamVideoRef.current.srcObject = webcamStream;
            }
        } catch (error) {
            console.error("Webcam error:", error);
        }
    };

    // STOP WEBCAM
    const stopWebcam = () => {
        if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach((track) => {
                track.stop();
            });
        }
    };

    // START RECORDING
    const startRecording = async () => {
        try {
            chunksRef.current = [];

            // SCREEN STREAM
            const screenStream =
                await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true,
                });

            // HANDLE MANUAL STOP
            screenStream.getVideoTracks()[0].onended = () => {
                stopRecording();
            };

            // START WEBCAM
            await startWebcam();

            // CREATE RECORDER
            const mediaRecorder = new MediaRecorder(screenStream);

            mediaRecorderRef.current = mediaRecorder;

            // SAVE CHUNKS
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            // RECORDING STOPPED
            mediaRecorder.onstop = () => {
                try {
                    const blob = new Blob(chunksRef.current, {
                        type: "video/webm",
                    });

                    // CREATE VIDEO URL
                    const url = URL.createObjectURL(blob);

                    // SAVE URL TO STATE
                    setVideoUrl(url);

                    stopWebcam();

                    chunksRef.current = [];
                } catch (error) {
                    console.error("Blob creation error:", error);
                }
            };

            mediaRecorder.start();

            setRecording(true);
        } catch (error) {
            console.error("Recording error:", error);
        }
    };

    // STOP RECORDING
    const stopRecording = () => {
        try {
            if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state !== "inactive"
            ) {
                mediaRecorderRef.current.stop();
            }

            setRecording(false);
        } catch (error) {
            console.error("Stop recording error:", error);
        }
    };

    // DOWNLOAD VIDEO
    const downloadVideo = () => {
        if (!videoUrl) return;

        const a = document.createElement("a");

        a.href = videoUrl;
        a.download = `recording-${Date.now()}.webm`;

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);
    };

    // CLEANUP
    useEffect(() => {
        return () => {
            stopWebcam();

            if (videoUrl) {
                URL.revokeObjectURL(videoUrl);
            }
        };
    }, [videoUrl]);

    return (
        <div className="w-[360px] p-5 bg-white">
            {/* HEADER */}
            <div className="text-center mb-5">
                <h1 className="text-2xl font-bold text-gray-800">
                    Screen Cast
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                    Chrome Screen Recorder
                </p>
            </div>

            {/* RECORD BUTTON */}
            {!recording ? (
                <button
                    onClick={startRecording}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition"
                >
                    Start Recording
                </button>
            ) : (
                <button
                    onClick={stopRecording}
                    className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-semibold transition"
                >
                    🔴 Stop Recording
                </button>
            )}

            {/* WEBCAM PREVIEW */}
            <div className="mt-6 flex justify-center">
                <video
                    ref={webcamVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-[180px] h-[180px] rounded-full object-cover border-4 border-blue-500 shadow-xl bg-black"
                />
            </div>

            {/* RECORDED VIDEO */}
            {videoUrl && (
                <div className="mt-6">
                    <h2 className="text-lg font-semibold mb-2">
                        Recording Preview
                    </h2>

                    <video
                        src={videoUrl}
                        controls
                        className="w-full rounded-xl border"
                    />

                    <button
                        onClick={downloadVideo}
                        className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-semibold"
                    >
                        Download Recording
                    </button>
                </div>
            )}

            {/* FOOTER */}
            <p className="text-center text-xs text-gray-400 mt-5">
                Built with React + MediaRecorder API
            </p>
        </div>
    );
}