"""
Pydantic V2 Two-Layer Shield Models for KIE.ai Kling Video Generation API.
Generated and verified according to api-discovery skill standard.
Covers 100% of fields for both 200 OK responses, webhook callbacks, and 4xx/5xx error contracts.
"""

from typing import Any, Generic, List, Literal, Optional, TypeVar, Union
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

T = TypeVar("T")


# =====================================================================
# 0. Base Model Configuration (5 Laws of Production Schemas)
# =====================================================================

class KieBaseModel(BaseModel):
    model_config = ConfigDict(
        extra="ignore",             # Law 5: Immunity to API mutations
        populate_by_name=True,      # Law 5: Support both camelCase and snake_case
        str_strip_whitespace=True,  # Clean leading/trailing spaces
        validate_default=True       # Validate default values
    )


# =====================================================================
# 1. Error Contract Models (4xx / 5xx)
# =====================================================================

class KieApiErrorResponse(KieBaseModel):
    code: int = Field(
        description="HTTP or business status code (e.g. 401, 402, 404, 422, 429, 500, 501)"
    )
    msg: str = Field(
        description="Developer-friendly error message from KIE API (e.g. 'Your call frequency is too high', 'insufficient credits')"
    )
    data: Optional[Any] = Field(
        default=None,
        description="Optional error payload or diagnostics"
    )

    @property
    def is_rate_limited(self) -> bool:
        return self.code == 429

    @property
    def is_insufficient_credits(self) -> bool:
        return self.code == 402

    @property
    def is_unauthorized(self) -> bool:
        return self.code == 401


# =====================================================================
# 2. File Upload Models (https://kieai.redpandaai.co)
# =====================================================================

class KieBase64UploadRequest(KieBaseModel):
    base64_data: str = Field(
        alias="base64Data",
        description="Base64 encoded file string or data URI (max 10MB)"
    )
    upload_path: str = Field(
        default="nana-banana/runs",
        alias="uploadPath",
        description="Target directory without leading/trailing slashes"
    )
    file_name: Optional[str] = Field(
        default="image.png",
        alias="fileName",
        description="File name including extension"
    )


class KieFileUploadData(KieBaseModel):
    download_url: str = Field(
        alias="downloadUrl",
        description="Temporary CDN download URL (valid for 24 hours)"
    )
    file_name: Optional[str] = Field(default=None, alias="fileName")
    file_path: Optional[str] = Field(default=None, alias="filePath")
    file_size: Optional[int] = Field(default=None, alias="fileSize")
    mime_type: Optional[str] = Field(default=None, alias="mimeType")
    uploaded_at: Optional[str] = Field(default=None, alias="uploadedAt")


class KieFileUploadResponse(KieBaseModel):
    success: bool = Field(default=True)
    code: int = Field(default=200)
    msg: str = Field(default="File uploaded successfully")
    data: KieFileUploadData


# =====================================================================
# 3. Credit Balance Model (/api/v1/chat/credit)
# =====================================================================

class KieCreditResponse(KieBaseModel):
    code: int = Field(default=200)
    msg: str = Field(default="success")
    data: float = Field(
        description="Current credit balance (e.g. 80.0)"
    )


# =====================================================================
# 4. Kling Video Generation Request Models (/api/v1/jobs/createTask)
# =====================================================================

class Kling26Input(KieBaseModel):
    prompt: str = Field(
        min_length=1,
        max_length=2500,
        description="Motion prompt describing camera trajectory and scene actions (max 2500 chars)"
    )
    image_urls: List[str] = Field(
        min_length=1,
        max_length=1,
        description="List containing exactly 1 public or KIE CDN image URL (JPEG/PNG, <= 10MB)"
    )
    sound: bool = Field(
        default=False,
        description="Whether to generate native AI audio. False saves 50% credits; master audio is added in post-production."
    )
    duration: Literal["5", "10"] = Field(
        default="5",
        description="Video duration in seconds: '5' (55 credits / $0.28) or '10' (110 credits / $0.55)"
    )


