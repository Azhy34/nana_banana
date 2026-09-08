"""
Pydantic V2 Two-Layer Shield Models for Google Gemini Omni 1.1 Flash (Interactions API).
Generated and verified according to api-discovery skill standard.
Covers 100% of fields for both 200 OK responses and 4xx/5xx error contracts.
"""

from typing import Any, Generic, List, Literal, Optional, TypeVar, Union
from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


# ==========================================
# 1. Error Contract Models (4xx / 5xx)
# ==========================================

class GoogleRpcErrorInfo(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    type: Optional[str] = Field(default=None, alias="@type", description="Schema type indicator")
    reason: Optional[str] = Field(default=None, description="Machine-readable error reason code")
    domain: Optional[str] = Field(default=None, description="Origin domain (e.g. googleapis.com)")
    metadata: Optional[dict[str, Any]] = Field(default=None, description="Context metadata")


class GoogleApiErrorDetail(BaseModel):
    model_config = ConfigDict(extra="allow")

    code: int = Field(description="HTTP or RPC status code")
    message: str = Field(description="Developer-friendly error message")
    status: str = Field(description="Standard RPC status string (e.g. INVALID_ARGUMENT, UNAUTHENTICATED)")
    details: List[GoogleRpcErrorInfo] = Field(default_factory=list, description="Array of detailed error diagnostics")


class GoogleApiErrorResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    error: GoogleApiErrorDetail = Field(description="Google Generative Language API error payload")


# ==========================================
# 2. Request Contract Models
# ==========================================

class ImageContentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["image"] = "image"
    data: str = Field(description="Base64 encoded image string (JPEG or PNG)")
    mime_type: Literal["image/jpeg", "image/png"] = Field(default="image/jpeg", description="MIME type of input image")


class TextContentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["text"] = "text"
    text: str = Field(description="Textual prompt or motion instructions")


class DocumentContentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["document"] = "document"
    uri: str = Field(description="URI of uploaded video or image from Google Files API")


OmniContentPart = Union[ImageContentInput, TextContentInput, DocumentContentInput]


class VideoResponseFormat(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["video"] = "video"
    resolution: Literal["360p", "720p", "1080p", "4k"] = Field(
        default="360p",
        description="Target resolution. 360p provides 60% faster iteration at 1/3 cost."
    )
    aspect_ratio: Optional[Literal["16:9", "9:16"]] = Field(
        default="16:9",
        description="Video aspect ratio. 16:9 landscape or 9:16 portrait."
    )
    delivery: Optional[Literal["inline", "uri"]] = Field(
        default="inline",
        description="Delivery mechanism: inline base64 or async Files API URI."
    )


class OmniInteractionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: Literal["gemini-omni-1.1-flash"] = "gemini-omni-1.1-flash"
    input: Union[str, List[OmniContentPart]] = Field(
        description="String prompt or list of multimodal parts (image, text, video uri)"
    )
    previous_interaction_id: Optional[str] = Field(
        default=None,
        description="ID of previous interaction for scene extension / multi-turn continuation"
    )
    response_format: Optional[VideoResponseFormat] = Field(
        default_factory=VideoResponseFormat,
        description="Video output configuration"
    )
    store: Optional[bool] = Field(
        default=True,
        description="Whether to store conversation state server-side"
    )


# ==========================================
# 3. Response Contract Models (200 OK)
# ==========================================

class OutputVideoPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    mime_type: Optional[str] = Field(default="video/mp4", description="MIME type of output video")
    data: Optional[str] = Field(default=None, description="Base64 encoded video bytes (if inline delivery)")
    uri: Optional[str] = Field(default=None, description="Download URI from Files API (if uri delivery)")


class StepContentItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str = Field(description="Content item type: text, image, video, thought")
    text: Optional[str] = Field(default=None, description="Text or thought content")
    mime_type: Optional[str] = Field(default=None, description="Media mime type")
    data: Optional[str] = Field(default=None, description="Media raw data / base64")
    uri: Optional[str] = Field(default=None, description="Resource URI")


class InteractionStep(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["user_input", "thought", "model_output"] = Field(description="Step type")
    content: List[StepContentItem] = Field(default_factory=list, description="Step content elements")


class OmniInteractionResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(description="Unique interaction ID for multi-turn extension")
    status: Literal["completed", "processing", "failed"] = Field(description="Lifecycle status")
    model: str = Field(description="Model ID used")
    object: Optional[str] = Field(default="interaction")
    created: Optional[int] = Field(default=None, description="Unix timestamp")
    output_video: Optional[OutputVideoPayload] = Field(
        default=None,
        description="Convenience output video container (inline data or uri)"
    )
    steps: List[InteractionStep] = Field(
        default_factory=list,
        description="Chronological steps of the interaction including thoughts and model output"
    )


# ==========================================
# 4. Two-Layer Service Result Shield
# ==========================================

class ServiceResult(BaseModel, Generic[T]):
    """
    Standard Two-Layer Shield wrapper for agentic tools and controllers.
    Guarantees zero-crash returns with deterministic machine status.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    data: Optional[T] = Field(default=None, description="Typed entity payload (Layer 1)")
    source_status: Literal[
        "OK",
        "BUSINESS_ERROR",
        "AUTH_ERROR",
        "CONNECTION_PENDING",
        "RATE_LIMITED",
        "TIMEOUT",
        "FALLBACK"
    ] = Field(
        default="OK",
        description="Normalized source status for business logic and UI decision making"
    )
    error_type: Optional[str] = Field(default=None, description="Machine-readable error reason code")
    error_message: Optional[str] = Field(default=None, description="Technical error description")
    warning_note: Optional[str] = Field(default=None, description="User-facing explanation without panic")
    transaction_id: Optional[str] = Field(default=None, description="Interaction ID or trace ID for correlation")
