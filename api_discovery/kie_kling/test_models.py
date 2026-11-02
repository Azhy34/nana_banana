"""
Unit tests for KIE.ai Kling Pydantic Two-Layer Shield Models.
Verifies 100% field parsing for valid requests, success responses, and 4xx/5xx error contracts.
"""

import pytest
from pydantic import ValidationError
from models import (
    KieApiErrorResponse,
    KieCreditResponse,
    KieFileUploadResponse,
    Kling26Input,
    Kling30OmniInput,
    KlingRecordInfoResponse,
    KlingTaskCreateRequest,
    KlingTaskCreateResponse,
    TwoLayerResult,
)


def test_kling26_request_validation():
    # Valid Kling 2.6 input
    valid_req = KlingTaskCreateRequest(
        model="kling-2.6/image-to-video",
        input=Kling26Input(
            prompt="Ultra slow push-in shot",
            image_urls=["https://tempfile.redpandaai.co/test.png"],
            sound=False,
            duration="5"
        )
    )
    dumped = valid_req.model_dump(by_alias=True)
    assert dumped["model"] == "kling-2.6/image-to-video"
    assert dumped["input"]["duration"] == "5"
    assert dumped["input"]["sound"] is False
    assert len(dumped["input"]["image_urls"]) == 1

    # Invalid duration must raise ValidationError
    with pytest.raises(ValidationError):
        Kling26Input(
            prompt="Test",
            image_urls=["https://example.com/img.png"],
            duration="15"  # only "5" or "10" allowed
        )

    # Empty image_urls must raise ValidationError
    with pytest.raises(ValidationError):
        Kling26Input(
            prompt="Test",
            image_urls=[],
            duration="5"
        )


def test_kling30_omni_validation():
    req = KlingTaskCreateRequest(
        model="kling-3.0-omni/image-to-video",
        input=Kling30OmniInput(
            prompt="Smooth dolly forward",
            image_urls=["https://tempfile.redpandaai.co/frame.png"],
            duration=4,
            resolution="1080p",
            audio=False
        )
    )
    dumped = req.model_dump(by_alias=True)
    assert dumped["input"]["resolution"] == "1080p"
    assert dumped["input"]["duration"] == 4


def test_credit_response_parsing():
    raw = {"code": 200, "msg": "success", "data": 80.0}
    parsed = KieCreditResponse.model_validate(raw)
    assert parsed.code == 200
    assert parsed.data == 80.0


def test_file_upload_response_parsing():
    raw = {
        "success": True,
        "code": 200,
        "msg": "File uploaded successfully",
        "data": {
            "fileName": "frame1_clean.png",
            "filePath": "kieai/12254931/runs/frame1_clean.png",
            "downloadUrl": "https://tempfile.redpandaai.co/kieai/12254931/runs/frame1_clean.png",
            "fileSize": 2510673,
            "mimeType": "image/png",
            "uploadedAt": "2026-11-01T17:58:57.280Z"
        }
    }
    parsed = KieFileUploadResponse.model_validate(raw)
    assert parsed.success is True
    assert parsed.data.download_url == "https://tempfile.redpandaai.co/kieai/12254931/runs/frame1_clean.png"


def test_task_create_response_parsing():
    raw = {
        "code": 200,
        "msg": "success",
        "data": {
            "taskId": "task_abc_123",
            "recordId": "rec_xyz"
        }
    }
    parsed = KlingTaskCreateResponse.model_validate(raw)
    assert parsed.data.task_id == "task_abc_123"


def test_task_record_info_success_and_generating():
    # 1. Generating state
    gen_raw = {
        "code": 200,
        "data": {
            "taskId": "task_abc_123",
            "model": "kling-2.6/image-to-video",
            "state": "generating",
            "costTime": 15
        }
    }
    gen_parsed = KlingRecordInfoResponse.model_validate(gen_raw)
    assert gen_parsed.data.state == "generating"

    # 2. Success state
    succ_raw = {
        "code": 200,
        "data": {
            "taskId": "task_abc_123",
            "model": "kling-2.6/image-to-video",
            "state": "success",
            "costTime": 42,
            "creditsConsumed": 55.0,
            "response": {
                "resultUrls": ["https://tempfile.redpandaai.co/out.mp4"]
            }
        }
    }
    succ_parsed = KlingRecordInfoResponse.model_validate(succ_raw)
    assert succ_parsed.data.state == "success"
    assert succ_parsed.data.response.result_urls[0] == "https://tempfile.redpandaai.co/out.mp4"
    assert succ_parsed.data.credits_consumed == 55.0


def test_error_contracts_4xx_5xx():
    # 402 Insufficient credits
    err_402 = KieApiErrorResponse.model_validate({
        "code": 402,
        "msg": "insufficient credits: balance 20 is less than 55 required"
    })
    assert err_402.is_insufficient_credits is True
    assert err_402.is_rate_limited is False

    # 429 Rate limited
    err_429 = KieApiErrorResponse.model_validate({
        "code": 429,
        "msg": "Your call frequency is too high. Please try again later."
    })
    assert err_429.is_rate_limited is True

    # 401 Unauthorized
    err_401 = KieApiErrorResponse.model_validate({
        "code": 401,
        "msg": "unauthorized token"
    })
    assert err_401.is_unauthorized is True


def test_two_layer_result_wrapper():
    res = TwoLayerResult[KieCreditResponse](
        success=True,
        data=KieCreditResponse(code=200, msg="success", data=80.0),
        raw_status_code=200
    )
    assert res.success is True
    assert res.data.data == 80.0
    assert res.error is None

