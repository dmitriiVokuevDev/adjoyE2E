import * as path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import {
  ClickRequest,
  ClientConfig,
  Platform,
  ReadRequest,
  ReadResponse,
  ViewRequest,
  WriteResponse,
} from "./types";

// Both the development tree and the candidate distribution use the same
// relative layout: `e2e/` and `backend/` are siblings, so this file at
// e2e/src/client.ts resolves ../../backend/proto/ to the proto directory
// in either context.
const WRITER_PROTO_PATH = path.resolve(
  __dirname,
  "../../backend/proto/writer.proto",
);
const READER_PROTO_PATH = path.resolve(
  __dirname,
  "../../backend/proto/reader.proto",
);

const protoLoaderOptions: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

function loadService(protoPath: string, qualifiedName: string): any {
  const packageDefinition = protoLoader.loadSync(protoPath, protoLoaderOptions);
  const grpcObject = grpc.loadPackageDefinition(packageDefinition) as any;
  const segments = qualifiedName.split(".");
  let cursor: any = grpcObject;
  for (const segment of segments) {
    cursor = cursor[segment];
    if (cursor === undefined) {
      throw new Error(`could not resolve ${qualifiedName} in ${protoPath}`);
    }
  }
  return cursor;
}

export class BackendClient {
  private writer: any;
  private reader: any;

  constructor(
    private writerAddress: string = "localhost:8081",
    private readerAddress: string = "localhost:8082",
    private configBaseUrl: string = "http://localhost:8083",
  ) {
    const WriterService = loadService(
      WRITER_PROTO_PATH,
      "writer.WriterService",
    );
    const ReaderService = loadService(
      READER_PROTO_PATH,
      "reader.ReaderService",
    );

    this.writer = new WriterService(
      this.writerAddress,
      grpc.credentials.createInsecure(),
    );
    this.reader = new ReaderService(
      this.readerAddress,
      grpc.credentials.createInsecure(),
    );
  }

  view(request: ViewRequest): Promise<WriteResponse> {
    return new Promise((resolve, reject) => {
      this.writer.View(
        request,
        (err: Error | null, response: WriteResponse) => {
          if (err) reject(err);
          else resolve(response);
        },
      );
    });
  }

  click(request: ClickRequest): Promise<WriteResponse> {
    return new Promise((resolve, reject) => {
      this.writer.Click(
        request,
        (err: Error | null, response: WriteResponse) => {
          if (err) reject(err);
          else resolve(response);
        },
      );
    });
  }

  read(request: ReadRequest): Promise<ReadResponse> {
    return new Promise((resolve, reject) => {
      this.reader.Read(request, (err: Error | null, response: ReadResponse) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  // Fetch the raw client config from the config service.
  //
  // Returned as `ClientConfig` for type-checking convenience, but the runtime
  // response may not match this type, that disagreement is itself worth
  // investigating. See the OpenAPI spec at http://localhost:8084/ (source:
  // backend/openapi.yaml) for the authoritative contract.
  async fetchConfig(
    platform: Platform,
    appId: string = "test-app",
  ): Promise<ClientConfig> {
    const url = `${this.configBaseUrl}/config?platform=${encodeURIComponent(
      platform,
    )}&app_id=${encodeURIComponent(appId)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `config fetch failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as ClientConfig;
  }

  close(): void {
    grpc.closeClient(this.writer);
    grpc.closeClient(this.reader);
  }
}
