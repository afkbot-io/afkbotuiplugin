from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from afkbot_plugin_afkbotui.router import (
    _last_activity_datetime,
    _serialize_graph_preview_trace,
    _serialize_graph_preview_validation,
)


def test_serialize_graph_preview_validation_exposes_stable_shape() -> None:
    payload = _serialize_graph_preview_validation(
        {
            "valid": False,
            "errors": ["missing edge", "", None],
            "internal": {"debug": "should not leak"},
        }
    )

    assert payload == {
        "valid": False,
        "errors": ["missing edge"],
    }


def test_serialize_graph_preview_trace_strips_sensitive_fields() -> None:
    payload = _serialize_graph_preview_trace(
        {
            "run": {
                "id": 7,
                "automation_id": 3,
                "trigger_type": "webhook",
                "status": "failed",
                "final_output": {"secret": "value"},
                "parent_session_id": "session-1",
            },
            "nodes": [
                {
                    "id": 11,
                    "node_id": 22,
                    "node_key": "validate",
                    "status": "failed",
                    "execution_index": 1,
                    "selected_ports": ["default"],
                    "reason": "bad payload",
                    "error_code": "invalid_json",
                    "child_session_id": "child-1",
                    "input": {"secret": "in"},
                    "output": {"secret": "out"},
                    "effects": [{"token": "value"}],
                }
            ],
            "fallback": {
                "execution_index": 2,
                "status": "skipped",
                "error_code": "no_fallback",
                "reason": "deterministic only",
                "prompt_package": {"secret": "value"},
            },
        }
    )

    assert payload["run"] == {
        "id": 7,
        "automation_id": 3,
        "trigger_type": "webhook",
        "status": "failed",
        "parent_session_id": "session-1",
        "error_code": None,
        "reason": None,
        "started_at": None,
        "completed_at": None,
        "fallback_status": None,
    }
    assert payload["nodes"] == [
        {
            "id": 11,
            "node_id": 22,
            "node_key": "validate",
            "status": "failed",
            "execution_index": 1,
            "selected_ports": ["default"],
            "reason": "bad payload",
            "error_code": "invalid_json",
            "child_session_id": "child-1",
        }
    ]
    assert payload["fallback"] == {
        "execution_index": 2,
        "status": "skipped",
        "error_code": "no_fallback",
        "reason": "deterministic only",
    }


def test_last_activity_ignores_future_cron_next_run() -> None:
    now = datetime.now(timezone.utc)
    item = SimpleNamespace(
        updated_at=now - timedelta(hours=4),
        created_at=now - timedelta(days=1),
        cron=SimpleNamespace(
            last_run_at=now - timedelta(minutes=30),
            next_run_at=now + timedelta(hours=2),
        ),
        webhook=None,
    )

    assert _last_activity_datetime(item) == now - timedelta(minutes=30)
