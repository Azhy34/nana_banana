import json
from pathlib import Path
from datetime import datetime, timezone

log_path = Path("gemini_sessions.json")
data = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else {}

session_id = "gmc-DS-006"
if session_id not in data:
    data[session_id] = {
        "createdTime": datetime.now(timezone.utc).isoformat(),
        "events": []
    }

prompt_text = (
    "Ultra-slow cinematic Steadicam forward push-in shot along the central Z-axis moving towards the nursery wallpaper mural. "
    "The camera glides forward steadily at a snail's pace, maintaining rock-solid optical stability. "
    "GEOMETRIC & FURNITURE LOCK: The natural solid wood slatted crib, oak parquet floor, and room architecture remain 100% rigid, "
    "frozen, and geometrically locked with zero distortion, zero bending, and zero shifting parts. "
    "INANIMATE 2D INK LOCK: The savannah landscape and illustrated elephants on the feature wall are strictly flat printed ink on matte non-woven paper. "
    "Completely static 2D artwork, zero biological animation, zero head turns, zero leg movement, zero morphing illustrations. "
    "Warm gentle morning sunlight grazes across the wallpaper texture creating authentic soft ambient shadows."
)

kling_event = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "sessionId": session_id,
    "model": "kling-2.6/image-to-video",
    "prompt": prompt_text,
    "cost": 0.275,
    "creditsConsumed": 55,
    "remainingCredits": 25,
    "duration": 279.0,
    "durationSeconds": 5.0,
    "status": "success",
    "resolution": "1072x1928",
    "aspectRatio": "9:16",
    "taskId": "ac69bfcaa6c0edc430017b5579fa7c32",
    "gmcItemGroupId": "DS-006",
    "stage": "kling_2_6_flight_ds006_scene1",
    "videoUrl": "https://tempfile.aiquickdraw.com/k/ac69bfcaa6c0edc430017b5579fa7c32_1_1793557193_6430.mp4",
    "outputFile": "runs/GMC-DS-006_creative/kling_2_6_scene1_flight.mp4"
}

data[session_id]["events"].append(kling_event)
log_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Successfully recorded Kling event into gemini_sessions.json. Total session events: {len(data[session_id]['events'])}")

