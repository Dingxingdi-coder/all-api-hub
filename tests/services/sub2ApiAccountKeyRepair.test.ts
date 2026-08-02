import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildGroupDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { AuthTypeEnum } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
} from "~/types/accountKeyAutoProvisioning"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => {
  const storageMap = new Map<string, unknown>()

  class StorageMock {
    async get(key: string) {
      return storageMap.get(key)
    }

    async set(key: string, value: unknown) {
      storageMap.set(key, value)
    }
  }

  return {
    storageMap,
    StorageMock,
    getAllAccounts: vi.fn(),
    convertToDisplayData: vi.fn(),
    fetchTokens: vi.fn(),
    fetchGroups: vi.fn(),
    createToken: vi.fn(),
    updateToken: vi.fn(),
    deleteToken: vi.fn(),
    sendRuntimeMessage: vi.fn(),
    safeRandomUUID: vi.fn(() => "sub2api-repair-job"),
  }
})

vi.mock("@plasmohq/storage", () => ({
  Storage: mocks.StorageMock,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: mocks.getAllAccounts,
    convertToDisplayData: mocks.convertToDisplayData,
  },
}))

vi.mock("~/services/apiAdapters/registry", async () => {
  const { sub2ApiTokenProvisioning } = await import(
    "~/services/apiAdapters/sub2api/tokenProvisioning"
  )

  return {
    getSiteTypeCapabilities: vi.fn((siteType: string) => ({
      siteType,
      account: {
        keyManagement: {
          fetchTokens: (...args: unknown[]) => mocks.fetchTokens(...args),
          userGroups: {
            fetch: (...args: unknown[]) => mocks.fetchGroups(...args),
          },
          createToken: (...args: unknown[]) => mocks.createToken(...args),
          updateToken: (...args: unknown[]) => mocks.updateToken(...args),
          deleteToken: (...args: unknown[]) => mocks.deleteToken(...args),
          resolveTokenKey: vi.fn(),
          fetchAvailableModels: vi.fn(),
        },
        tokenProvisioning: sub2ApiTokenProvisioning,
      },
    })),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: mocks.sendRuntimeMessage,
  }
})

vi.mock("~/utils/core/identifier", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/identifier")>()
  return {
    ...actual,
    safeRandomUUID: mocks.safeRandomUUID,
  }
})

const account = buildSiteAccount({
  id: "sub2api-1",
  site_name: "Sub2API Account",
  site_type: SITE_TYPES.SUB2API,
  site_url: "https://sub2api.example.com",
  authType: AuthTypeEnum.AccessToken,
  disabled: false,
  account_info: {
    id: "101",
    access_token: "access-token",
    username: "tester",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
})

const displayAccount = buildDisplaySiteData({
  id: account.id,
  name: account.site_name,
  baseUrl: account.site_url,
  siteType: SITE_TYPES.SUB2API,
  authType: AuthTypeEnum.AccessToken,
  userId: "101",
  token: "access-token",
})

describe("Sub2API account key repair", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.storageMap.clear()
    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.convertToDisplayData.mockReturnValue([displayAccount])
    mocks.fetchTokens.mockResolvedValue([
      buildApiToken({ id: 1, name: "existing key", group: "default" }),
    ])
    mocks.fetchGroups.mockResolvedValue({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 1 },
      pro: { desc: "Pro", ratio: 1 },
    })
    mocks.createToken.mockResolvedValue(true)
    mocks.updateToken.mockResolvedValue(true)
    mocks.deleteToken.mockResolvedValue(true)
    mocks.sendRuntimeMessage.mockResolvedValue(undefined)
    mocks.safeRandomUUID.mockReturnValue("sub2api-repair-job")
  })

  it("runs through the repair runner and creates every missing group key", async () => {
    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    })

    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress.totals).toMatchObject({
      enabledAccounts: 1,
      eligibleAccounts: 1,
      processedAccounts: 1,
      processedEligibleAccounts: 1,
    })
    expect(progress.summary).toMatchObject({
      created: 1,
      skipped: 0,
      failed: 0,
      availableGroups: 3,
      coveredGroups: 3,
      createdKeys: 2,
    })
    expect(progress.results).toEqual([
      expect.objectContaining({
        accountId: account.id,
        siteType: SITE_TYPES.SUB2API,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
        availableGroups: ["default", "vip", "pro"],
        coveredGroups: ["default", "vip", "pro"],
        createdGroups: ["vip", "pro"],
        missingGroups: [],
      }),
    ])
    expect(mocks.createToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ accountId: account.id }),
      buildGroupDefaultTokenRequest("vip"),
    )
    expect(mocks.createToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ accountId: account.id }),
      buildGroupDefaultTokenRequest("pro"),
    )
  })
})
