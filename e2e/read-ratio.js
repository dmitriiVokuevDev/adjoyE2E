// Standalone reader probe: prints the vtc/vti ratio the reader publishes for an
// ad/platform. Used by the Android e2e cycle to prove that UI-layer bugs reach
// the published metric.
//
//   node read-ratio.js <type> <ad> [platform]
//   node read-ratio.js vtc ad-001 android
const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const [, , type = "vtc", ad = "ad-001", platform = "android"] = process.argv;

const def = protoLoader.loadSync(
  path.resolve(__dirname, "../backend/proto/reader.proto"),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true },
);
const pkg = grpc.loadPackageDefinition(def);
const reader = new pkg.reader.ReaderService(
  "localhost:8082",
  grpc.credentials.createInsecure(),
);

reader.Read({ type, platform, ad }, (err, res) => {
  if (err) {
    console.error(`ERROR ${err.message}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ type, ad, platform, value: res.value }));
  grpc.closeClient(reader);
});
