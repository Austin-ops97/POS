import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicAppOrigin } from "./app-origin";

describe("publicAppOrigin", () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevVercel = process.env.VERCEL_URL;

  function restore() {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
  }

  it("prefers NEXT_PUBLIC_APP_URL, then VERCEL_URL, then request origin", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "preview.vercel.app";
    assert.equal(publicAppOrigin("http://localhost:3000"), "https://preview.vercel.app");
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test/";
    assert.equal(publicAppOrigin("http://localhost:3000"), "https://example.test");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    assert.equal(publicAppOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
    restore();
  });
});
