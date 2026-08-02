import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ManagedSiteTokenBatchExportPreviewList } from "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewList"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import { render, screen } from "~~/tests/test-utils/render"

const t = ((key: string) => key) as unknown as TFunction

const buildDraft = (name: string) => ({
  name,
  type: 1,
  key: "test-key",
  base_url: "https://example.com",
  models: ["gpt-4o"],
  groups: ["default"],
  priority: 0,
  weight: 0,
  status: 1,
})

const buildPreviewItem = (
  id: string,
  runtimeKeyName: string,
  fields: Pick<
    ManagedSiteTokenBatchExportPreviewItem,
    "draft" | "status" | "warningCodes"
  >,
): ManagedSiteTokenBatchExportPreviewItem => ({
  id,
  accountId: "account-1",
  accountName: "Account 1",
  runtimeKeyId: id,
  runtimeKeyName,
  ...fields,
})

const preview: ManagedSiteTokenBatchExportPreview = {
  siteType: SITE_TYPES.NEW_API,
  totalCount: 4,
  readyCount: 1,
  warningCount: 1,
  skippedCount: 1,
  blockedCount: 1,
  items: [
    buildPreviewItem("item-1", "Token 1", {
      draft: buildDraft("Account 1 - Token 1"),
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      warningCodes: [],
    }),
    buildPreviewItem("item-2", "Token 2", {
      draft: buildDraft("Account 1 - Token 2"),
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      warningCodes: [
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MODEL_PREFILL_FAILED,
      ],
    }),
    buildPreviewItem("item-3", "Token 3", {
      draft: buildDraft("Account 1 - Token 3"),
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      warningCodes: [],
    }),
    buildPreviewItem("item-4", "Token 4", {
      draft: null,
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      warningCodes: [],
    }),
  ],
}

const executionResult: ManagedSiteTokenBatchExportExecutionResult = {
  totalSelected: 2,
  attemptedCount: 2,
  createdCount: 1,
  failedCount: 1,
  skippedCount: 2,
  items: [
    {
      id: "item-1",
      accountName: "Account 1",
      runtimeKeyName: "Token 1",
      success: true,
      skipped: false,
    },
    {
      id: "item-2",
      accountName: "Account 1",
      runtimeKeyName: "Token 2",
      success: false,
      skipped: false,
      error: "create failed",
    },
    {
      id: "item-3",
      accountName: "Account 1",
      runtimeKeyName: "Token 3",
      success: false,
      skipped: true,
    },
    {
      id: "item-4",
      accountName: "Account 1",
      runtimeKeyName: "Token 4",
      success: false,
      skipped: true,
    },
  ],
}

const renderResultList = () =>
  render(
    <ManagedSiteTokenBatchExportPreviewList
      t={t}
      preview={preview}
      selectedIds={new Set()}
      executableSelection={{ checked: false, itemCount: 0, selectedCount: 0 }}
      modelOptions={[]}
      executionResult={executionResult}
      isLoadingPreview={false}
      isManualPreviewRefresh={false}
      isRunning={false}
      verifyingItemId={null}
      isVerificationDialogOpen={false}
      onToggleAll={vi.fn()}
      onRefreshPreview={vi.fn()}
      onToggleItem={vi.fn()}
      onItemModelsChange={vi.fn()}
      onVerifyAndRefresh={vi.fn()}
    />,
  )

describe("ManagedSiteTokenBatchExportPreviewList", () => {
  it("filters completed import results and counts every execution item", async () => {
    const user = userEvent.setup()
    renderResultList()

    expect(
      screen.getByRole("button", { name: "account:filter.tagsAllLabel (4)" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: "common:status.success (1)" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:status.failed (1)" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "modelList:batchVerify.status.skipped (2)",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:status.success (1)" }),
    )
    expect(screen.getByText("Account 1 / Token 1")).toBeInTheDocument()
    expect(screen.queryByText("Account 1 / Token 2")).not.toBeInTheDocument()
    expect(screen.queryByText("Account 1 / Token 3")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:status.failed (1)" }),
    )
    expect(screen.getByText("Account 1 / Token 2")).toBeInTheDocument()
    expect(screen.queryByText("Account 1 / Token 1")).not.toBeInTheDocument()
    expect(screen.queryByText("Account 1 / Token 3")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "modelList:batchVerify.status.skipped (2)",
      }),
    )
    expect(screen.getByText("Account 1 / Token 3")).toBeInTheDocument()
    expect(screen.getByText("Account 1 / Token 4")).toBeInTheDocument()
    expect(screen.queryByText("Account 1 / Token 2")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "account:filter.tagsAllLabel (4)" }),
    )
    for (const token of ["Token 1", "Token 2", "Token 3", "Token 4"]) {
      expect(screen.getByText(`Account 1 / ${token}`)).toBeInTheDocument()
    }
  })
})
