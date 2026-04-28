from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import afkbot_plugin_afkbotui.router as router_module
from afkbot.services.automations.contracts import (
    AutomationMetadata,
    AutomationWebhookEndpointMetadata,
    AutomationWebhookMetadata,
)
from afkbot_plugin_afkbotui.router import (
    _infer_task_session_profile_id,
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


def test_infer_task_session_profile_id_reads_ai_subagent_owner_ref() -> None:
    payload = {
        "owner_type": "ai_subagent",
        "owner_ref": "default:researcher",
        "profile_id": "backlog",
    }

    assert _infer_task_session_profile_id(payload) == "default"


def test_config_accepts_subagent_task_flow_actor_type() -> None:
    class FakeRegistry:
        def __init__(self) -> None:
            self._config: dict[str, object] = {}

        def read_config(self) -> dict[str, object]:
            return dict(self._config)

        def write_config(self, payload: dict[str, object]) -> None:
            self._config = dict(payload)

        def reset_config(self) -> None:
            self._config = {}

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    response = client.patch(
        "/v1/plugins/afkbotui/config",
        json={
            "task_flow_actor_type": "ai_subagent",
            "task_flow_actor_ref": "default:reviewer",
        },
    )

    assert response.status_code == 200
    assert response.json()["config"]["task_flow_actor_type"] == "ai_subagent"
    assert response.json()["config"]["task_flow_actor_ref"] == "default:reviewer"


def test_automation_webhook_endpoint_route_is_separate_from_masked_detail(monkeypatch) -> None:
    now = datetime.now(timezone.utc)
    masked = AutomationMetadata(
        id=8,
        profile_id="github",
        name="Review",
        prompt="Handle webhook",
        trigger_type="webhook",
        status="active",
        execution_mode="prompt",
        graph_fallback_mode="resume_with_ai_if_safe",
        created_at=now,
        updated_at=now,
        webhook=AutomationWebhookMetadata(
            webhook_token=None,
            webhook_path=None,
            webhook_url=None,
            webhook_token_masked="[HIDDEN]",
            last_execution_status="idle",
            last_received_at=None,
            last_started_at=None,
            last_succeeded_at=None,
            last_failed_at=None,
            last_error=None,
            last_session_id=None,
            last_event_hash=None,
            chat_resume_command=None,
        ),
    )
    revealed = AutomationWebhookEndpointMetadata(
        recoverable=True,
        webhook_path="/v1/automations/github/webhook/token-1",
        webhook_url="https://example.com/v1/automations/github/webhook/token-1",
        webhook_token_masked="toke...en-1",
    )

    class FakeService:
        async def list(self, *, profile_id: str, include_deleted: bool = False):
            assert profile_id == "default"
            assert include_deleted is False
            return [masked]

        async def get(self, *, profile_id: str, automation_id: int):
            assert profile_id == "default"
            assert automation_id == 8
            return masked

        async def reveal_webhook_endpoint(self, *, profile_id: str, automation_id: int):
            assert profile_id == "default"
            assert automation_id == 8
            return revealed

    class FakeRegistry:
        def __init__(self) -> None:
            self._config: dict[str, object] = {}

        def read_config(self) -> dict[str, object]:
            return dict(self._config)

        def write_config(self, payload: dict[str, object]) -> None:
            self._config = dict(payload)

        def reset_config(self) -> None:
            self._config = {}

    monkeypatch.setattr(router_module, "get_settings", lambda: object())
    monkeypatch.setattr(router_module, "get_automations_service", lambda _settings: FakeService())

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    list_response = client.get("/v1/plugins/afkbotui/automations", params={"profile_id": "default"})
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert list_payload["automations"][0]["webhook"]["webhook_url"] is None
    assert list_payload["automations"][0]["webhook"]["webhook_path"] is None
    assert list_payload["automations"][0]["webhook"]["webhook_token_masked"] == "[HIDDEN]"

    detail_response = client.get(
        "/v1/plugins/afkbotui/automations/8",
        params={"profile_id": "default"},
    )
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["automation"]["webhook"]["webhook_url"] is None
    assert detail_payload["automation"]["webhook"]["webhook_path"] is None
    assert detail_payload["automation"]["webhook"]["webhook_token_masked"] == "[HIDDEN]"

    endpoint_response = client.get(
        "/v1/plugins/afkbotui/automations/8/webhook-endpoint",
        params={"profile_id": "default"},
    )
    assert endpoint_response.status_code == 200
    assert endpoint_response.headers["cache-control"] == "private, no-store"
    assert endpoint_response.headers["pragma"] == "no-cache"
    endpoint_payload = endpoint_response.json()
    assert endpoint_payload["webhook"]["webhook_url"] == revealed.webhook_url
    assert endpoint_payload["webhook"]["webhook_path"] == revealed.webhook_path
    assert endpoint_payload["webhook"]["webhook_token_masked"] == revealed.webhook_token_masked
    assert endpoint_payload["webhook"]["recoverable"] is True


def test_task_flow_task_routes_map_prompt_payload_to_description(monkeypatch) -> None:
    observed: dict[str, dict[str, object]] = {}

    class DumpableTask:
        def model_dump(self, *, mode: str) -> dict[str, object]:
            assert mode == "json"
            return {
                "description": "Write the route contract.",
                "id": "task-1",
                "status": "todo",
                "title": "Route task",
            }

    class FakeTaskFlowService:
        async def create_task(self, **kwargs: object) -> DumpableTask:
            observed["create"] = kwargs
            assert "prompt" not in kwargs
            assert kwargs["description"] == "Write the route contract."
            return DumpableTask()

        async def update_task(self, **kwargs: object) -> DumpableTask:
            observed["update"] = kwargs
            assert "prompt" not in kwargs
            assert kwargs["description"] == "Update the route contract."
            return DumpableTask()

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    monkeypatch.setattr(router_module, "get_settings", lambda: object())
    monkeypatch.setattr(router_module, "get_task_flow_service", lambda _settings: FakeTaskFlowService())

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    create_response = client.post(
        "/v1/plugins/afkbotui/task-flow/tasks",
        json={"prompt": "Write the route contract.", "title": "Route task"},
        params={"profile_id": "default"},
    )
    assert create_response.status_code == 200
    assert observed["create"]["profile_id"] == "default"

    update_response = client.patch(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1",
        json={"prompt": "Update the route contract."},
        params={"profile_id": "default"},
    )
    assert update_response.status_code == 200
    assert observed["update"]["task_id"] == "task-1"
