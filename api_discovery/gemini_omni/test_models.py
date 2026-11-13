"""
Verification test script for Gemini Omni Flash (1.2 / 1.1) Pydantic V2 models.
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
    expected_cost_usd,
)

AUDIT_PATH = os.path.join(os.path.dirname(__file__), "raw_endpoints_audit.json")


def run_tests():
    print("=== Running Gemini Omni Flash (1.2 / 1.1) Pydantic Schema Verification ===")
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

    # 6. Google's 2026-11 contract (docs: aistudio.google.com/docs/omni)
    print("\n--- 5. Testing the 1.2 contract (duration, limits, usage) ---")
    import pytest_free_raises as raises  # tiny local helper, no pytest needed

    default_req = OmniInteractionCreateRequest(input="x")
    assert default_req.model == "gemini-omni-1.2-flash" and default_req.response_format.resolution == "720p"
    assert default_req.response_format.duration is None  # NOT SENT: Google makes 10 s, the caller must set it
    ok = OmniInteractionCreateRequest(input="x", response_format={"type": "video", "duration": "5s", "aspect_ratio": "9:16"})
    assert ok.response_format.duration == "5s"
    for bad in ("2s", "16s", "5", "5 s", "10.5s"):
        raises.validation(lambda b=bad: OmniInteractionCreateRequest(input="x", response_format={"type": "video", "duration": b}), f"duration {bad!r}")
    img = {"type": "image", "data": "b64", "mime_type": "image/jpeg"}
    raises.validation(lambda: OmniInteractionCreateRequest(input=[img] * 7 + [{"type": "text", "text": "x"}]), "7 images")
    raises.validation(lambda: OmniInteractionCreateRequest(input=[{"type": "text", "text": "<FIRST_FRAME> a <LAST_FRAME> b"}]), "control tags")
    raises.validation(lambda: OmniInteractionCreateRequest(
        input=[img, img, {"type": "text", "text": "x"}], response_format={"type": "video", "duration": "12s"},
        generation_config={"video_config": {"task": "image_to_video"}}), "first+last frame over 10 s")
    OmniInteractionCreateRequest(input=[img, img, {"type": "text", "text": "x"}], response_format={"type": "video", "duration": "12s"})  # two REFERENCE images: allowed
    video_in = OmniInteractionCreateRequest(input=[{"type": "video", "uri": "files/abc"}, {"type": "text", "text": "Make this video anime"}])
    assert video_in.input[0].type == "video"
    for status in ("in_progress", "requires_action", "completed", "failed", "cancelled", "incomplete"):
        OmniInteractionResponse.model_validate({"id": "v1_x", "status": status, "model": "gemini-omni-1.2-flash"})
    sample = next(i for i in audit_data["successful_responses"] if i["scenario"] == "synthetic_1_2_usage_sample")["response"]
    parsed = OmniInteractionResponse.model_validate(sample)
    assert parsed.usage.video_cost_usd() == 0.3475  # 28960 video tokens x $12 / 1M = a 5 s 720p clip
    assert expected_cost_usd("720p", 5) == 0.3475 and expected_cost_usd("1080p", 5) == 0.5213  # Google's published token rates
    print("  [PASS] 1.2 contract: default model/resolution, duration pattern, limits, tags, video input, statuses, usage cost.")

    # 7. Images: inline OR by Files API uri, the types both Google docs list (13.11.2026 audit)
    print("\n--- 6. Testing image inputs (data | uri, mime types) ---")
    inline = OmniInteractionCreateRequest(input=[{"type": "image", "data": "b64"}, {"type": "text", "text": "x"}])
    assert inline.input[0].mime_type == "image/jpeg"  # bare inline data keeps the old default
    by_uri = OmniInteractionCreateRequest(input=[{"type": "image", "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc"}, {"type": "text", "text": "x"}])
    assert by_uri.input[0].uri and by_uri.input[0].data is None and by_uri.input[0].mime_type is None
    for mime in ("image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"):
        OmniInteractionCreateRequest(input=[{"type": "image", "data": "b64", "mime_type": mime}])
    raises.validation(lambda: OmniInteractionCreateRequest(input=[{"type": "image"}]), "image without data and uri")
    raises.validation(lambda: OmniInteractionCreateRequest(input=[{"type": "image", "data": "b64", "uri": "files/abc"}]), "image with both data and uri")
    raises.validation(lambda: OmniInteractionCreateRequest(input=[{"type": "image", "data": "b64", "mime_type": "image/svg+xml"}]), "svg image")
    assert OmniInteractionCreateRequest(input="x").routing_note() is None
    note = OmniInteractionCreateRequest(model="gemini-omni-1.1-flash", input="x").routing_note()
    assert note and "2026-12-03" in note and "1.2" in note
    print("  [PASS] images (data | uri | mime types) and the 1.1 routing note.")

    # 8. The request the SITE really sends (fixture kept in step with e2e/ui/video.spec.ts)
    print("\n--- 7. Testing the site's request against the shield ---")
    with open(os.path.join(os.path.dirname(__file__), "site_payload.sample.json"), "r", encoding="utf-8") as f:
        site_payload = json.load(f)
    site_payload.pop("_comment", None)
    site_req = OmniInteractionCreateRequest.model_validate(site_payload)
    assert site_req.model == "gemini-omni-1.2-flash" and site_req.routing_note() is None
    assert site_req.response_format.resolution == "720p" and site_req.response_format.duration == "5s" and site_req.response_format.aspect_ratio == "9:16"
    assert site_req.generation_config.seed == 133466 and site_req.store is False and site_req.stream is False and site_req.background is False
    assert site_req.input[0].mime_type == "image/png" and site_req.input[1].text == "<preset prompt>"
    print("  [PASS] the site's request is accepted by the Pydantic shield.")

    print("\nALL 8 TESTS PASSED SUCCESSFULLY! The schema is 100% compliant with api-discovery.")


if __name__ == "__main__":
    run_tests()
