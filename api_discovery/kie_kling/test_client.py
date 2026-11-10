"""
Tests for the KIE client helpers that need no network.
Run from the repo root:  py -3.12 -X utf8 -m pytest api_discovery/kie_kling -q
"""

import pytest

pytestmark = pytest.mark.core  # the old KIE client tests are small and guard the request/response shapes

import io

from PIL import Image

from api_discovery.kie_kling.client import KieKlingClient, sniff_image_format


def _image_bytes(fmt: str) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (200, 150, 180)).save(buf, format=fmt)
    return buf.getvalue()


def test_sniff_uses_real_bytes_not_extension():
    assert sniff_image_format(_image_bytes("PNG")) == "png"
    assert sniff_image_format(_image_bytes("JPEG")) == "jpeg"
    assert sniff_image_format(_image_bytes("WEBP")) == "webp"
    assert sniff_image_format(b"GIF89a....") is None
    assert sniff_image_format(b"") is None


def test_upload_rejects_non_image_and_mislabelled_names_without_network(tmp_path):
    client = KieKlingClient(api_key="test-key-not-real")

    not_image = tmp_path / "fake.png"
    not_image.write_bytes(b"this is not an image at all")
    res = client.upload_file(not_image)
    assert res.success is False and res.error.code == 415

    missing = client.upload_file(tmp_path / "missing.png")
    assert missing.success is False and missing.error.code == 404
