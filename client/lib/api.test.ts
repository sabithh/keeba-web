import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  getAccessToken: vi.fn(),
  forceRefreshAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

import { streamChatMessage } from "./api";
import { forceRefreshAccessToken, getAccessToken, signOut } from "./auth";

describe("streamChatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("refreshes token on 401 and does not force logout", async () => {
    const fetchMock = vi.mocked(fetch);
    const getAccessTokenMock = vi.mocked(getAccessToken);
    const forceRefreshAccessTokenMock = vi.mocked(forceRefreshAccessToken);
    const signOutMock = vi.mocked(signOut);

    getAccessTokenMock.mockResolvedValue("stale-token");
    forceRefreshAccessTokenMock.mockResolvedValue("fresh-token");

    const unauthorizedResponse = new Response(JSON.stringify({ error: "invalid jwt" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("Hello"));
        controller.close();
      },
    });

    const successResponse = new Response(stream, {
      status: 200,
      headers: {
        "x-thread-id": "thread-123",
      },
    });

    fetchMock.mockResolvedValueOnce(unauthorizedResponse).mockResolvedValueOnce(successResponse);

    const onChunk = vi.fn();
    await streamChatMessage("hello", onChunk);

    expect(forceRefreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith("Hello");
  });

  it("falls back to access-token apikey when configured key flow keeps returning invalid jwt", async () => {
    const fetchMock = vi.mocked(fetch);
    const getAccessTokenMock = vi.mocked(getAccessToken);
    const forceRefreshAccessTokenMock = vi.mocked(forceRefreshAccessToken);

    getAccessTokenMock.mockResolvedValue("stale-token");
    forceRefreshAccessTokenMock.mockResolvedValue("fresh-token");

    const unauthorizedResponse = new Response(JSON.stringify({ error: "invalid jwt" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("Recovered"));
        controller.close();
      },
    });

    const successResponse = new Response(stream, {
      status: 200,
      headers: {
        "x-thread-id": "thread-456",
      },
    });

    fetchMock
      .mockResolvedValueOnce(unauthorizedResponse)
      .mockResolvedValueOnce(unauthorizedResponse)
      .mockResolvedValueOnce(successResponse);

    const onChunk = vi.fn();
    await streamChatMessage("hello", onChunk);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const thirdCall = fetchMock.mock.calls[2];
    const thirdRequestInit = thirdCall[1] as RequestInit;
    const thirdHeaders = thirdRequestInit.headers as Record<string, string>;
    expect(thirdHeaders.apikey).toBe("fresh-token");
    expect(thirdHeaders.Authorization).toBe("Bearer fresh-token");
    expect(onChunk).toHaveBeenCalledWith("Recovered");
  });
});