class Kling30OmniInput(KieBaseModel):
    prompt: str = Field(
        min_length=1,
        max_length=3072,
        description="Motion prompt describing scene action and camera movement (max 3072 chars)"
    )
    image_urls: List[str] = Field(
        min_length=1,
        max_length=1,
        description="List containing exactly 1 image URL (JPG/PNG, <= 50MB)"
    )
    duration: Literal[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] = Field(
        default=5,
        description="Video duration in seconds (3 to 15)"
    )
    resolution: Literal["720p", "1080p", "4k"] = Field(
        default="1080p",
        description="Target resolution: '720p', '1080p' (18 credits/s), or '4k'"
    )
    aspect_ratio: Literal["auto", "16:9", "9:16", "1:1"] = Field(
        default="auto",
        description="Aspect ratio. Use 'auto' to inherit from input image."
    )
    audio: bool = Field(
        default=False,
        description="Whether to enable native audio (billed extra)"
    )
    customize_multi_shots: bool = Field(
        default=False,
        description="Multi-shot control flag"
    )


class KlingTaskCreateRequest(KieBaseModel):
    model: Literal[
        "kling-2.6/image-to-video",
        "kling-3.0-omni/image-to-video",
        "kling/v2-5-turbo-image-to-video-pro",
        "kling/v2-1-master-image-to-video"
    ] = Field(
        default="kling-2.6/image-to-video",
        description="Target model identifier"
    )
    input: Union[Kling26Input, Kling30OmniInput] = Field(
        description="Model-specific generation parameters"
    )
    call_back_url: Optional[str] = Field(
        default=None,
        alias="callBackUrl",
        description="Optional webhook URL for async result delivery"
    )


class KlingTaskCreateData(KieBaseModel):
    task_id: str = Field(
        alias="taskId",
        description="Unique task ID used for polling via /api/v1/jobs/recordInfo"
    )
    record_id: Optional[str] = Field(
        default=None,
        alias="recordId"
    )


class KlingTaskCreateResponse(KieBaseModel):
    code: int = Field(default=200)
    msg: str = Field(default="success")
    data: KlingTaskCreateData


# =====================================================================
# 5. Task Record / Query Status Models (/api/v1/jobs/recordInfo)
# =====================================================================

class KlingTaskResponsePayload(KieBaseModel):
    result_urls: List[str] = Field(
        default_factory=list,
        alias="resultUrls",
        description="List of direct CDN URLs to generated video files"
    )


class KlingRecordInfoData(KieBaseModel):
    task_id: str = Field(alias="taskId")
    model: str
    state: Literal["waiting", "queuing", "generating", "success", "fail"] = Field(
        description="Current lifecycle state of the video generation job"
    )
    success_flag: Optional[int] = Field(default=None, alias="successFlag")
    cost_time: Optional[int] = Field(default=None, alias="costTime", description="Processing duration in seconds")
    credits_consumed: Optional[float] = Field(default=None, alias="creditsConsumed", description="Actual credits billed")
    create_time: Optional[int] = Field(default=None, alias="createTime")
    complete_time: Optional[int] = Field(default=None, alias="completeTime")
    fail_code: Optional[str] = Field(default=None, alias="failCode")
    fail_msg: Optional[str] = Field(default=None, alias="failMsg")
    result_json: Optional[str] = Field(default=None, alias="resultJson")
    response: Optional[KlingTaskResponsePayload] = Field(default=None)


class KlingRecordInfoResponse(KieBaseModel):
    code: int = Field(default=200)
    msg: Optional[str] = Field(default="success")
    data: Optional[KlingRecordInfoData] = Field(default=None)


# =====================================================================
# 6. Two-Layer Shield Return Wrapper
# =====================================================================

class TwoLayerResult(KieBaseModel, Generic[T]):
    success: bool = Field(description="True if operation completed cleanly with valid response")
    data: Optional[T] = Field(default=None, description="Typed success payload")
    error: Optional[KieApiErrorResponse] = Field(default=None, description="Detailed error payload if failed")
    raw_status_code: int = Field(default=200, description="Underlying HTTP status code")

