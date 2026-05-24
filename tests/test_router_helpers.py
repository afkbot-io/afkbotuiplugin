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
            observed.setdefault("updates", []).append(kwargs)
            observed["update"] = kwargs
            assert "prompt" not in kwargs
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
    assert observed["update"]["description"] == "Update the route contract."
    assert "reviewer_type" not in observed["update"]
    assert "reviewer_ref" not in observed["update"]

    clear_reviewer_response = client.patch(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1",
        json={"reviewer_ref": None, "reviewer_type": None},
        params={"profile_id": "default"},
    )
    assert clear_reviewer_response.status_code == 200
    assert observed["update"]["reviewer_type"] is None
    assert observed["update"]["reviewer_ref"] is None


def test_task_flow_docs_context_and_feed_routes_forward_to_service(monkeypatch) -> None:
    observed: dict[str, dict[str, object]] = {}

    class Dumpable:
        def __init__(self, payload: dict[str, object]) -> None:
            self.payload = payload

        def model_dump(self, *, mode: str) -> dict[str, object]:
            assert mode == "json"
            return self.payload

    class FakeTaskFlowService:
        async def list_flow_documents(self, **kwargs: object) -> list[Dumpable]:
            observed["list_flow_documents"] = kwargs
            return [Dumpable({"id": "doc-flow-plan", "document_key": "plan"})]

        async def put_task_document(self, **kwargs: object) -> Dumpable:
            observed["put_task_document"] = kwargs
            return Dumpable({"id": "doc-task-plan", "document_key": "plan"})

        async def confirm_document(self, **kwargs: object) -> Dumpable:
            observed["confirm_document"] = kwargs
            return Dumpable({"id": kwargs["document_id"], "confirmation_status": "confirmed"})

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

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {"task_flow_actor_ref": "default", "task_flow_actor_type": "ai_profile"}

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
            "actor_ref": "default",
            "actor_type": "ai_profile",
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
        json={"actor_ref": "default", "actor_type": "ai_profile", "expected_revision": 2},
        params={"profile_id": "default"},
    )
    assert confirm_response.status_code == 200
    assert observed["confirm_document"]["expected_revision"] == 2

    context_response = client.get(
        "/v1/plugins/afkbotui/task-flow/tasks/task-1/context",
        params={"profile_id": "default"},
    )
    assert context_response.status_code == 200
    assert observed["build_task_context"] == {"profile_id": "default", "task_id": "task-1"}

    feed_response = client.get(
        "/v1/plugins/afkbotui/task-flow/feed",
        params={"profile_id": "default", "owner_ref": "default:researcher", "owner_type": "ai_subagent"},
    )
    assert feed_response.status_code == 200
    assert observed["build_agent_inbox"]["owner_type"] == "ai_subagent"
    assert observed["build_agent_inbox"]["owner_ref"] == "default:researcher"
    assert observed["build_agent_inbox"]["task_limit"] == 30
    assert observed["build_agent_inbox"]["event_limit"] == 20


