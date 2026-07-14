import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stopMediaStream,
  type BarcodeDecoder,
  type DecodedBarcode,
} from "@/components/barcode/decoder";

describe("barcode decoder abstractions", () => {
  it("stopMediaStream stops all tracks", () => {
    let stopped = 0;
    const stream = {
      getTracks: () => [
        {
          stop: () => {
            stopped += 1;
          },
        },
        {
          stop: () => {
            stopped += 1;
          },
        },
      ],
    } as unknown as MediaStream;

    stopMediaStream(stream);
    assert.equal(stopped, 2);
    stopMediaStream(null);
  });

  it("supports injectable mock decoder", async () => {
    const seen: DecodedBarcode[] = [];
    const mock: BarcodeDecoder = {
      async start(_video, onDetect) {
        onDetect({ rawValue: "036000291452", format: "upc_a" });
      },
      stop() {},
    };
    await mock.start({} as HTMLVideoElement, (r) => seen.push(r));
    assert.equal(seen[0]?.rawValue, "036000291452");
    mock.stop();
  });
});
