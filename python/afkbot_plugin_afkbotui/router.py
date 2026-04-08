"""FastAPI router for the AFKBOT unified admin plugin."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from afkbot.services.automations import AutomationsServiceError, get_automations_service
from afkbot.services.automations.contracts import AutomationMetadata
from afkbot.services.plugins.contracts import PluginServiceError
from afkbot.services.plugins.runtime_registry import PluginRuntimeRegistry
from afkbot.services.policy import ProfileFilesLockedError
from afkbot.services.profile_runtime import ProfileServiceError, get_profile_service
from afkbot.services.subagents.profile_service import get_profile_subagent_service
from afkbot.services.task_flow import TaskFlowServiceError, get_task_flow_service
from afkbot.settings import get_settings


class UiPluginConfig(BaseModel):
    """Validated runtime config exposed to the static UI."""

    model_config = ConfigDict(extra="forbid")

    poll_interval_sec: int = Field(default=5, ge=5, le=300)
    default_profile_id: str = Field(default="default", min_length=1, max_length=120)
    task_flow_poll_interval_sec: int = Field(default=5, ge=1, le=300)
    task_flow_board_limit_per_column: int = Field(default=20, ge=1, le=200)
    task_flow_actor_type: Literal["human", "ai_profile"] = "human"
    task_flow_actor_ref: str = Field(default="web-user", min_length=1, max_length=120)


class UiPluginConfigPatchPayload(BaseModel):
    """Patch payload for persisted plugin config."""

    model_config = ConfigDict(extra="forbid")

    poll_interval_sec: int | None = Field(default=None, ge=5, le=300)
    default_profile_id: str | None = Field(default=None, min_length=1, max_length=120)
    task_flow_poll_interval_sec: int | None = Field(default=None, ge=1, le=300)
    task_flow_board_limit_per_column: int | None = Field(default=None, ge=1, le=200)
    task_flow_actor_type: Literal["human", "ai_profile"] | None = None
    task_flow_actor_ref: str | None = Field(default=None, min_length=1, max_length=120)


class UiPluginConfigEnvelope(BaseModel):
    """Envelope compatible with older Task Flow config writes."""

    model_config = ConfigDict(extra="forbid")

    config: UiPluginConfigPatchPayload


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


class TaskFlowCreatePayload(BaseModel):
    """Request body for one task flow create action."""

    title: str = Field(min_length=1, max_length=240)
    description: str | None = None
    created_by_type: str = Field(default="human", min_length=1)
    created_by_ref: str = Field(default="web-user", min_length=1)
    default_owner_type: str | None = None
    default_owner_ref: str | None = None
    labels: tuple[str, ...] = ()


class TaskCreatePayload(BaseModel):
    """Request body for one task create action."""

    title: str = Field(min_length=1, max_length=240)
    prompt: str = Field(min_length=1, max_length=12000)
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
    prompt: str | None = None
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
                rotate_webhook_token=False,
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
        try:
            item = await service.create_flow(
                profile_id=profile_id,
                title=payload.title,
                description=payload.description,
                created_by_type=payload.created_by_type,
                created_by_ref=payload.created_by_ref,
                default_owner_type=payload.default_owner_type,
                default_owner_ref=payload.default_owner_ref,
                labels=payload.labels,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task_flow": item.model_dump(mode="json")}

    @router.delete("/task-flow/flows/{flow_id}")
    async def task_flow_delete(
        flow_id: str,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            await service.delete_flow(profile_id=profile_id, flow_id=flow_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"deleted": True, "flow_id": flow_id}

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
        return {"board": payload.model_dump(mode="json")}

    @router.post("/task-flow/tasks")
    async def task_flow_task_create(
        payload: TaskCreatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            item = await service.create_task(
                profile_id=profile_id,
                title=payload.title,
                prompt=payload.prompt,
                created_by_type=payload.created_by_type,
                created_by_ref=payload.created_by_ref,
                flow_id=payload.flow_id,
                priority=payload.priority,
                due_at=payload.due_at,
                owner_type=payload.owner_type,
                owner_ref=payload.owner_ref,
                reviewer_type=payload.reviewer_type,
                reviewer_ref=payload.reviewer_ref,
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

    @router.patch("/task-flow/tasks/{task_id}")
    async def task_flow_task_patch(
        task_id: str,
        payload: TaskPatchPayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            item = await service.update_task(
                profile_id=profile_id,
                task_id=task_id,
                title=payload.title,
                prompt=payload.prompt,
                status=payload.status,
                priority=payload.priority,
                due_at=payload.due_at,
                owner_type=payload.owner_type,
                owner_ref=payload.owner_ref,
                reviewer_type=payload.reviewer_type,
                reviewer_ref=payload.reviewer_ref,
                requires_review=payload.requires_review,
                labels=payload.labels,
                blocked_reason_code=payload.blocked_reason_code,
                blocked_reason_text=payload.blocked_reason_text,
                actor_type=payload.actor_type,
                actor_ref=payload.actor_ref,
            )
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"task": item.model_dump(mode="json")}

    @router.delete("/task-flow/tasks/{task_id}")
    async def task_flow_task_delete(
        task_id: str,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
        try:
            await service.delete_task(profile_id=profile_id, task_id=task_id)
        except TaskFlowServiceError as exc:
            raise _task_http_error(exc) from exc
        return {"deleted": True, "task_id": task_id}

    @router.post("/task-flow/tasks/bulk-update")
    async def task_flow_task_bulk_update(
        payload: TaskBulkUpdatePayload,
        profile_id: str = "default",
    ) -> dict[str, object]:
        service = get_task_flow_service(get_settings())
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
                updated = await service.update_task(
                    profile_id=profile_id,
                    task_id=task_id,
                    status=payload.status,
                    priority=payload.priority,
                    due_at=payload.due_at,
                    owner_type=payload.owner_type,
                    owner_ref=payload.owner_ref,
                    reviewer_type=payload.reviewer_type,
                    reviewer_ref=payload.reviewer_ref,
                    requires_review=payload.requires_review,
                    labels=payload.labels,
                    blocked_reason_code=payload.blocked_reason_code,
                    blocked_reason_text=payload.blocked_reason_text,
                    actor_type=payload.actor_type,
                    actor_ref=payload.actor_ref,
                )
                if payload.comment_message:
                    await service.add_task_comment(
                        profile_id=profile_id,
                        task_id=task_id,
                        actor_type=payload.actor_type,
                        actor_ref=payload.actor_ref,
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
        try:
            item = await service.add_task_comment(
                profile_id=profile_id,
                task_id=task_id,
                actor_type=payload.actor_type,
                actor_ref=payload.actor_ref,
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
        try:
            payload = await service.list_review_tasks(
                profile_id=profile_id,
                actor_type=actor_type or config.task_flow_actor_type,
                actor_ref=actor_ref or config.task_flow_actor_ref,
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
        try:
            item = await service.approve_review_task(
                profile_id=profile_id,
                task_id=task_id,
                actor_type=payload.actor_type,
                actor_ref=payload.actor_ref,
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
        try:
            item = await service.request_review_changes(
                profile_id=profile_id,
                task_id=task_id,
                reason_text=payload.reason_text,
                actor_type=payload.actor_type,
                actor_ref=payload.actor_ref,
                owner_type=payload.owner_type,
                owner_ref=payload.owner_ref,
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

    return router


def _serialize_automation(item: AutomationMetadata) -> dict[str, object]:
    """Serialize one automation with derived UI fields."""

    payload = item.model_dump(mode="json")
    payload["derived"] = {
        "last_activity_at": _derive_last_activity(item),
    }
    return payload


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
        candidates.extend(
            dt for dt in (item.cron.last_run_at, item.cron.next_run_at) if dt is not None
        )
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
    """Normalize legacy config keys into the runtime UI config shape."""

    if not isinstance(payload, dict):
        return {}

    return {
        "poll_interval_sec": payload.get("poll_interval_sec", 5),
        "default_profile_id": payload.get("default_profile_id", "default"),
        "task_flow_poll_interval_sec": payload.get(
            "task_flow_poll_interval_sec",
            payload.get("poll_interval_sec", 5),
        ),
        "task_flow_board_limit_per_column": payload.get(
            "task_flow_board_limit_per_column",
            payload.get("board_limit_per_column", 20),
        ),
        "task_flow_actor_type": payload.get(
            "task_flow_actor_type",
            payload.get("actor_type", "human"),
        ),
        "task_flow_actor_ref": payload.get(
            "task_flow_actor_ref",
            payload.get("actor_ref", "web-user"),
        ),
    }
