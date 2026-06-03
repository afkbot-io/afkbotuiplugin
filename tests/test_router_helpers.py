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


def test_infer_task_session_profile_id_uses_task_profile_for_employee_owner() -> None:
    payload = {
        "owner_type": "employee",
        "owner_ref": "researcher",
        "profile_id": "backlog",
    }

    assert _infer_task_session_profile_id(payload) == "backlog"


def test_config_accepts_employee_task_flow_actor_type_and_normalizes_legacy_actor(monkeypatch) -> None:
    class FakeRegistry:
        def __init__(self) -> None:
            self._config: dict[str, object] = {
                "task_flow_actor_ref": "default:reviewer",
                "task_flow_actor_type": "ai_subagent",
            }

        def read_config(self) -> dict[str, object]:
            return dict(self._config)

        def write_config(self, payload: dict[str, object]) -> None:
            self._config = dict(payload)

        def reset_config(self) -> None:
            self._config = {}

    monkeypatch.setattr(router_module, "resolve_local_human_ref", lambda _settings: "cli_user:local")

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    legacy_response = client.get("/v1/plugins/afkbotui/config")
    assert legacy_response.status_code == 200
    assert legacy_response.json()["config"]["task_flow_actor_type"] == "human"
    assert legacy_response.json()["config"]["task_flow_actor_ref"] == "cli_user:local"

    response = client.patch(
        "/v1/plugins/afkbotui/config",
        json={
            "task_flow_actor_type": "employee",
            "task_flow_actor_ref": "cto",
        },
    )

    assert response.status_code == 200
    assert response.json()["config"]["task_flow_actor_type"] == "employee"
    assert response.json()["config"]["task_flow_actor_ref"] == "cto"


def test_config_normalizes_web_user_default_human_actor_placeholder(monkeypatch) -> None:
    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {
                "task_flow_actor_ref": "web-user/default",
                "task_flow_actor_type": "human",
            }

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    monkeypatch.setattr(router_module, "resolve_local_human_ref", lambda _settings: "cli_user:local")

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    response = client.get("/v1/plugins/afkbotui/config")
    assert response.status_code == 200
    assert response.json()["config"]["task_flow_actor_type"] == "human"
    assert response.json()["config"]["task_flow_actor_ref"] == "cli_user:local"


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
            observed.setdefault("updates", []).append(kwargs)
            observed["update"] = kwargs
            assert "prompt" not in kwargs
            return DumpableTask()

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {
                "task_flow_actor_ref": "web-user/default",
                "task_flow_actor_type": "human",
            }

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    monkeypatch.setattr(router_module, "get_settings", lambda: object())
    monkeypatch.setattr(router_module, "resolve_local_human_ref", lambda _settings: "cli_user:local")
    monkeypatch.setattr(router_module, "get_task_flow_service", lambda _settings: FakeTaskFlowService())

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    create_response = client.post(
        "/v1/plugins/afkbotui/task-flow/tasks",
        json={
            "owner_ref": "web-user/default",
            "owner_type": "human",
            "prompt": "Write the route contract.",
            "reviewer_ref": "default",
            "reviewer_type": "human",
            "title": "Route task",
        },
        params={"profile_id": "default"},
    )
    assert create_response.status_code == 200
    assert observed["create"]["profile_id"] == "default"
    assert observed["create"]["created_by_type"] == "human"
    assert observed["create"]["created_by_ref"] == "cli_user:local"
    assert observed["create"]["owner_ref"] == "cli_user:local"
    assert observed["create"]["reviewer_ref"] == "cli_user:local"

    update_response = client.patch(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1",
        json={"prompt": "Update the route contract."},
        params={"profile_id": "default"},
    )
    assert update_response.status_code == 200
    assert observed["update"]["task_id"] == "task-1"
    assert observed["update"]["actor_type"] == "human"
    assert observed["update"]["actor_ref"] == "cli_user:local"
    assert observed["update"]["description"] == "Update the route contract."
    assert "reviewer_type" not in observed["update"]
    assert "reviewer_ref" not in observed["update"]
    assert "blocked_reason_code" not in observed["update"]
    assert "blocked_reason_text" not in observed["update"]

    human_owner_response = client.patch(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1",
        json={
            "owner_ref": "web-user/default",
            "owner_type": "human",
            "reviewer_ref": "web-user",
            "reviewer_type": "human",
        },
        params={"profile_id": "default"},
    )
    assert human_owner_response.status_code == 200
    assert observed["update"]["owner_ref"] == "cli_user:local"
    assert observed["update"]["reviewer_ref"] == "cli_user:local"

    clear_blocker_response = client.patch(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1",
        json={"blocked_reason_code": None, "blocked_reason_text": None},
        params={"profile_id": "default"},
    )
    assert clear_blocker_response.status_code == 200
    assert observed["update"]["blocked_reason_code"] is None
    assert observed["update"]["blocked_reason_text"] is None

    clear_reviewer_response = client.patch(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1",
        json={"reviewer_ref": None, "reviewer_type": None},
        params={"profile_id": "default"},
    )
    assert clear_reviewer_response.status_code == 200
    assert observed["update"]["reviewer_type"] is None
    assert observed["update"]["reviewer_ref"] is None


