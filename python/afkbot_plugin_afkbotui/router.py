"""FastAPI router for the AFKBOT unified admin plugin."""

from __future__ import annotations

import asyncio
from datetime import datetime
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select

from afkbot_plugin_afkbotui.bootstrap_files import get_profile_bootstrap_files_service
from afkbot.db.bootstrap import create_schema
from afkbot.db.engine import create_engine
from afkbot.db.session import create_session_factory, session_scope
from afkbot.models.task_event import TaskEvent
from afkbot.repositories.chat_turn_repo import ChatTurnRepository
from afkbot.services.agent_loop.api_runtime import get_api_session_factory, poll_chat_progress
from afkbot.services.agent_loop.api_runtime_support import dispose_owned_engine, resolve_session_resources
from afkbot.services.agent_loop.progress_stream import ProgressCursor
from afkbot.services.automations import AutomationsServiceError, get_automations_service
from afkbot.services.automations.contracts import AutomationMetadata
from afkbot.services.employees import EmployeeService, EmployeeServiceError
from afkbot.services.plugins.contracts import PluginServiceError
from afkbot.services.plugins.runtime_registry import PluginRuntimeRegistry
from afkbot.services.policy import ProfileFilesLockedError
from afkbot.services.profile_runtime import ProfileServiceError, get_profile_service
from afkbot.services.skills import get_profile_skill_service
from afkbot.services.subagents.profile_service import get_profile_subagent_service
from afkbot.services.task_flow import TaskFlowServiceError, get_task_flow_service
from afkbot.services.task_flow.human_ref import resolve_local_human_ref
from afkbot.settings import get_settings

_TASK_COMMENT_PREVIEW_SCHEMA_READY = False
_TASK_COMMENT_PREVIEW_SCHEMA_LOCK: asyncio.Lock | None = None


class UiPluginConfig(BaseModel):
    """Validated runtime config exposed to the static UI."""

    model_config = ConfigDict(extra="forbid")

    poll_interval_sec: int = Field(default=5, ge=5, le=300)
    default_profile_id: str = Field(default="default", min_length=1, max_length=120)
    task_flow_poll_interval_sec: int = Field(default=5, ge=1, le=300)
    task_flow_board_limit_per_column: int = Field(default=20, ge=1, le=200)
    task_flow_actor_type: Literal["human", "employee"] = "human"
    task_flow_actor_ref: str = Field(default="web-user", min_length=1, max_length=120)


class UiPluginConfigPatchPayload(BaseModel):
    """Patch payload for persisted plugin config."""

    model_config = ConfigDict(extra="forbid")

    poll_interval_sec: int | None = Field(default=None, ge=5, le=300)
    default_profile_id: str | None = Field(default=None, min_length=1, max_length=120)
    task_flow_poll_interval_sec: int | None = Field(default=None, ge=1, le=300)
    task_flow_board_limit_per_column: int | None = Field(default=None, ge=1, le=200)
    task_flow_actor_type: Literal["human", "employee"] | None = None
    task_flow_actor_ref: str | None = Field(default=None, min_length=1, max_length=120)


class UiPluginConfigEnvelope(BaseModel):
    """Envelope compatible with older Task Flow config writes."""

    model_config = ConfigDict(extra="forbid")

    config: UiPluginConfigPatchPayload


class TaskFlowEmployeeCreatePayload(BaseModel):
    """Request body for creating a profile-local Task Flow employee."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=160)
    role: str = Field(min_length=1, max_length=120)
    status: Literal["active", "disabled", "archived"] = "active"
    manager_id: str | None = Field(default=None, max_length=120)
    body: str = Field(default="", max_length=8000)
    allowed_tools: list[str] = Field(default_factory=list, max_length=80)
    can_use_subagents: bool = False
    subagent_allowlist: list[str] = Field(default_factory=list, max_length=80)


class AutomationCreatePayload(BaseModel):
    """Request body for automation creation."""

    name: str = Field(min_length=1, max_length=255)
    prompt: str = Field(min_length=1, max_length=12000)
    trigger_type: Literal["cron", "webhook"]
    cron_expr: str | None = Field(default=None, max_length=64)
    timezone_name: str | None = Field(default=None, max_length=64)


class AutomationPatchPayload(BaseModel):
    """Request body for automation update."""

    name: str | None = Field(default=None, max_length=255)
    prompt: str | None = Field(default=None, max_length=12000)
    status: Literal["active", "paused"] | None = None
    cron_expr: str | None = Field(default=None, max_length=64)
    timezone_name: str | None = Field(default=None, max_length=64)
    rotate_webhook_token: bool | None = None


class TaskFlowCreatePayload(BaseModel):
    """Request body for one task flow create action."""

    title: str = Field(min_length=1, max_length=240)
    description: str | None = None
    created_by_type: str = Field(default="human", min_length=1)
    created_by_ref: str = Field(default="web-user", min_length=1)
    default_owner_type: str | None = None
    default_owner_ref: str | None = None
    labels: tuple[str, ...] = ()


class TaskFlowPatchPayload(BaseModel):
    """Request body for editable task flow metadata."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = None
    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)
    default_owner_type: str | None = None
    default_owner_ref: str | None = None
    labels: tuple[str, ...] | None = None


class TaskCreatePayload(BaseModel):
    """Request body for one task create action."""

    title: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default=None, min_length=1, max_length=12000)
    prompt: str | None = Field(default=None, min_length=1, max_length=12000)
    created_by_type: str = Field(default="human", min_length=1)
    created_by_ref: str = Field(default="web-user", min_length=1)
    flow_id: str | None = None
    priority: int = Field(default=50, ge=0, le=100)
    due_at: datetime | None = None
    owner_type: str | None = None
    owner_ref: str | None = None
    reviewer_type: str | None = None
    reviewer_ref: str | None = None
    source_type: str = Field(default="ui_task_flow", min_length=1, max_length=64)
    source_ref: str | None = Field(default="plugin:afkbotui")
    labels: tuple[str, ...] = ()
    requires_review: bool = False
    depends_on_task_ids: tuple[str, ...] = ()


class TaskCommentCreatePayload(BaseModel):
    """Request body for one kanban task comment."""

    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(min_length=1)
    message: str = Field(min_length=1, max_length=4000)
    comment_type: str = Field(default="note", min_length=1, max_length=64)
    task_run_id: int | None = None


class TaskPatchPayload(BaseModel):
    """Request body for one task update."""

    title: str | None = None
    description: str | None = Field(default=None, max_length=12000)
    prompt: str | None = Field(default=None, max_length=12000)
    status: str | None = None
    priority: int | None = None
    due_at: datetime | None = None
    owner_type: str | None = None
    owner_ref: str | None = None
    reviewer_type: str | None = None
    reviewer_ref: str | None = None
    requires_review: bool | None = None
    labels: tuple[str, ...] | None = None
    blocked_reason_code: str | None = None
    blocked_reason_text: str | None = None
    actor_type: str | None = None
    actor_ref: str | None = None


class ReviewApprovePayload(BaseModel):
    """Request body for approving one review task."""

    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)


class ReviewRequestChangesPayload(BaseModel):
    """Request body for requesting changes on one review task."""

    reason_text: str = Field(min_length=1, max_length=4000)
    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)
    owner_type: str | None = None
    owner_ref: str | None = None
    reason_code: str = Field(default="review_changes_requested", min_length=1, max_length=64)


class TaskBulkUpdatePayload(BaseModel):
    """Request body for bulk task changes from the Task Flow board."""

    task_ids: tuple[str, ...] = Field(min_length=1)
    status: str | None = None
    priority: int | None = None
    due_at: datetime | None = None
    owner_type: str | None = None
    owner_ref: str | None = None
    reviewer_type: str | None = None
    reviewer_ref: str | None = None
    requires_review: bool | None = None
    labels: tuple[str, ...] | None = None
    blocked_reason_code: str | None = None
    blocked_reason_text: str | None = None
    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)
    skip_active: bool = True
    comment_message: str | None = Field(default=None, max_length=4000)
    comment_type: str = Field(default="note", min_length=1, max_length=64)


class TaskBulkDeletePayload(BaseModel):
    """Request body for bulk task deletion from the Task Flow board."""

    task_ids: tuple[str, ...] = Field(min_length=1)
    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)


class TaskDocumentPutPayload(BaseModel):
    """Request body for creating or updating one Task Flow document."""

    scope_type: Literal["flow", "task"]
    scope_id: str = Field(min_length=1, max_length=128)
    document_key: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=240)
    body: str = Field(default="", max_length=200000)
    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)
    base_revision: int | None = Field(default=None, ge=1)


class TaskDocumentConfirmPayload(BaseModel):
    """Request body for confirming one Task Flow document revision."""

    model_config = ConfigDict(extra="forbid")

    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)
    expected_revision: int | None = Field(default=None, ge=1)


class TaskDocumentDeletePayload(BaseModel):
    """Request body for deleting one Task Flow document."""

    model_config = ConfigDict(extra="forbid")

    actor_type: str = Field(default="human", min_length=1)
    actor_ref: str = Field(default="web-user", min_length=1)
    expected_revision: int | None = Field(default=None, ge=1)


