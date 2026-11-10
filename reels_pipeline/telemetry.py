"""
Structured JSONL Telemetry and Cost Tracing for reels_pipeline.
Adheres to gcp-observability-logging principles:
- W3C Trace ID correlation
- Zero Secret Leak policy
- Precise token, credit, and latency metrics
"""

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .config import PipelineConfig


class TelemetryLogger:
    @staticmethod
    def generate_trace_id() -> str:
        """Returns a 32-character hex trace ID adhering to W3C Trace Context standard."""
        return uuid.uuid4().hex

    @classmethod
    def log_event(
        cls,
        stage: str,
        trace_id: str,
        listing: str,
        duration_ms: int,
        status: str = "success",
        model: Optional[str] = None,
        tokens: Optional[Dict[str, int]] = None,
        credits_spent: int = 0,
        cost_usd: float = 0.0,
        output_path: Optional[str] = None,
        error_message: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Appends a structured event to telemetry.jsonl and returns the record."""
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "trace_id": trace_id,
            "listing": listing,
            "stage": stage,
            "model": model,
            "status": status,
            "duration_ms": duration_ms,
            "credits_spent": credits_spent,
            "cost_usd": round(cost_usd, 4),
            "tokens": tokens or {},
            "output_path": output_path,
            "error_message": error_message,
        }
        if extra:
            record["extra"] = extra

        log_path = PipelineConfig.TELEMETRY_LOG_PATH
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        return record

    @staticmethod
    def format_badge(record: Dict[str, Any]) -> str:
        """Formats a human-friendly Markdown status badge for chat output."""
        status_icon = "✅" if record["status"] == "success" else "❌"
        duration_sec = round(record["duration_ms"] / 1000.0, 1)
        cost = f"${record['cost_usd']:.3f}" if record["cost_usd"] > 0 else "$0.00"
        credits_str = f" ({record['credits_spent']} cr)" if record["credits_spent"] > 0 else ""
        
        parts = [
            f"{status_icon} **{record['stage']}** ({record.get('model', 'N/A')})",
            f"⏱️ {duration_sec}s",
            f"💰 {cost}{credits_str}",
        ]
        if record.get("tokens") and record["tokens"].get("total_tokens"):
            parts.append(f"🔤 {record['tokens']['total_tokens']} tokens")
        if record.get("output_path"):
            parts.append(f"📁 `{Path(record['output_path']).name}`")
        if record.get("error_message"):
            parts.append(f"⚠️ Error: {record['error_message']}")

        return " | ".join(parts)

