"""Plugin entrypoint for the afkbotui AFKBOT plugin."""

from __future__ import annotations

from afkbot.services.plugins.runtime_registry import PluginRuntimeRegistry

from afkbot_plugin_afkbotui.router import build_router


def register(registry: PluginRuntimeRegistry) -> None:
    """Register AFKBOT UI runtime surfaces."""

    api_prefix = registry.manifest.mounts.api_prefix or "/v1/plugins/afkbotui"
    registry.register_router(
        build_router(
            api_prefix=api_prefix,
            registry=registry,
        )
    )
    _ = registry.data_dir