class SubagentCreatePayload(BaseModel):
    """Request body for profile subagent creation."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: str = Field(min_length=1, max_length=128)
    markdown: str = Field(min_length=1, max_length=200000)


class SubagentPatchPayload(BaseModel):
    """Request body for profile subagent updates."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=128)
    markdown: str | None = Field(default=None, min_length=1, max_length=200000)


class SkillCreatePayload(BaseModel):
    """Request body for profile skill creation."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: str = Field(min_length=1, max_length=128)
    markdown: str = Field(min_length=1, max_length=200000)


class SkillPatchPayload(BaseModel):
    """Request body for profile skill updates."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=128)
    markdown: str | None = Field(default=None, min_length=1, max_length=200000)


class BootstrapFileCreatePayload(BaseModel):
    """Request body for profile bootstrap file creation."""

    model_config = ConfigDict(extra="forbid")

    file_name: str = Field(min_length=1, max_length=128)
    content: str = Field(default="", max_length=200000)


class BootstrapFilePatchPayload(BaseModel):
    """Request body for profile bootstrap file updates."""

    model_config = ConfigDict(extra="forbid")

    file_name: str | None = Field(default=None, min_length=1, max_length=128)
    content: str | None = Field(default=None, max_length=200000)


def _task_payload_description(payload: TaskCreatePayload | TaskPatchPayload) -> str | None:
    """Return canonical Task Flow description from new or legacy UI payloads."""

    return payload.description if payload.description is not None else payload.prompt


