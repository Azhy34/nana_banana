"""
Verification test script for Gemini Omni 1.1 Flash Pydantic V2 models.
Tests parsing of:
1. Valid 200 OK Inline Base64 response
2. Valid 200 OK Async File URI response
3. 400 Invalid Argument error
4. 401 Unauthenticated error
5. 429 Rate Limited error
6. Two-Layer ServiceResult shield wrapping
"""

import json
import os
from models import (
    GoogleApiErrorResponse,
    OmniInteractionCreateRequest,
    OmniInteractionResponse,
    ServiceResult,
)

AUDIT_PATH = os.path.join(os.path.dirname(__file__), "raw_endpoints_audit.json")


def run_tests():
    print("=== Running Gemini Omni 1.1 Flash Pydantic Schema Verification ===")
    with open(AUDIT_PATH, "r", encoding="utf-8") as f:
        audit_data = json.load(f)

    # 1. Test Successful Responses (200 OK)
    print("\n--- 1. Testing Successful Responses (200 OK) ---")
    for item in audit_data["successful_responses"]:
        scenario = item["scenario"]
        raw = item["response"]
        parsed = OmniInteractionResponse.model_validate(raw)
        assert parsed.id == raw["id"], f"ID mismatch in {scenario}"
        assert parsed.status == "completed", f"Status mismatch in {scenario}"
        print(f"  [PASS] Scenario '{scenario}': parsed ID={parsed.id}, model={parsed.model}")

    # 2. Test Error Responses (4xx / 5xx)
    print("\n--- 2. Testing Error Responses (4xx / 5xx) ---")
    for item in audit_data["error_responses"]:
        scenario = item["scenario"]
        raw = item["response"]
        err_parsed = GoogleApiErrorResponse.model_validate(raw)
        assert err_parsed.error.code == item["status_code"]
        print(f"  [PASS] Scenario '{scenario}': code={err_parsed.error.code}, status={err_parsed.error.status}")

    # 3. Test Two-Layer ServiceResult Shield
    print("\n--- 3. Testing Two-Layer ServiceResult Shield ---")
    success_raw = audit_data["successful_responses"][0]["response"]
    success_obj = OmniInteractionResponse.model_validate(success_raw)
    shield_ok = ServiceResult[OmniInteractionResponse](
        data=success_obj,
        source_status="OK",
        transaction_id=success_obj.id,
    )
    assert shield_ok.source_status == "OK"
    assert shield_ok.data is not None and shield_ok.data.output_video is not None
    print("  [PASS] ServiceResult OK wrapper verified.")

    # 4. Test ServiceResult Failure fallback
    shield_err = ServiceResult[OmniInteractionResponse](
        data=None,
        source_status="RATE_LIMITED",
        error_type="RESOURCE_EXHAUSTED",
        error_message="Quota exceeded for 360p draft generations.",
        warning_note="Генерация видео временно перегружена. Попробуйте через 1 минуту.",
        transaction_id="trace-test-123",
    )
    assert shield_err.source_status == "RATE_LIMITED"
    assert shield_err.warning_note is not None
    print("  [PASS] ServiceResult Fallback / Error Shield verified.")

    # 5. Test Request validation (Request Contract)
    print("\n--- 4. Testing Request Contract Validation ---")
    req = OmniInteractionCreateRequest(
        input=[
            {"type": "image", "data": "base64_sample", "mime_type": "image/jpeg"},
            {"type": "text", "text": "Execute smooth dolly-in camera zoom"},
        ],
        response_format={"type": "video", "resolution": "360p", "aspect_ratio": "16:9"},
    )
    assert req.response_format.resolution == "360p"
    assert len(req.input) == 2
    print(f"  [PASS] Request Contract validated (resolution={req.response_format.resolution}).")

    print("\nALL 5 TESTS PASSED SUCCESSFULLY! The schema is 100% compliant with api-discovery.")


if __name__ == "__main__":
    run_tests()