def test_task_flow_flow_update_route_forwards_metadata_patch(monkeypatch) -> None:
    observed: dict[str, object] = {}

    class DumpableFlow:
        def model_dump(self, *, mode: str) -> dict[str, object]:
            assert mode == "json"
            return {
                "description": "Updated scope",
                "id": "flow-1",
                "title": "Renamed Flow",
            }

    class FakeTaskFlowService:
        async def create_flow(self, **kwargs: object) -> DumpableFlow:
            observed.clear()
            observed.update(kwargs)
            return DumpableFlow()

        async def update_flow(self, **kwargs: object) -> DumpableFlow:
            observed.clear()
            observed.update(kwargs)
            return DumpableFlow()

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    monkeypatch.setattr(router_module, "get_settings", lambda: object())
    monkeypatch.setattr(router_module, "resolve_local_human_ref", lambda _settings: "cli_user:local")
    monkeypatch.setattr(router_module, "get_task_flow_service", lambda _settings: FakeTaskFlowService())

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    create_response = client.post(
        "/v1/plugins/afkbotui/task-flow/flows",
        json={"description": "Scope", "title": "New Flow"},
        params={"profile_id": "default"},
    )
    assert create_response.status_code == 200
    assert observed["created_by_type"] == "human"
    assert observed["created_by_ref"] == "cli_user:local"

    response = client.patch(
        "/v1/plugins/afkbotui/task-flow/flows/flow-1",
        json={
            "default_owner_ref": "default",
            "default_owner_type": "human",
            "description": "Updated scope",
            "labels": ["delivery"],
            "title": "Renamed Flow",
        },
        params={"profile_id": "default"},
    )

    assert response.status_code == 200
    assert response.json()["task_flow"]["title"] == "Renamed Flow"
    assert observed == {
        "actor_ref": "cli_user:local",
        "actor_type": "human",
        "default_owner_ref": "cli_user:local",
        "default_owner_type": "human",
        "description": "Updated scope",
        "flow_id": "flow-1",
        "labels": ("delivery",),
        "profile_id": "default",
        "title": "Renamed Flow",
    }


