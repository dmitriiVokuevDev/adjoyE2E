# Backend

Five services on Docker Compose: Redis, `writer` (gRPC :8081), `reader` (gRPC :8082), `config` (REST :8083), and `swagger-ui` (HTTP :8084).

## First run

```sh
./images/load.sh        # load the writer/reader/config images
docker compose up -d
docker compose ps       # confirm services healthy
```

## Reset state

```sh
docker compose down -v
rm -rf logs/*
docker compose up -d
```

## Logs

Bind-mounted to `./logs/`:

```sh
tail -f logs/writer.log
tail -f logs/reader.log
tail -f logs/config.log
```

The writer, reader, and config services each emit one line per request to their respective log files, with stderr duplicated to `docker compose logs`.

## Quick checks

```sh
# writer (gRPC)
grpcurl -plaintext \
  -import-path ./proto -proto writer.proto \
  -d '{"platform":"android","ad":"ad-test","id":"view-1"}' \
  localhost:8081 writer.WriterService/View

# reader (gRPC)
grpcurl -plaintext \
  -import-path ./proto -proto reader.proto \
  -d '{"type":"vtc","platform":"android","ad":"ad-test"}' \
  localhost:8082 reader.ReaderService/Read

# config (REST)
curl -s 'http://localhost:8083/config?platform=ios&app_id=test-app'
```

If the live config response disagrees with the OpenAPI spec, the spec is authoritative.
