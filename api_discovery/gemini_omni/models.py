"""
Pydantic V2 Two-Layer Shield Models for Google Gemini Omni Flash (Interactions API): gemini-omni-1.2-flash (GA 2026-11-05)
and gemini-omni-1.1-flash (routed to 1.2 and billed at 1.2 rates from 2026-12-03).
Verified 2026-11-08 against aistudio.google.com/docs/omni, /docs/pricing and ai.google.dev/api/interactions-api.
Covers 100% of fields for both 200 OK responses and 4xx/5xx error contracts.

Facts these models enforce (Google's own docs):
  - without `response_format.duration` the model makes 10 s; the value is a string "3s".."15s" (at most "10s" with a first+last frame);
  - the default resolution is 720p; the REST video lives in steps[].content[] (`output_video` is an SDK convenience field);
  - there is NO negative-prompt parameter and no system instruction: negatives go into the prompt text;
  - the old control tags <FIRST_FRAME>, <LAST_FRAME>, <IMAGE_REF_n>, <VIDEO_REF_n> are deprecated: describe the role of each media in words;
  - billing is per OUTPUT token (video: $12 per 1M tokens on 1.2), see OmniUsage.video_cost_usd.
"""

import re
from typing import Any, Generic, List, Literal, Optional, TypeVar, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator

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

