"""Minimal assert-raises helper for the plain-script tests of this package (no pytest dependency)."""

from pydantic import ValidationError


def validation(call, label: str) -> None:
    try:
        call()
    except ValidationError:
        return
    raise AssertionError(f"{label}: pydantic accepted a request that Google rejects")
