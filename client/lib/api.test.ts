import { streamChatMessage } from "./api";
import * as auth from "./auth";

// Mock the auth module
jest.mock("./auth", () => ({
  getAccessToken: jest.fn(),
  forceRefreshAccessToken: jest.fn(),
  signOut: jest.fn(),
  getCurrentUser: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

describe("streamChatMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should refresh token on 401 without calling signOut", async () => {
    // Setup initial stale token
    (auth.getAccessToken as jest.Mock).mockResolvedValue("stale-token");
    
    // Mock fetch to return 401 on first call, 200 on second
    const mockResponse401 = { 
      ok: false, 
      status: 401, 
      json: async () => ({ error: "invalid jwt" }) 
    };
    
    // Minimal mock for a successfully streamed response body
    const mockResponse200 = { 
      ok: true, 
      status: 200, 
      headers: { get: () => "thread-123" },
      body: { 
        getReader: () => {
          let called = false;
          return {
            read: async () => {
              if (called) return { done: true, value: undefined };
              called = true;
              return { done: false, value: new TextEncoder().encode("Hello") };
            }
          };
        }
      }
    };
    
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse401)
      .mockResolvedValueOnce(mockResponse200);

    // Setup refreshed token
    (auth.forceRefreshAccessToken as jest.Mock).mockResolvedValue("fresh-token");

    // Execute
    const onChunk = jest.fn();
    await streamChatMessage("hello", onChunk);

    // Verify it fetched with the initial token, and then the fresh token
    expect(auth.forceRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    
    // Verify signOut was NOT called (this was the bug)
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith("Hello");
  });
});