# Image types both Google docs agree on (Interactions API reference lists more: gif, bmp, tiff; Vertex lists exactly these five).
OmniImageMime = Literal["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]


class ImageContentInput(BaseModel):
    """An image is passed EITHER inline (`data`, base64) OR by reference (`uri`, Files API: docs "Extending with reference media")."""
    model_config = ConfigDict(extra="forbid")

    type: Literal["image"] = "image"
    data: Optional[str] = Field(default=None, description="Base64 encoded image (inline). Exactly one of `data` / `uri`.")
    uri: Optional[str] = Field(default=None, description="URI of an image uploaded with the Files API. Exactly one of `data` / `uri`.")
    mime_type: Optional[OmniImageMime] = Field(
        default=None,
        description="MIME type of the image. Inline data without it is read as image/jpeg (the old default); a `uri` image needs none.",
    )

    @model_validator(mode="after")
    def _one_source(self):
        if (self.data is None) == (self.uri is None):
            raise ValueError("an image takes exactly one of `data` (base64) or `uri` (Files API)")
        if self.data is not None and self.mime_type is None:
            self.mime_type = "image/jpeg"
        return self


class TextContentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["text"] = "text"
    text: str = Field(description="Textual prompt or motion instructions")


class DocumentContentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["document"] = "document"
    uri: str = Field(description="URI of uploaded video or image from Google Files API")


class VideoContentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["video"] = "video"
    uri: str = Field(description="URI of a video uploaded with the Files API (edit / extend / reference video)")


OmniContentPart = Union[ImageContentInput, TextContentInput, VideoContentInput, DocumentContentInput]

OMNI_MODELS = ("gemini-omni-1.2-flash", "gemini-omni-1.1-flash")
OMNI_VIDEO_USD_PER_M_TOKENS = 12.0  # gemini-omni-1.2-flash; 1.1 was 17.5 and is billed at the 1.2 rate from 2026-12-03
OMNI_TOKENS_PER_SECOND = {"360p": 1931, "720p": 5792, "1080p": 8688, "4k": 17376}  # Google pricing page
DEPRECATED_CONTROL_TAGS = re.compile(r"<(?:FIRST_FRAME|LAST_FRAME|IMAGE_REF_\d+|VIDEO_REF_\d+)>")


class VideoResponseFormat(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["video"] = "video"
    resolution: Literal["360p", "720p", "1080p", "4k"] = Field(
        default="720p",
        description="Target resolution (Google's default is 720p). 1080p and 4k are upscaled. 360p is a cheap draft."
    )
    duration: Optional[str] = Field(
        default=None,
        pattern=r"^(?:[3-9]|1[0-5])s$",
        description="Clip length as whole seconds, '3s'..'15s' ('3s'..'10s' with first+last frame). NOT SENT = the model makes 10 s."
    )
    aspect_ratio: Optional[Literal["16:9", "9:16"]] = Field(
        default="16:9",
        description="Video aspect ratio. 16:9 landscape or 9:16 portrait."
    )
    delivery: Optional[Literal["inline", "uri"]] = Field(
        default="inline",
        description="Delivery mechanism: inline base64 or async Files API URI (Google: use uri for videos larger than 4 MB)."
    )
    gcs_uri: Optional[str] = Field(default=None, description="Cloud Storage URI for the output (Vertex only, required there with delivery=uri)")


class VideoConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    task: Optional[Literal["text_to_video", "image_to_video", "reference_to_video", "edit", "extend"]] = Field(
        default=None,
        description="Fallback only: the model infers the mode from the prompt. Setting it adds strict limits (inputs, roles)."
    )


class OmniGenerationConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    video_config: Optional[VideoConfig] = None
    seed: Optional[int] = Field(default=None, description="Decoding seed (the field exists in generation_config); Google's Omni docs do not promise that the same seed repeats a clip")


class OmniInteractionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: Literal["gemini-omni-1.2-flash", "gemini-omni-1.1-flash"] = "gemini-omni-1.2-flash"
    input: Union[str, List[OmniContentPart]] = Field(
        description="String prompt or list of multimodal parts (image, text, video uri)"
    )
    generation_config: Optional[OmniGenerationConfig] = Field(default=None, description="video_config.task (fallback) and seed")
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
        description="Whether to store conversation state server-side. Google: store=false is faster for a one-shot call, "
                    "but the video can then NOT be edited by a later turn (previous_interaction_id). "
                    "delivery='uri' REQUIRES store=true."
    )
    stream: Optional[bool] = Field(default=None, description="Google advises stream=false for a plain synchronous generation")
    background: Optional[bool] = Field(default=None, description="Google advises background=false for a plain synchronous generation")

    @model_validator(mode="after")
    def _google_limits(self):
        parts = self.input if isinstance(self.input, list) else []
        texts = [self.input] if isinstance(self.input, str) else [p.text for p in parts if isinstance(p, TextContentInput)]
        for text in texts:
            if DEPRECATED_CONTROL_TAGS.search(text):
                raise ValueError("deprecated control tags (<FIRST_FRAME>, <LAST_FRAME>, <IMAGE_REF_n>, <VIDEO_REF_n>) are unsupported: describe each media in words")
        images = sum(isinstance(p, ImageContentInput) for p in parts)
        videos = sum(isinstance(p, VideoContentInput) for p in parts)
        if images > 6:
            raise ValueError(f"{images} images: Omni takes at most 6 reference images")
        if videos > 3:
            raise ValueError(f"{videos} videos: Omni takes at most 3 reference videos")
        fmt = self.response_format
        if fmt and fmt.delivery == "uri" and self.store is False:
            # seen live 13.11.2026: 400 "store=true is required when response format has video delivery set to URI"
            raise ValueError("response_format.delivery='uri' requires store=true (Google answers 400 otherwise)")
        seconds = int(fmt.duration[:-1]) if fmt and fmt.duration else None
        task = self.generation_config.video_config.task if self.generation_config and self.generation_config.video_config else None
        if seconds and seconds > 10 and videos > 1:
            raise ValueError("clips of 11-15 s take at most 1 reference video")
        if seconds and seconds > 10 and task == "image_to_video" and images == 2:
            raise ValueError("first + last frame (two images, task image_to_video) supports 3-10 s only")
        return self

    def routing_note(self) -> Optional[str]:
        """A warning (not an error) for the caller / UI: 1.1 still answers until 2026-12-03, then Google routes it to 1.2 at the 1.2 rate."""
        if self.model == "gemini-omni-1.1-flash":
            return ("gemini-omni-1.1-flash: from 2026-12-03 Google routes it to gemini-omni-1.2-flash and bills the 1.2 rate "
                    "($0.07/s at 720p). Use gemini-omni-1.2-flash.")
        return None


# ==========================================
# 3. Response Contract Models (200 OK)
# ==========================================

class ModalityTokens(BaseModel):
    model_config = ConfigDict(extra="allow")

    modality: Optional[Literal["text", "image", "audio", "video", "document"]] = None
    tokens: Optional[int] = None


class OmniUsage(BaseModel):
    """Token statistics of an interaction. The bill of a clip = video output tokens x $12 / 1M (1.2)."""
    model_config = ConfigDict(extra="allow")

    total_tokens: Optional[int] = None
    total_input_tokens: Optional[int] = None
    total_output_tokens: Optional[int] = None
    total_thought_tokens: Optional[int] = None
    input_tokens_by_modality: List[ModalityTokens] = Field(default_factory=list)
    output_tokens_by_modality: List[ModalityTokens] = Field(default_factory=list)

    def video_cost_usd(self, usd_per_m_tokens: float = OMNI_VIDEO_USD_PER_M_TOKENS) -> Optional[float]:
        """Price of the video part of this interaction, None when the response carries no video token count."""
        tokens = sum(m.tokens or 0 for m in self.output_tokens_by_modality if m.modality == "video")
        return round(tokens * usd_per_m_tokens / 1_000_000, 4) if tokens else None


def expected_cost_usd(resolution: str, seconds: int, usd_per_m_tokens: float = OMNI_VIDEO_USD_PER_M_TOKENS) -> float:
    """Price of a clip BEFORE generating it (Google's token rates per second of video: 720p 5792, 1080p 8688, ...)."""
    return round(OMNI_TOKENS_PER_SECOND[resolution] * seconds * usd_per_m_tokens / 1_000_000, 4)


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
    status: Literal["in_progress", "requires_action", "completed", "failed", "cancelled", "incomplete", "processing"] = Field(
        description="Lifecycle status (Google: in_progress, requires_action, completed, failed, cancelled, incomplete; "
                    "`processing` is kept for older samples)"
    )
    model: str = Field(description="Model ID used")
    object: Optional[str] = Field(default="interaction")
    created: Optional[Union[int, str]] = Field(default=None, description="Creation time: ISO 8601 string (Google) or a Unix timestamp in older samples")
    updated: Optional[str] = Field(default=None, description="Last update time, ISO 8601")
    service_tier: Optional[str] = Field(default=None, description="flex | standard | priority")
    usage: Optional[OmniUsage] = Field(default=None, description="Token usage; the video output tokens are what is billed")
    output_video: Optional[OutputVideoPayload] = Field(
        default=None,
        description="Convenience output video container. SDK-only: the raw REST answer carries the video in steps[].content[]"
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