def test_task_flow_bulk_and_review_routes_resolve_human_actor_placeholders(monkeypatch) -> None:
    observed: dict[str, object] = {}

    class Dumpable:
        def __init__(self, payload: dict[str, object]) -> None:
            self.payload = payload

        def __getattr__(self, name: str) -> object:
            try:
                return self.payload[name]
            except KeyError as exc:
                raise AttributeError(name) from exc

        def model_dump(self, *, mode: str) -> dict[str, object]:
            assert mode == "json"
            return self.payload

    class FakeTaskFlowService:
        async def get_task(self, **kwargs: object) -> Dumpable:
            observed["get_task"] = kwargs
            return Dumpable({"id": kwargs["task_id"], "status": "todo"})

        async def update_task(self, **kwargs: object) -> Dumpable:
            observed["bulk_update"] = kwargs
            return Dumpable({"id": kwargs["task_id"], "status": kwargs.get("status") or "todo"})

        async def add_task_comment(self, **kwargs: object) -> Dumpable:
            observed["bulk_comment"] = kwargs
            return Dumpable({"id": 1, "task_id": kwargs["task_id"]})

        async def list_review_tasks(self, **kwargs: object) -> list[Dumpable]:
            observed["list_review_tasks"] = kwargs
            return []

        async def approve_review_task(self, **kwargs: object) -> Dumpable:
            observed["approve_review_task"] = kwargs
            return Dumpable({"id": kwargs["task_id"], "status": "completed"})

        async def request_review_changes(self, **kwargs: object) -> Dumpable:
            observed["request_review_changes"] = kwargs
            return Dumpable({"id": kwargs["task_id"], "status": "blocked"})

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    monkeypatch.setattr(router_module, "get_settings", lambda: object())
    monkeypatch.setattr(router_module, "resolve_local_human_ref", lambda _settings: "cli_user:local")
    monkeypatch.setattr(router_module, "get_task_flow_service", lambda _settings: FakeTaskFlowService())

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    bulk_response = client.post(
        "/v1/plugins/afkbotui/task-flow/tasks/bulk-update",
        json={
            "actor_ref": "web-user/default",
            "actor_type": "human",
            "comment_message": "Moving by hand",
            "owner_ref": "web-user/default",
            "owner_type": "human",
            "reviewer_ref": "default",
            "reviewer_type": "human",
            "status": "review",
            "task_ids": ["task-1"],
        },
        params={"profile_id": "default"},
    )
    assert bulk_response.status_code == 200
    assert observed["bulk_update"]["actor_type"] == "human"
    assert observed["bulk_update"]["actor_ref"] == "cli_user:local"
    assert observed["bulk_update"]["owner_ref"] == "cli_user:local"
    assert observed["bulk_update"]["reviewer_ref"] == "cli_user:local"
    assert observed["bulk_comment"]["actor_type"] == "human"
    assert observed["bulk_comment"]["actor_ref"] == "cli_user:local"

    review_response = client.get("/v1/plugins/afkbotui/task-flow/review", params={"profile_id": "default"})
    assert review_response.status_code == 200
    assert observed["list_review_tasks"]["actor_type"] == "human"
    assert observed["list_review_tasks"]["actor_ref"] == "cli_user:local"

    approve_response = client.post(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1/review/approve",
        json={"actor_ref": "web-user", "actor_type": "human"},
        params={"profile_id": "default"},
    )
    assert approve_response.status_code == 200
    assert observed["approve_review_task"]["actor_type"] == "human"
    assert observed["approve_review_task"]["actor_ref"] == "cli_user:local"

    changes_response = client.post(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1/review/request-changes",
        json={
            "actor_ref": "web-user",
            "actor_type": "human",
            "owner_ref": "web-user/default",
            "owner_type": "human",
            "reason_text": "Needs edits",
        },
        params={"profile_id": "default"},
    )
    assert changes_response.status_code == 200
    assert observed["request_review_changes"]["actor_type"] == "human"
    assert observed["request_review_changes"]["actor_ref"] == "cli_user:local"
    assert observed["request_review_changes"]["owner_ref"] == "cli_user:local"


