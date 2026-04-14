"""Profile-scoped CRUD service for arbitrary bootstrap files within the plugin."""

from __future__ import annotations

import re
from pathlib import Path

from pydantic import BaseModel, Field

from afkbot.services.atomic_writes import atomic_text_write
from afkbot.services.policy import get_profile_files_lock
from afkbot.services.profile_runtime import ProfileServiceError, get_profile_service
from afkbot.services.profile_runtime.runtime_config import get_profile_runtime_config_service
from afkbot.settings import Settings

_SERVICES_BY_ROOT: dict[str, "ProfileBootstrapFilesService"] = {}
_FILENAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class BootstrapFileRecord(BaseModel):
    """Serializable bootstrap file descriptor returned by CRUD operations."""

    file_name: str = Field(min_length=1)
    origin: str = "profile"
    path: str = Field(min_length=1)
    content: str | None = None
    summary: str = ""


class ProfileBootstrapFilesService:
    """Manage custom profile bootstrap files stored as `<profile>/bootstrap/<file_name>`."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._runtime_configs = get_profile_runtime_config_service(settings)
        self._profile_files_lock = get_profile_files_lock(root_dir=settings.root_dir)

    async def list(self, *, profile_id: str) -> list[BootstrapFileRecord]:
        """List profile bootstrap files for one profile."""

        await self._ensure_profile_exists(profile_id)
        root = self._runtime_configs.bootstrap_dir(profile_id)
        if not root.exists():
            return []
        result: list[BootstrapFileRecord] = []
        for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
            if not path.is_file():
                continue
            content = path.read_text(encoding="utf-8")
            result.append(
                BootstrapFileRecord(
                    file_name=path.name,
                    path=self._to_relative(path),
                    summary=_extract_summary(content),
                )
            )
        return result

    async def get(self, *, profile_id: str, file_name: str) -> BootstrapFileRecord:
        """Read one profile bootstrap file by user-provided file name."""

        await self._ensure_profile_exists(profile_id)
        normalized_name = _validate_file_name(file_name)
        path = self._file_path(profile_id=profile_id, file_name=normalized_name)
        if not path.exists():
            raise FileNotFoundError(f"Profile bootstrap file not found: {normalized_name}")
        content = path.read_text(encoding="utf-8")
        return BootstrapFileRecord(
            file_name=normalized_name,
            path=self._to_relative(path),
            content=content,
            summary=_extract_summary(content),
        )

    async def create(self, *, profile_id: str, file_name: str, content: str) -> BootstrapFileRecord:
        """Create one new profile bootstrap file."""

        await self._ensure_profile_exists(profile_id)
        normalized_name = _validate_file_name(file_name)
        path = self._file_path(profile_id=profile_id, file_name=normalized_name)
        async with self._profile_files_lock.acquire(profile_id):
            self._runtime_configs.ensure_layout(profile_id)
            if path.exists():
                raise FileExistsError(f"Profile bootstrap file already exists: {normalized_name}")
            atomic_text_write(path, content, mode=0o600)
        return BootstrapFileRecord(
            file_name=normalized_name,
            path=self._to_relative(path),
            content=content,
            summary=_extract_summary(content),
        )

    async def update(
        self,
        *,
        profile_id: str,
        current_name: str,
        next_name: str | None = None,
        content: str | None = None,
    ) -> BootstrapFileRecord:
        """Update one existing profile bootstrap file, optionally renaming it."""

        await self._ensure_profile_exists(profile_id)
        normalized_current_name = _validate_file_name(current_name)
        normalized_next_name = _validate_file_name(next_name) if next_name is not None else normalized_current_name
        current_path = self._file_path(profile_id=profile_id, file_name=normalized_current_name)
        next_path = self._file_path(profile_id=profile_id, file_name=normalized_next_name)
        async with self._profile_files_lock.acquire(profile_id):
            self._runtime_configs.ensure_layout(profile_id)
            if not current_path.exists():
                raise FileNotFoundError(f"Profile bootstrap file not found: {normalized_current_name}")
            if normalized_next_name != normalized_current_name and next_path.exists():
                raise FileExistsError(f"Profile bootstrap file already exists: {normalized_next_name}")
            next_content = content if content is not None else current_path.read_text(encoding="utf-8")
            if normalized_next_name != normalized_current_name:
                current_path.rename(next_path)
            atomic_text_write(next_path, next_content, mode=0o600)
        return BootstrapFileRecord(
            file_name=normalized_next_name,
            path=self._to_relative(next_path),
            content=next_content,
            summary=_extract_summary(next_content),
        )

    async def delete(self, *, profile_id: str, file_name: str) -> BootstrapFileRecord:
        """Delete one existing profile bootstrap file."""

        await self._ensure_profile_exists(profile_id)
        normalized_name = _validate_file_name(file_name)
        path = self._file_path(profile_id=profile_id, file_name=normalized_name)
        async with self._profile_files_lock.acquire(profile_id):
            if not path.exists():
                raise FileNotFoundError(f"Profile bootstrap file not found: {normalized_name}")
            path.unlink()
        return BootstrapFileRecord(file_name=normalized_name, path=self._to_relative(path))

    def _file_path(self, *, profile_id: str, file_name: str) -> Path:
        root = self._runtime_configs.bootstrap_dir(profile_id)
        path = (root / file_name).resolve()
        root_resolved = root.resolve()
        if not path.is_relative_to(root_resolved):
            raise ValueError(f"Invalid bootstrap file path: {file_name}")
        return path

    def _to_relative(self, path: Path) -> str:
        root = self._settings.root_dir.resolve()
        try:
            return str(path.resolve().relative_to(root))
        except ValueError:
            return str(path.resolve())

    async def _ensure_profile_exists(self, profile_id: str) -> None:
        await get_profile_service(self._settings).get(profile_id=profile_id)


def get_profile_bootstrap_files_service(settings: Settings) -> ProfileBootstrapFilesService:
    """Return cached profile bootstrap files service bound to one root directory."""

    key = str(settings.root_dir.resolve())
    service = _SERVICES_BY_ROOT.get(key)
    if service is None:
        service = ProfileBootstrapFilesService(settings=settings)
        _SERVICES_BY_ROOT[key] = service
    return service


def reset_profile_bootstrap_files_services() -> None:
    """Reset cached profile bootstrap services for tests."""

    _SERVICES_BY_ROOT.clear()


def _validate_file_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("Bootstrap file name must not be empty.")
    if "/" in normalized or "\\" in normalized:
        raise ValueError("Bootstrap file name must not contain path separators.")
    if normalized in {".", ".."}:
        raise ValueError("Bootstrap file name must not be a relative path alias.")
    if normalized.startswith("."):
        raise ValueError("Bootstrap file name must not start with a dot.")
    if not _FILENAME_PATTERN.fullmatch(normalized):
        raise ValueError(
            "Bootstrap file name must match `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`."
        )
    return normalized


def _extract_summary(content: str) -> str:
    """Extract deterministic one-line summary from file content."""

    for raw in content.splitlines():
        line = " ".join(raw.strip().split())
        if line:
            return line[:160]
    return ""
