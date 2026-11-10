"""Prompt logs written by tests go to a temp folder, never into runs/prompts of the project."""

import pytest


@pytest.fixture(autouse=True)
def _prompt_logs_in_a_temp_folder(tmp_path_factory, monkeypatch):
    from reels_pipeline import kie_generator

    monkeypatch.setattr(kie_generator, "PROMPT_LOG_DIR", tmp_path_factory.mktemp("prompt_logs"))