def test_task_flow_docs_context_and_feed_routes_forward_to_service(monkeypatch) -> None:
    observed: dict[str, dict[str, object]] = {}

    class Dumpable:
        def __init__(self, payload: dict[str, object]) -> None:
            self.payload = payload

        def __getattr__(self, name: str) -> object:
            try:
                return self.payload[name]
            except KeyError as exc:
                raise AttributeError(name) from exc

        def model_dump(self, *, mode: str) -> dict[str, object]:
            assert mode == "json"
            return self.payload

    class FakeTaskFlowService:
        async def list_documents(self, **kwargs: object) -> list[Dumpable]:
            observed["list_documents"] = kwargs
            return [Dumpable({"id": "doc-task-qa", "document_key": "qa"})]

        async def list_flow_documents(self, **kwargs: object) -> list[Dumpable]:
            observed["list_flow_documents"] = kwargs
            return [Dumpable({"id": "doc-flow-plan", "document_key": "plan"})]

        async def put_task_document(self, **kwargs: object) -> Dumpable:
            observed["put_task_document"] = kwargs
            return Dumpable({"id": "doc-task-plan", "document_key": "plan"})

        async def confirm_document(self, **kwargs: object) -> Dumpable:
            observed["confirm_document"] = kwargs
            return Dumpable({"id": kwargs["document_id"], "confirmation_status": "confirmed"})

        async def delete_document(self, **kwargs: object) -> Dumpable:
            observed["delete_document"] = kwargs
            return Dumpable({"id": kwargs["document_id"], "document_key": "plan"})

        async def build_task_context(self, **kwargs: object) -> Dumpable:
            observed["build_task_context"] = kwargs
            return Dumpable({"task": {"id": kwargs["task_id"], "title": "Task"}})

        async def build_agent_inbox(
            self,
            *,
            event_limit: int | None,
            owner_ref: str,
            owner_type: str,
            profile_id: str,
            task_limit: int | None,
        ) -> Dumpable:
            observed["build_agent_inbox"] = {
                "event_limit": event_limit,
                "owner_ref": owner_ref,
                "owner_type": owner_type,
                "profile_id": profile_id,
                "task_limit": task_limit,
            }
            return Dumpable({"owner_ref": owner_ref, "owner_type": owner_type, "tasks": []})

        async def add_task_comment(self, **kwargs: object) -> Dumpable:
            observed["add_task_comment"] = kwargs
            return Dumpable(
                {
                    "id": 1,
                    "task_id": kwargs["task_id"],
                    "actor_type": kwargs["actor_type"],
                    "actor_ref": kwargs["actor_ref"],
                    "message": kwargs["message"],
                    "comment_type": kwargs["comment_type"],
                    "created_at": "2026-06-02T00:00:00Z",
                }
            )

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {"task_flow_actor_ref": "cto", "task_flow_actor_type": "employee"}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    monkeypatch.setattr(router_module, "get_settings", lambda: object())
    monkeypatch.setattr(router_module, "resolve_local_human_ref", lambda _settings: "cli_user:local")
    monkeypatch.setattr(router_module, "get_task_flow_service", lambda _settings: FakeTaskFlowService())

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    workspace_docs_response = client.get(
        "/v1/plugins/afkbotui/task-flow/documents",
        params={
            "confirmation_status": "draft",
            "limit": 25,
            "offset": 5,
            "profile_id": "default",
            "query": "qa",
            "scope_type": "task",
        },
    )
    assert workspace_docs_response.status_code == 200
    assert workspace_docs_response.json()["task_documents"][0]["id"] == "doc-task-qa"
    assert observed["list_documents"] == {
        "confirmation_status": "draft",
        "limit": 25,
        "offset": 5,
        "profile_id": "default",
        "query": "qa",
        "scope_type": "task",
    }

    docs_response = client.get(
        "/v1/plugins/afkbotui/task-flow/docs",
        params={"profile_id": "default", "scope_id": "flow-1", "scope_type": "flow"},
    )
    assert docs_response.status_code == 200
    assert docs_response.json()["task_documents"][0]["id"] == "doc-flow-plan"
    assert observed["list_flow_documents"] == {"flow_id": "flow-1", "profile_id": "default"}

    put_response = client.put(
        "/v1/plugins/afkbotui/task-flow/docs",
        json={
            "actor_ref": "cto",
            "actor_type": "employee",
            "body": "Plan body",
            "document_key": "plan",
            "scope_id": "task-1",
            "scope_type": "task",
            "title": "Task plan",
        },
        params={"profile_id": "default"},
    )
    assert put_response.status_code == 200
    assert observed["put_task_document"]["task_id"] == "task-1"
    assert observed["put_task_document"]["document_key"] == "plan"

    confirm_response = client.post(
        "/v1/plugins/afkbotui/task-flow/docs/doc-task-plan/confirm",
        json={"actor_ref": "web-user", "actor_type": "human", "expected_revision": 2},
        params={"profile_id": "default"},
    )
    assert confirm_response.status_code == 200
    assert observed["confirm_document"]["actor_type"] == "human"
    assert observed["confirm_document"]["actor_ref"] == "cli_user:local"
    assert observed["confirm_document"]["expected_revision"] == 2

    delete_response = client.request(
        "DELETE",
        "/v1/plugins/afkbotui/task-flow/docs/doc-task-plan",
        json={"actor_ref": "default", "actor_type": "ai_profile", "expected_revision": 2},
        params={"profile_id": "default"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True
    assert observed["delete_document"]["actor_type"] == "human"
    assert observed["delete_document"]["actor_ref"] == "cli_user:local"
    assert observed["delete_document"]["document_id"] == "doc-task-plan"
    assert observed["delete_document"]["expected_revision"] == 2

    context_response = client.get(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1/context",
        params={"profile_id": "default"},
    )
    assert context_response.status_code == 200
    assert observed["build_task_context"] == {"profile_id": "default", "task_id": "task-1"}

    feed_response = client.get(
        "/v1/plugins/afkbotui/task-flow/feed",
        params={"profile_id": "default", "owner_ref": "researcher", "owner_type": "employee"},
    )
    assert feed_response.status_code == 200
    assert observed["build_agent_inbox"]["owner_type"] == "employee"
    assert observed["build_agent_inbox"]["owner_ref"] == "researcher"
    assert observed["build_agent_inbox"]["task_limit"] == 30
    assert observed["build_agent_inbox"]["event_limit"] == 20

    comment_response = client.post(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1/comments",
        json={
            "actor_ref": "web-user",
            "actor_type": "human",
            "message": "Operator note",
        },
        params={"profile_id": "default"},
    )
    assert comment_response.status_code == 200
    assert observed["add_task_comment"]["actor_type"] == "human"
    assert observed["add_task_comment"]["actor_ref"] == "cli_user:local"
    assert observed["add_task_comment"]["message"] == "Operator note"


def test_task_flow_employee_routes_expose_employee_roster_and_org_chart(monkeypatch) -> None:
    class Dumpable:
        def __init__(self, payload: dict[str, object]) -> None:
            self.payload = payload

        def __getattr__(self, name: str) -> object:
            try:
                return self.payload[name]
            except KeyError as exc:
                raise AttributeError(name) from exc

        def model_dump(self, *, mode: str) -> dict[str, object]:
            assert mode == "json"
            return self.payload

    class FakeEmployeeService:
        def __init__(self, _settings) -> None:
            pass

        async def list_employees(self, *, profile_id: str):
            assert profile_id == "default"
            return [
                Dumpable(
                    {
                        "allowed_tools": ["taskflow.read"],
                        "body": "# CTO\nOwns project decomposition.",
                        "can_delegate_to": ["planner"],
                        "can_use_subagents": True,
                        "derived_reports": ["planner"],
                        "id": "cto",
                        "manager_id": None,
                        "max_active_tasks": 1,
                        "name": "CTO",
                        "profile_id": "default",
                        "reports": ["planner"],
                        "role": "orchestrator",
                        "status": "active",
                        "subagent_allowlist": ["architect"],
                        "title": "Technical Director",
                    }
                ),
                Dumpable(
                    {
                        "allowed_tools": [],
                        "body": "Plans delivery.",
                        "can_delegate_to": [],
                        "can_use_subagents": False,
                        "derived_reports": [],
                        "id": "planner",
                        "manager_id": "cto",
                        "max_active_tasks": 1,
                        "name": "Planner",
                        "profile_id": "default",
                        "reports": [],
                        "role": "planner",
                        "status": "active",
                        "subagent_allowlist": [],
                        "title": "Delivery Planner",
                    }
                ),
            ]

        async def build_org_chart(self, *, profile_id: str):
            assert profile_id == "default"
            return Dumpable(
                {
                    "edges": [["cto", "planner"]],
                    "employees": {"cto": {"id": "cto"}, "planner": {"id": "planner"}},
                    "profile_id": "default",
                    "root_employee_ids": ["cto"],
                    "validation": {"issues": [], "profile_id": "default", "valid": True},
                }
            )

        async def upsert_employee(self, *, profile_id: str, employee_id: str, content: str):
            assert profile_id == "default"
            assert employee_id == "developer"
            assert "manager_id: cto" in content
            assert "allowed_tools:" in content
            status = "disabled" if "status: disabled" in content else "active"
            return Dumpable(
                {
                    "allowed_tools": ["task.*"],
                    "body": "# Developer\nBuilds features.",
                    "can_delegate_to": [],
                    "can_use_subagents": False,
                    "derived_reports": [],
                    "id": "developer",
                    "manager_id": "cto",
                    "max_active_tasks": 1,
                    "name": "Developer",
                    "profile_id": "default",
                    "reports": [],
                    "role": "developer",
                    "status": status,
                    "subagent_allowlist": [],
                    "title": "Developer",
                }
            )

        async def delete_employee(self, *, profile_id: str, employee_id: str):
            assert profile_id == "default"
            assert employee_id == "developer"
            return Dumpable(
                {
                    "allowed_tools": ["task.*"],
                    "body": "# Developer\nBuilds features.",
                    "can_delegate_to": [],
                    "can_use_subagents": False,
                    "derived_reports": [],
                    "id": "developer",
                    "manager_id": "cto",
                    "max_active_tasks": 1,
                    "name": "Developer",
                    "profile_id": "default",
                    "reports": [],
                    "role": "developer",
                    "status": "disabled",
                    "subagent_allowlist": [],
                    "title": "Developer",
                }
            )

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    monkeypatch.setattr(router_module, "get_settings", lambda: object())
    monkeypatch.setattr(router_module, "EmployeeService", FakeEmployeeService)

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    response = client.get("/v1/plugins/afkbotui/task-flow/employees", params={"profile_id": "default"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["filtered_count"] == 2
    assert payload["employees"][0]["id"] == "cto"
    assert payload["employees"][0]["owner_ref"] == "cto"
    assert payload["employees"][0]["path"] == "profiles/default/employees/cto.md"
    assert payload["employees"][0]["summary"] == "CTO"

    filtered = client.get(
        "/v1/plugins/afkbotui/task-flow/employees",
        params={"profile_id": "default", "q": "delivery"},
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.json()["employees"]] == ["planner"]

    org_chart = client.get("/v1/plugins/afkbotui/task-flow/org-chart", params={"profile_id": "default"})
    assert org_chart.status_code == 200
    assert org_chart.json()["org_chart"]["edges"] == [["cto", "planner"]]

    created = client.post(
        "/v1/plugins/afkbotui/task-flow/employees",
        params={"profile_id": "default"},
        json={
            "id": "developer",
            "name": "Developer",
            "title": "Developer",
            "role": "developer",
            "manager_id": "cto",
            "body": "Builds features.",
            "allowed_tools": ["task.*"],
            "can_use_subagents": False,
        },
    )
    assert created.status_code == 200
    assert created.json()["employee"]["id"] == "developer"
    assert created.json()["employee"]["manager_id"] == "cto"

    updated = client.put(
        "/v1/plugins/afkbotui/task-flow/employees/developer",
        params={"profile_id": "default"},
        json={
            "id": "developer",
            "name": "Developer",
            "title": "Senior Developer",
            "role": "developer",
            "status": "disabled",
            "manager_id": "cto",
            "body": "Builds features.",
            "allowed_tools": ["task.*"],
            "can_use_subagents": False,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["employee"]["id"] == "developer"
    assert updated.json()["employee"]["status"] == "disabled"

    mismatched = client.put(
        "/v1/plugins/afkbotui/task-flow/employees/developer",
        params={"profile_id": "default"},
        json={
            "id": "other",
            "name": "Developer",
            "title": "Developer",
            "role": "developer",
        },
    )
    assert mismatched.status_code == 400
    assert mismatched.json()["detail"]["error_code"] == "employee_id_mismatch"

    deleted = client.delete(
        "/v1/plugins/afkbotui/task-flow/employees/developer",
        params={"profile_id": "default"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