def build_router(*, api_prefix: str, registry: PluginRuntimeRegistry) -> APIRouter:
    """Build a router exposing the unified AFKBOT admin workspace APIs."""

    router = APIRouter(prefix=api_prefix, tags=["plugin-afkbotui"])

    def read_config() -> UiPluginConfig:
        try:
            return UiPluginConfig.model_validate(_normalize_config_payload(registry.read_config()))
        except PluginServiceError as exc:
            raise _plugin_http_error(exc) from exc
        except ValidationError as exc:
            raise HTTPException(
                status_code=400,
                detail={"error_code": "invalid_plugin_config", "reason": str(exc)},
            ) from exc

    def write_config(payload: UiPluginConfigPatchPayload | UiPluginConfigEnvelope) -> UiPluginConfig:
        patch = payload.config if isinstance(payload, UiPluginConfigEnvelope) else payload
        current = read_config().model_dump(mode="json")
        current.update(patch.model_dump(exclude_none=True))
        try:
            registry.write_config(current)
        except PluginServiceError as exc:
            raise _plugin_http_error(exc) from exc
        return read_config()

    def serialize_config(config: UiPluginConfig) -> dict[str, object]:
        payload = config.model_dump(mode="json")
        return {"config": payload, "plugin_config": {"config": payload}}

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "plugin": "afkbotui"}

    @router.get("/config")
    async def get_config() -> dict[str, object]:
        return serialize_config(read_config())

    @router.get("/ui-config")
    async def get_ui_config() -> dict[str, object]:
        return serialize_config(read_config())

    @router.patch("/config")
    async def patch_config(payload: UiPluginConfigPatchPayload | UiPluginConfigEnvelope) -> dict[str, object]:
        return serialize_config(write_config(payload))

    @router.put("/config")
    async def put_config(payload: UiPluginConfigPatchPayload | UiPluginConfigEnvelope) -> dict[str, object]:
        return serialize_config(write_config(payload))

    @router.delete("/config")
    async def delete_config() -> dict[str, object]:
        try:
            registry.reset_config()
        except PluginServiceError as exc:
            raise _plugin_http_error(exc) from exc
        return serialize_config(read_config())

    @router.get("/profiles")
    async def profiles() -> dict[str, object]:
        service = get_profile_service(get_settings())
        try:
            payload = await service.list()
        except ProfileServiceError as exc:
            raise _profile_http_error(exc) from exc
        return {"profiles": [item.model_dump(mode="json") for item in payload]}

    @router.get("/automations")
    async def list_automations(
        profile_id: str = "default",
        include_deleted: bool = False,
        trigger_type: Literal["cron", "webhook"] | None = None,
        status: Literal["active", "paused", "deleted"] | None = None,
        q: str = "",
    ) -> dict[str, object]:
        service = get_automations_service(get_settings())
        try:
            items = await service.list(profile_id=profile_id, include_deleted=include_deleted)
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc

        summary = _build_summary(items)
        filtered_items = [
            item
            for item in items
            if _matches_filters(
                item=item,
                trigger_type=trigger_type,
                status=status,
                query=q,
            )
        ]
        filtered_items.sort(key=_sort_key, reverse=True)
        return {
            "automations": [_serialize_automation(item) for item in filtered_items],
            "summary": summary,
            "filtered_count": len(filtered_items),
        }

    @router.get("/automations/{automation_id}")
    async def get_automation(
        automation_id: int,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_automations_service(get_settings())
        try:
            item = await service.get(profile_id=profile_id, automation_id=automation_id)
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc
        return {"automation": _serialize_automation(item)}

    @router.get("/automations/{automation_id}/webhook-endpoint")
    async def get_automation_webhook_endpoint(
        automation_id: int,
        profile_id: str = "default",
        response: Response = None,
    ) -> dict[str, object]:
        service = get_automations_service(get_settings())
        try:
            item = await service.get(profile_id=profile_id, automation_id=automation_id)
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc
        if item.trigger_type != "webhook":
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "automation_not_webhook",
                    "reason": "Webhook endpoint reveal is available only for webhook automations",
                },
            )
        try:
            endpoint = await service.reveal_webhook_endpoint(
                profile_id=profile_id,
                automation_id=automation_id,
            )
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc
        _mark_private_no_store(response)
        return {"webhook": endpoint.model_dump(mode="json")}

    @router.get("/automations/{automation_id}/graph-preview")
    async def get_automation_graph_preview(
        automation_id: int,
        profile_id: str = "default",
        limit: int = 6,
    ) -> dict[str, object]:
        service = get_automations_service(get_settings())
        try:
            automation = await service.get(profile_id=profile_id, automation_id=automation_id)
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc

        graph_payload: dict[str, object] | None = None
        validation_payload: dict[str, object] | None = None
        recent_runs: list[dict[str, object]] = []
        latest_trace: dict[str, object] | None = None
        graph_error: dict[str, str] | None = None
        ai_handoff_present = False

        if automation.execution_mode == "graph":
            try:
                graph = await service.get_graph(profile_id=profile_id, automation_id=automation_id)
                validation = await service.validate_graph(profile_id=profile_id, automation_id=automation_id)
                runs = await service.list_graph_runs(
                    profile_id=profile_id,
                    automation_id=automation_id,
                    limit=max(1, min(int(limit or 6), 12)),
                )
                graph_payload = _serialize_graph_preview_graph(graph.model_dump(mode="json"))
                validation_payload = _serialize_graph_preview_validation(
                    validation.model_dump(mode="json")
                )
                recent_runs = [_serialize_graph_preview_run(item.model_dump(mode="json")) for item in runs]
                ai_handoff_present = _graph_has_ai_handoff(graph_payload)
                if runs:
                    latest_trace = _serialize_graph_preview_trace(
                        (
                            await service.get_graph_trace(
                                profile_id=profile_id,
                                run_id=runs[0].id,
                            )
                        ).model_dump(mode="json")
                    )
            except AutomationsServiceError as exc:
                if exc.error_code != "automation_graph_missing":
                    raise _automation_http_error(exc) from exc
                graph_error = {"error_code": exc.error_code, "reason": exc.reason}

        return {
            "automation_id": automation.id,
            "profile_id": automation.profile_id,
            "execution_mode": automation.execution_mode,
            "graph_available": graph_payload is not None,
            "graph": graph_payload,
            "validation": validation_payload,
            "recent_runs": recent_runs,
            "latest_trace": latest_trace,
            "ai_handoff_present": ai_handoff_present,
            "graph_error": graph_error,
        }

    @router.post("/automations")
    async def create_automation(
        payload: AutomationCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_automations_service(get_settings())
        try:
            if payload.trigger_type == "cron":
                if payload.cron_expr is None:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "error_code": "invalid_cron_expr",
                            "reason": "cron_expr is required for cron trigger",
                        },
                    )
                item = await service.create_cron(
                    profile_id=profile_id,
                    name=payload.name,
                    prompt=payload.prompt,
                    cron_expr=payload.cron_expr,
                    timezone_name=payload.timezone_name or "UTC",
                )
            else:
                if payload.cron_expr is not None or payload.timezone_name is not None:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "error_code": "invalid_update_payload",
                            "reason": "Webhook automations do not accept cron settings",
                        },
                    )
                item = await service.create_webhook(
                    profile_id=profile_id,
                    name=payload.name,
                    prompt=payload.prompt,
                )
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc
        return {"automation": _serialize_automation(item)}

    @router.patch("/automations/{automation_id}")
    async def patch_automation(
        automation_id: int,
        payload: AutomationPatchPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_automations_service(get_settings())
        try:
            item = await service.update(
                profile_id=profile_id,
                automation_id=automation_id,
                name=payload.name,
                prompt=payload.prompt,
                status=payload.status,
                cron_expr=payload.cron_expr,
                timezone_name=payload.timezone_name,
                rotate_webhook_token=payload.rotate_webhook_token,
            )
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc
        return {"automation": _serialize_automation(item)}

    @router.delete("/automations/{automation_id}")
    async def delete_automation(
        automation_id: int,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_automations_service(get_settings())
        try:
            await service.delete(profile_id=profile_id, automation_id=automation_id)
        except AutomationsServiceError as exc:
            raise _automation_http_error(exc) from exc
        return {"deleted": True, "automation_id": automation_id}

    @router.get("/task-flow/flows")
    async def task_flow_list(profile_id: str = "default") -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.list_flows(profile_id=profile_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_flows": [item.model_dump(mode="json") for item in payload]}

    @router.post("/task-flow/flows")
    async def task_flow_create(
        payload: TaskFlowCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.created_by_type,
            actor_ref=payload.created_by_ref,
            config=config,
        )
        try:
            item = await service.create_flow(
                profile_id=profile_id,
                title=payload.title,
                description=payload.description,
                created_by_type=actor_type,
                created_by_ref=actor_ref,
                default_owner_type=payload.default_owner_type,
                default_owner_ref=_normalize_task_flow_human_principal_ref(
                    principal_type=payload.default_owner_type,
                    principal_ref=payload.default_owner_ref,
                ),
                labels=payload.labels,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_flow": item.model_dump(mode="json")}

    @router.patch("/task-flow/flows/{flow_id}")
    async def task_flow_update(
        flow_id: str,
        payload: TaskFlowPatchPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        kwargs: dict[str, object] = {
            "actor_ref": actor_ref,
            "actor_type": actor_type,
            "flow_id": flow_id,
            "profile_id": profile_id,
        }
        for field_name in (
            "default_owner_ref",
            "default_owner_type",
            "description",
            "labels",
            "title",
        ):
            if field_name in payload.model_fields_set:
                kwargs[field_name] = getattr(payload, field_name)
        if "default_owner_ref" in payload.model_fields_set or "default_owner_type" in payload.model_fields_set:
            kwargs["default_owner_ref"] = _normalize_task_flow_human_principal_ref(
                principal_type=kwargs.get("default_owner_type"),
                principal_ref=kwargs.get("default_owner_ref"),
            )
        try:
            item = await service.update_flow(**kwargs)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_flow": item.model_dump(mode="json")}

    @router.delete("/task-flow/flows/{flow_id}")
    async def task_flow_delete(
        flow_id: str,
        payload: ReviewApprovePayload | None = None,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type if payload is not None else None,
            actor_ref=payload.actor_ref if payload is not None else None,
            config=config,
        )
        try:
            await service.delete_flow(
                profile_id=profile_id,
                flow_id=flow_id,
                actor_type=actor_type,
                actor_ref=actor_ref,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"deleted": True, "flow_id": flow_id}

    @router.get("/task-flow/documents")
    async def task_flow_document_workspace(
        profile_id: str = "default",
        query: str | None = None,
        scope_type: Literal["flow", "task"] | None = None,
        confirmation_status: str | None = None,
        limit: int = Query(default=100, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.list_documents(
                profile_id=profile_id,
                scope_type=scope_type,
                confirmation_status=confirmation_status,
                query=query,
                limit=limit,
                offset=offset,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_documents": [item.model_dump(mode="json") for item in payload]}

    @router.get("/task-flow/docs")
    async def task_flow_document_list(
        scope_type: Literal["flow", "task"],
        scope_id: str,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            if scope_type == "flow":
                payload = await service.list_flow_documents(profile_id=profile_id, flow_id=scope_id)
            else:
                payload = await service.list_task_documents(profile_id=profile_id, task_id=scope_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_documents": [item.model_dump(mode="json") for item in payload]}

    @router.put("/task-flow/docs")
    async def task_flow_document_put(
        payload: TaskDocumentPutPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        try:
            if payload.scope_type == "flow":
                item = await service.put_flow_document(
                    profile_id=profile_id,
                    flow_id=payload.scope_id,
                    document_key=payload.document_key,
                    title=payload.title,
                    body=payload.body,
                    actor_type=actor_type,
                    actor_ref=actor_ref,
                    base_revision=payload.base_revision,
                )
            else:
                item = await service.put_task_document(
                    profile_id=profile_id,
                    task_id=payload.scope_id,
                    document_key=payload.document_key,
                    title=payload.title,
                    body=payload.body,
                    actor_type=actor_type,
                    actor_ref=actor_ref,
                    base_revision=payload.base_revision,
                )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_document": item.model_dump(mode="json")}

    @router.post("/task-flow/docs/{document_id}/confirm")
    async def task_flow_document_confirm(
        document_id: str,
        payload: TaskDocumentConfirmPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        try:
            item = await service.confirm_document(
                profile_id=profile_id,
                document_id=document_id,
                actor_type=actor_type,
                actor_ref=actor_ref,
                expected_revision=payload.expected_revision,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_document": item.model_dump(mode="json")}

    @router.delete("/task-flow/docs/{document_id}")
    async def task_flow_document_delete(
        document_id: str,
        payload: TaskDocumentDeletePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        try:
            item = await service.delete_document(
                profile_id=profile_id,
                document_id=document_id,
                actor_type=actor_type,
                actor_ref=actor_ref,
                expected_revision=payload.expected_revision,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"deleted": True, "task_document": item.model_dump(mode="json")}

    @router.get("/task-flow/board")
    async def task_flow_board(
        profile_id: str = "default",
        flow_id: str | None = None,
        owner_type: str | None = None,
        owner_ref: str | None = None,
        labels: str = "",
        limit_per_column: int | None = None,
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        try:
            payload = await service.build_board(
                profile_id=profile_id,
                flow_id=flow_id,
                owner_type=owner_type,
                owner_ref=owner_ref,
                labels=tuple(item.strip() for item in labels.split(",") if item.strip()),
                limit_per_column=limit_per_column or config.task_flow_board_limit_per_column,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"board": await _serialize_board_payload(payload.model_dump(mode="json"))}

    @router.get("/task-flow/sessions/activity")
    async def task_flow_session_activity(
        profile_id: str = "default",
        task_ids: str = "",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        requested_task_ids = tuple(item.strip() for item in task_ids.split(",") if item.strip())
        try:
            payload = await service.list_task_session_activity(
                profile_id=profile_id,
                task_ids=requested_task_ids,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {
            "task_sessions": {
                task_id: (
                    payload[task_id].model_dump(mode="json")
                    if task_id in payload
                    else None
                )
                for task_id in requested_task_ids
            }
        }

    @router.post("/task-flow/tasks")
    async def task_flow_task_create(
        payload: TaskCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.created_by_type,
            actor_ref=payload.created_by_ref,
            config=config,
        )
        try:
            item = await service.create_task(
                profile_id=profile_id,
                title=payload.title,
                description=_task_payload_description(payload),
                created_by_type=actor_type,
                created_by_ref=actor_ref,
                flow_id=payload.flow_id,
                priority=payload.priority,
                due_at=payload.due_at,
                owner_type=payload.owner_type,
                owner_ref=_normalize_task_flow_human_principal_ref(
                    principal_type=payload.owner_type,
                    principal_ref=payload.owner_ref,
                ),
                reviewer_type=payload.reviewer_type,
                reviewer_ref=_normalize_task_flow_human_principal_ref(
                    principal_type=payload.reviewer_type,
                    principal_ref=payload.reviewer_ref,
                ),
                source_type=payload.source_type,
                source_ref=payload.source_ref,
                labels=payload.labels,
                requires_review=payload.requires_review,
                depends_on_task_ids=payload.depends_on_task_ids,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task": item.model_dump(mode="json")}

    @router.get("/task-flow/tasks/{task_id}")
    async def task_flow_task_get(task_id: str, profile_id: str = "default") -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.get_task(profile_id=profile_id, task_id=task_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task": payload.model_dump(mode="json")}

    @router.get("/task-flow/tasks/{task_id}/context")
    async def task_flow_task_context(task_id: str, profile_id: str = "default") -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.build_task_context(profile_id=profile_id, task_id=task_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"context": payload.model_dump(mode="json")}

    @router.get("/task-flow/feed")
    async def task_flow_agent_feed(
        profile_id: str = "default",
        owner_type: str | None = None,
        owner_ref: str | None = None,
        limit: int | None = 30,
        event_limit: int | None = 20,
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        try:
            payload = await service.build_agent_inbox(
                profile_id=profile_id,
                owner_type=owner_type or config.task_flow_actor_type,
                owner_ref=owner_ref or config.task_flow_actor_ref,
                task_limit=limit,
                event_limit=event_limit,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"feed": payload.model_dump(mode="json")}

    @router.get("/task-flow/employees")
    async def task_flow_employees(profile_id: str = "default", q: str = "") -> dict[str, object]:
        service = EmployeeService(get_settings())
        query = q.strip().lower()
        try:
            employees = await service.list_employees(profile_id=profile_id)
        except EmployeeServiceError as exc:
            raise _employee_http_error(exc) from exc
        records = [_serialize_task_flow_employee(employee) for employee in employees]
        if query:
            records = [
                record
                for record in records
                if query
                in " ".join(
                    str(record.get(field) or "")
                    for field in ("id", "name", "title", "role", "status", "summary", "path")
                ).lower()
            ]
        return {"employees": records, "filtered_count": len(records)}

    @router.post("/task-flow/employees")
    async def create_task_flow_employee(
        payload: TaskFlowEmployeeCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = EmployeeService(get_settings())
        content = _render_task_flow_employee_markdown(payload)
        try:
            employee = await service.upsert_employee(
                profile_id=profile_id,
                employee_id=payload.id,
                content=content,
            )
        except EmployeeServiceError as exc:
            raise _employee_http_error(exc) from exc
        return {"employee": _serialize_task_flow_employee(employee)}

    @router.put("/task-flow/employees/{employee_id}")
    async def update_task_flow_employee(
        employee_id: str,
        payload: TaskFlowEmployeeCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        if payload.id != employee_id:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "employee_id_mismatch",
                    "reason": "Employee id in the payload must match the URL.",
                },
            )
        service = EmployeeService(get_settings())
        content = _render_task_flow_employee_markdown(payload)
        try:
            employee = await service.upsert_employee(
                profile_id=profile_id,
                employee_id=employee_id,
                content=content,
            )
        except EmployeeServiceError as exc:
            raise _employee_http_error(exc) from exc
        return {"employee": _serialize_task_flow_employee(employee)}

    @router.delete("/task-flow/employees/{employee_id}")
    async def delete_task_flow_employee(employee_id: str, profile_id: str = "default") -> dict[str, object]:
        service = EmployeeService(get_settings())
        try:
            chart = await service.build_org_chart(profile_id=profile_id)
            employee = chart.employees.get(employee_id)
            if employee is not None and employee.derived_reports:
                raise EmployeeServiceError(
                    error_code="employee_has_reports",
                    reason=(
                        f"Employee {employee_id} manages other employees. Reassign or delete those "
                        "reports before deleting this employee."
                    ),
                )
            employee = await service.delete_employee(profile_id=profile_id, employee_id=employee_id)
        except EmployeeServiceError as exc:
            raise _employee_http_error(exc) from exc
        return {"deleted": True, "employee": _serialize_task_flow_employee(employee)}

    @router.get("/task-flow/org-chart")
    async def task_flow_org_chart(profile_id: str = "default") -> dict[str, object]:
        service = EmployeeService(get_settings())
        try:
            payload = await service.build_org_chart(profile_id=profile_id)
        except EmployeeServiceError as exc:
            raise _employee_http_error(exc) from exc
        return {"org_chart": payload.model_dump(mode="json")}

    @router.get("/task-flow/tasks/{task_id}/session")
    async def task_flow_task_session_insights(
        task_id: str,
        profile_id: str = "default",
        history_limit: int = 6,
        progress_limit: int = 18,
        run_id: int | None = None,
        after_event_id: int = 0,
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        settings = get_settings()
        try:
            task = await service.get_task(profile_id=profile_id, task_id=task_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc

        session_payload = _build_task_session_payload(task.model_dump(mode="json"))
        session_id = str(session_payload.get("session_id") or "").strip() if session_payload is not None else ""
        session_profile_id = (
            str(session_payload.get("session_profile_id") or "").strip()
            if session_payload is not None
            else ""
        )
        normalized_history_limit = max(1, min(int(history_limit or 6), 12))
        normalized_progress_limit = max(1, min(int(progress_limit or 18), 40))

        if not session_id or not session_profile_id:
            return {
                "session": session_payload,
                "turns": [],
                "progress": {
                    "events": [],
                    "cursor": ProgressCursor(run_id=run_id, last_event_id=after_event_id).model_dump(mode="json"),
                },
            }

        resources = await resolve_session_resources(
            shared_session_factory=get_api_session_factory(),
            settings=settings,
        )
        try:
            async with session_scope(resources.session_factory) as db:
                turns = await ChatTurnRepository(db).list_recent(
                    profile_id=session_profile_id,
                    session_id=session_id,
                    limit=normalized_history_limit,
                )
        finally:
            await dispose_owned_engine(resources)

        progress = await poll_chat_progress(
            profile_id=session_profile_id,
            session_id=session_id,
            cursor=ProgressCursor(run_id=run_id, last_event_id=after_event_id),
        )
        serialized_events = [item.model_dump(mode="json") for item in progress.events[-normalized_progress_limit:]]
        serialized_turns = [
            {
                "id": item.id,
                "session_id": item.session_id,
                "profile_id": item.profile_id,
                "user_message": item.user_message,
                "assistant_message": item.assistant_message,
            }
            for item in turns
        ]
        return {
            "session": session_payload,
            "turns": serialized_turns,
            "progress": {
                "events": serialized_events,
                "cursor": progress.cursor.model_dump(mode="json"),
            },
        }

    @router.patch("/task-flow/tasks/{task_id}")
    async def task_flow_task_patch(
        task_id: str,
        payload: TaskPatchPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        try:
            update_kwargs: dict[str, object] = {
                "profile_id": profile_id,
                "task_id": task_id,
                "title": payload.title,
                "description": _task_payload_description(payload),
                "status": payload.status,
                "priority": payload.priority,
                "due_at": payload.due_at,
                "owner_type": payload.owner_type,
                "owner_ref": _normalize_task_flow_human_principal_ref(
                    principal_type=payload.owner_type,
                    principal_ref=payload.owner_ref,
                ),
                "requires_review": payload.requires_review,
                "labels": payload.labels,
                "actor_type": actor_type,
                "actor_ref": actor_ref,
            }
            if "blocked_reason_code" in payload.model_fields_set:
                update_kwargs["blocked_reason_code"] = payload.blocked_reason_code
            if "blocked_reason_text" in payload.model_fields_set:
                update_kwargs["blocked_reason_text"] = payload.blocked_reason_text
            if "reviewer_type" in payload.model_fields_set:
                update_kwargs["reviewer_type"] = payload.reviewer_type
            if "reviewer_ref" in payload.model_fields_set:
                update_kwargs["reviewer_ref"] = payload.reviewer_ref
            if "reviewer_ref" in payload.model_fields_set or "reviewer_type" in payload.model_fields_set:
                update_kwargs["reviewer_ref"] = _normalize_task_flow_human_principal_ref(
                    principal_type=update_kwargs.get("reviewer_type"),
                    principal_ref=update_kwargs.get("reviewer_ref"),
                )
            item = await service.update_task(**update_kwargs)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task": item.model_dump(mode="json")}

    @router.delete("/task-flow/tasks/{task_id}")
    async def task_flow_task_delete(
        task_id: str,
        payload: ReviewApprovePayload | None = None,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type if payload is not None else None,
            actor_ref=payload.actor_ref if payload is not None else None,
            config=config,
        )
        try:
            await service.delete_task(
                profile_id=profile_id,
                task_id=task_id,
                actor_type=actor_type,
                actor_ref=actor_ref,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"deleted": True, "task_id": task_id}

    @router.post("/task-flow/tasks/bulk-update")
    async def task_flow_task_bulk_update(
        payload: TaskBulkUpdatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        updated_tasks: list[dict[str, object]] = []
        errors: list[dict[str, object]] = []
        for task_id in payload.task_ids:
            try:
                existing = await service.get_task(profile_id=profile_id, task_id=task_id)
                if payload.skip_active and existing.status in {"claimed", "running"}:
                    errors.append(
                        {
                            "task_id": task_id,
                            "error_code": "task_active_conflict",
                            "reason": "Running or claimed tasks are excluded from bulk updates.",
                        }
                    )
                    continue
                update_kwargs: dict[str, object] = {
                    "profile_id": profile_id,
                    "task_id": task_id,
                    "status": payload.status,
                    "priority": payload.priority,
                    "due_at": payload.due_at,
                    "owner_type": payload.owner_type,
                    "owner_ref": _normalize_task_flow_human_principal_ref(
                        principal_type=payload.owner_type,
                        principal_ref=payload.owner_ref,
                    ),
                    "requires_review": payload.requires_review,
                    "labels": payload.labels,
                    "actor_type": actor_type,
                    "actor_ref": actor_ref,
                }
                if "blocked_reason_code" in payload.model_fields_set:
                    update_kwargs["blocked_reason_code"] = payload.blocked_reason_code
                if "blocked_reason_text" in payload.model_fields_set:
                    update_kwargs["blocked_reason_text"] = payload.blocked_reason_text
                if "reviewer_type" in payload.model_fields_set:
                    update_kwargs["reviewer_type"] = payload.reviewer_type
                if "reviewer_ref" in payload.model_fields_set:
                    update_kwargs["reviewer_ref"] = payload.reviewer_ref
                if "reviewer_ref" in payload.model_fields_set or "reviewer_type" in payload.model_fields_set:
                    update_kwargs["reviewer_ref"] = _normalize_task_flow_human_principal_ref(
                        principal_type=update_kwargs.get("reviewer_type"),
                        principal_ref=update_kwargs.get("reviewer_ref"),
                    )
                updated = await service.update_task(**update_kwargs)
                if payload.comment_message:
                    await service.add_task_comment(
                        profile_id=profile_id,
                        task_id=task_id,
                        actor_type=actor_type,
                        actor_ref=actor_ref,
                        message=payload.comment_message,
                        comment_type=payload.comment_type,
                    )
                updated_tasks.append(updated.model_dump(mode="json"))
            except TaskFlowServiceError as exc:
                errors.append(
                    {
                        "task_id": task_id,
                        "error_code": exc.error_code,
                        "reason": exc.reason,
                    }
                )
        return {
            "updated_count": len(updated_tasks),
            "error_count": len(errors),
            "updated_tasks": updated_tasks,
            "errors": errors,
        }

    @router.post("/task-flow/tasks/bulk-delete")
    async def task_flow_task_bulk_delete(
        payload: TaskBulkDeletePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        deleted_task_ids: list[str] = []
        errors: list[dict[str, object]] = []
        seen: set[str] = set()
        for task_id in payload.task_ids:
            normalized_task_id = str(task_id).strip()
            if not normalized_task_id or normalized_task_id in seen:
                continue
            seen.add(normalized_task_id)
            try:
                await service.delete_task(
                    profile_id=profile_id,
                    task_id=normalized_task_id,
                    actor_type=actor_type,
                    actor_ref=actor_ref,
                )
                deleted_task_ids.append(normalized_task_id)
            except TaskFlowServiceError as exc:
                errors.append(
                    {
                        "task_id": normalized_task_id,
                        "error_code": exc.error_code,
                        "reason": exc.reason,
                    }
                )
        return {
            "deleted_count": len(deleted_task_ids),
            "error_count": len(errors),
            "deleted_task_ids": deleted_task_ids,
            "errors": errors,
        }

    @router.get("/task-flow/tasks/{task_id}/comments")
    async def task_flow_task_comments(
        task_id: str,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.list_task_comments(profile_id=profile_id, task_id=task_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_comments": [item.model_dump(mode="json") for item in payload]}

    @router.post("/task-flow/tasks/{task_id}/comments")
    async def task_flow_task_comment_add(
        task_id: str,
        payload: TaskCommentCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        try:
            item = await service.add_task_comment(
                profile_id=profile_id,
                task_id=task_id,
                actor_type=actor_type,
                actor_ref=actor_ref,
                message=payload.message,
                comment_type=payload.comment_type,
                task_run_id=payload.task_run_id,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_comment": item.model_dump(mode="json")}

    @router.get("/task-flow/tasks/{task_id}/dependencies")
    async def task_flow_task_dependencies(
        task_id: str,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.list_dependencies(profile_id=profile_id, task_id=task_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_dependencies": [item.model_dump(mode="json") for item in payload]}

    @router.get("/task-flow/tasks/{task_id}/events")
    async def task_flow_task_events(
        task_id: str,
        profile_id: str = "default",
        limit: int | None = 50,
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.list_task_events(profile_id=profile_id, task_id=task_id, limit=limit)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_events": [item.model_dump(mode="json") for item in payload]}

    @router.get("/task-flow/tasks/{task_id}/runs")
    async def task_flow_task_runs(
        task_id: str,
        profile_id: str = "default",
        limit: int | None = 20,
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            payload = await service.list_task_runs(profile_id=profile_id, task_id=task_id, limit=limit)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_runs": [item.model_dump(mode="json") for item in payload]}

    @router.get("/task-flow/review")
    async def task_flow_review_queue(
        profile_id: str = "default",
        actor_type: str | None = None,
        actor_ref: str | None = None,
        flow_id: str | None = None,
        labels: str = "",
        limit: int | None = 20,
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        resolved_actor_type, resolved_actor_ref = _resolve_task_flow_actor_identity(
            actor_type=actor_type,
            actor_ref=actor_ref,
            config=config,
        )
        try:
            payload = await service.list_review_tasks(
                profile_id=profile_id,
                actor_type=resolved_actor_type,
                actor_ref=resolved_actor_ref,
                flow_id=flow_id,
                labels=tuple(item.strip() for item in labels.split(",") if item.strip()),
                limit=limit,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"review_tasks": [item.model_dump(mode="json") for item in payload]}

    @router.post("/task-flow/tasks/{task_id}/review/approve")
    async def task_flow_review_approve(
        task_id: str,
        payload: ReviewApprovePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        try:
            item = await service.approve_review_task(
                profile_id=profile_id,
                task_id=task_id,
                actor_type=actor_type,
                actor_ref=actor_ref,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task": item.model_dump(mode="json")}

    @router.post("/task-flow/tasks/{task_id}/review/request-changes")
    async def task_flow_review_request_changes(
        task_id: str,
        payload: ReviewRequestChangesPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        config = read_config()
        actor_type, actor_ref = _resolve_task_flow_actor_identity(
            actor_type=payload.actor_type,
            actor_ref=payload.actor_ref,
            config=config,
        )
        try:
            item = await service.request_review_changes(
                profile_id=profile_id,
                task_id=task_id,
                reason_text=payload.reason_text,
                actor_type=actor_type,
                actor_ref=actor_ref,
                owner_type=payload.owner_type,
                owner_ref=_normalize_task_flow_human_principal_ref(
                    principal_type=payload.owner_type,
                    principal_ref=payload.owner_ref,
                ),
                reason_code=payload.reason_code,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task": item.model_dump(mode="json")}

    @router.get("/subagents")
    async def list_subagents(profile_id: str = "default", q: str = "") -> dict[str, object]:
        service = get_profile_subagent_service(get_settings())
        items = await service.list(profile_id=profile_id)
        query = q.strip().lower()
        if query:
            items = [
                item
                for item in items
                if query in item.name.lower()
                or query in item.summary.lower()
                or query in item.path.lower()
            ]
        items.sort(key=lambda item: item.name)
        return {
            "subagents": [item.model_dump(mode="json", exclude_none=True) for item in items],
            "filtered_count": len(items),
        }

    @router.get("/subagents/{name}")
    async def get_subagent(name: str, profile_id: str = "default") -> dict[str, object]:
        service = get_profile_subagent_service(get_settings())
        try:
            payload = await service.get(profile_id=profile_id, name=name)
        except (FileNotFoundError, ValueError) as exc:
            raise _subagent_http_error(exc) from exc
        return {"subagent": payload.model_dump(mode="json", exclude_none=True)}

    @router.post("/subagents")
    async def create_subagent(
        payload: SubagentCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_profile_subagent_service(get_settings())
        try:
            await service.get(profile_id=profile_id, name=payload.name)
        except FileNotFoundError:
            pass
        except ValueError as exc:
            raise _subagent_http_error(exc) from exc
        else:
            raise HTTPException(
                status_code=409,
                detail={
                    "error_code": "profile_subagent_exists",
                    "reason": f"Profile subagent already exists: {payload.name}",
                },
            )
        try:
            item = await service.upsert(profile_id=profile_id, name=payload.name, content=payload.markdown)
        except (ProfileFilesLockedError, ValueError) as exc:
            raise _subagent_http_error(exc) from exc
        return {"subagent": item.model_dump(mode="json", exclude_none=True)}

    @router.patch("/subagents/{name}")
    async def patch_subagent(
        name: str,
        payload: SubagentPatchPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_profile_subagent_service(get_settings())
        try:
            current = await service.get(profile_id=profile_id, name=name)
        except (FileNotFoundError, ValueError) as exc:
            raise _subagent_http_error(exc) from exc
        next_name = payload.name or current.name
        next_markdown = payload.markdown or current.content or ""
        try:
            item = await service.upsert(profile_id=profile_id, name=next_name, content=next_markdown)
            if item.name != current.name:
                await service.delete(profile_id=profile_id, name=current.name)
        except (ProfileFilesLockedError, ValueError) as exc:
            raise _subagent_http_error(exc) from exc
        return {"subagent": item.model_dump(mode="json", exclude_none=True)}

    @router.delete("/subagents/{name}")
    async def delete_subagent(name: str, profile_id: str = "default") -> dict[str, object]:
        service = get_profile_subagent_service(get_settings())
        try:
            item = await service.delete(profile_id=profile_id, name=name)
        except (FileNotFoundError, ProfileFilesLockedError, ValueError) as exc:
            raise _subagent_http_error(exc) from exc
        return {"deleted": True, "subagent": item.model_dump(mode="json", exclude_none=True)}

    @router.get("/skills")
    async def list_skills(profile_id: str = "default", q: str = "") -> dict[str, object]:
        service = get_profile_skill_service(get_settings())
        try:
            items = await service.list(profile_id=profile_id, scope="profile", include_unavailable=True)
        except ValueError as exc:
            raise _skill_http_error(exc) from exc
        query = q.strip().lower()
        if query:
            items = [
                item
                for item in items
                if query in item.name.lower()
                or query in item.summary.lower()
                or query in item.path.lower()
                or any(query in alias.lower() for alias in item.aliases)
                or any(query in requirement.lower() for requirement in item.missing_requirements)
                or any(query in error.lower() for error in item.manifest_errors)
                or query in item.execution_mode.lower()
            ]
        items.sort(key=lambda item: item.name)
        return {
            "skills": [item.model_dump(mode="json", exclude_none=True) for item in items],
            "filtered_count": len(items),
        }

    @router.get("/skills/{name}")
    async def get_skill(name: str, profile_id: str = "default") -> dict[str, object]:
        service = get_profile_skill_service(get_settings())
        try:
            payload = await service.get(profile_id=profile_id, name=name, scope="profile")
        except (FileNotFoundError, ValueError) as exc:
            raise _skill_http_error(exc) from exc
        return {"skill": payload.model_dump(mode="json", exclude_none=True)}

    @router.post("/skills")
    async def create_skill(
        payload: SkillCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_profile_skill_service(get_settings())
        try:
            await service.get(profile_id=profile_id, name=payload.name, scope="profile")
        except FileNotFoundError:
            pass
        except ValueError as exc:
            raise _skill_http_error(exc) from exc
        else:
            raise HTTPException(
                status_code=409,
                detail={
                    "error_code": "profile_skill_exists",
                    "reason": f"Profile skill already exists: {payload.name}",
                },
            )
        try:
            item = await service.upsert(profile_id=profile_id, name=payload.name, content=payload.markdown)
        except (ProfileFilesLockedError, ValueError) as exc:
            raise _skill_http_error(exc) from exc
        return {"skill": item.model_dump(mode="json", exclude_none=True)}

    @router.patch("/skills/{name}")
    async def patch_skill(
        name: str,
        payload: SkillPatchPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_profile_skill_service(get_settings())
        try:
            current = await service.get(profile_id=profile_id, name=name, scope="profile")
        except (FileNotFoundError, ValueError) as exc:
            raise _skill_http_error(exc) from exc
        next_name = payload.name or current.name
        next_markdown = payload.markdown or current.content or ""
        try:
            item = await service.upsert(profile_id=profile_id, name=next_name, content=next_markdown)
            if item.name != current.name:
                await service.delete(profile_id=profile_id, name=current.name)
        except (ProfileFilesLockedError, ValueError) as exc:
            raise _skill_http_error(exc) from exc
        return {"skill": item.model_dump(mode="json", exclude_none=True)}

    @router.delete("/skills/{name}")
    async def delete_skill(name: str, profile_id: str = "default") -> dict[str, object]:
        service = get_profile_skill_service(get_settings())
        try:
            item = await service.delete(profile_id=profile_id, name=name)
        except (FileNotFoundError, ProfileFilesLockedError, ValueError) as exc:
            raise _skill_http_error(exc) from exc
        return {"deleted": True, "skill": item.model_dump(mode="json", exclude_none=True)}

    @router.get("/bootstrap-files")
    async def list_bootstrap_files(profile_id: str = "default", q: str = "") -> dict[str, object]:
        service = get_profile_bootstrap_files_service(get_settings())
        try:
            items = await service.list(profile_id=profile_id)
        except (ProfileServiceError, ValueError) as exc:
            raise _bootstrap_file_http_error(exc) from exc
        query = q.strip().lower()
        if query:
            items = [
                item
                for item in items
                if query in item.file_name.lower()
                or query in item.summary.lower()
                or query in item.path.lower()
            ]
        return {
            "bootstrap_files": [item.model_dump(mode="json", exclude_none=True) for item in items],
            "filtered_count": len(items),
        }

    @router.get("/bootstrap-files/{file_name}")
    async def get_bootstrap_file(file_name: str, profile_id: str = "default") -> dict[str, object]:
        service = get_profile_bootstrap_files_service(get_settings())
        try:
            payload = await service.get(profile_id=profile_id, file_name=file_name)
        except (FileNotFoundError, ProfileServiceError, ValueError) as exc:
            raise _bootstrap_file_http_error(exc) from exc
        return {"bootstrap_file": payload.model_dump(mode="json", exclude_none=True)}

    @router.post("/bootstrap-files")
    async def create_bootstrap_file(
        payload: BootstrapFileCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_profile_bootstrap_files_service(get_settings())
        try:
            item = await service.create(
                profile_id=profile_id,
                file_name=payload.file_name,
                content=payload.content,
            )
        except (FileExistsError, ProfileFilesLockedError, ProfileServiceError, ValueError) as exc:
            raise _bootstrap_file_http_error(exc) from exc
        return {"bootstrap_file": item.model_dump(mode="json", exclude_none=True)}

    @router.patch("/bootstrap-files/{file_name}")
    async def patch_bootstrap_file(
        file_name: str,
        payload: BootstrapFilePatchPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_profile_bootstrap_files_service(get_settings())
        try:
            item = await service.update(
                profile_id=profile_id,
                current_name=file_name,
                next_name=payload.file_name,
                content=payload.content,
            )
        except (FileExistsError, FileNotFoundError, ProfileFilesLockedError, ProfileServiceError, ValueError) as exc:
            raise _bootstrap_file_http_error(exc) from exc
        return {"bootstrap_file": item.model_dump(mode="json", exclude_none=True)}

    @router.delete("/bootstrap-files/{file_name}")
    async def delete_bootstrap_file(file_name: str, profile_id: str = "default") -> dict[str, object]:
        service = get_profile_bootstrap_files_service(get_settings())
        try:
            item = await service.delete(profile_id=profile_id, file_name=file_name)
        except (FileNotFoundError, ProfileFilesLockedError, ProfileServiceError, ValueError) as exc:
            raise _bootstrap_file_http_error(exc) from exc
        return {"deleted": True, "bootstrap_file": item.model_dump(mode="json", exclude_none=True)}

    return router


async def _serialize_board_payload(payload: dict[str, object]) -> dict[str, object]:
    """Enrich board preview tasks with the latest comment metadata."""

    columns = payload.get("columns")
    if not isinstance(columns, list):
        return payload
    task_ids: list[str] = []
    for column in columns:
        if not isinstance(column, dict):
            continue
        for task in column.get("tasks", []):
            if isinstance(task, dict):
                task_id = str(task.get("id") or "").strip()
                if task_id:
                    task_ids.append(task_id)
    previews = await _load_latest_task_comment_previews(task_ids)
    if not previews:
        return payload
    for column in columns:
        if not isinstance(column, dict):
            continue
        for task in column.get("tasks", []):
            if not isinstance(task, dict):
                continue
            preview = previews.get(str(task.get("id") or "").strip())
            if preview is None:
                continue
            task.update(preview)
    return payload


async def _load_latest_task_comment_previews(task_ids: list[str]) -> dict[str, dict[str, str | None]]:
    """Load the latest comment preview for each visible task id."""

    normalized_ids = tuple(dict.fromkeys(task_id.strip() for task_id in task_ids if task_id.strip()))
    if not normalized_ids:
        return {}
    _, session_factory = await _get_task_comment_preview_resources()
    async with session_scope(session_factory) as session:
        ranked_comments = (
            select(
                TaskEvent.task_id.label("task_id"),
                TaskEvent.message.label("message"),
                TaskEvent.actor_type.label("actor_type"),
                TaskEvent.actor_ref.label("actor_ref"),
                TaskEvent.created_at.label("created_at"),
                func.row_number().over(
                    partition_by=TaskEvent.task_id,
                    order_by=(TaskEvent.created_at.desc(), TaskEvent.id.desc()),
                ).label("row_num"),
            )
            .where(
                TaskEvent.task_id.in_(normalized_ids),
                TaskEvent.event_type == "comment_added",
            )
            .subquery()
        )
        rows = await session.execute(
            select(
                ranked_comments.c.task_id,
                ranked_comments.c.message,
                ranked_comments.c.actor_type,
                ranked_comments.c.actor_ref,
                ranked_comments.c.created_at,
            ).where(ranked_comments.c.row_num == 1)
        )
        return {
            str(task_id): {
                "last_comment_message": str(message or "").strip() or None,
                "last_comment_actor_type": str(actor_type or "").strip() or None,
                "last_comment_actor_ref": str(actor_ref or "").strip() or None,
                "last_comment_created_at": created_at.isoformat() if created_at is not None else None,
            }
            for task_id, message, actor_type, actor_ref, created_at in rows.all()
        }


async def _get_task_comment_preview_resources():
    """Return cached DB resources for task comment preview enrichment."""

    global _TASK_COMMENT_PREVIEW_SCHEMA_LOCK, _TASK_COMMENT_PREVIEW_SCHEMA_READY
    engine, session_factory = _task_comment_preview_resources()
    if _TASK_COMMENT_PREVIEW_SCHEMA_READY:
        return engine, session_factory
    if _TASK_COMMENT_PREVIEW_SCHEMA_LOCK is None:
        _TASK_COMMENT_PREVIEW_SCHEMA_LOCK = asyncio.Lock()
    async with _TASK_COMMENT_PREVIEW_SCHEMA_LOCK:
        if not _TASK_COMMENT_PREVIEW_SCHEMA_READY:
            await create_schema(engine)
            _TASK_COMMENT_PREVIEW_SCHEMA_READY = True
    return engine, session_factory


@lru_cache(maxsize=1)
def _task_comment_preview_resources():
    """Create the DB engine/session factory once for board comment preview queries."""

    settings = get_settings()
    engine = create_engine(settings)
    return engine, create_session_factory(engine)


def _serialize_automation(item: AutomationMetadata) -> dict[str, object]:
    """Serialize one automation with derived UI fields."""

    payload = item.model_dump(mode="json")
    if item.trigger_type == "webhook":
        webhook = payload.get("webhook")
        if isinstance(webhook, dict):
            payload["webhook"] = {
                **webhook,
                "webhook_token": None,
                "webhook_path": None,
                "webhook_url": None,
            }
    payload["derived"] = {
        "last_activity_at": _derive_last_activity(item),
        "has_graph": item.execution_mode == "graph",
        "needs_attention": (
            item.webhook is not None and item.webhook.last_execution_status == "failed"
        ),
    }
    return payload


def _mark_private_no_store(response: Response | None) -> None:
    """Prevent browser or proxy caching for secret-bearing operator responses."""

    if response is None:
        return
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"


def _graph_has_ai_handoff(graph_payload: dict[str, object] | None) -> bool:
    """Return whether the serialized graph contains one AI or subagent handoff node."""

    if not graph_payload:
        return False
    nodes = graph_payload.get("nodes")
    if not isinstance(nodes, list):
        return False
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_kind = str(node.get("node_kind") or "").strip().lower()
        if node_kind in {"ai", "agent"}:
            return True
    return False


def _serialize_graph_preview_graph(graph_payload: dict[str, object]) -> dict[str, object]:
    """Reduce one graph snapshot to the fields consumed by the UI preview."""

    nodes = graph_payload.get("nodes")
    edges = graph_payload.get("edges")
    return {
        "flow_id": graph_payload.get("flow_id"),
        "automation_id": graph_payload.get("automation_id"),
        "execution_mode": graph_payload.get("execution_mode"),
        "graph_fallback_mode": graph_payload.get("graph_fallback_mode"),
        "name": graph_payload.get("name"),
        "version": graph_payload.get("version"),
        "status": graph_payload.get("status"),
        "nodes": [
            {
                "id": node.get("id"),
                "key": node.get("key"),
                "name": node.get("name"),
                "node_kind": node.get("node_kind"),
                "node_type": node.get("node_type"),
                "node_version_id": node.get("node_version_id"),
            }
            for node in nodes
            if isinstance(node, dict)
        ]
        if isinstance(nodes, list)
        else [],
        "edges": [
            {
                "id": edge.get("id"),
                "source_key": edge.get("source_key"),
                "target_key": edge.get("target_key"),
                "source_port": edge.get("source_port"),
                "target_port": edge.get("target_port"),
            }
            for edge in edges
            if isinstance(edge, dict)
        ]
        if isinstance(edges, list)
        else [],
    }


def _serialize_graph_preview_run(run_payload: dict[str, object]) -> dict[str, object]:
    """Return one compact graph run row for the UI preview."""

    return {
        "id": run_payload.get("id"),
        "automation_id": run_payload.get("automation_id"),
        "trigger_type": run_payload.get("trigger_type"),
        "status": run_payload.get("status"),
        "parent_session_id": run_payload.get("parent_session_id"),
        "error_code": run_payload.get("error_code"),
        "reason": run_payload.get("reason"),
        "started_at": run_payload.get("started_at"),
        "completed_at": run_payload.get("completed_at"),
        "fallback_status": run_payload.get("fallback_status"),
    }


def _serialize_graph_preview_validation(
    validation_payload: dict[str, object],
) -> dict[str, object]:
    """Return one stable validation payload for the UI preview contract."""

    errors = validation_payload.get("errors")
    return {
        "valid": bool(validation_payload.get("valid")),
        "errors": [
            str(item).strip()
            for item in errors
            if item is not None and str(item).strip()
        ]
        if isinstance(errors, list)
        else [],
    }


def _serialize_graph_preview_trace(trace_payload: dict[str, object]) -> dict[str, object]:
    """Return one compact latest-trace payload for the UI preview."""

    run_payload = trace_payload.get("run")
    nodes = trace_payload.get("nodes")
    fallback_payload = trace_payload.get("fallback")
    return {
        "run": _serialize_graph_preview_run(run_payload) if isinstance(run_payload, dict) else None,
        "nodes": [
            {
                "id": node.get("id"),
                "node_id": node.get("node_id"),
                "node_key": node.get("node_key"),
                "status": node.get("status"),
                "execution_index": node.get("execution_index"),
                "selected_ports": node.get("selected_ports") if isinstance(node.get("selected_ports"), list) else [],
                "reason": node.get("reason"),
                "error_code": node.get("error_code"),
                "child_session_id": node.get("child_session_id"),
            }
            for node in nodes
            if isinstance(node, dict)
        ]
        if isinstance(nodes, list)
        else [],
        "fallback": {
            "execution_index": fallback_payload.get("execution_index"),
            "status": fallback_payload.get("status"),
            "error_code": fallback_payload.get("error_code"),
            "reason": fallback_payload.get("reason"),
        }
        if isinstance(fallback_payload, dict)
        else None,
    }


def _build_summary(items: list[AutomationMetadata]) -> dict[str, int]:
    """Build compact counters for the overview strip."""

    return {
        "total": len(items),
        "active": sum(1 for item in items if item.status == "active"),
        "paused": sum(1 for item in items if item.status == "paused"),
        "deleted": sum(1 for item in items if item.status == "deleted"),
        "cron": sum(1 for item in items if item.trigger_type == "cron"),
        "webhook": sum(1 for item in items if item.trigger_type == "webhook"),
        "attention": sum(
            1
            for item in items
            if item.webhook is not None and item.webhook.last_execution_status == "failed"
        ),
    }


def _matches_filters(
    *,
    item: AutomationMetadata,
    trigger_type: str | None,
    status: str | None,
    query: str,
) -> bool:
    """Apply UI filters in-memory over one profile automation list."""

    if trigger_type and item.trigger_type != trigger_type:
        return False
    if status and item.status != status:
        return False
    normalized_query = query.strip().lower()
    if not normalized_query:
        return True
    haystack = [
        item.name,
        item.prompt,
        item.trigger_type,
        item.status,
        item.profile_id,
        item.execution_mode,
        item.graph_fallback_mode,
    ]
    if item.cron is not None:
        haystack.extend((item.cron.cron_expr, item.cron.timezone))
    if item.webhook is not None:
        haystack.extend(
            filter(
                None,
                (
                    item.webhook.webhook_token_masked,
                    item.webhook.last_execution_status,
                    item.webhook.last_session_id,
                    item.webhook.chat_resume_command,
                ),
            )
        )
    return normalized_query in " ".join(part.lower() for part in haystack if part)


def _sort_key(item: AutomationMetadata) -> tuple[datetime, datetime]:
    """Sort by latest activity, then by updated timestamp."""

    last_activity = _last_activity_datetime(item) or item.updated_at
    return (last_activity, item.updated_at)


def _derive_last_activity(item: AutomationMetadata) -> str | None:
    """Return latest activity timestamp serialized for UI use."""

    last_activity = _last_activity_datetime(item)
    return None if last_activity is None else last_activity.isoformat()


def _last_activity_datetime(item: AutomationMetadata) -> datetime | None:
    """Resolve one comparable activity timestamp from trigger metadata."""

    candidates: list[datetime] = [item.updated_at, item.created_at]
    if item.cron is not None:
        candidates.extend(dt for dt in (item.cron.last_run_at,) if dt is not None)
    if item.webhook is not None:
        candidates.extend(
            dt
            for dt in (
                item.webhook.last_received_at,
                item.webhook.last_started_at,
                item.webhook.last_succeeded_at,
                item.webhook.last_failed_at,
            )
            if dt is not None
        )
    return max(candidates) if candidates else None


def _build_task_session_payload(task_payload: dict[str, object]) -> dict[str, object] | None:
    """Build one session payload for UI consumption from serialized task metadata."""

    active_session = task_payload.get("active_session")
    if isinstance(active_session, dict) and str(active_session.get("session_id") or "").strip():
        return {
            "session_id": str(active_session.get("session_id") or "").strip(),
            "session_profile_id": str(
                active_session.get("session_profile_id")
                or task_payload.get("last_session_profile_id")
                or task_payload.get("profile_id")
                or "default"
            ).strip(),
            "dialog_active": bool(active_session.get("dialog_active")),
            "queued_turn_count": int(active_session.get("queued_turn_count") or 0),
            "running_turn_count": int(active_session.get("running_turn_count") or 0),
            "latest_activity_at": active_session.get("latest_activity_at"),
        }

    return None


def _extract_markdown_summary(content: str) -> str:
    for raw in content.splitlines():
        line = raw.strip()
        if not line or line.startswith("---"):
            continue
        if line.startswith("#"):
            line = line.lstrip("#").strip()
        if line:
            return " ".join(line.split())[:160]
    return ""


def _serialize_task_flow_employee(employee: object) -> dict[str, object]:
    payload = employee.model_dump(mode="json")
    summary = _extract_markdown_summary(str(payload.get("body") or ""))
    if not summary:
        summary = str(payload.get("title") or payload.get("role") or payload.get("name") or payload.get("id") or "")
    profile_id = str(payload.get("profile_id") or "")
    employee_id = str(payload.get("id") or "")
    return {
        **payload,
        "owner_ref": employee_id,
        "path": f"profiles/{profile_id}/employees/{employee_id}.md",
        "summary": summary,
    }


def _render_task_flow_employee_markdown(payload: TaskFlowEmployeeCreatePayload) -> str:
    allowed_tools = payload.allowed_tools
    body = payload.body.strip() or (
        f"{payload.name} owns focused Task Flow work for this profile and reports durable "
        "progress, blockers, and handoff notes."
    )
    lines = [
        "---",
        f"id: {_frontmatter_scalar(payload.id)}",
        f"name: {_frontmatter_scalar(payload.name)}",
        f"title: {_frontmatter_scalar(payload.title)}",
        f"role: {_frontmatter_scalar(payload.role)}",
        f"status: {_frontmatter_scalar(payload.status)}",
    ]
    if payload.manager_id:
        lines.append(f"manager_id: {_frontmatter_scalar(payload.manager_id)}")
    lines.extend(
        [
            "can_delegate_to: []",
            f"allowed_tools: {_frontmatter_list(allowed_tools)}",
            f"can_use_subagents: {str(payload.can_use_subagents).lower()}",
            f"subagent_allowlist: {_frontmatter_list(payload.subagent_allowlist)}",
            "max_active_tasks: 1",
            "---",
            "",
            f"# {_markdown_line(payload.name)}",
            "",
            body,
            "",
        ]
    )
    return "\n".join(lines)


def _frontmatter_scalar(value: str) -> str:
    return " ".join(str(value or "").split())


def _frontmatter_list(values: list[str]) -> str:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in values:
        value = _frontmatter_scalar(item)
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return "[" + ", ".join(f'"{item}"' for item in normalized) + "]"


def _markdown_line(value: str) -> str:
    return " ".join(str(value or "").split()) or "Employee"


def _normalize_task_flow_actor_type(value: object) -> str:
    raw = str(value or "").strip().lower()
    return raw if raw in {"human", "employee"} else "human"


def _normalize_task_flow_actor_ref(*, actor_type: str, value: object) -> str:
    raw = str(value or "").strip()
    if actor_type == "human" and raw.lower() in {"", "default", "web-user", "web-user/default"}:
        return resolve_local_human_ref(get_settings())
    return raw or (resolve_local_human_ref(get_settings()) if actor_type == "human" else "cto")


def _normalize_task_flow_human_principal_ref(
    *,
    principal_type: object,
    principal_ref: object,
) -> object:
    if str(principal_type or "").strip().lower() != "human":
        return principal_ref
    return _normalize_task_flow_actor_ref(actor_type="human", value=principal_ref)


def _resolve_task_flow_actor_identity(
    *,
    actor_type: object,
    actor_ref: object,
    config: UiPluginConfig,
) -> tuple[str, str]:
    """Resolve UI actor input into the public Task Flow principal identity."""

    resolved_actor_type = _normalize_task_flow_actor_type(actor_type or config.task_flow_actor_type)
    actor_ref_value = actor_ref or config.task_flow_actor_ref
    if resolved_actor_type == "employee":
        resolved_actor_type = "human"
        actor_ref_value = "web-user"
    resolved_actor_ref = _normalize_task_flow_actor_ref(
        actor_type=resolved_actor_type,
        value=actor_ref_value,
    )
    return resolved_actor_type, resolved_actor_ref


def _automation_http_error(exc: AutomationsServiceError) -> HTTPException:
    """Map automation service errors to HTTP responses."""

    status_code = 404 if exc.error_code in {"automation_not_found", "profile_not_found"} else 400
    return HTTPException(
        status_code=status_code,
        detail={"error_code": exc.error_code, "reason": exc.reason},
    )


def _task_http_error(exc: TaskFlowServiceError) -> HTTPException:
    """Map task-flow service errors to HTTP responses."""

    if exc.error_code.endswith("_not_found"):
        status_code = 404
    elif exc.error_code in {"task_delete_active_conflict", "task_flow_delete_active_conflict"}:
        status_code = 409
    else:
        status_code = 400
    return HTTPException(status_code=status_code, detail={"error_code": exc.error_code, "reason": exc.reason})


def _employee_http_error(exc: EmployeeServiceError) -> HTTPException:
    """Map employee service errors to HTTP responses."""

    if exc.error_code.endswith("_not_found"):
        status_code = 404
    elif exc.error_code in {"employee_in_use", "employee_has_reports"}:
        status_code = 409
    else:
        status_code = 400
    return HTTPException(
        status_code=status_code,
        detail={"error_code": exc.error_code, "reason": exc.reason},
    )


def _subagent_http_error(exc: FileNotFoundError | ProfileFilesLockedError | ValueError) -> HTTPException:
    """Map profile subagent CRUD errors to HTTP responses."""

    if isinstance(exc, ProfileFilesLockedError):
        return HTTPException(
            status_code=409,
            detail={"error_code": exc.error_code, "reason": exc.reason},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=400,
            detail={"error_code": "invalid_subagent_name", "reason": str(exc)},
        )
    return HTTPException(
        status_code=404,
        detail={"error_code": "profile_subagent_not_found", "reason": str(exc)},
    )


def _skill_http_error(exc: FileNotFoundError | ProfileFilesLockedError | ValueError) -> HTTPException:
    """Map profile skill CRUD errors to HTTP responses."""

    if isinstance(exc, ProfileFilesLockedError):
        return HTTPException(
            status_code=409,
            detail={"error_code": exc.error_code, "reason": exc.reason},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=400,
            detail={"error_code": "invalid_skill_name", "reason": str(exc)},
        )
    return HTTPException(
        status_code=404,
        detail={"error_code": "profile_skill_not_found", "reason": str(exc)},
    )


def _bootstrap_file_http_error(
    exc: FileExistsError | FileNotFoundError | ProfileFilesLockedError | ProfileServiceError | ValueError,
) -> HTTPException:
    """Map profile bootstrap file CRUD errors to HTTP responses."""

    if isinstance(exc, ProfileFilesLockedError):
        return HTTPException(
            status_code=409,
            detail={"error_code": exc.error_code, "reason": exc.reason},
        )
    if isinstance(exc, ProfileServiceError):
        return _profile_http_error(exc)
    if isinstance(exc, FileExistsError):
        return HTTPException(
            status_code=409,
            detail={"error_code": "profile_bootstrap_file_exists", "reason": str(exc)},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=400,
            detail={"error_code": "invalid_bootstrap_file_name", "reason": str(exc)},
        )
    return HTTPException(
        status_code=404,
        detail={"error_code": "profile_bootstrap_file_not_found", "reason": str(exc)},
    )


def _profile_http_error(exc: ProfileServiceError) -> HTTPException:
    """Map profile service errors to HTTP responses."""

    status_code = 404 if exc.error_code == "profile_not_found" else 400
    return HTTPException(
        status_code=status_code,
        detail={"error_code": exc.error_code, "reason": exc.reason},
    )


def _plugin_http_error(exc: PluginServiceError) -> HTTPException:
    """Map plugin config errors to HTTP responses."""

    return HTTPException(status_code=400, detail={"error_code": exc.error_code, "reason": exc.reason})


def _normalize_config_payload(payload: object) -> dict[str, object]:
    """Normalize config payload into the runtime UI config shape."""

    if not isinstance(payload, dict):
        return {}
    raw_actor_type = payload.get(
        "task_flow_actor_type",
        payload.get("actor_type", "human"),
    )
    task_flow_actor_type = _normalize_task_flow_actor_type(raw_actor_type)
    actor_ref = (
        "web-user"
        if str(raw_actor_type or "").strip().lower() not in {"human", "employee"}
        else payload.get(
            "task_flow_actor_ref",
            payload.get("actor_ref", "web-user"),
        )
    )

    return {
        "poll_interval_sec": payload.get("poll_interval_sec", 5),
        "default_profile_id": payload.get("default_profile_id", "default"),
        "task_flow_poll_interval_sec": payload.get(
            "task_flow_poll_interval_sec",
            5,
        ),
        "task_flow_board_limit_per_column": payload.get(
            "task_flow_board_limit_per_column",
            payload.get("board_limit_per_column", 20),
        ),
        "task_flow_actor_type": task_flow_actor_type,
        "task_flow_actor_ref": _normalize_task_flow_actor_ref(
            actor_type=task_flow_actor_type,
            value=actor_ref,
        ),
    }
