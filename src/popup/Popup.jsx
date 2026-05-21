export default function Popup() {
    const openRecorder = async () => {
        const url = chrome.runtime.getURL("recorder.html");

        window.open(url, "_blank", "width=1120,height=820");
        window.close();
    };

    return (
        <div className="w-[360px] bg-white text-left box-border">
            <div className="heroPanel">
                <img className="projectIcon" src="/icon.svg" alt="Screen Cast" />
                <p className="eyebrow">Screen Cast</p>
                <h1 className="title">Record without losing your session</h1>
                <p className="copy">
                    Open the recorder studio, choose Entire Screen, and keep working while it captures in the background.
                </p>
                <button className="launchButton" onClick={openRecorder}>
                    Open Recorder
                </button>
            </div>

            <div className="tips">
                <div>
                    <strong>Best for switching</strong>
                    <span>Select Entire Screen in Chrome's picker.</span>
                </div>
                <div>
                    <strong>Saves locally</strong>
                    <span>Stop recording and choose where to save the WebM file.</span>
                </div>
            </div>
        </div>
    );
}
