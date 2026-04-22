import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createAutomation,
  deleteAutomation,
  resolveAutomationError,
  rotateAutomationWebhook,
  updateAutomation,
} from "@/features/automations/model/automations.api";
import { automationsKeys } from "@/features/automations/model/automations.query-keys";
import type { Automation, AutomationDraft } from "@/features/automations/model/automations.types";

export function useAutomationMutations({
  api,
  profileId,
}: {
  api: unknown;
  profileId: string;
}) {
  const queryClient = useQueryClient();

  const invalidateFamily = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: automationsKeys.listRoot(profileId),
      }),
      queryClient.invalidateQueries({
        queryKey: automationsKeys.detailRoot(profileId),
      }),
      queryClient.invalidateQueries({
        queryKey: automationsKeys.graphRoot(profileId),
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (draft: AutomationDraft) => createAutomation(api, profileId, draft),
    onSuccess: async (automation) => {
      if (automation?.id) {
        queryClient.setQueryData(automationsKeys.detail(profileId, automation.id), automation);
      }
      await invalidateFamily();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ automationId, draft }: { automationId: number; draft: AutomationDraft }) =>
      updateAutomation(api, profileId, automationId, draft),
    onSuccess: async (automation, { automationId }) => {
      queryClient.removeQueries({
        queryKey: automationsKeys.detail(profileId, automationId),
      });
      queryClient.removeQueries({
        queryKey: automationsKeys.graph(profileId, automationId),
      });
      if (automation?.id) {
        queryClient.setQueryData(automationsKeys.detail(profileId, automation.id), automation);
      }
      await invalidateFamily();
    },
  });

  const rotateWebhookMutation = useMutation({
    mutationFn: async (automationId: number) => rotateAutomationWebhook(api, profileId, automationId),
    onSuccess: async (automation, automationId) => {
      queryClient.removeQueries({
        queryKey: automationsKeys.detail(profileId, automationId),
      });
      if (automation?.id) {
        queryClient.setQueryData(automationsKeys.detail(profileId, automation.id), automation);
      }
      await invalidateFamily();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (automationId: number) => {
      await deleteAutomation(api, profileId, automationId);
      return automationId;
    },
    onSuccess: async (automationId) => {
      queryClient.removeQueries({
        queryKey: automationsKeys.detail(profileId, automationId),
      });
      queryClient.removeQueries({
        queryKey: automationsKeys.graph(profileId, automationId),
      });
      await invalidateFamily();
    },
  });

  return {
    createMutation,
    deleteMutation,
    resolveErrorMessage(error: unknown) {
      return resolveAutomationError(error);
    },
    rotateWebhookMutation,
    updateMutation,
  };
}