def test_task_flow_subagents_route_exposes_core_and_profile_team_members(monkeypatch, tmp_path) -> None:
    core_path = tmp_path / "afkbot" / "subagents" / "backend-engineer.md"
    profile_path = tmp_path / "profiles" / "default" / "subagents" / "reviewer.md"
    core_path.parent.mkdir(parents=True)
    profile_path.parent.mkdir(parents=True)
    core_path.write_text("# backend-engineer\nOwn backend implementation.", encoding="utf-8")
    profile_path.write_text("# reviewer\nOwn review gates.", encoding="utf-8")

    class FakeLoader:
        def __init__(self, _settings) -> None:
            pass

        async def list_subagents(self, profile_id: str):
            assert profile_id == "default"
            return [
                SimpleNamespace(name="backend-engineer", origin="core", path=core_path),
                SimpleNamespace(name="orchestrator", origin="core", path=core_path),
                SimpleNamespace(name="reviewer", origin="profile", path=profile_path),
            ]

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    app = FastAPI()
    monkeypatch.setattr(router_module, "get_settings", lambda: SimpleNamespace(root_dir=tmp_path))
    monkeypatch.setattr(router_module, "SubagentLoader", FakeLoader)
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    response = client.get("/v1/plugins/afkbotui/task-flow/subagents", params={"profile_id": "default"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["filtered_count"] == 2
    assert payload["subagents"] == [
        {
            "name": "backend-engineer",
            "origin": "core",
            "owner_ref": "default:backend-engineer",
            "path": "afkbot/subagents/backend-engineer.md",
            "profile_id": "default",
            "summary": "backend-engineer",
        },
        {
            "name": "reviewer",
            "origin": "profile",
            "owner_ref": "default:reviewer",
            "path": "profiles/default/subagents/reviewer.md",
            "profile_id": "default",
            "summary": "reviewer",
        },
    ]

    filtered = client.get(
        "/v1/plugins/afkbotui/task-flow/subagents",
        params={"profile_id": "default", "q": "review"},
    )
    assert filtered.status_code == 200
    assert [item["name"] for item in filtered.json()["subagents"]] == ["reviewer"]


def test_task_flow_team_route_reads_and_updates_team_config_without_runtime_materialization(
    monkeypatch,
    tmp_path,
) -> None:
    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    class FakeProfileService:
        async def list(self):
            return [
                SimpleNamespace(id="default"),
                SimpleNamespace(id="analyst"),
                SimpleNamespace(id="outsider"),
            ]

    class FakeTaskFlowTeamConfigService:
        def __init__(self) -> None:
            self.team_profile_ids: tuple[str, ...] | None = None

        def load(self, profile_id: str) -> tuple[str, ...] | None:
            assert profile_id == "default"
            return self.team_profile_ids

        def write(self, profile_id: str, team_profile_ids: tuple[str, ...]) -> None:
            assert profile_id == "default"
            self.team_profile_ids = team_profile_ids

    team_configs = FakeTaskFlowTeamConfigService()
    settings = SimpleNamespace(llm_model="gpt-4o-mini", llm_provider="openai", root_dir=tmp_path)
    monkeypatch.setattr(router_module, "get_settings", lambda: settings)
    monkeypatch.setattr(router_module, "get_profile_service", lambda _settings: FakeProfileService())
    monkeypatch.setattr(router_module, "get_taskflow_team_config_service", lambda _settings: team_configs)

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    initial = client.get("/v1/plugins/afkbotui/task-flow/team", params={"profile_id": "default"})
    assert initial.status_code == 200
    assert initial.json()["team"]["allowed_profile_ids"] == ["default"]

    unknown = client.get("/v1/plugins/afkbotui/task-flow/team", params={"profile_id": "missing"})
    assert unknown.status_code == 400
    assert unknown.json()["detail"]["error_code"] == "invalid_task_flow_team"

    updated = client.patch(
        "/v1/plugins/afkbotui/task-flow/team",
        json={"taskflow_team_profile_ids": ["analyst", "analyst", ""]},
        params={"profile_id": "default"},
    )
    assert updated.status_code == 200
    assert updated.json()["team"]["taskflow_team_profile_ids"] == ["analyst"]
    assert updated.json()["team"]["allowed_profile_ids"] == ["default", "analyst"]
    assert team_configs.team_profile_ids == ("analyst",)

    invalid = client.patch(
        "/v1/plugins/afkbotui/task-flow/team",
        json={"taskflow_team_profile_ids": ["missing"]},
        params={"profile_id": "default"},
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["error_code"] == "invalid_task_flow_team"


def test_task_flow_subagents_route_can_expand_allowed_team_profiles(monkeypatch, tmp_path) -> None:
    default_path = tmp_path / "afkbot" / "subagents" / "backend-engineer.md"
    analyst_path = tmp_path / "profiles" / "analyst" / "subagents" / "reviewer.md"
    default_path.parent.mkdir(parents=True)
    analyst_path.parent.mkdir(parents=True)
    default_path.write_text("# backend-engineer\nOwn backend implementation.", encoding="utf-8")
    analyst_path.write_text("# reviewer\nOwn analyst review gates.", encoding="utf-8")

    class FakeLoader:
        def __init__(self, _settings) -> None:
            pass

        async def list_subagents(self, profile_id: str):
            if profile_id == "default":
                return [SimpleNamespace(name="backend-engineer", origin="core", path=default_path)]
            if profile_id == "analyst":
                return [SimpleNamespace(name="reviewer", origin="profile", path=analyst_path)]
            raise AssertionError(profile_id)

    class FakeProfileService:
        async def list(self):
            return [SimpleNamespace(id="default"), SimpleNamespace(id="analyst")]

    class FakeTaskFlowTeamConfigService:
        def load(self, profile_id: str) -> tuple[str, ...]:
            assert profile_id == "default"
            return ("analyst",)

    class FakeRegistry:
        def read_config(self) -> dict[str, object]:
            return {}

        def write_config(self, payload: dict[str, object]) -> None:
            del payload

        def reset_config(self) -> None:
            pass

    settings = SimpleNamespace(root_dir=tmp_path)
    monkeypatch.setattr(router_module, "get_settings", lambda: settings)
    monkeypatch.setattr(router_module, "get_profile_service", lambda _settings: FakeProfileService())
    monkeypatch.setattr(router_module, "get_taskflow_team_config_service", lambda _settings: FakeTaskFlowTeamConfigService())
    monkeypatch.setattr(router_module, "SubagentLoader", FakeLoader)

    app = FastAPI()
    app.include_router(
        router_module.build_router(api_prefix="/v1/plugins/afkbotui", registry=FakeRegistry())
    )
    client = TestClient(app)

    response = client.get(
        "/v1/plugins/afkbotui/task-flow/subagents",
        params={"profile_id": "default", "team": "1"},
    )
    assert response.status_code == 200
    assert response.json()["subagents"] == [
        {
            "name": "backend-engineer",
            "origin": "core",
            "owner_ref": "default:backend-engineer",
            "path": "afkbot/subagents/backend-engineer.md",
            "profile_id": "default",
            "summary": "backend-engineer",
        },
        {
            "name": "reviewer",
            "origin": "profile",
            "owner_ref": "analyst:reviewer",
            "path": "profiles/analyst/subagents/reviewer.md",
            "profile_id": "analyst",
            "summary": "reviewer",
        },
    ]
